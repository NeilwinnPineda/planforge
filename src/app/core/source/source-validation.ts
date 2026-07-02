import type {
  DesignSourceValidationLevel,
  DesignSourceValidationMessage,
  DesignSourceValidationResult,
  PromptDesignSource,
} from './models/design-source.model';

// Migration note:
// This block replaces the legacy source-intake validation responsibility that currently lives in
// testing/legacy-reference/app/src/app/data/design-source.ts. The new version is isolated so source intake can evolve
// independently from generation and presentation stages.

// Source validation stage.
// Input: a typed PromptDesignSource loaded from the local source artifact.
// Output: a DesignSourceValidationResult used by the source-intake UI and future stage gates.
// This block validates source structure and references only. It does not mutate source data.
export function validateDesignSource(source: PromptDesignSource): DesignSourceValidationResult {
  const messages: DesignSourceValidationMessage[] = [];
  const addMessage = (
    level: DesignSourceValidationLevel,
    scope: string,
    message: string,
  ): void => {
    messages.push({ level, scope, message });
  };

  const catalogIds = new Set<string>();
  const duplicateIds = new Set<string>();

  source.roomCatalog.forEach((room) => {
    if (!room.id.trim()) {
      addMessage('fail', 'rooms.catalog', 'Every catalog room needs a stable id.');
    } else if (catalogIds.has(room.id)) {
      duplicateIds.add(room.id);
    } else {
      catalogIds.add(room.id);
    }

    if (!room.label.trim()) {
      addMessage('warn', `rooms.catalog.${room.id}`, 'Room label is empty.');
    }

    if (!Number.isFinite(room.radius) || room.radius <= 0) {
      addMessage(
        'fail',
        `rooms.catalog.${room.id}`,
        'Room radius must be a positive number in meters.',
      );
    }
  });

  duplicateIds.forEach((id) => {
    addMessage('fail', `rooms.catalog.${id}`, 'Duplicate room ids make source variants ambiguous.');
  });

  const programEntries = Object.entries(source.settings.rooms.program);
  const activeRoomInstances = programEntries.reduce(
    (total, [, count]) => total + Math.max(0, count),
    0,
  );

  programEntries.forEach(([roomId, count]) => {
    if (!catalogIds.has(roomId)) {
      addMessage(
        'fail',
        `rooms.program.${roomId}`,
        'Program references a room id that is missing from the room catalog.',
      );
    }

    if (!Number.isInteger(count) || count < 0) {
      addMessage(
        'fail',
        `rooms.program.${roomId}`,
        'Program count must be a non-negative integer.',
      );
    }
  });

  const lotSegments = source.settings.lot.segments;
  const frontageSegments = lotSegments.filter((segment) => segment.isRrow).length;

  if (lotSegments.length < 3) {
    addMessage('fail', 'lot.segments', 'Lot input needs at least three boundary segments.');
  }

  lotSegments.forEach((segment) => {
    if (!Number.isFinite(segment.distance) || segment.distance <= 0) {
      addMessage(
        'fail',
        `lot.segments.${segment.point}`,
        'Segment distance must be a positive meter value.',
      );
    }

    if (!Number.isFinite(segment.setback) || segment.setback < 0) {
      addMessage(
        'fail',
        `lot.segments.${segment.point}`,
        'Segment setback must be zero or a positive meter value.',
      );
    }
  });

  if (frontageSegments === 0) {
    addMessage('warn', 'lot.segments', 'No road/frontage segment is marked with isRrow.');
  }

  if (frontageSegments > 1) {
    addMessage('warn', 'lot.segments', 'More than one road/frontage segment is marked with isRrow.');
  }

  const generatedIds = new Set(Object.keys(source.settings.adjacency.generatedTypeDefaults));
  const knownIds = new Set([...catalogIds, ...generatedIds]);
  const adjacencyPairs = new Set<string>();
  const isScoreInRange = (score: number): boolean => Number.isInteger(score) && score >= 1 && score <= 5;

  Object.entries(source.settings.adjacency.generatedTypeDefaults).forEach(([generatedId, score]) => {
    if (!isScoreInRange(score)) {
      addMessage(
        'fail',
        `adjacency.generatedTypeDefaults.${generatedId}`,
        'Generated type default must be an integer score from 1 to 5.',
      );
    }
  });

  Object.entries(source.settings.adjacency.exceptions).forEach(([fromId, links]) => {
    if (!knownIds.has(fromId)) {
      addMessage(
        'fail',
        `adjacency.exceptions.${fromId}`,
        'Adjacency source id is not in the room catalog or generated ids.',
      );
    }

    Object.entries(links).forEach(([toId, score]) => {
      if (!knownIds.has(toId)) {
        addMessage(
          'fail',
          `adjacency.exceptions.${fromId}.${toId}`,
          'Adjacency target id is not in the room catalog or generated ids.',
        );
      }

      if (!isScoreInRange(score)) {
        addMessage(
          'fail',
          `adjacency.exceptions.${fromId}.${toId}`,
          'Adjacency score must be an integer from 1 to 5.',
        );
      }

      adjacencyPairs.add([fromId, toId].sort().join('__'));
    });
  });

  const validateRuleRooms = (scope: string, roomIds: string[]): void => {
    if (!roomIds.length) {
      addMessage('warn', scope, 'Rule does not name any rooms.');
    }

    roomIds.forEach((roomId) => {
      if (!knownIds.has(roomId)) {
        addMessage('fail', `${scope}.${roomId}`, 'Rule references an unknown room id.');
      }
    });
  };

  source.settings.rules.special.forEach((rule) => {
    validateRuleRooms(`rules.special.${rule.label}`, rule.rooms);
  });
  source.settings.rules.blockers.forEach((rule) => {
    validateRuleRooms(`rules.blockers.${rule.label}`, rule.rooms);
  });

  addMessage(
    'pass',
    'source.meta',
    `Version ${source.meta.version} is loaded as the active design source.`,
  );
  addMessage(
    'pass',
    'rooms.program',
    `${activeRoomInstances} active room instances are derived from ${programEntries.length} program rows.`,
  );
  addMessage(
    'pass',
    'adjacency.exceptions',
    `${adjacencyPairs.size} unique adjacency pairs are available to the rule engine.`,
  );

  const status = messages.some((message) => message.level === 'fail')
    ? 'fail'
    : messages.some((message) => message.level === 'warn')
      ? 'warn'
      : 'pass';

  return {
    status,
    messages,
    counts: {
      roomTypes: source.roomCatalog.length,
      activeRoomTypes: programEntries.filter(([, count]) => count > 0).length,
      activeRoomInstances,
      adjacencyPairs: adjacencyPairs.size,
      specialRules: source.settings.rules.special.length,
      blockers: source.settings.rules.blockers.length,
      frontageSegments,
    },
  };
}

