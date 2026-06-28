import type { VerifiedLayoutArtifact } from '../processing/models/layout-processing-artifact.model';

export type ConstructionWallOwnerKind = 'room' | 'hallway';
export type ConstructionWallExteriorKind = 'filler' | 'outside';

export interface ConstructionExternalWallSegment {
  readonly id: string;
  readonly fromKey: string;
  readonly toKey: string;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly lengthMeters: number;
  readonly ownerTypeId: string;
  readonly ownerLabel: string;
  readonly ownerKind: ConstructionWallOwnerKind;
  readonly exteriorLabel: string;
  readonly exteriorKind: ConstructionWallExteriorKind;
}

export interface ConstructionExternalWallLoop {
  readonly id: string;
  readonly pointKeys: readonly string[];
  readonly segmentCount: number;
  readonly closed: boolean;
}

export interface ConstructionExternalWallAnalysis {
  readonly segments: readonly ConstructionExternalWallSegment[];
  readonly loops: readonly ConstructionExternalWallLoop[];
  readonly constructedAreaSquareMeters: number;
  readonly externalWallPerimeterMeters: number;
  readonly areaPerimeterRatio: number;
}

interface EdgeRecord {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly ownerTypeId: string;
  readonly ownerLabel: string;
  readonly ownerKind: 'room' | 'hallway' | 'filler';
}

export function analyzeConstructionExternalWalls(artifact: VerifiedLayoutArtifact): ConstructionExternalWallAnalysis {
  const edgeMap = new Map<string, EdgeRecord[]>();

  artifact.cells.forEach((cell) => {
    cell.worldPoints.forEach((from, index) => {
      const to = cell.worldPoints[(index + 1) % cell.worldPoints.length];
      const key = edgeKey(from, to);
      const records = edgeMap.get(key) ?? [];
      records.push({
        from,
        to,
        ownerTypeId: cell.typeId,
        ownerLabel: cell.label || cell.typeId,
        ownerKind: cell.pkg ? 'filler' : cell.hallway ? 'hallway' : 'room',
      });
      edgeMap.set(key, records);
    });
  });

  const segments = [...edgeMap.entries()]
    .map(([key, records]) => {
      const constructedRecords = records.filter((record) => record.ownerKind !== 'filler');
      const fillerRecords = records.filter((record) => record.ownerKind === 'filler');
      const record = constructedRecords[0];

      if (!record) return null;
      if (records.length === 1) return buildWallSegment(key, record, 'outside');
      if (records.length === 2 && constructedRecords.length === 1 && fillerRecords.length === 1) {
        return buildWallSegment(key, record, 'filler', fillerRecords[0].ownerLabel);
      }

      return null;
    })
    .filter((segment): segment is ConstructionExternalWallSegment => segment !== null)
    .map((segment, index) => ({
      ...segment,
      id: `EW-${String(index + 1).padStart(3, '0')}-${segment.id}`,
    }))
    .sort((left, right) => right.lengthMeters - left.lengthMeters);

  const constructedAreaSquareMeters = artifact.cells
    .filter((cell) => !cell.pkg)
    .reduce((sum, cell) => sum + cell.areaSquareMeters, 0);
  const externalWallPerimeterMeters = segments.reduce((sum, segment) => sum + segment.lengthMeters, 0);

  return {
    segments,
    loops: buildExternalWallLoops(segments),
    constructedAreaSquareMeters,
    externalWallPerimeterMeters,
    areaPerimeterRatio: externalWallPerimeterMeters > 1e-6
      ? Number((constructedAreaSquareMeters / externalWallPerimeterMeters).toFixed(4))
      : Number.POSITIVE_INFINITY,
  };
}

function buildWallSegment(
  edgeId: string,
  record: EdgeRecord,
  exteriorKind: ConstructionWallExteriorKind,
  exteriorLabel = 'outside',
): ConstructionExternalWallSegment {
  return {
    id: edgeId,
    fromKey: pointKey(record.from),
    toKey: pointKey(record.to),
    from: record.from,
    to: record.to,
    lengthMeters: Number(Math.hypot(record.to.x - record.from.x, record.to.y - record.from.y).toFixed(3)),
    ownerTypeId: record.ownerTypeId,
    ownerLabel: record.ownerLabel,
    ownerKind: record.ownerKind === 'hallway' ? 'hallway' : 'room',
    exteriorLabel,
    exteriorKind,
  };
}

function buildExternalWallLoops(segments: readonly ConstructionExternalWallSegment[]): readonly ConstructionExternalWallLoop[] {
  const unused = new Set(segments.map((_, index) => index));
  const byKey = new Map<string, number[]>();

  segments.forEach((segment, index) => {
    byKey.set(segment.fromKey, [...(byKey.get(segment.fromKey) ?? []), index]);
    byKey.set(segment.toKey, [...(byKey.get(segment.toKey) ?? []), index]);
  });

  const loops: ConstructionExternalWallLoop[] = [];

  while (unused.size > 0) {
    const firstIndex = unused.values().next().value as number;
    const first = segments[firstIndex];
    const pointKeys = [first.fromKey, first.toKey];
    const startKey = first.fromKey;
    let currentKey = first.toKey;
    let closed = currentKey === startKey;
    let segmentCount = 1;
    unused.delete(firstIndex);

    while (!closed) {
      const nextIndex = (byKey.get(currentKey) ?? []).find((index) => unused.has(index));
      if (nextIndex === undefined) break;

      const next = segments[nextIndex];
      const forward = next.fromKey === currentKey;
      currentKey = forward ? next.toKey : next.fromKey;
      pointKeys.push(currentKey);
      segmentCount += 1;
      unused.delete(nextIndex);
      closed = currentKey === startKey;
    }

    loops.push({
      id: `EWL-${String(loops.length + 1).padStart(2, '0')}`,
      pointKeys,
      segmentCount,
      closed,
    });
  }

  return loops.sort((left, right) => Number(right.closed) - Number(left.closed) || right.segmentCount - left.segmentCount);
}

function edgeKey(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): string {
  const a = pointKey(from);
  const b = pointKey(to);
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function pointKey(point: { readonly x: number; readonly y: number }): string {
  return `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
}
