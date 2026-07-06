import { DecimalPipe, NgFor, NgIf, PercentPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import type { ConstructionExternalWallAnalysis } from '../../../core/construction/external-wall.factory';
import type { ConstructionDoorPlacement } from '../../../core/construction/door-placement.factory';
import type { ConstructionWindowPlacement } from '../../../core/construction/window-placement.factory';
import { ConstructionOutputService } from '../../../core/construction/construction-output.service';
import { type GalleryEntry } from '../../../core/processing/layout-gallery.service';
import type { VerifiedLayoutArtifact } from '../../../core/processing/processing.exports';
import { WorkflowVisualStateService } from '../../../core/processing/workflow-visual-state.service';
import { LayoutViewComponent, type LayoutViewLine, type LayoutViewMarker } from '../../../shared/layout-view/layout-view.component';
import { StatusPillComponent } from '../../../shared/status-pill/status-pill.component';
import { StatStripComponent } from '../../../shared/stat-strip/stat-strip.component';

interface ConstructionChecklistRow {
  readonly label: string;
  readonly status: 'ready' | 'blocked' | 'gated';
  readonly detail: string;
}

interface ConstructionPreviewCell {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly points: string;
  readonly cx: number;
  readonly cy: number;
  readonly generated: boolean;
  readonly hallway: boolean;
  readonly showLabel: boolean;
}

interface ConstructionWallSegment {
  readonly id: string;
  readonly fromKey: string;
  readonly toKey: string;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly lengthMeters: number;
  readonly ownerLabel: string;
  readonly ownerKind: 'room' | 'hallway';
  readonly exteriorLabel: string;
  readonly exteriorKind: 'filler' | 'outside';
}

interface ConstructionInteriorWallSegment {
  readonly id: string;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly ownerLabel: string;
}

interface ConstructionWindowMarker {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly radiusPixels: number;
  readonly placement: ConstructionWindowPlacement;
}

interface ConstructionDoorMarker {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly widthPixels: number;
  readonly angleDegrees: number;
  readonly placement: ConstructionDoorPlacement;
}

interface ConstructionWallLoop {
  readonly id: string;
  readonly points: string;
  readonly segmentCount: number;
  readonly closed: boolean;
}

interface PreviewProjection {
  readonly project: (point: { readonly x: number; readonly y: number }) => { readonly x: number; readonly y: number };
  readonly scale: number;
}

interface ConstructionHighlightRow {
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'app-construction-page',
  standalone: true,
  imports: [DecimalPipe, NgFor, NgIf, PercentPipe, LayoutViewComponent, StatusPillComponent, StatStripComponent],
  templateUrl: './construction-page.component.html',
  styleUrl: './construction-page.component.scss',
})
export class ConstructionPageComponent {
  private readonly constructionOutputService = inject(ConstructionOutputService);
  private readonly workflowVisualStateService = inject(WorkflowVisualStateService);

