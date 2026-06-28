import type { ProvisionalLayoutCell, VerifiedLayoutArtifact } from '../processing/models/layout-processing-artifact.model';
import type { ConstructionExternalWallSegment } from './external-wall.factory';
import { type ConstructionDoorKind, EXTERIOR_DOOR_RULES, interiorDoorWidthForTypeId } from './door-schedule';

export type { ConstructionDoorKind };

export interface ConstructionDoorPlacement {
  readonly id: string;
  readonly kind: ConstructionDoorKind;
  readonly ownerTypeId: string;
  readonly ownerLabel: string;
  readonly widthMeters: number;
  readonly tNormalized: number;
  readonly tMeters: number;
  readonly wallLengthMeters: number;
  readonly positionWorld: { readonly x: number; readonly y: number };
  readonly wallFromWorld: { readonly x: number; readonly y: number };
  readonly wallToWorld: { readonly x: number; readonly y: number };
  readonly wallId: string | null;
  readonly adjacentTypeId: string | null;
  readonly adjacentLabel: string | null;
}

interface SharedEdgeEntry {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly lengthMeters: number;
  readonly neighbor: ProvisionalLayoutCell;
}

export function buildDoorPlacements(
  artifact: VerifiedLayoutArtifact,
  externalSegments: readonly ConstructionExternalWallSegment[],
): readonly ConstructionDoorPlacement[] {
  const placements: ConstructionDoorPlacement[] = [];
  let counter = 0;

  // Phase 1: exterior doors — entry, garage, service
  for (const [typeId, rule] of Object.entries(EXTERIOR_DOOR_RULES)) {
    const ownedWalls = externalSegments
      .filter((s) => s.ownerTypeId === typeId && s.ownerKind === 'room');

    if (!ownedWalls.length) continue;

    // Front-facing rooms (entry, garage) prefer the wall closest to the street
    // (minimum average y = south/front edge in lot coordinate space).
    // Service doors use the longest wall instead.
    const wall = rule.preferFront
      ? [...ownedWalls].sort((a, b) => ((a.from.y + a.to.y) / 2) - ((b.from.y + b.to.y) / 2))[0]
      : [...ownedWalls].sort((a, b) => b.lengthMeters - a.lengthMeters)[0];

    if (wall.lengthMeters < rule.widthMeters + 0.4) continue;

    counter += 1;
    placements.push(placeDoor(wall.from, wall.to, wall.lengthMeters, 0.5, {
      id: `DOOR-${String(counter).padStart(3, '0')}-${rule.kind.toUpperCase()}`,
      kind: rule.kind,
      ownerTypeId: typeId,
      ownerLabel: wall.ownerLabel,
      widthMeters: rule.widthMeters,
      wallId: wall.id,
      adjacentTypeId: null,
      adjacentLabel: null,
    }));
  }

  // Phase 2: interior doors — every enclosed (non-open_access) room
  const sharedEdgeMap = buildSharedEdgeMap(artifact);

  for (const cell of artifact.cells) {
    if (cell.pkg || cell.hallway) continue;
    if (cell.tags.includes('open_access')) continue;

    const edges = sharedEdgeMap.get(cell.id);
    if (!edges?.length) continue;

    const best = [...edges].sort((a, b) => {
      const aScore = interiorDoorNeighborScore(cell.typeId, a.neighbor);
      const bScore = interiorDoorNeighborScore(cell.typeId, b.neighbor);
      if (aScore !== bScore) return bScore - aScore;
      return b.lengthMeters - a.lengthMeters;
    })[0];

    const width = interiorDoorWidthForTypeId(cell.typeId);
    if (best.lengthMeters < width + 0.2) continue;

    counter += 1;
    placements.push(placeDoor(best.from, best.to, best.lengthMeters, 0.5, {
      id: `DOOR-${String(counter).padStart(3, '0')}-INT`,
      kind: 'interior',
      ownerTypeId: cell.typeId,
      ownerLabel: cell.label || cell.typeId,
      widthMeters: width,
      wallId: null,
      adjacentTypeId: best.neighbor.typeId,
      adjacentLabel: best.neighbor.label || best.neighbor.typeId,
    }));
  }

  return placements;
}

// Rooms that should door into their served sleeping room rather than the hallway.
// master_closet is typically en-suite inside the master suite.
const PREFER_SLEEPING_NEIGHBOR: ReadonlySet<string> = new Set(['master_bath', 'master_closet']);

function interiorDoorNeighborScore(ownerTypeId: string, neighbor: ProvisionalLayoutCell): number {
  if (PREFER_SLEEPING_NEIGHBOR.has(ownerTypeId)) {
    if (neighbor.tags.includes('sleeping')) return 2;
    if (neighbor.hallway) return 1;
    return 0;
  }
  // Default: hallway first, then open-access rooms (living, dining, foyer…), then anything else
  if (neighbor.hallway) return 2;
  if (neighbor.tags.includes('open_access')) return 1;
  return 0;
}

function placeDoor(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  lengthMeters: number,
  tNormalized: number,
  fields: Omit<ConstructionDoorPlacement, 'tNormalized' | 'tMeters' | 'wallLengthMeters' | 'positionWorld' | 'wallFromWorld' | 'wallToWorld'>,
): ConstructionDoorPlacement {
  return {
    ...fields,
    tNormalized,
    tMeters: Number((tNormalized * lengthMeters).toFixed(3)),
    wallLengthMeters: lengthMeters,
    positionWorld: {
      x: Number((from.x + (to.x - from.x) * tNormalized).toFixed(4)),
      y: Number((from.y + (to.y - from.y) * tNormalized).toFixed(4)),
    },
    wallFromWorld: from,
    wallToWorld: to,
  };
}

function buildSharedEdgeMap(artifact: VerifiedLayoutArtifact): Map<string, SharedEdgeEntry[]> {
  const edgeOwners = new Map<string, Array<{
    cell: ProvisionalLayoutCell;
    from: { readonly x: number; readonly y: number };
    to: { readonly x: number; readonly y: number };
  }>>();

  for (const cell of artifact.cells) {
    for (let i = 0; i < cell.worldPoints.length; i++) {
      const from = cell.worldPoints[i];
      const to = cell.worldPoints[(i + 1) % cell.worldPoints.length];
      const key = edgeKey(from, to);
      const owners = edgeOwners.get(key) ?? [];
      owners.push({ cell, from, to });
      edgeOwners.set(key, owners);
    }
  }

  const result = new Map<string, SharedEdgeEntry[]>();

  for (const records of edgeOwners.values()) {
    if (records.length !== 2) continue;
    const [a, b] = records;
    const length = Number(Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y).toFixed(3));

    const aEdges = result.get(a.cell.id) ?? [];
    aEdges.push({ from: a.from, to: a.to, lengthMeters: length, neighbor: b.cell });
    result.set(a.cell.id, aEdges);

    const bEdges = result.get(b.cell.id) ?? [];
    bEdges.push({ from: b.from, to: b.to, lengthMeters: length, neighbor: a.cell });
    result.set(b.cell.id, bEdges);
  }

  return result;
}

function edgeKey(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): string {
  const a = `${Math.round(from.x * 1000)},${Math.round(from.y * 1000)}`;
  const b = `${Math.round(to.x * 1000)},${Math.round(to.y * 1000)}`;
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}
