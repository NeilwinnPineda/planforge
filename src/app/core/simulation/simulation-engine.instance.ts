import { signal } from '@angular/core';
import type { GenerationStageSnapshot } from '../generation/generation-stage.service';
import type { LotGeometryResult } from '../geometry/geometry.exports';
import { createLayoutId } from '../identity/layout-id.factory';
import type { PipelineReport } from '../reporting/models/pipeline-report.model';
import type { SourceReadSnapshot } from '../source/source.exports';
import {
  buildSimulationJobs,
  resetSimulationJob,
  shakeSimulationJob,
} from './simulation-runner.factory';
import type { SpawnHeatmap } from './spawn-heatmap.factory';
import {
  applyCaptureOutcomeToJob,
  buildCapturedLayoutArtifact,
  buildCapturedLayoutSummary,
  buildSimulationCaptureReport,
  evaluateSimulationCandidate,
} from './simulation-capture.factory';
import type { SimulationStageSnapshot } from './models/simulation-runner.model';
import { applySimulationShakeImpulse, stepSimulationJob } from './simulation-physics.factory';

export interface SimulationEngineDependencies {
  getGenerationSnapshot: () => GenerationStageSnapshot;
  getLotGeometry: () => LotGeometryResult;
  getSourceSnapshot: () => SourceReadSnapshot;
  postReport: (report: PipelineReport) => Promise<{ ok: boolean; status: number }>;
  getSpawnHeatmap?: () => SpawnHeatmap | null;
}

// Slice 7 / Layout exploration core boundary.
// Stage category: simulation within the broader Layout Exploration stage.
// Input: generation snapshot access, lot geometry access, source snapshot access, and reporting transport.
// Output: one isolated exploration core with its own timers, snapshot state, and capture lifecycle.
// Allowed dependencies: pure simulation factories and injected stage-access callbacks only.
// Forbidden responsibilities: route composition, shell state, and downstream gallery/schematic ownership.
export class SimulationEngineInstance {
  readonly snapshot;
  private readonly simulationJobCount = 1;
  private readonly simulationTickIntervalMs = 33;
  private readonly capturePreparationTicks = 120;
  private readonly snapshotState;
  private simulationTickTimer: ReturnType<typeof setInterval> | null = null;
  private captureLoopTimer: ReturnType<typeof setInterval> | null = null;
  private shakeLoopTimer: ReturnType<typeof setInterval> | null = null;
  private capturePauseUntilMs = 0;

  constructor(
    readonly instanceId: string,
    private readonly dependencies: SimulationEngineDependencies,
  ) {
    this.snapshotState = signal<SimulationStageSnapshot>(this.buildInitialSnapshot());
    this.snapshot = this.snapshotState.asReadonly();
  }

  ensureAutoRun(): void {
    this.startSimulationSystem();
  }

