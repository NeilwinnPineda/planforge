export type { ActiveRoomInstance } from './models/room-instance.model';
export type {
  CandidateBand,
  CandidateSeedPoint,
  DeterministicCandidateLayout,
} from './models/candidate-layout.model';
export { deriveActiveRoomInstances } from './room-instance.factory';
export { buildDeterministicCandidateLayout } from './candidate-layout.factory';
export { GenerationStageService } from './generation-stage.service';
export type { GenerationStageSnapshot } from './generation-stage.service';
