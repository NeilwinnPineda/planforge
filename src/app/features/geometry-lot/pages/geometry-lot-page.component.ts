import { Component, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { LotGeometryService } from '../../../core/geometry/geometry.exports';
import type { GeometryPoint } from '../../../core/geometry/geometry.exports';

interface GeometryMetricRow {
  readonly label: string;
  readonly value: string;
}

interface PreviewPoint {
  readonly x: number;
  readonly y: number;
}

interface PreviewGuideLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly labelX: number;
  readonly labelY: number;
  readonly label: string;
}

interface GeometryPreviewModel {
  readonly polygon: string;
  readonly points: readonly PreviewPoint[];
}

interface GeometryProjectionModel {
  readonly lotPreview: GeometryPreviewModel;
  readonly buildablePreview: GeometryPreviewModel;
  readonly guideLines: readonly PreviewGuideLine[];
  readonly scaleBarWidthPixels: number;
  readonly scaleBarMeters: number;
}

@Component({
  selector: 'app-geometry-lot-page',
  standalone: true,
  imports: [NgFor],
  templateUrl: './geometry-lot-page.component.html',
  styleUrl: './geometry-lot-page.component.scss',
})
export class GeometryLotPageComponent {
  private readonly lotGeometryService = inject(LotGeometryService);
  private readonly previewWidth = 440;
  private readonly previewHeight = 320;
  protected readonly lotGeometry = this.lotGeometryService.getActiveLotGeometry();
  protected readonly metricRows: readonly GeometryMetricRow[] = [
    { label: 'Lot area', value: `${this.lotGeometry.lotAreaSquareMeters.toFixed(2)} sq m` },
    { label: 'Buildable area', value: `${this.lotGeometry.buildableAreaSquareMeters.toFixed(2)} sq m` },
    { label: 'Frontage segments', value: String(this.lotGeometry.frontageSegments) },
    { label: 'Closure error', value: `${this.lotGeometry.closureErrorMeters.toFixed(3)} m` },
  ];
  protected readonly setbackRows = this.lotGeometry.lotSegments.map((segment, index) => ({
    edge: `${segment.point} → ${this.lotGeometry.lotSegments[(index + 1) % this.lotGeometry.lotSegments.length].point}`,
    setback: `${segment.setback.toFixed(2)} m`,
    frontage: segment.isRrow ? 'RROW' : 'Side / rear',
  }));
  protected readonly projection = this.buildGeometryProjection();

  // Geometry projection step for page inspection.
  // Input: canonical world-space lot/buildable geometry plus preview canvas size.
  // Output: projected polygons, setback guide lines, and a scale bar for read-only inspection.
  // Stage role: projection/presentation preparation only; canonical geometry remains unchanged.
  private buildGeometryProjection(): GeometryProjectionModel {
    const lotPoints = this.lotGeometry.lotPoints;
    const buildablePoints = this.lotGeometry.buildablePoints;
    const width = this.previewWidth;
    const height = this.previewHeight;
    const minX = Math.min(...lotPoints.map((point) => point.x));
    const maxX = Math.max(...lotPoints.map((point) => point.x));
    const minY = Math.min(...lotPoints.map((point) => point.y));
    const maxY = Math.max(...lotPoints.map((point) => point.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const padding = 20;
    const scale = Math.min(
      (width - padding * 2) / spanX,
      (height - padding * 2) / spanY,
    );
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;

    const projectPoints = (points: GeometryPoint[]): PreviewPoint[] => points.map((point) => ({
      x: Number((offsetX + (point.x - minX) * scale).toFixed(2)),
      y: Number((height - (offsetY + (point.y - minY) * scale)).toFixed(2)),
    }));
    const lotPreviewPoints = projectPoints(lotPoints);
    const buildablePreviewPoints = projectPoints(buildablePoints);
    const guideLines: PreviewGuideLine[] = this.lotGeometry.lotSegments.map((segment, index) => {
      const lotPointA = lotPreviewPoints[index];
      const lotPointB = lotPreviewPoints[(index + 1) % lotPreviewPoints.length];
      const buildablePointA = buildablePreviewPoints[index];
      const buildablePointB = buildablePreviewPoints[(index + 1) % buildablePreviewPoints.length];
      const buildableMidpoint = {
        x: (buildablePointA.x + buildablePointB.x) / 2,
        y: (buildablePointA.y + buildablePointB.y) / 2,
      };
      const lotProjectionPoint = this.projectPointOntoSegment(
        buildableMidpoint,
        lotPointA,
        lotPointB,
      );

      return {
        x1: Number(lotProjectionPoint.x.toFixed(2)),
        y1: Number(lotProjectionPoint.y.toFixed(2)),
        x2: Number(buildableMidpoint.x.toFixed(2)),
        y2: Number(buildableMidpoint.y.toFixed(2)),
        labelX: Number(((lotProjectionPoint.x + buildableMidpoint.x) / 2).toFixed(2)),
        labelY: Number((((lotProjectionPoint.y + buildableMidpoint.y) / 2) - 6).toFixed(2)),
        label: `${segment.setback.toFixed(1)}m`,
      };
    });

    return {
      lotPreview: {
        points: lotPreviewPoints,
        polygon: lotPreviewPoints.map((point) => `${point.x},${point.y}`).join(' '),
      },
      buildablePreview: {
        points: buildablePreviewPoints,
        polygon: buildablePreviewPoints.map((point) => `${point.x},${point.y}`).join(' '),
      },
      guideLines,
      scaleBarMeters: 2,
      scaleBarWidthPixels: Number((2 * scale).toFixed(2)),
    };
  }

  protected trackByEdge(index: number): number {
    return index;
  }

  private projectPointOntoSegment(
    point: PreviewPoint,
    segmentStart: PreviewPoint,
    segmentEnd: PreviewPoint,
  ): PreviewPoint {
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;
    const segmentLengthSquared = dx * dx + dy * dy;

    if (segmentLengthSquared <= 1e-9) {
      return segmentStart;
    }

    const projectionRatio = Math.max(
      0,
      Math.min(
        1,
        ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / segmentLengthSquared,
      ),
    );

    return {
      x: segmentStart.x + dx * projectionRatio,
      y: segmentStart.y + dy * projectionRatio,
    };
  }
}
