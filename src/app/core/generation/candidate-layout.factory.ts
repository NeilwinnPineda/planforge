import type { LotGeometryResult } from '../geometry/geometry.exports';
import type { ActiveRoomInstance } from './models/room-instance.model';
import type {
  CandidateBand,
  CandidateSeedBiasProfile,
  CandidateSeedPoint,
  DeterministicCandidateLayout,
} from './models/candidate-layout.model';

// Deterministic candidate-seeding stage.
// Input: canonical active room instances and canonical buildable lot geometry.
// Output: a first-pass candidate layout composed of seed points inside the buildable envelope.
// Stage role: initial layout generation.
// The block is deterministic and produces no rendering artifacts.
export function buildDeterministicCandidateLayout(
  roomInstances: ActiveRoomInstance[],
  lotGeometry: LotGeometryResult,
): DeterministicCandidateLayout {
  const frontBandRooms = roomInstances.filter((roomInstance) => roomInstance.tags.includes('front_facing'));
  const rearBandRooms = roomInstances.filter((roomInstance) => roomInstance.tags.includes('sleeping'));
  const centerBandRooms = roomInstances.filter(
    (roomInstance) => !frontBandRooms.includes(roomInstance) && !rearBandRooms.includes(roomInstance),
  );

  const orderedSeeds = [
    ...buildBandSeeds(frontBandRooms, 'front', lotGeometry),
    ...buildBandSeeds(centerBandRooms, 'center', lotGeometry),
    ...buildBandSeeds(rearBandRooms, 'rear', lotGeometry),
  ];

  return {
    seedSetLabel: `candidate-${roomInstances.length}-rooms`,
    method: 'deterministic-band-seeding',
    seeds: orderedSeeds,
  };
}

function buildBandSeeds(
  roomInstances: ActiveRoomInstance[],
  band: CandidateBand,
  lotGeometry: LotGeometryResult,
): CandidateSeedPoint[] {
  if (!roomInstances.length) {
    return [];
  }

  const bounds = lotGeometry.buildableBounds;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  return roomInstances
    .slice()
    .sort((left, right) => right.radiusMeters - left.radiusMeters)
    .map((roomInstance, index) => {
      const biasProfile = buildSeedBiasProfile(roomInstance, band, index, roomInstances.length);

      return {
        instanceId: roomInstance.instanceId,
        typeId: roomInstance.typeId,
        label: roomInstance.label,
        color: roomInstance.color,
        radiusMeters: roomInstance.radiusMeters,
        targetAreaSquareMeters: roomInstance.targetAreaSquareMeters,
        band,
        biasProfile,
        x: Number((bounds.minX + width * biasProfile.horizontalAnchor).toFixed(3)),
        y: Number((bounds.minY + height * biasProfile.verticalAnchor).toFixed(3)),
      };
    });
}

function buildSeedBiasProfile(
  roomInstance: ActiveRoomInstance,
  band: CandidateBand,
  index: number,
  total: number,
): CandidateSeedBiasProfile {
  const distributedAnchor = buildDistributedAnchor(index, total);

  return buildStageSafeBiasProfile(roomInstance, band, distributedAnchor);
}

function buildStageSafeBiasProfile(
  roomInstance: ActiveRoomInstance,
  band: CandidateBand,
  distributedAnchor: number,
): CandidateSeedBiasProfile {
  if (roomInstance.tags.includes('front_facing')) {
    return {
      horizontalAnchor: distributedAnchor,
      verticalAnchor: 0.22,
      edgeBias: 'frontage',
      weight: 1,
      note: 'Early-stage frontage tag bias only.',
    };
  }

  if (roomInstance.tags.includes('sleeping')) {
    return {
      horizontalAnchor: distributedAnchor,
      verticalAnchor: 0.8,
      edgeBias: 'perimeter',
      weight: 0.85,
      note: 'Early-stage rear-band bias only.',
    };
  }

  return {
    horizontalAnchor: distributedAnchor,
    verticalAnchor: band === 'front' ? 0.24 : band === 'rear' ? 0.78 : 0.5,
    edgeBias: band === 'center' ? 'interior' : 'perimeter',
    weight: 0,
    note: 'Stage-safe neutral seed bias. Late pipeline data may replace this.',
  };
}

function buildDistributedAnchor(index: number, total: number): number {
  if (total <= 1) {
    return 0.5;
  }

  return clampAnchor(0.16 + ((index + 1) / (total + 1)) * 0.68);
}

function clampAnchor(value: number): number {
  return Math.min(0.88, Math.max(0.12, value));
}