  protected readonly topOutput = computed(() => this.constructionOutputService.outputs()[0] ?? null);
  protected readonly topLayout = computed(() => this.topOutput()?.entry ?? null);
  protected readonly fallbackVerificationSnapshot = computed(() =>
    this.topLayout() ? null : this.workflowVisualStateService.latestRenderableSnapshot(),
  );
  protected readonly fallbackArtifact = computed(() => this.fallbackVerificationSnapshot()?.verificationResult.artifact ?? null);
  protected readonly fallbackFailure = this.workflowVisualStateService.latestFailure;
  protected readonly previewCells = computed(() => this.buildPreviewCells(this.topLayout()?.artifact ?? null));
  protected readonly fallbackPreviewCells = computed(() => this.buildPreviewCells(this.fallbackArtifact()));
  protected readonly interiorWalls = computed(() => this.buildInteriorWalls(this.topLayout()?.artifact ?? null));
  protected readonly externalWalls = computed(() => this.buildExternalWalls(this.topOutput()?.analysis ?? null));
  protected readonly externalWallLoops = computed(() => this.buildExternalWallLoops(this.externalWalls()));
  protected readonly doorPlacements = computed(() => this.topOutput()?.doorPlacements ?? []);
  protected readonly doorMarkers = computed(() => this.deriveDoorMarkers(this.doorPlacements()));
  protected readonly windowPlacements = computed(() => this.topOutput()?.windowPlacements ?? []);
  protected readonly windowMarkers = computed(() => this.deriveWindowMarkers(this.windowPlacements()));
  protected readonly layoutInteriorWalls = computed<readonly LayoutViewLine[]>(() =>
    this.interiorWalls().map((wall) => ({ x1: wall.fromX, y1: wall.fromY, x2: wall.toX, y2: wall.toY })),
  );
  protected readonly layoutExteriorWalls = computed<readonly LayoutViewLine[]>(() =>
    this.externalWalls().map((wall) => ({ x1: wall.fromX, y1: wall.fromY, x2: wall.toX, y2: wall.toY })),
  );
  protected readonly layoutDoorMarkers = computed<readonly LayoutViewMarker[]>(() =>
    this.doorMarkers().map((door) => ({
      cx: door.cx,
      cy: door.cy,
      angle: door.angleDegrees,
      width: door.widthPixels,
      height: 6,
      title: `${door.placement.ownerLabel} - ${door.placement.kind} ${door.placement.widthMeters}m`,
    })),
  );
  protected readonly stageStatusLabel = computed(() => {
    if (this.topLayout()) return 'Ready for construction review';
    if (this.fallbackArtifact()) return 'Waiting for verified layout - showing last reviewed attempt';
    return 'Waiting for verified layout';
  });
  protected readonly stageStatusTone = computed<'ready' | 'attention'>(() => (
    this.topLayout() ? 'ready' : 'attention'
  ));
  protected readonly stageSummary = computed(() => {
    if (this.topLayout()) {
      return 'This page turns a verified layout into a construction-facing preview so you can inspect walls, doors, windows, and readiness before any downstream handoff.';
    }
    if (this.fallbackArtifact()) {
      return 'No accepted construction candidate is ready yet, but this page is keeping the last reviewed layout visible so you can still see what the pipeline is producing while waiting on a clean pass.';
    }
    return 'Construction Output only becomes useful after Verification has produced at least one layout worth carrying forward.';
  });
  protected readonly stageNextAction = computed(() => {
    if (this.topLayout()) {
      return 'Review the construction preview first, then confirm readiness and inspect walls, windows, and doors before any export or Revit handoff.';
    }
    if (this.fallbackArtifact()) {
      return 'Use this fallback preview for context, then return to Verification or Simulation to fix what is blocking a construction-ready candidate.';
    }
    return 'Go back to Verification and Candidate Gallery first so this stage has a verified layout to stage.';
  });
  protected readonly highlightRows = computed<readonly ConstructionHighlightRow[]>(() => {
    const layout = this.topLayout();
    const fallbackArtifact = this.fallbackArtifact();
    return [
      { label: 'Current status', value: this.stageStatusLabel() },
      { label: 'Real rooms', value: layout ? String(this.realRoomCount(layout)) : fallbackArtifact ? String(fallbackArtifact.cells.filter((cell) => !cell.pkg && !cell.hallway).length) : '0' },
      { label: 'Window placements', value: String(this.windowPlacements().length) },
      { label: 'Door placements', value: String(this.doorPlacements().length) },
    ];
  });
  protected readonly checklist = computed<readonly ConstructionChecklistRow[]>(() => {
    const top = this.topLayout();

    return [
      {
        label: 'Verified layout identity',
        status: top ? 'ready' : 'blocked',
        detail: top ? `Bound to ${top.artifact.layoutId}.` : 'No accepted layout has survived verification yet.',
      },
      {
        label: 'Canonical geometry',
        status: top ? 'ready' : 'blocked',
        detail: top ? `${top.artifact.cells.length} verified cells are available for downstream construction.` : 'Waiting for accepted cells.',
      },
      {
        label: 'Typed construction contract',
        status: 'gated',
        detail: 'Not emitted yet. This page is the staging surface before Revit mutation is allowed.',
      },
      {
        label: 'Revit apply',
        status: 'gated',
        detail: 'Must remain approval-gated and transaction-grouped.',
      },
    ];
  });

