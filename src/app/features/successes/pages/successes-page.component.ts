import { Component, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf, DecimalPipe, PercentPipe, SlicePipe } from '@angular/common';
import { type GalleryEntry, LayoutGalleryService } from '../../../core/processing/layout-gallery.service';
import type { VerifiedLayoutArtifact } from '../../../core/processing/processing.exports';

interface SuccessPreviewCell {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly points: string;
  readonly cx: number;
  readonly cy: number;
  readonly generated: boolean;
}

@Component({
  selector: 'app-successes-page',
  standalone: true,
  imports: [NgFor, NgIf, DecimalPipe, PercentPipe, SlicePipe],
  templateUrl: './successes-page.component.html',
  styleUrl: './successes-page.component.scss',
})
export class SuccessesPageComponent {
  private readonly galleryService = inject(LayoutGalleryService);

  protected readonly entries = this.galleryService.entries;
  protected readonly selectedLayoutId = signal('');
  protected readonly topEntry = computed(() => this.entries()[0] ?? null);
  protected readonly selectedEntry = computed(() =>
    this.entries().find((entry) => entry.artifact.layoutId === this.selectedLayoutId()) ?? this.topEntry(),
  );
  protected readonly selectedPreviewCells = computed(() => this.buildPreviewCells(this.selectedEntry()?.artifact ?? null));

  protected readonly checkLabels = [
    { key: 'deficiencyCheck',     label: 'DEF'  },
    { key: 'aspectRatioCheck',    label: 'ASP'  },
    { key: 'accessCheck',         label: 'ACC'  },
    { key: 'adjacencyCheck',      label: 'CRIT' },
    { key: 'garageFrontageCheck', label: 'GAR'  },
    { key: 'sliverCheck',         label: 'SLV'  },
    { key: 'overlapCheck',        label: 'OVL'  },
  ] as const;

  protected totalArea(artifact: VerifiedLayoutArtifact): number {
    return artifact.cells.reduce((s, c) => s + c.areaSquareMeters, 0);
  }

  protected hallwayShare(artifact: VerifiedLayoutArtifact): number {
    const total = this.totalArea(artifact);
    if (total <= 1e-6) return 0;
    const hallway = artifact.cells
      .filter((cell) => cell.hallway)
      .reduce((sum, cell) => sum + cell.areaSquareMeters, 0);
    return hallway / total;
  }

  protected areaFit(artifact: VerifiedLayoutArtifact): number {
    const rooms = artifact.cells.filter((cell) => !cell.pkg && !cell.hallway && cell.targetSquareMeters > 1e-6);
    if (!rooms.length) return 0;
    return rooms.reduce((sum, cell) => sum + Math.min(1, cell.areaSquareMeters / cell.targetSquareMeters), 0) / rooms.length;
  }

  protected scoreRows(entry: GalleryEntry): readonly { readonly label: string; readonly value: number }[] {
    return [
      { label: 'Area fit', value: entry.scoreBreakdown.areaFit },
      { label: 'Wall perimeter', value: entry.scoreBreakdown.externalWallPerimeterEfficiency },
      { label: 'Hallway efficiency', value: entry.scoreBreakdown.hallwayEfficiency },
      { label: 'Room regularity', value: entry.scoreBreakdown.roomShapeRegularity },
      { label: 'Room proportions', value: entry.scoreBreakdown.roomProportionScore },
      { label: 'Final adjacency', value: entry.scoreBreakdown.finalAdjacencyScore },
      { label: 'Wall loop closure', value: entry.scoreBreakdown.wallLoopClosure },
      { label: 'Simulation', value: entry.scoreBreakdown.sourceScore },
    ];
  }

  protected checkPassed(artifact: VerifiedLayoutArtifact, key: string): boolean {
    return (artifact as unknown as Record<string, { passed: boolean }>)[key]?.passed ?? true;
  }

  protected selectEntry(entry: GalleryEntry): void {
    this.selectedLayoutId.set(entry.artifact.layoutId);
  }

  protected isSelectedEntry(entry: GalleryEntry): boolean {
    return this.selectedEntry()?.artifact.layoutId === entry.artifact.layoutId;
  }

  private buildPreviewCells(artifact: VerifiedLayoutArtifact | null): readonly SuccessPreviewCell[] {
    if (!artifact?.cells.length) return [];

    const allPoints = artifact.cells.flatMap((cell) => cell.worldPoints);
    const minX = Math.min(...allPoints.map((point) => point.x));
    const maxX = Math.max(...allPoints.map((point) => point.x));
    const minY = Math.min(...allPoints.map((point) => point.y));
    const maxY = Math.max(...allPoints.map((point) => point.y));
    const width = 760;
    const height = 480;
    const padding = 24;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    const project = (point: { readonly x: number; readonly y: number }) => ({
      x: Number((offsetX + (point.x - minX) * scale).toFixed(2)),
      y: Number((height - (offsetY + (point.y - minY) * scale)).toFixed(2)),
    });

    return artifact.cells.map((cell) => {
      const points = cell.worldPoints.map(project);
      const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      return {
        id: cell.id,
        label: cell.label || cell.typeId,
        color: cell.color,
        points: points.map((point) => `${point.x},${point.y}`).join(' '),
        cx: Number(cx.toFixed(2)),
        cy: Number(cy.toFixed(2)),
        generated: cell.pkg || cell.hallway,
      };
    });
  }
}
