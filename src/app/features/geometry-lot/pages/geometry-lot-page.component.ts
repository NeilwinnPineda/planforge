import { NgFor, NgIf } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  createSvgViewportFit,
  LotGeometryService,
} from '../../../core/geometry/geometry.exports';
import { SourceReadService } from '../../../core/source/source.exports';
import { LayoutViewComponent, type LayoutViewAnnotation, type LayoutViewLine, type LayoutViewPoint } from '../../../shared/layout-view/layout-view.component';
import { StatusPillComponent } from '../../../shared/status-pill/status-pill.component';
import { StatStripComponent } from '../../../shared/stat-strip/stat-strip.component';
import type {
  GeometryBounds,
  GeometryPoint,
  LotGeometryResult,
  NamedGeometryPoint,
  ProjectedSvgPoint,
} from '../../../core/geometry/geometry.exports';

interface GeometryMetricRow {
  readonly label: string;
  readonly value: string;
}

interface GeometryStatusRow {
  readonly label: string;
  readonly value: string;
}

interface GeometryHighlightRow {
  readonly label: string;
  readonly value: string;
}

interface LotSegmentEditorRow {
  readonly segmentIndex: number;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly bearing: string;
  readonly northSouth: 'N' | 'S';
  readonly degrees: number;
  readonly minutes: number;
  readonly eastWest: 'E' | 'W';
  readonly distance: number;
}

interface BoundarySetupRow {
  readonly segmentIndex: number;
  readonly edge: string;
  readonly setback: number;
  readonly frontage: string;
  readonly isRrow: boolean;
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

interface PreviewEdgeAnnotation {
  readonly lineX1: number;
  readonly lineY1: number;
  readonly lineX2: number;
  readonly lineY2: number;
  readonly labelX: number;
  readonly labelY: number;
  readonly distance: string;
}

interface PreviewClosureLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface GeometryPreviewModel {
  readonly polygon: string;
  readonly points: readonly ProjectedSvgPoint[];
}

interface GeometryProjectionModel {
  readonly viewBox: string;
  readonly width: number;
  readonly height: number;
  readonly lotPreview: GeometryPreviewModel;
  readonly buildablePreview: GeometryPreviewModel;
  readonly hasBuildablePreview: boolean;
  readonly closureLine: PreviewClosureLine | null;
  readonly edgeAnnotations: readonly PreviewEdgeAnnotation[];
  readonly guideLines: readonly PreviewGuideLine[];
  readonly scaleBarWidthPixels: number;
  readonly scaleBarMeters: number;
  readonly scaleBarX: number;
  readonly scaleBarY: number;
  readonly scaleTextY: number;
}

type GeometryStageStatus = 'ready' | 'review' | 'fail';

@Component({
  selector: 'app-geometry-lot-page',
  standalone: true,
  imports: [NgFor, NgIf, LayoutViewComponent, StatusPillComponent, StatStripComponent],
  templateUrl: './geometry-lot-page.component.html',
  styleUrl: './geometry-lot-page.component.scss',
})
export class GeometryLotPageComponent {
  private readonly lotGeometryService = inject(LotGeometryService);
  private readonly sourceReadService = inject(SourceReadService);