  protected realRoomCount(entry: GalleryEntry): number {
    return entry.artifact.cells.filter((cell) => !cell.pkg && !cell.hallway).length;
  }

  protected generatedCellCount(entry: GalleryEntry): number {
    return entry.artifact.cells.filter((cell) => cell.pkg || cell.hallway).length;
  }

  protected totalArea(entry: GalleryEntry): number {
    return entry.artifact.cells.reduce((sum, cell) => sum + cell.areaSquareMeters, 0);
  }

  private buildPreviewCells(artifact: VerifiedLayoutArtifact | null): readonly ConstructionPreviewCell[] {
    if (!artifact?.cells.length) return [];

    const { project } = this.buildProjection(artifact);

    return artifact.cells.map((cell) => {
      const points = cell.worldPoints.map(project);
      const centroid = this.projectedPolygonCentroid(points);

      return {
        id: cell.id,
        label: cell.label || cell.typeId,
        color: cell.color,
        points: points.map((point) => `${point.x},${point.y}`).join(' '),
        cx: centroid.x,
        cy: centroid.y,
        generated: cell.pkg || cell.hallway,
        hallway: cell.hallway,
        showLabel: !cell.pkg && !cell.hallway,
      };
    });
  }

  private buildInteriorWalls(artifact: VerifiedLayoutArtifact | null): readonly ConstructionInteriorWallSegment[] {
    if (!artifact?.cells.length) return [];

    const { project } = this.buildProjection(artifact);
    const enclosedRooms = artifact.cells.filter((cell) =>
      !cell.pkg
      && !cell.hallway
      && !cell.tags.includes('open_access'),
    );

    return enclosedRooms.flatMap((cell) =>
      cell.worldPoints.map((from, index) => {
        const to = cell.worldPoints[(index + 1) % cell.worldPoints.length];
        const projectedFrom = project(from);
        const projectedTo = project(to);

        return {
          id: `IW-${cell.id}-${String(index + 1).padStart(2, '0')}`,
          fromX: projectedFrom.x,
          fromY: projectedFrom.y,
          toX: projectedTo.x,
          toY: projectedTo.y,
          ownerLabel: cell.label || cell.typeId,
        };
      }),
    );
  }

  private buildExternalWalls(analysis: ConstructionExternalWallAnalysis | null): readonly ConstructionWallSegment[] {
    if (!analysis?.segments.length) return [];

    const artifact = this.topLayout()?.artifact ?? null;
    if (!artifact) return [];
    const { project } = this.buildProjection(artifact);

    return analysis.segments.map((segment) => {
      const from = project(segment.from);
      const to = project(segment.to);
      return {
        id: segment.id,
        fromKey: segment.fromKey,
        toKey: segment.toKey,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        lengthMeters: segment.lengthMeters,
        ownerLabel: segment.ownerLabel,
        ownerKind: segment.ownerKind,
        exteriorLabel: segment.exteriorLabel,
        exteriorKind: segment.exteriorKind,
      };
    });
  }

  private buildExternalWallLoops(segments: readonly ConstructionWallSegment[]): readonly ConstructionWallLoop[] {
    const unused = new Set(segments.map((_, index) => index));
    const byKey = new Map<string, number[]>();

    segments.forEach((segment, index) => {
      byKey.set(segment.fromKey, [...(byKey.get(segment.fromKey) ?? []), index]);
      byKey.set(segment.toKey, [...(byKey.get(segment.toKey) ?? []), index]);
    });

    const loops: ConstructionWallLoop[] = [];

    while (unused.size > 0) {
      const firstIndex = unused.values().next().value as number;
      const first = segments[firstIndex];
      const points = [{ x: first.fromX, y: first.fromY }, { x: first.toX, y: first.toY }];
      const startKey = first.fromKey;
      let currentKey = first.toKey;
      let closed = currentKey === startKey;
      let segmentCount = 1;
      unused.delete(firstIndex);

      while (!closed) {
        const nextIndex = (byKey.get(currentKey) ?? []).find((index) => unused.has(index));
        if (nextIndex === undefined) break;

        const next = segments[nextIndex];
        const forward = next.fromKey === currentKey;
        points.push({
          x: forward ? next.toX : next.fromX,
          y: forward ? next.toY : next.fromY,
        });
        currentKey = forward ? next.toKey : next.fromKey;
        segmentCount += 1;
        unused.delete(nextIndex);
        closed = currentKey === startKey;
      }

      loops.push({
        id: `EWL-${String(loops.length + 1).padStart(2, '0')}`,
        points: points.map((point) => `${point.x},${point.y}`).join(' '),
        segmentCount,
        closed,
      });
    }

    return loops.sort((left, right) => Number(right.closed) - Number(left.closed) || right.segmentCount - left.segmentCount);
  }

