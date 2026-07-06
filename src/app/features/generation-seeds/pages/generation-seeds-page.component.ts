import { Component, computed, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { GenerationStageService } from '../../../core/generation/generation.exports';
import {
  createSvgViewportFit,
  LotGeometryService,
} from '../../../core/geometry/geometry.exports';
import type { CandidateSeedPoint } from '../../../core/generation/generation.exports';
import type { GeometryPoint } from '../../../core/geometry/geometry.exports';
import { LayoutViewComponent } from '../../../shared/layout-view/layout-view.component';
import { StatusPillComponent } from '../../../shared/status-pill/status-pill.component';

interface SeedMetricRow {
  readonly label: string;
  readonly value: string;
}

interface SeedStatusRow {
  readonly label: string;
  readonly value: string;
}

interface PreviewSeedCircle {
  readonly label: string;
  readonly color: string;
  readonly cx: number;
  readonly cy: number;
  readonly radiusPixels: number;
  readonly band: string;
  readonly biasNote: string;
}

@Component({
  selector: 'app-generation-seeds-page',
  standalone: true,
  imports: [NgFor, LayoutViewComponent, StatusPillComponent],
  templateUrl: './generation-seeds-page.component.html',
  styleUrl: './generation-seeds-page.component.scss',
})
export class GenerationSeedsPageComponent {
  private readonly lotGeometryService = inject(LotGeometryService);
  private readonly generationStageService = inject(GenerationStageService);

  protected readonly lotGeometry = this.lotGeometryService.getActiveLotGeometry();
  protected readonly generationSnapshot = this.generationStageService.getGenerationSnapshot();
  protected readonly stageStatusLabel = computed(() =>
    this.generationSnapshot.candidateLayout.seeds.length > 0 ? 'Ready for review' : 'Needs input',
  );
  protected readonly previewViewport = createSvgViewportFit(this.lotGeometry.lotBounds, {
    maxWidth: 660,
    maxHeight: 430,
    minWidth: 520,
    minHeight: 340,
    padding: 28,
  });
  protected readonly metricRows: readonly SeedMetricRow[] = [
    { label: 'Active room instances', value: String(this.generationSnapshot.roomInstances.length) },
    { label: 'Seed points', value: String(this.generationSnapshot.candidateLayout.seeds.length) },
    { label: 'Front band rooms', value: String(this.countBand('front')) },
    { label: 'Rear band rooms', value: String(this.countBand('rear')) },
  ];
  protected readonly statusRows: readonly SeedStatusRow[] = [
    {
      label: 'Readiness',
      value: this.generationSnapshot.candidateLayout.seeds.length > 0
        ? 'Candidate seeds are ready to inspect'
        : 'No candidate seeds available yet',
    },
    {
      label: 'Generation method',
      value: 'Deterministic band placement with stage-safe frontage, center, and rear zones.',
    },
    {
      label: 'Next action',
      value: 'Review seed spread and room ordering before moving into live simulation behavior.',
    },
  ];
  protected readonly previewLotPolygon = this.buildPreviewPolygon(this.lotGeometry.lotPoints);
  protected readonly previewBuildablePolygon = this.buildPreviewPolygon(this.lotGeometry.buildablePoints);
  protected readonly previewSeedCircles = this.buildPreviewSeedCircles(this.generationSnapshot.candidateLayout.seeds);
  protected readonly bandRows = [
    { band: 'Front band', description: 'Front-facing rooms begin near the road edge to preserve an entry-facing starting condition.' },
    { band: 'Center band', description: 'Interior rooms stay centered as a neutral starting arrangement before physics takes over.' },
    { band: 'Rear band', description: 'Sleeping rooms begin toward the rear to preserve privacy intent in the first layout pass.' },
  ];
  protected readonly summaryChips = [
    this.stageStatusLabel(),
    `${this.generationSnapshot.candidateLayout.seeds.length} seed points`,
    `${this.generationSnapshot.roomInstances.length} active rooms`,
    'Even preview spread',
  ];

  private buildPreviewPolygon(points: GeometryPoint[]): string {
    const previewPoints = this.projectPoints(points);
    return previewPoints.map((point) => `${point.x},${point.y}`).join(' ');
  }

  private buildPreviewSeedCircles(seeds: CandidateSeedPoint[]): PreviewSeedCircle[] {
    const previewSeedPoints = this.buildPreviewSeedPoints(seeds);
    const projectedPoints = this.projectPoints(previewSeedPoints);

    return previewSeedPoints.map((seed, index) => ({
      label: seed.label,
      color: seed.color,
      cx: projectedPoints[index].x,
      cy: projectedPoints[index].y,
      radiusPixels: Number((seed.radiusMeters * this.previewViewport.scale).toFixed(2)),
      band: seed.band,
      biasNote: seed.biasProfile.note,
    }));
  }

  private projectPoints(points: GeometryPoint[]): Array<{ x: number; y: number }> {
    return this.previewViewport.projectPoints(points);
  }

  private buildPreviewSeedPoints(seeds: CandidateSeedPoint[]): CandidateSeedPoint[] {
    const bounds = this.lotGeometry.buildableBounds;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const perBandVerticalAnchor: Record<CandidateSeedPoint['band'], number> = {
      front: 0.22,
      center: 0.5,
      rear: 0.78,
    };

    const groupedSeeds = {
      front: seeds.filter((seed) => seed.band === 'front'),
      center: seeds.filter((seed) => seed.band === 'center'),
      rear: seeds.filter((seed) => seed.band === 'rear'),
    } as const;

    return (['front', 'center', 'rear'] as const).flatMap((band) => {
      const bandSeeds = groupedSeeds[band];
      return bandSeeds.map((seed, index) => {
        const distributedAnchor = this.buildDistributedAnchor(index, bandSeeds.length);
        const stagger = this.buildVerticalStagger(index, bandSeeds.length);

        return {
          ...seed,
          x: Number((bounds.minX + width * distributedAnchor).toFixed(3)),
          y: Number((bounds.minY + height * this.clampAnchor(perBandVerticalAnchor[band] + stagger)).toFixed(3)),
        };
      });
    });
  }

  private buildDistributedAnchor(index: number, total: number): number {
    if (total <= 1) {
      return 0.5;
    }

    return this.clampAnchor(0.16 + ((index + 1) / (total + 1)) * 0.68);
  }

  private buildVerticalStagger(index: number, total: number): number {
    if (total <= 1) {
      return 0;
    }

    const staggerPattern = [0, -0.035, 0.035, -0.06, 0.06, -0.085, 0.085];
    return staggerPattern[index] ?? 0;
  }

  private clampAnchor(value: number): number {
    return Math.min(0.88, Math.max(0.12, value));
  }

  private countBand(band: CandidateSeedPoint['band']): number {
    return this.generationSnapshot.candidateLayout.seeds.filter((seed) => seed.band === band).length;
  }
}