  protected readonly lotGeometry = computed(() => this.lotGeometryService.getActiveLotGeometry());
  protected readonly stageStatus = computed<GeometryStageStatus>(() => {
    const geometry = this.lotGeometry();
    if (!geometry.isBuildable) {
      return 'fail';
    }

    return geometry.closureErrorMeters < 0.01 && geometry.frontageSegments === 1
      ? 'ready'
      : 'review';
  });
  protected readonly stageStatusLabel = computed(() => {
    const status = this.stageStatus();
    if (status === 'fail') {
      return 'Fail';
    }

    return status === 'ready' ? 'Ready' : 'Review';
  });
  protected readonly stageSummary = computed(() => {
    const geometry = this.lotGeometry();

    return `Use this stage to confirm the real lot shape before any room layout work begins. The current site has ${geometry.lotPoints.length} lot corners and resolves to ${geometry.buildableAreaSquareMeters.toFixed(2)} square meters inside the setback-derived footprint.`;
  });
  protected readonly stageNextAction = computed(() => {
    const status = this.stageStatus();

    if (status === 'ready') {
      return 'If the lot outline and buildable inset both look correct, continue to Generation and inspect the first seeded layout.';
    }

    if (status === 'review') {
      return 'Review frontage, closure, and setbacks before trusting the lot enough to seed room placement.';
    }

    return 'Fix the failing geometry first so generation does not start from an unusable or non-buildable site.';
  });
  protected readonly metricRows = computed<readonly GeometryMetricRow[]>(() => {
    const geometry = this.lotGeometry();
    return [
      { label: 'Lot area', value: `${geometry.lotAreaSquareMeters.toFixed(2)} sq m` },
      { label: 'Buildable area', value: `${geometry.buildableAreaSquareMeters.toFixed(2)} sq m` },
      { label: 'Frontage segments', value: String(geometry.frontageSegments) },
      { label: 'Closure error', value: `${geometry.closureErrorMeters.toFixed(3)} m` },
    ];
  });
  protected readonly statusRows = computed<readonly GeometryStatusRow[]>(() => {
    const geometry = this.lotGeometry();
    const status = this.stageStatus();

    return [
      {
        label: 'Readiness',
        value:
          status === 'ready'
            ? 'Ready for generation'
            : status === 'fail'
              ? 'Lot must be corrected before generation'
              : 'Needs geometry review',
      },
      {
        label: 'Frontage',
        value:
          geometry.frontageSegments === 1
            ? 'Single frontage edge confirmed'
            : 'Frontage edge needs review',
      },
      {
        label: 'Next action',
        value:
          status === 'fail'
            ? 'Correct the lot coordinates or setbacks until a buildable footprint resolves.'
            : 'Confirm setbacks and buildable shape before moving to generation.',
      },
    ];
  });
  protected readonly highlightRows = computed<readonly GeometryHighlightRow[]>(() => [
    { label: 'Current status', value: this.stageStatusLabel() },
    { label: 'Lot corners', value: String(this.lotGeometry().lotPoints.length) },
    { label: 'Buildable corners', value: String(this.lotGeometry().buildablePoints.length) },
    { label: 'Closure', value: this.closureStatusLabel() },
  ]);
  protected readonly setbackRows = computed<readonly BoundarySetupRow[]>(() => {
    const geometry = this.lotGeometry();
    return geometry.lotSegments.map((segment, index) => ({
      segmentIndex: index,
      edge: `${segment.point} -> ${geometry.lotSegments[(index + 1) % geometry.lotSegments.length].point}`,
      setback: segment.setback,
      frontage: segment.isRrow ? 'Frontage edge' : 'Side / rear edge',
      isRrow: Boolean(segment.isRrow),
    }));
  });
  protected readonly lotSegmentRows = computed<readonly LotSegmentEditorRow[]>(() => {
    const geometry = this.lotGeometry();
    return geometry.lotSegments.map((segment, index) => ({
      segmentIndex: index,
      startLabel: geometry.lotPoints[index]?.label ?? segment.point,
      endLabel: geometry.lotPoints[(index + 1) % geometry.lotPoints.length]?.label ?? segment.point,
      bearing: segment.bearing,
      ...this.parseBearing(segment.bearing),
      distance: segment.distance,
    }));
  });
  protected readonly closureStatusLabel = computed(() => (
    this.lotGeometry().closureErrorMeters < 0.01 ? 'Closed' : 'Open'
  ));
  protected readonly projection = computed(() => this.buildGeometryProjection(this.lotGeometry()));
  protected readonly layoutGuideLines = computed<readonly LayoutViewLine[]>(() => {
    const projection = this.projection();
    return [
      ...projection.guideLines.map((line) => ({ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 })),
      ...(projection.closureLine ? [{ ...projection.closureLine, major: true }] : []),
    ];
  });
  protected readonly layoutPoints = computed<readonly LayoutViewPoint[]>(() => [
    ...this.projection().lotPreview.points.map((point) => ({ x: point.x, y: point.y, kind: 'lot' as const })),
    ...this.projection().buildablePreview.points.map((point) => ({ x: point.x, y: point.y, kind: 'buildable' as const })),
  ]);
  protected readonly layoutAnnotations = computed<readonly LayoutViewAnnotation[]>(() => {
    const projection = this.projection();
    const geometry = this.lotGeometry();
    return [
      ...projection.lotPreview.points.flatMap((point, index): LayoutViewAnnotation[] => [
        { x: point.x + 7, y: point.y - 8, text: geometry.lotPoints[index]?.label ?? `P${index + 1}`, kind: 'label' },
        { x: point.x + 7, y: point.y + 6, text: geometry.lotSegments[index]?.bearing ?? '', kind: 'bearing' },
      ]),
      ...projection.edgeAnnotations.map((edge) => ({ x: edge.labelX, y: edge.labelY + 4, text: edge.distance, kind: 'distance' as const, anchor: 'middle' as const })),
      ...projection.guideLines.map((guide) => ({ x: guide.labelX, y: guide.labelY, text: guide.label, kind: 'setback' as const, anchor: 'middle' as const })),
    ];
  });
  protected readonly layoutScaleBar = computed(() => ({
    x: this.projection().scaleBarX,
    y: this.projection().scaleBarY,
    width: this.projection().scaleBarWidthPixels,
    label: `${this.projection().scaleBarMeters}m scale`,
  }));

