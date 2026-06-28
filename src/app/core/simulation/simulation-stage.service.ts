import { Injectable, computed, inject, signal } from '@angular/core';
import { GenerationStageService } from '../generation/generation.exports';
import { LotGeometryService } from '../geometry/geometry.exports';
import { ReportingEndpointService } from '../reporting/reporting-endpoint.service';
import { SourceReadService } from '../source/source.exports';
import type { LayoutExplorationCaptureArtifact, SimulationCapturedLayoutSummary } from './models/simulation-runner.model';
import { SimulationEngineInstance } from './simulation-engine.instance';
import { ConstructionOutputService } from '../construction/construction-output.service';

@Injectable({ providedIn: 'root' })
export class SimulationStageService {
  private readonly sourceReadService = inject(SourceReadService);
  private readonly generationStageService = inject(GenerationStageService);
  private readonly lotGeometryService = inject(LotGeometryService);
  private readonly reportingEndpointService = inject(ReportingEndpointService);
  private readonly constructionOutputsService = inject(ConstructionOutputService);
  private readonly instances = new Map<string, SimulationEngineInstance>();
  private readonly activeInstanceIdState = signal<string>('primary-simulation');
  private readonly instancesVersionState = signal(0);
  private readonly cascadeSpawnCount = 3;
  private readonly autoInstanceTargetCount = 1 + this.cascadeSpawnCount;
  private readonly autoInstanceSpawnIntervalMs = 10000;
  private autoSpawnTimer: ReturnType<typeof setInterval> | null = null;

  // Slice 7 / Layout exploration cluster orchestrator facade.
  // Stage category: simulation within the broader Layout Exploration stage.
  // Input: core-id selection plus stage access services and reporting transport.
  // Output: active-core access plus cluster-level orchestration for cascading cores and layout capture aggregation.
  // Allowed dependencies: stage access services, reporting transport, and simulation engine instances only.
  // Forbidden responsibilities: physics math ownership, downstream gallery cell conversion, and page-local inspection assembly.
  readonly snapshot = computed(() => this.getActiveInstance().snapshot());
  readonly activeInstanceId = this.activeInstanceIdState.asReadonly();
  readonly instanceIds = computed(() => {
    this.instancesVersionState();
    return [...this.instances.keys()];
  });
  readonly captureGallery = computed<readonly SimulationCapturedLayoutSummary[]>(() => {
    this.instancesVersionState();

    return [...this.instances.values()]
      .flatMap((instance) => instance.snapshot().recentCaptures)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return Date.parse(right.capturedAtIso) - Date.parse(left.capturedAtIso);
      });
  });
  readonly captureArtifacts = computed<readonly LayoutExplorationCaptureArtifact[]>(() => {
    this.instancesVersionState();

    return [...this.instances.values()]
      .flatMap((instance) => instance.snapshot().recentCaptureArtifacts)
      .sort((left, right) => {
        if (right.sourceScore !== left.sourceScore) {
          return right.sourceScore - left.sourceScore;
        }

        return Date.parse(right.capturedAtIso) - Date.parse(left.capturedAtIso);
      });
  });
  readonly autoSpawnTargetCount = this.autoInstanceTargetCount;
  readonly autoSpawnInterval = this.autoInstanceSpawnIntervalMs;
  readonly cascadeSiblingCount = this.cascadeSpawnCount;

  constructor() {
    this.ensureInstance('primary-simulation');
  }

  ensureAutoRun(): void {
    this.getActiveInstance().ensureAutoRun();
    this.startSimulationSystem();
  }

  startSimulation(): void {
    this.getActiveInstance().startSimulation();
  }

  startSimulationSystem(): void {
    this.instances.forEach((instance) => instance.startSimulationSystem());
    this.startAutoSpawnLoop();
  }

  stopSimulation(): void {
    this.getActiveInstance().stopSimulation();
  }

  stopSimulationSystem(): void {
    this.stopAutoSpawnLoop();
    this.instances.forEach((instance) => instance.stopSimulationSystem());
  }

  activateJob(index: number): void {
    this.getActiveInstance().activateJob(index);
  }

  resetActiveJob(): void {
    this.getActiveInstance().resetActiveJob();
  }

  shakeActiveJob(): void {
    this.getActiveInstance().shakeActiveJob();
  }

  toggleCaptureLoop(): void {
    this.getActiveInstance().toggleCaptureLoop();
  }

  clearSimulationSystem(): void {
    this.stopAutoSpawnLoop();
    this.instances.forEach((instance) => instance.dispose());
    this.instances.clear();
    this.instancesVersionState.update((version) => version + 1);
    this.activeInstanceIdState.set('primary-simulation');
    this.ensureInstance('primary-simulation');
  }

  createInstance(instanceId?: string): string {
    const resolvedId = instanceId ?? `simulation-${this.instances.size + 1}`;
    const instance = this.ensureInstance(resolvedId);
    if (this.hasRunningInstance()) {
      instance.startSimulationSystem();
    }
    return resolvedId;
  }

  activateInstance(instanceId: string): void {
    this.ensureInstance(instanceId);
    this.activeInstanceIdState.set(instanceId);
  }

  disposeInstance(instanceId: string): void {
    if (this.instances.size <= 1) {
      return;
    }

    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    instance.dispose();
    this.instances.delete(instanceId);
    this.instancesVersionState.update((version) => version + 1);

    if (this.activeInstanceIdState() === instanceId) {
      this.activeInstanceIdState.set(this.instances.keys().next().value ?? 'primary-simulation');
    }
  }

  cullLayout(layoutId: string): void {
    this.instances.forEach((instance) => instance.cullLayout(layoutId));
    this.instancesVersionState.update((version) => version + 1);
  }

  private ensureInstance(instanceId: string): SimulationEngineInstance {
    const existingInstance = this.instances.get(instanceId);
    if (existingInstance) {
      return existingInstance;
    }

    const createdInstance = new SimulationEngineInstance(instanceId, {
      getGenerationSnapshot: () => this.generationStageService.getGenerationSnapshot(),
      getLotGeometry: () => this.lotGeometryService.getActiveLotGeometry(),
      getSourceSnapshot: () => this.sourceReadService.getActiveSourceSnapshot(),
      postReport: (report) => this.reportingEndpointService.postReport(report),
      getSpawnHeatmap: () => this.constructionOutputsService.spawnHeatmap(),
    });

    this.instances.set(instanceId, createdInstance);
    this.instancesVersionState.update((version) => version + 1);
    return createdInstance;
  }

  private getActiveInstance(): SimulationEngineInstance {
    return this.ensureInstance(this.activeInstanceIdState());
  }

  readInstanceSnapshot(instanceId: string) {
    return this.ensureInstance(instanceId).snapshot();
  }

  private startAutoSpawnLoop(): void {
    if (this.autoSpawnTimer !== null) {
      return;
    }

    this.autoSpawnTimer = setInterval(() => {
      if (this.instances.size >= this.autoInstanceTargetCount) {
        this.stopAutoSpawnLoop();
        return;
      }

      const nextInstanceId = `simulation-${this.instances.size + 1}`;
      this.createInstance(nextInstanceId);
    }, this.autoInstanceSpawnIntervalMs);
  }

  private stopAutoSpawnLoop(): void {
    if (this.autoSpawnTimer !== null) {
      clearInterval(this.autoSpawnTimer);
      this.autoSpawnTimer = null;
    }
  }

  private hasRunningInstance(): boolean {
    return [...this.instances.values()].some((instance) => instance.snapshot().isRunning);
  }
}
