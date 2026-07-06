import { Component, computed, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { LotGeometryService } from '../../../core/geometry/geometry.exports';
import { GenerationStageService } from '../../../core/generation/generation.exports';
import { SourceReadService } from '../../../core/source/source.exports';
import { SimulationStageService } from '../../../core/simulation/simulation.exports';
import { buildSimulationPreview } from '../view-models/simulation-preview.factory';
import {
  buildSimulationForceMetrics,
  buildSimulationLotMetrics,
  buildSimulationRoomRows,
  computeSimulationSatRows,
  summarizeSatRows,
} from '../../../core/simulation/simulation.exports';
import { LayoutViewComponent } from '../../../shared/layout-view/layout-view.component';
import { StatusPillComponent } from '../../../shared/status-pill/status-pill.component';
import { StatStripComponent } from '../../../shared/stat-strip/stat-strip.component';

interface SimulationMetricRow {
  readonly label: string;
  readonly value: string;
}

interface SimulationHighlight {
  readonly label: string;
  readonly value: string;
}

interface SimulationCoreRow {
  readonly coreId: string;
  readonly status: string;
  readonly loop: string;
  readonly ticks: number;
  readonly resets: number;
  readonly captures: number;
  readonly fails: number;
  readonly lastScore: string;
  readonly lastOutcome: string;
}

interface SimulationGalleryRow {
  readonly id: string;
  readonly layoutId: string;
  readonly coreId: string;
  readonly jobIndex: number;
  readonly capturedAtIso: string;
  readonly score: number;
  readonly attractionAverage: number;
  readonly repelAverage: number;
  readonly bubbleCount: number;
  readonly rank: number;
}

@Component({
  selector: 'app-simulation-foundation-page',
  standalone: true,
  imports: [NgFor, NgIf, LayoutViewComponent, StatusPillComponent, StatStripComponent],
  templateUrl: './simulation-foundation-page.component.html',
  styleUrl: './simulation-foundation-page.component.scss',
})
export class SimulationFoundationPageComponent {
  private readonly lotGeometryService = inject(LotGeometryService);
  private readonly generationStageService = inject(GenerationStageService);
  private readonly sourceReadService = inject(SourceReadService);
  protected readonly simulationStageService = inject(SimulationStageService);
  private readonly previewWidth = 520;
  private readonly previewHeight = 360;
  private readonly decimalFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  private readonly shortDecimalFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  private readonly integerFormatter = new Intl.NumberFormat('en-US');
  private readonly dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  protected readonly autoSpawnTargetCount = this.simulationStageService.autoSpawnTargetCount;
  protected readonly autoSpawnIntervalSeconds = this.simulationStageService.autoSpawnInterval / 1000;
  protected readonly lotGeometry = this.lotGeometryService.getActiveLotGeometry();
  protected readonly generationSnapshot = this.generationStageService.getGenerationSnapshot();
  protected readonly sourceSnapshot = this.sourceReadService.getActiveSourceSnapshot();
  protected readonly snapshot = this.simulationStageService.snapshot;
  protected readonly instanceIds = this.simulationStageService.instanceIds;
  protected readonly captureGallery = this.simulationStageService.captureGallery;
  protected readonly activeJob = computed(() => this.snapshot().jobs[this.snapshot().activeJobIndex] ?? null);
  protected readonly activeCaptureOutcome = computed(() => this.activeJob()?.lastCaptureOutcome ?? null);
  protected readonly runningInstanceCount = computed(() =>
    this.instanceIds().filter((instanceId) => this.simulationStageService.readInstanceSnapshot(instanceId).isRunning).length,
  );
  protected readonly stageStatusLabel = computed(() => {
    const outcome = this.activeCaptureOutcome();
    if (this.captureGallery().length > 0) return 'Accepted layout found';
    if (outcome?.status === 'pass') return 'Accepted layout found';
    if (this.runningInstanceCount() > 0) return 'Exploring layouts';
    return 'Waiting to explore';
  });
  protected readonly stageStatusTone = computed<'ready' | 'progress' | 'attention'>(() => {
    const outcome = this.activeCaptureOutcome();
    if (this.captureGallery().length > 0 || outcome?.status === 'pass') return 'ready';
    if (this.runningInstanceCount() > 0) return 'progress';
    return 'attention';
  });
  protected readonly stageNextAction = computed(() => {
    if (this.captureGallery().length > 0) {
      return 'Open Processing or Candidate Gallery to inspect the strongest captured layout next.';
    }
    if (this.runningInstanceCount() > 0) {
      return 'Keep watching the live layout until the simulation captures a layout or shows a clear failure pattern.';
    }
    return 'Start the simulation from the run bar above so the first layout exploration cycle can begin.';
  });
  protected readonly stageSummary = computed(() => {
    const outcome = this.activeCaptureOutcome();
    if (outcome?.status === 'pass') {
      return 'A live simulation has already produced a passing capture. Use this page to confirm the layout motion and inspect why it succeeded.';
    }
    if (this.runningInstanceCount() > 0) {
      return 'This stage shows the layout bubbles moving inside the lot while the engine searches for a capture worth keeping.';
    }
    return 'This stage is where the layout first becomes animated. Start the engine to see rooms settle into a candidate arrangement.';
  });
  protected readonly highlightRows = computed<readonly SimulationHighlight[]>(() => {
    const latestOutcome = this.activeCaptureOutcome();
    return [
      { label: 'Current status', value: this.stageStatusLabel() },
      { label: 'Running sims', value: this.integerFormatter.format(this.runningInstanceCount()) },
      { label: 'Total sims', value: this.integerFormatter.format(this.instanceIds().length) },
      { label: 'Accepted layouts', value: this.integerFormatter.format(this.captureGallery().length) },
      { label: 'Latest result', value: latestOutcome?.status ?? 'waiting' },
    ];
  });
  protected readonly coreRows = computed<readonly SimulationCoreRow[]>(() =>
    this.instanceIds().map((instanceId) => {
      const instanceSnapshot = this.simulationStageService.readInstanceSnapshot(instanceId);
      const activeJob = instanceSnapshot.jobs[instanceSnapshot.activeJobIndex];
      const lastOutcome = activeJob?.lastCaptureOutcome ?? null;

      return {
        coreId: instanceId,
        status: instanceSnapshot.isRunning ? 'running' : 'paused',
        loop: instanceSnapshot.captureLoopRunning ? 'active' : 'idle',
        ticks: activeJob?.tickCount ?? 0,
        resets: activeJob?.resetCount ?? 0,
        captures: activeJob?.capturedCount ?? 0,
        fails: activeJob?.failedCount ?? 0,
        lastScore: lastOutcome ? this.decimalFormatter.format(lastOutcome.score) : 'n/a',
        lastOutcome: lastOutcome?.status ?? 'waiting',
      };
    }),
  );
  protected readonly galleryRows = computed<readonly SimulationGalleryRow[]>(() =>
    this.captureGallery()
      .slice(0, 18)
      .map((capture, index) => ({
        id: capture.id,
        layoutId: capture.layoutId,
        coreId: capture.instanceId,
        jobIndex: capture.jobIndex,
        capturedAtIso: capture.capturedAtIso,
        score: capture.score,
        attractionAverage: capture.attractionAverage,
        repelAverage: capture.repelAverage,
        bubbleCount: capture.bubbleCount,
        rank: index + 1,
      })),
  );
  protected readonly viewerMetricRows = computed<readonly SimulationMetricRow[]>(() => {
    const activeJob = this.activeJob();
    const latestOutcome = this.activeCaptureOutcome();

    return [
      { label: 'Parallel simulations', value: `${this.integerFormatter.format(this.runningInstanceCount())} running / ${this.integerFormatter.format(this.instanceIds().length)} total` },
      { label: 'Capture loop', value: this.snapshot().captureLoopRunning ? 'active' : 'idle' },
      { label: 'Accepted layouts', value: this.integerFormatter.format(this.captureGallery().length) },
      { label: 'Latest outcome', value: latestOutcome?.status ?? 'waiting' },
      { label: 'Latest score', value: latestOutcome ? this.decimalFormatter.format(latestOutcome.score) : 'n/a' },
      { label: 'Latest reason', value: latestOutcome?.reason ?? 'Let the simulation run long enough to complete an evaluation cycle.' },
      { label: 'Bubbles in view', value: this.integerFormatter.format(activeJob?.bubbles.length ?? 0) },
      { label: 'Ticks in view', value: this.integerFormatter.format(activeJob?.tickCount ?? 0) },
    ];
  });
  protected readonly activeOutcomeSummary = computed(() => {
    const outcome = this.activeCaptureOutcome();
    if (!outcome) {
      return 'No evaluation has completed yet. Let the layout keep moving until the engine finishes a capture check.';
    }
    return outcome.reason;
  });
  protected readonly preview = computed(() =>
    buildSimulationPreview(this.lotGeometry, this.activeJob()?.bubbles ?? [], {
      width: this.previewWidth,
      height: this.previewHeight,
      padding: 24,
    }),
  );
  protected readonly lotMetrics = computed(() => {
    const frontage = this.lotGeometry.lotSegments.find((segment) => segment.isRrow)?.distance ?? 0;
    const sideSetbacks = this.lotGeometry.lotSegments.filter((segment) => !segment.isRrow).map((segment) => segment.setback);
    const averageSideSetback = sideSetbacks.length
      ? sideSetbacks.reduce((total, setback) => total + setback, 0) / sideSetbacks.length
      : 0;
    const allocatedArea = this.generationSnapshot.roomInstances.reduce(
      (total, roomInstance) => total + roomInstance.targetAreaSquareMeters,
      0,
    );

    return buildSimulationLotMetrics(
      this.activeJob()?.bubbles ?? [],
      this.lotGeometry.buildableAreaSquareMeters,
      this.lotGeometry.lotAreaSquareMeters,
      frontage,
      averageSideSetback,
      allocatedArea,
    );
  });
  protected readonly forceMetrics = computed(() => buildSimulationForceMetrics(this.sourceSnapshot.source.settings));
  protected readonly roomRows = computed(() => buildSimulationRoomRows(this.generationSnapshot.roomInstances));
  protected readonly satRows = computed(() => computeSimulationSatRows(this.activeJob()?.bubbles ?? [], this.sourceSnapshot.source.settings));
  protected readonly attractionSatSummary = computed(() => summarizeSatRows(this.satRows().attractionRows));
  protected readonly repelSatSummary = computed(() => summarizeSatRows(this.satRows().repelRows));
  protected readonly recentCaptures = computed(() => this.snapshot().recentCaptures);
  protected readonly activeJobBubbles = computed(() => this.activeJob()?.bubbles ?? []);

  protected formatScore(value: number): string {
    return this.decimalFormatter.format(value);
  }

  protected formatDistance(value: number): string {
    return `${this.shortDecimalFormatter.format(value)} m`;
  }

  protected formatVector(value: number): string {
    return this.decimalFormatter.format(value);
  }

  protected formatDate(value: string): string {
    return this.dateFormatter.format(new Date(value));
  }

  protected startSimulation(): void {
    this.simulationStageService.startSimulation();
  }

  protected stopSimulation(): void {
    this.simulationStageService.stopSimulation();
  }

  protected resetActiveJob(): void {
    this.simulationStageService.resetActiveJob();
  }

  protected shakeActiveJob(): void {
    this.simulationStageService.shakeActiveJob();
  }

  protected activateJob(index: number): void {
    this.simulationStageService.activateJob(index);
  }

  protected activateInstance(instanceId: string): void {
    this.simulationStageService.activateInstance(instanceId);
  }
}
