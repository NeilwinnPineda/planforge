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

interface SimulationMetricRow {
  readonly label: string;
  readonly value: string;
}

interface SimulationCoreRow {
  readonly coreId: string;
  readonly isActive: boolean;
  readonly status: string;
  readonly loop: string;
  readonly ticks: number;
  readonly resets: number;
  readonly captures: number;
  readonly fails: number;
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
  imports: [NgFor, NgIf],
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
  protected readonly coreRows = computed<readonly SimulationCoreRow[]>(() =>
    this.instanceIds().map((instanceId) => {
      const instanceSnapshot = this.simulationStageService.readInstanceSnapshot(instanceId);
      const activeJob = instanceSnapshot.jobs[instanceSnapshot.activeJobIndex];

      return {
        coreId: instanceId,
        isActive: instanceId === this.simulationStageService.activeInstanceId(),
        status: instanceSnapshot.isRunning ? 'running' : 'paused',
        loop: instanceSnapshot.captureLoopRunning ? 'active' : 'idle',
        ticks: activeJob?.tickCount ?? 0,
        resets: activeJob?.resetCount ?? 0,
        captures: activeJob?.capturedCount ?? 0,
        fails: activeJob?.failedCount ?? 0,
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
  protected readonly metricRows = computed<readonly SimulationMetricRow[]>(() => {
    const activeJob = this.activeJob();
    const placedBubbleCount = activeJob?.bubbles.filter((bubble) => bubble.placed).length ?? 0;
    const totalBubbleCount = activeJob?.bubbles.length ?? 0;

    return [
      { label: 'Core count', value: `${this.integerFormatter.format(this.instanceIds().length)} / ${this.integerFormatter.format(this.simulationStageService.autoSpawnTargetCount)}` },
      { label: 'Cascade siblings', value: String(this.simulationStageService.cascadeSiblingCount) },
      { label: 'Spawn cadence', value: `${this.integerFormatter.format(this.simulationStageService.autoSpawnInterval / 1000)} s` },
      { label: 'Gallery layouts', value: this.integerFormatter.format(this.captureGallery().length) },
      { label: 'Runner count', value: this.integerFormatter.format(this.snapshot().jobs.length) },
      { label: 'Engine running', value: this.snapshot().isRunning ? 'running' : 'stopped' },
      { label: 'Capture loop', value: this.snapshot().captureLoopRunning ? 'active' : 'idle' },
      { label: 'Reset cadence', value: `${this.integerFormatter.format(this.snapshot().hardResetIntervalMs)} ms` },
      { label: 'Auto shake feature', value: this.snapshot().autoShakeEnabled ? 'enabled in source' : 'disabled in source' },
      { label: 'Active runner ticks', value: this.integerFormatter.format(activeJob?.tickCount ?? 0) },
      { label: 'Placed bubbles', value: `${this.integerFormatter.format(placedBubbleCount)} / ${this.integerFormatter.format(totalBubbleCount)}` },
    ];
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
