import { Component, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { GenerationStageService } from '../../../core/generation/generation.exports';
import { LotGeometryService } from '../../../core/geometry/geometry.exports';
import type { CandidateSeedPoint } from '../../../core/generation/generation.exports';
import type { GeometryPoint } from '../../../core/geometry/geometry.exports';

interface SeedMetricRow {
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
  imports: [NgFor],
  templateUrl: './generation-seeds-page.component.html',
  styleUrl: './generation-seeds-page.component.scss',
})
export class GenerationSeedsPageComponent {
  private readonly lotGeometryService = inject(LotGeometryService);
  private readonly generationStageService = inject(GenerationStageService);
  private readonly previewWidth = 520;
  private readonly previewHeight = 360;

  protected readonly lotGeometry = this.lotGeometryService.getActiveLotGeometry();
  protected readonly generationSnapshot = this.generationStageService.getGenerationSnapshot();
  protected readonly metricRows: readonly SeedMetricRow[] = [
    { label: 'Active room instances', value: String(this.generationSnapshot.roomInstances.length) },
    { label: 'Seed set', value: this.generationSnapshot.candidateLayout.seedSetLabel },
    { label: 'Generation method', value: this.generationSnapshot.candidateLayout.method },
    { label: 'Seed points', value: String(this.generationSnapshot.candidateLayout.seeds.length) },
  ];
  protected readonly previewLotPolygon = this.buildPreviewPolygon(this.lotGeometry.lotPoints);
  protected readonly previewBuildablePolygon = this.buildPreviewPolygon(this.lotGeometry.buildablePoints);
  protected readonly previewSeedCircles = this.buildPreviewSeedCircles(this.generationSnapshot.candidateLayout.seeds);
  protected readonly bandRows = [
    { band: 'front', description: 'Only explicit early-stage frontage tags bias toward the road edge here.' },
    { band: 'center', description: 'General interior rooms keep a neutral center-band seed until later pipeline data exists.' },
    { band: 'rear', description: 'Sleeping-tag rooms keep a simple rear-band seed, not a late-stage resolved intent.' },
  ];

  private buildPreviewPolygon(points: GeometryPoint[]): string {
    const previewPoints = this.projectPoints(points);
    return previewPoints.map((point) => `${point.x},${point.y}`).join(' ');
  }

  private buildPreviewSeedCircles(seeds: CandidateSeedPoint[]): PreviewSeedCircle[] {
    const projectedPoints = this.projectPoints(seeds);
    const bounds = this.lotGeometry.lotBounds;
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const padding = 24;
    const scale = Math.min(
      (this.previewWidth - padding * 2) / spanX,
      (this.previewHeight - padding * 2) / spanY,
    );

    return seeds.map((seed, index) => ({
      label: seed.label,
      color: seed.color,
      cx: projectedPoints[index].x,
      cy: projectedPoints[index].y,
      radiusPixels: Number((seed.radiusMeters * scale).toFixed(2)),
      band: seed.band,
      biasNote: seed.biasProfile.note,
    }));
  }

  private projectPoints(points: GeometryPoint[]): Array<{ x: number; y: number }> {
    const bounds = this.lotGeometry.lotBounds;
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const padding = 24;
    const scale = Math.min(
      (this.previewWidth - padding * 2) / spanX,
      (this.previewHeight - padding * 2) / spanY,
    );
    const offsetX = (this.previewWidth - spanX * scale) / 2;
    const offsetY = (this.previewHeight - spanY * scale) / 2;

    return points.map((point) => ({
      x: Number((offsetX + (point.x - bounds.minX) * scale).toFixed(2)),
      y: Number((this.previewHeight - (offsetY + (point.y - bounds.minY) * scale)).toFixed(2)),
    }));
  }
}