  protected onLotSegmentBearingChanged(segmentIndex: number, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const value = input?.value?.trim() ?? '';

    if (!value) {
      return;
    }

    this.sourceReadService.updateLotSegmentBearing(segmentIndex, value);
  }

  protected onLotSegmentDistanceChanged(segmentIndex: number, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const value = Number(input?.value ?? Number.NaN);

    if (!Number.isFinite(value)) {
      return;
    }

    this.sourceReadService.updateLotSegmentDistance(segmentIndex, value);
  }

  protected adjustLotSegmentDistance(segmentIndex: number, distance: number, delta: number): void {
    this.sourceReadService.updateLotSegmentDistance(segmentIndex, Math.max(0.001, Number((distance + delta).toFixed(3))));
  }

  protected adjustLotSegmentSetback(segmentIndex: number, setback: number, delta: number): void {
    this.sourceReadService.updateLotSegmentSetback(segmentIndex, Math.max(0, Number((setback + delta).toFixed(2))));
  }

  protected adjustBearingPart(row: LotSegmentEditorRow, part: 'degrees' | 'minutes', delta: number): void {
    const totalMinutes = Math.max(0, Math.min(5400, row.degrees * 60 + row.minutes + (part === 'degrees' ? delta * 60 : delta)));
    this.writeBearing(row.segmentIndex, row.northSouth, Math.floor(totalMinutes / 60), totalMinutes % 60, row.eastWest);
  }

  protected toggleBearingAxis(row: LotSegmentEditorRow, axis: 'northSouth' | 'eastWest'): void {
    this.writeBearing(
      row.segmentIndex,
      axis === 'northSouth' ? (row.northSouth === 'N' ? 'S' : 'N') : row.northSouth,
      row.degrees,
      row.minutes,
      axis === 'eastWest' ? (row.eastWest === 'E' ? 'W' : 'E') : row.eastWest,
    );
  }

  protected onLotSegmentRrowChanged(segmentIndex: number, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.sourceReadService.updateLotSegmentRrow(segmentIndex, Boolean(input?.checked));
  }

  protected onLotSegmentSetbackChanged(segmentIndex: number, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const value = Number(input?.value ?? Number.NaN);

    if (!Number.isFinite(value)) {
      return;
    }

    this.sourceReadService.updateLotSegmentSetback(segmentIndex, value);
  }

  protected addNextLotCorner(): void {
    const geometry = this.lotGeometry();
    if (!geometry.lotPoints.length) {
      return;
    }

    this.sourceReadService.addLotPoint(geometry.lotPoints.length - 1);
  }

  protected removeLotCorner(pointIndex: number): void {
    this.sourceReadService.removeLotPoint(pointIndex);
  }

  protected canRemoveLotCorner(pointIndex: number): boolean {
    return pointIndex > 0 && this.lotGeometry().lotPoints.length > 3;
  }

  protected trackByEdge(index: number): number {
    return index;
  }

  private parseBearing(bearing: string): Pick<LotSegmentEditorRow, 'northSouth' | 'degrees' | 'minutes' | 'eastWest'> {
    const match = /^([NS])\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+([EW])$/i.exec(bearing.trim());
    return {
      northSouth: (match?.[1]?.toUpperCase() === 'S' ? 'S' : 'N'),
      degrees: Math.max(0, Math.min(90, Math.floor(Number(match?.[2] ?? 0)))),
      minutes: Math.max(0, Math.min(59, Math.round(Number(match?.[3] ?? 0)))),
      eastWest: (match?.[4]?.toUpperCase() === 'W' ? 'W' : 'E'),
    };
  }

