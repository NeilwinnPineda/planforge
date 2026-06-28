export type CandidateBand = 'front' | 'center' | 'rear';
export type CandidateEdgeBias = 'frontage' | 'perimeter' | 'interior';

export interface CandidateSeedBiasProfile {
  horizontalAnchor: number;
  verticalAnchor: number;
  edgeBias: CandidateEdgeBias;
  weight: number;
  note: string;
}

export interface CandidateSeedPoint {
  instanceId: string;
  typeId: string;
  label: string;
  color: string;
  radiusMeters: number;
  targetAreaSquareMeters: number;
  band: CandidateBand;
  biasProfile: CandidateSeedBiasProfile;
  x: number;
  y: number;
}

export interface DeterministicCandidateLayout {
  seedSetLabel: string;
  method: string;
  seeds: CandidateSeedPoint[];
}