  startSimulation(): void {
    if (this.simulationTickTimer !== null) {
      return;
    }

    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      isRunning: true,
      jobs: snapshot.jobs.map((job) => ({
        ...job,
        status: 'running',
      })),
    }));

    this.simulationTickTimer = setInterval(() => {
      const lotGeometry = this.dependencies.getLotGeometry();
      const sourceSettings = this.dependencies.getSourceSnapshot().source.settings;
      this.snapshotState.update((snapshot) => ({
        ...snapshot,
        frameVersion: snapshot.frameVersion + 1,
        jobs: snapshot.jobs.map((job) => ({
          ...stepSimulationJob(job, lotGeometry, sourceSettings),
          status: 'running',
        })),
      }));
    }, this.simulationTickIntervalMs);
  }

  startSimulationSystem(): void {
    this.startSimulation();

    if (!this.snapshotState().captureLoopRunning) {
      this.toggleCaptureLoop();
    }
  }

  stopSimulation(): void {
    if (this.simulationTickTimer !== null) {
      clearInterval(this.simulationTickTimer);
      this.simulationTickTimer = null;
    }

    this.stopShakeLoop();
    this.stopCaptureLoop();

    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      isRunning: false,
      jobs: snapshot.jobs.map((job) => ({
        ...job,
        status: 'paused',
      })),
    }));
  }

  stopSimulationSystem(): void {
    this.stopSimulation();
  }

  activateJob(index: number): void {
    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      activeJobIndex: Math.max(0, Math.min(index, snapshot.jobs.length - 1)),
    }));
  }

  resetActiveJob(): void {
    const generationSnapshot = this.dependencies.getGenerationSnapshot();
    const candidateLayout = generationSnapshot.candidateLayout;
    const lotGeometry = this.dependencies.getLotGeometry();
    const sourceSettings = this.dependencies.getSourceSnapshot().source.settings;
    const captureThresholdStart = this.getCaptureThresholdStart();
    const activeJobIndex = this.snapshotState().activeJobIndex;

    const resetHeatmap = this.dependencies.getSpawnHeatmap?.() ?? null;
    this.capturePauseUntilMs = Date.now() + 600;
    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      frameVersion: snapshot.frameVersion + 1,
      jobs: snapshot.jobs.map((job) =>
        job.index === activeJobIndex
          ? resetSimulationJob(
            job,
            generationSnapshot.roomInstances,
            candidateLayout,
            lotGeometry,
            sourceSettings,
            captureThresholdStart,
            resetHeatmap,
          )
          : job,
      ),
    }));
  }

  shakeActiveJob(): void {
    const sourceSettings = this.dependencies.getSourceSnapshot().source.settings;
    const activeJobIndex = this.snapshotState().activeJobIndex;
    const durationMs = sourceSettings.simulation.forces.shakeLoopDurationMs;
    const intervalMs = sourceSettings.simulation.forces.shakeLoopIntervalMs;
    const stopAt = Date.now() + durationMs;

    this.stopShakeLoop();
    this.capturePauseUntilMs = stopAt + this.simulationTickIntervalMs * 4;

    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      frameVersion: snapshot.frameVersion + 1,
      jobs: snapshot.jobs.map((job) =>
        job.index === activeJobIndex ? applySimulationShakeImpulse(shakeSimulationJob(job), sourceSettings) : job,
      ),
    }));

    this.shakeLoopTimer = setInterval(() => {
      if (Date.now() >= stopAt) {
        this.stopShakeLoop();
        return;
      }

      this.snapshotState.update((snapshot) => ({
        ...snapshot,
        frameVersion: snapshot.frameVersion + 1,
        jobs: snapshot.jobs.map((job) =>
          job.index === activeJobIndex ? applySimulationShakeImpulse(shakeSimulationJob(job), sourceSettings) : job,
        ),
      }));
    }, intervalMs);
  }

  toggleCaptureLoop(): void {
    if (this.captureLoopTimer !== null) {
      this.stopCaptureLoop();
      return;
    }

    const intervalMs = this.snapshotState().hardResetIntervalMs;

    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      captureLoopRunning: true,
    }));

    this.captureLoopTimer = setInterval(() => {
      this.runCaptureCycle();
    }, intervalMs);
  }

  dispose(): void {
    this.stopSimulation();
  }

  cullLayout(layoutId: string): void {
    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      recentCaptures: snapshot.recentCaptures.filter((capture) => capture.layoutId !== layoutId),
      recentCaptureArtifacts: snapshot.recentCaptureArtifacts.filter((artifact) => artifact.layoutId !== layoutId),
    }));
  }

  private runCaptureCycle(): void {
    if (Date.now() < this.capturePauseUntilMs) {
      return;
    }

    const generationSnapshot = this.dependencies.getGenerationSnapshot();
    const candidateLayout = generationSnapshot.candidateLayout;
    const lotGeometry = this.dependencies.getLotGeometry();
    const sourceSnapshot = this.dependencies.getSourceSnapshot();
    const sourceSettings = sourceSnapshot.source.settings;
    const captureThresholdStart = this.getCaptureThresholdStart();
    const cycleHeatmap = this.dependencies.getSpawnHeatmap?.() ?? null;
    const passReports: Array<{ jobIndex: number; report: PipelineReport }> = [];
    const passSummaries: ReturnType<typeof buildCapturedLayoutSummary>[] = [];
    const passArtifacts: ReturnType<typeof buildCapturedLayoutArtifact>[] = [];

    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      frameVersion: snapshot.frameVersion + 1,
      recentCaptures: snapshot.recentCaptures.slice(0, 14),
      jobs: snapshot.jobs.map((job) => {
        const evolvedJob = this.advanceJobForCapture(job, lotGeometry, sourceSettings);
        const outcome = evaluateSimulationCandidate(evolvedJob, lotGeometry, sourceSettings);
        const evaluatedJob = applyCaptureOutcomeToJob(evolvedJob, outcome);

        if (outcome.status === 'pass') {
          const layoutId = createLayoutId();
          passReports.push({
            jobIndex: job.index,
            report: buildSimulationCaptureReport(
              this.instanceId,
              layoutId,
              sourceSnapshot,
              candidateLayout,
              evaluatedJob,
              outcome,
            ),
          });
          passSummaries.push(
            buildCapturedLayoutSummary(
              this.instanceId,
              layoutId,
              evaluatedJob,
              outcome,
            ),
          );
          passArtifacts.push(
            buildCapturedLayoutArtifact(
              this.instanceId,
              layoutId,
              evaluatedJob,
              outcome,
            ),
          );
        }

        return resetSimulationJob(
          evaluatedJob,
          generationSnapshot.roomInstances,
          candidateLayout,
          lotGeometry,
          sourceSettings,
          outcome.status === 'pass' ? captureThresholdStart : evaluatedJob.captureThreshold,
          cycleHeatmap,
        );
      }),
    }));

    if (!passSummaries.length) {
      return;
    }

    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      recentCaptures: [...passSummaries, ...snapshot.recentCaptures].slice(0, 15),
      recentCaptureArtifacts: [...passArtifacts, ...snapshot.recentCaptureArtifacts].slice(0, 15),
    }));

    passReports.forEach(({ jobIndex, report }) => {
      void this.postCaptureReport(jobIndex, report);
    });
  }

  private stopCaptureLoop(): void {
    if (this.captureLoopTimer !== null) {
      clearInterval(this.captureLoopTimer);
      this.captureLoopTimer = null;
    }

    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      captureLoopRunning: false,
    }));
  }

  private stopShakeLoop(): void {
    if (this.shakeLoopTimer !== null) {
      clearInterval(this.shakeLoopTimer);
      this.shakeLoopTimer = null;
    }
  }

  private buildInitialSnapshot(): SimulationStageSnapshot {
    const sourceSnapshot = this.dependencies.getSourceSnapshot();
    const lotGeometry = this.dependencies.getLotGeometry();
    const generationSnapshot = this.dependencies.getGenerationSnapshot();
    const candidateLayout = generationSnapshot.candidateLayout;
    const hardResetCondition = sourceSnapshot.source.settings.simulation.resetConditions.find(
      (condition) => condition.enabled && condition.type === 'hard_interval_ms',
    );
    const hardResetIntervalMs = hardResetCondition?.threshold ?? 4000;
    const jobs = buildSimulationJobs(
      generationSnapshot.roomInstances,
      candidateLayout,
      lotGeometry,
      sourceSnapshot.source.settings,
      {
        jobCount: this.simulationJobCount,
        captureThresholdStart: sourceSnapshot.source.settings.simulation.captureThresholds.start,
        hardResetIntervalMs,
      },
      this.dependencies.getSpawnHeatmap?.() ?? null,
    );

    return {
      isRunning: false,
      captureLoopRunning: false,
      activeJobIndex: 0,
      hardResetIntervalMs,
      autoShakeEnabled: sourceSnapshot.source.settings.features.simulation.autoShake,
      frameVersion: 0,
      jobs,
      recentCaptures: [],
      recentCaptureArtifacts: [],
    };
  }

  private getCaptureThresholdStart(): number {
    return this.dependencies.getSourceSnapshot().source.settings.simulation.captureThresholds.start;
  }

  private advanceJobForCapture(
    job: SimulationStageSnapshot['jobs'][number],
    lotGeometry: LotGeometryResult,
    sourceSettings: SourceReadSnapshot['source']['settings'],
  ): SimulationStageSnapshot['jobs'][number] {
    let evolvedJob = job;

    for (let tickIndex = 0; tickIndex < this.capturePreparationTicks; tickIndex += 1) {
      evolvedJob = stepSimulationJob(evolvedJob, lotGeometry, sourceSettings);
    }

    return evolvedJob;
  }

  private async postCaptureReport(jobIndex: number, report: PipelineReport): Promise<void> {
    this.updateJobReportStatus(jobIndex, 'pending', 'Posting capture report to endpoint.');

    try {
      const result = await this.dependencies.postReport(report);
      this.updateJobReportStatus(
        jobIndex,
        result.ok ? 'posted' : 'failed',
        result.ok ? `Capture report accepted (${result.status}).` : `Capture report rejected (${result.status}).`,
      );
    } catch (error) {
      this.updateJobReportStatus(
        jobIndex,
        'failed',
        error instanceof Error ? error.message : 'Capture report transport failed.',
      );
    }
  }

  private updateJobReportStatus(
    jobIndex: number,
    reportStatus: 'pending' | 'posted' | 'failed',
    reportMessage: string,
  ): void {
    this.snapshotState.update((snapshot) => ({
      ...snapshot,
      jobs: snapshot.jobs.map((job) => (
        job.index === jobIndex && job.lastCaptureOutcome
          ? {
            ...job,
            lastCaptureOutcome: {
              ...job.lastCaptureOutcome,
              reportStatus,
              reportMessage,
            },
          }
          : job
      )),
    }));
  }
}