  private writeBearing(segmentIndex: number, northSouth: 'N' | 'S', degrees: number, minutes: number, eastWest: 'E' | 'W'): void {
    this.sourceReadService.updateLotSegmentBearing(segmentIndex, `${northSouth} ${degrees} ${minutes} ${eastWest}`);
  }

  private buildGeometryProjection(lotGeometry: LotGeometryResult): GeometryProjectionModel {
    const lotPoints = lotGeometry.lotPoints;
    const buildablePoints = lotGeometry.buildablePoints.filter(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    );
    const hasBuildablePreview = buildablePoints.length >= 3 && buildablePoints.length === lotPoints.length;
    const previewBounds = this.getPreviewBounds(lotGeometry, buildablePoints);
    const viewport = createSvgViewportFit(previewBounds, {
      maxWidth: 520,
      maxHeight: 360,
      minWidth: 420,
      minHeight: 280,
      padding: 42,
    });
    const lotPreviewPoints = viewport.projectPoints(lotPoints);
    const buildablePreviewPoints = hasBuildablePreview ? viewport.projectPoints(buildablePoints) : [];
    const edgeAnnotations: PreviewEdgeAnnotation[] = lotGeometry.lotSegments.map((segment, index) => {
      const startPoint = lotPreviewPoints[index];
      const endPoint = lotPreviewPoints[(index + 1) % lotPreviewPoints.length];
      const midX = (startPoint.x + endPoint.x) / 2;
      const midY = (startPoint.y + endPoint.y) / 2;
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const edgeLength = Math.hypot(dx, dy) || 1;
      const normalX = -dy / edgeLength;
      const normalY = dx / edgeLength;
      const offset = 16;
      const labelX = midX + normalX * offset;
      const labelY = midY + normalY * offset;

      return {
        lineX1: Number(midX.toFixed(2)),
        lineY1: Number(midY.toFixed(2)),
        lineX2: Number(labelX.toFixed(2)),
        lineY2: Number(labelY.toFixed(2)),
        labelX: Number(labelX.toFixed(2)),
        labelY: Number(labelY.toFixed(2)),
        distance: `${segment.distance.toFixed(2)} m`,
      };
    });
    const guideLines: PreviewGuideLine[] = hasBuildablePreview
      ? lotGeometry.lotSegments.map((segment, index) => {
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
      })
      : [];
    const closureLine = lotGeometry.closureSegment
      ? {
        x1: viewport.projectPoint(lotGeometry.closureSegment.from).x,
        y1: viewport.projectPoint(lotGeometry.closureSegment.from).y,
        x2: viewport.projectPoint(lotGeometry.closureSegment.to).x,
        y2: viewport.projectPoint(lotGeometry.closureSegment.to).y,
      }
      : null;

    return {
      viewBox: viewport.viewBox,
      width: viewport.width,
      height: viewport.height,
      lotPreview: {
        points: lotPreviewPoints,
        polygon: lotPreviewPoints.map((point) => `${point.x},${point.y}`).join(' '),
      },
      buildablePreview: {
        points: buildablePreviewPoints,
        polygon: buildablePreviewPoints.map((point) => `${point.x},${point.y}`).join(' '),
      },
      hasBuildablePreview,
      closureLine,
      edgeAnnotations,
      guideLines,
      scaleBarMeters: 2,
      scaleBarWidthPixels: Number((2 * viewport.scale).toFixed(2)),
      scaleBarX: 24,
      scaleBarY: Number((viewport.height - 24).toFixed(2)),
      scaleTextY: Number((viewport.height - 34).toFixed(2)),
    };
  }

  private getPreviewBounds(
    lotGeometry: LotGeometryResult,
    buildablePoints: readonly NamedGeometryPoint[],
  ): GeometryBounds {
    const points: GeometryPoint[] = [...lotGeometry.lotPoints, ...buildablePoints];

    if (lotGeometry.closureSegment) {
      points.push(lotGeometry.closureSegment.from, lotGeometry.closureSegment.to);
    }

    if (!points.length) {
      return {
        minX: 0,
        maxX: 1,
        minY: 0,
        maxY: 1,
      };
    }

    return {
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
  }

  private projectPointOntoSegment(
    point: ProjectedSvgPoint,
    segmentStart: ProjectedSvgPoint,
    segmentEnd: ProjectedSvgPoint,
  ): ProjectedSvgPoint {
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
