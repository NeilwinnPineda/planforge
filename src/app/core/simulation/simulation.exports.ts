export type {
  LayoutExplorationCaptureArtifact,
  SimulationBubbleState,
  SimulationCapturedLayoutSummary,
  SimulationCaptureOutcome,
  SimulationJobState,
  SimulationStageSnapshot,
} from './models/simulation-runner.model';
export type { SimulationFoundationSettings } from './simulation-runner.factory';
export {
  buildSimulationJobs,
  resetSimulationJob,
  shakeSimulationJob,
} from './simulation-runner.factory';
export {
  buildInitialSimulationBubbles,
  stepSimulationJob,
} from './simulation-physics.factory';
export type {
  SimulationMetricRow,
  SimulationSatRow,
  SimulationSatSummary,
} from './simulation-analysis.factory';
export {
  buildSimulationLotMetrics,
  buildSimulationForceMetrics,
  buildSimulationRoomRows,
  computeSimulationSatRows,
  summarizeSatRows,
} from './simulation-analysis.factory';
export {
  applyCaptureOutcomeToJob,
  buildCapturedLayoutSummary,
  buildSimulationCaptureReport,
  evaluateSimulationCandidate,
} from './simulation-capture.factory';
export type { SimulationEngineDependencies } from './simulation-engine.instance';
export { SimulationEngineInstance } from './simulation-engine.instance';
export { SimulationStageService } from './simulation-stage.service';