  private deriveWindowMarkers(placements: readonly ConstructionWindowPlacement[]): readonly ConstructionWindowMarker[] {
    if (!placements.length) return [];

    const artifact = this.topLayout()?.artifact ?? null;
    if (!artifact) return [];
    const { scale, project } = this.buildProjection(artifact);

    return placements.map((placement) => {
      const { x, y } = project(placement.positionWorld);
      const radiusPixels = Number(Math.max(3, Math.min(12, (placement.widthMeters / 2) * scale)).toFixed(2));
      return { id: placement.id, cx: x, cy: y, radiusPixels, placement };
    });
  }

  private deriveDoorMarkers(placements: readonly ConstructionDoorPlacement[]): readonly ConstructionDoorMarker[] {
    if (!placements.length) return [];

    const artifact = this.topLayout()?.artifact ?? null;
    if (!artifact) return [];
    const { scale, project } = this.buildProjection(artifact);

    return placements.map((door) => {
      const { x: cx, y: cy } = project(door.positionWorld);
      const projFrom = project(door.wallFromWorld);
      const projTo = project(door.wallToWorld);
      const angleDegrees = Number(
        (Math.atan2(projTo.y - projFrom.y, projTo.x - projFrom.x) * (180 / Math.PI)).toFixed(2),
      );
      const widthPixels = Number(Math.max(6, door.widthMeters * scale).toFixed(2));
      return { id: door.id, cx, cy, widthPixels, angleDegrees, placement: door };
    });
  }

  private buildProjection(artifact: VerifiedLayoutArtifact): PreviewProjection {
    const width = 760;
    const height = 460;
    const padding = 26;
    const allPoints = artifact.cells.flatMap((cell) => cell.worldPoints);
    const minX = Math.min(...allPoints.map((point) => point.x));
    const maxX = Math.max(...allPoints.map((point) => point.x));
    const minY = Math.min(...allPoints.map((point) => point.y));
    const maxY = Math.max(...allPoints.map((point) => point.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;

    return {
      scale,
      project: (point) => ({
        x: Number((offsetX + (point.x - minX) * scale).toFixed(2)),
        y: Number((height - (offsetY + (point.y - minY) * scale)).toFixed(2)),
      }),
    };
  }

  private projectedPolygonCentroid(points: readonly { readonly x: number; readonly y: number }[]): { readonly x: number; readonly y: number } {
    if (points.length < 3) {
      const cx = points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length);
      const cy = points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length);
      return { x: Number(cx.toFixed(2)), y: Number(cy.toFixed(2)) };
    }

    let twiceArea = 0;
    let cx = 0;
    let cy = 0;

    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      const cross = point.x * next.y - next.x * point.y;
      twiceArea += cross;
      cx += (point.x + next.x) * cross;
      cy += (point.y + next.y) * cross;
    });

    if (Math.abs(twiceArea) <= 1e-6) {
      const averageX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const averageY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      return { x: Number(averageX.toFixed(2)), y: Number(averageY.toFixed(2)) };
    }

    return {
      x: Number((cx / (3 * twiceArea)).toFixed(2)),
      y: Number((cy / (3 * twiceArea)).toFixed(2)),
    };
  }
}
