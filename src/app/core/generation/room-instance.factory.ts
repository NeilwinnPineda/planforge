import type { PromptDesignSource, RoomPrototype } from '../source/source.exports';
import type { ActiveRoomInstance } from './models/room-instance.model';

// Migration note:
// This block replaces the legacy active-room expansion responsibility currently embedded in
// testing/app/src/app/services/config.service.ts. The new version isolates source-program expansion
// from layout constants, visualization, and simulation orchestration.

// Room-instance derivation stage.
// Input: source room catalog and source room program counts.
// Output: concrete active room instances ready for candidate generation.
// Stage role: domain transformation before layout generation.
// The block is deterministic and does not mutate source data.
export function deriveActiveRoomInstances(source: PromptDesignSource): ActiveRoomInstance[] {
  const roomPrototypeById = new Map<string, RoomPrototype>(
    source.roomCatalog.map((roomPrototype) => [roomPrototype.id, roomPrototype]),
  );

  return Object.entries(source.settings.rooms.program).flatMap(([typeId, count]) => {
    const roomPrototype = roomPrototypeById.get(typeId);
    if (!roomPrototype || count <= 0) {
      return [];
    }

    return Array.from({ length: count }, (_, index) => {
      const programIndex = index + 1;
      const isPrimaryInstance = programIndex === 1;
      return {
        instanceId: isPrimaryInstance ? typeId : `${typeId}_${programIndex}`,
        typeId,
        label: isPrimaryInstance ? roomPrototype.label : `${roomPrototype.label} ${programIndex}`,
        shortLabel: roomPrototype.shortLabel,
        color: roomPrototype.color,
        radiusMeters: roomPrototype.radius,
        targetAreaSquareMeters: Number((Math.PI * roomPrototype.radius * roomPrototype.radius).toFixed(2)),
        tags: [...roomPrototype.tags],
        programIndex,
      };
    });
  });
}
