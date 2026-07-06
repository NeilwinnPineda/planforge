import type { LotGeometryResult } from '../geometry/geometry.exports';
import type { ActiveRoomInstance } from './models/room-instance.model';
import type {
  CandidateBand,
  CandidateSeedBiasProfile,
  CandidateSeedPoint,
  DeterministicCandidateLayout,
} from './models/candidate-layout.model';

export function buildDeterministicCandidateLayout(
  roomInstances: ActiveRoomInstance[],
  lotGeometry: LotGeometryResult,
): DeterministicCandidateLayout {
  const bounds = lotGeometry.buildableBounds;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const seeds: CandidateSeedPoint[] = roomInstances.map((roomInstance, index) => {
    const biasProfile = buildRandomBiasProfile(roomInstance, index);

    return {
      instanceId: roomInstance.instanceId,
      typeId: roomInstance.typeId,
      label: roomInstance.label,
      color: roomInstance.color,
      radiusMeters: roomInstance.radiusMeters,
      targetAreaSquareMeters: roomInstance.targetAreaSquareMeters,
      band: resolveBand(roomInstance),
      biasProfile,
      x: Number((bounds.minX + width * biasProfile.horizontalAnchor).toFixed(3)),
      y: Number((bounds.minY + height * biasProfile.verticalAnchor).toFixed(3)),
    };
  });

  return {
    seedSetLabel: `candidate-${roomInstances.length}-rooms`,
    method: 'random-envelope-seeding',
    seeds,
  };
}

function buildRandomBiasProfile(
  roomInstance: ActiveRoomInstance,
  index: number,
): CandidateSeedBiasProfile {
  const horizontalAnchor = clampAnchor(deterministicFloat(index * 3 + 1) * 0.76 + 0.12);
  const verticalAnchor = clampAnchor(deterministicFloat(index * 3 + 2) * 0.76 + 0.12);

  if (roomInstance.tags.includes('front_facing')) {
    return { horizontalAnchor, verticalAnchor, edgeBias: 'frontage', weight: 0, note: 'Random seed; frontage edge bias.' };
  }

  if (roomInstance.tags.includes('sleeping')) {
    return { horizontalAnchor, verticalAnchor, edgeBias: 'perimeter', weight: 0, note: 'Random seed; perimeter edge bias.' };
  }

  return { horizontalAnchor, verticalAnchor, edgeBias: 'interior', weight: 0, note: 'Random seed; interior edge bias.' };
}

function resolveBand(roomInstance: ActiveRoomInstance): CandidateBand {
  if (roomInstance.tags.includes('front_facing')) return 'front';
  if (roomInstance.tags.includes('sleeping')) return 'rear';
  return 'center';
}

function deterministicFloat(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return Math.abs(x - Math.floor(x));
}

function clampAnchor(value: number): number {
  return Math.min(0.88, Math.max(0.12, value));
}
