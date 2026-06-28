import type { CandidateBand } from '../../generation/generation.exports';
import type { RoomTag } from '../../source/source.exports';

// Slice 5 / Simulation engine foundation.
// Stage category: generation.
// Input: candidate seed layout plus simulation settings from the active source.
// Output: job lifecycle state and live bubble state for simulation inspection.
// Allowed dependencies: seed-stage outputs, source simulation settings, and lifecycle timers.
// Forbidden responsibilities: candidate capture promotion, schematic conversion, and visual projection.

export interface SimulationBubbleState {
  instanceId: string;
  typeId: string;
  label: string;
  color: string;
  radiusMeters: number;
  targetAreaSquareMeters: number;
  band: CandidateBand;
  tags: RoomTag[];
  pkg: boolean;
  hallway: boolean;
  vx: number;
  vy: number;
  x: number;
  y: number;
  placed: boolean;
}

export interface SimulationCaptureOutcome {
  status: 'skip' | 'fail' | 'pass';
  reason: string;
  score: number;
  thresholdBefore: number;
  thresholdAfter: number;
  frontEdgePassed: boolean;
  attractionAverage: number;
  repelAverage: number;
  evaluatedAtIso: string;
  reportStatus: 'idle' | 'pending' | 'posted' | 'failed';
  reportMessage: string | null;
}

export interface SimulationCapturedLayoutSummary {
  id: string;
  layoutId: string;
  instanceId: string;
  jobIndex: number;
  capturedAtIso: string;
  score: number;
  attractionAverage: number;
  repelAverage: number;
  bubbleCount: number;
}

export interface LayoutExplorationCaptureArtifact {
  readonly recordId: string;
  readonly layoutId: string;
  readonly coreId: string;
  readonly runnerIndex: number;
  readonly capturedAtIso: string;
  readonly sourceScore: number;
  readonly attractionAverage: number;
  readonly repelAverage: number;
  readonly bubbles: readonly SimulationBubbleState[];
}

export interface SimulationJobState {
  index: number;
  status: 'idle' | 'running' | 'paused';
  respawnSeed: number;
  captureThreshold: number;
  consecutiveCaptureFails: number;
  capturedCount: number;
  failedCount: number;
  resetCount: number;
  shakeCount: number;
  tickCount: number;
  bubbles: SimulationBubbleState[];
  lastCaptureOutcome: SimulationCaptureOutcome | null;
}

export interface SimulationStageSnapshot {
  isRunning: boolean;
  captureLoopRunning: boolean;
  activeJobIndex: number;
  hardResetIntervalMs: number;
  autoShakeEnabled: boolean;
  frameVersion: number;
  jobs: SimulationJobState[];
  recentCaptures: SimulationCapturedLayoutSummary[];
  recentCaptureArtifacts: readonly LayoutExplorationCaptureArtifact[];
}
