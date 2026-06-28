import type { DeterministicCandidateLayout } from '../generation/generation.exports';
import type { ActiveRoomInstance } from '../generation/generation.exports';
import type { LotGeometryResult } from '../geometry/geometry.exports';
import type { ProjectSettings } from '../source/source.exports';
import type { SimulationJobState } from './models/simulation-runner.model';
import { buildInitialSimulationBubbles } from './simulation-physics.factory';
import type { SpawnHeatmap } from './spawn-heatmap.factory';

export interface SimulationFoundationSettings {
  jobCount: number;
  captureThresholdStart: number;
  hardResetIntervalMs: number;
}

// Slice 5 / Simulation job seeding.
// Stage category: generation.
// Input: deterministic candidate seed layout and simulation foundation settings.
// Output: seeded simulation job states ready for lifecycle ownership.
// Allowed dependencies: canonical seed-stage outputs and source simulation settings only.
// Forbidden responsibilities: long-running timer control, capture promotion, and rendering.
export function buildSimulationJobs(
  roomInstances: ActiveRoomInstance[],
  candidateLayout: DeterministicCandidateLayout,
  lotGeometry: LotGeometryResult,
  sourceSettings: ProjectSettings,
  settings: SimulationFoundationSettings,
  heatmap?: SpawnHeatmap | null,
): SimulationJobState[] {
  return Array.from({ length: settings.jobCount }, (_, index) => {
    const respawnSeed = buildRespawnSeed(index, 0);

    return {
      index,
      status: 'idle',
      respawnSeed,
      captureThreshold: settings.captureThresholdStart,
      consecutiveCaptureFails: 0,
      capturedCount: 0,
      failedCount: 0,
      resetCount: 0,
      shakeCount: 0,
      tickCount: 0,
      bubbles: buildInitialSimulationBubbles(
        roomInstances,
        candidateLayout,
        lotGeometry,
        sourceSettings,
        index,
        respawnSeed,
        heatmap,
      ),
      lastCaptureOutcome: null,
    };
  });
}

export function resetSimulationJob(
  job: SimulationJobState,
  roomInstances: ActiveRoomInstance[],
  candidateLayout: DeterministicCandidateLayout,
  lotGeometry: LotGeometryResult,
  sourceSettings: ProjectSettings,
  captureThresholdStart: number,
  heatmap?: SpawnHeatmap | null,
): SimulationJobState {
  const nextResetCount = job.resetCount + 1;
  const nextRespawnSeed = buildRespawnSeed(job.index, nextResetCount);

  return {
    ...job,
    status: 'idle',
    respawnSeed: nextRespawnSeed,
    captureThreshold: captureThresholdStart,
    consecutiveCaptureFails: 0,
    resetCount: nextResetCount,
    tickCount: 0,
    bubbles: buildInitialSimulationBubbles(
      roomInstances,
      candidateLayout,
      lotGeometry,
      sourceSettings,
      job.index,
      nextRespawnSeed,
      heatmap,
    ),
  };
}

export function shakeSimulationJob(job: SimulationJobState): SimulationJobState {
  return {
    ...job,
    shakeCount: job.shakeCount + 1,
  };
}

function buildRespawnSeed(jobIndex: number, resetCount: number): number {
  const timeSalt = Date.now();
  const randomSalt = Math.floor(Math.random() * 1_000_000_000);
  return (jobIndex + 1) * 10_000_019 + resetCount * 1_000_003 + timeSalt + randomSalt;
}
