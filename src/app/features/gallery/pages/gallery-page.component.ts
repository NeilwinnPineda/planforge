import { DecimalPipe, NgFor, NgIf, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ConstructionOutputService, type ConstructionOutput } from '../../../core/construction/construction-output.service';
import { ConstructionContractPushService } from '../../../core/construction/construction-contract-push.service';
import type { VerifiedLayoutArtifact } from '../../../core/processing/processing.exports';

interface GalleryCard {
  readonly rank: number;
  readonly output: ConstructionOutput;
  readonly miniCells: readonly MiniCell[];
  readonly totalAreaSqm: number;
  readonly roomCount: number;
  readonly windowCount: number;
  readonly doorCount: number;
}

interface MiniCell {
  readonly id: string;
  readonly color: string;
  readonly points: string;
  readonly generated: boolean;
  readonly hallway: boolean;
}

interface DetailCell {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly points: string;
  readonly cx: number;
  readonly cy: number;
  readonly generated: boolean;
}

interface ScoreRow {
  readonly label: string;
  readonly value: number;
}

const MINI_W = 240;
const MINI_H = 150;
const MINI_PAD = 10;
const DETAIL_W = 640;
const DETAIL_H = 400;
const DETAIL_PAD = 20;

@Component({
  selector: 'app-gallery-page',
  standalone: true,
  imports: [DecimalPipe, NgFor, NgIf, PercentPipe],
  templateUrl: './gallery-page.component.html',
  styleUrl: './gallery-page.component.scss',
})
export class GalleryPageComponent {
  private readonly outputsService = inject(ConstructionOutputService);
  protected readonly pushService = inject(ConstructionContractPushService);

  protected readonly selectedId = signal<string | null>(null);

  protected readonly miniW = MINI_W;
  protected readonly miniH = MINI_H;
  protected readonly detailW = DETAIL_W;
  protected readonly detailH = DETAIL_H;

  protected readonly checkLabels = [
    { key: 'deficiencyCheck',     label: 'DEF'  },
    { key: 'aspectRatioCheck',    label: 'ASP'  },
    { key: 'accessCheck',         label: 'ACC'  },
    { key: 'adjacencyCheck',      label: 'CRIT' },
    { key: 'garageFrontageCheck', label: 'GAR'  },
    { key: 'sliverCheck',         label: 'SLV'  },
    { key: 'overlapCheck',        label: 'OVL'  },
  ] as const;

  protected readonly cards = computed((): readonly GalleryCard[] =>
    this.outputsService.outputs().map((output, i) => ({
      rank: i + 1,
      output,
      miniCells: this.buildMiniCells(output),
      totalAreaSqm: output.entry.artifact.cells.reduce((s, c) => s + c.areaSquareMeters, 0),
      roomCount: output.entry.artifact.cells.filter((c) => !c.pkg && !c.hallway).length,
      windowCount: output.windowPlacements.length,
      doorCount: output.doorPlacements.length,
    })),
  );

  protected readonly selectedCard = computed((): GalleryCard | null => {
    const id = this.selectedId();
    return this.cards().find((c) => c.output.entry.artifact.layoutId === id)
      ?? this.cards()[0]
      ?? null;
  });

  protected readonly detailCells = computed((): readonly DetailCell[] =>
    this.buildDetailCells(this.selectedCard()?.output.entry.artifact ?? null),
  );

  protected select(id: string): void {
    this.selectedId.set(id);
  }

  protected isSelected(card: GalleryCard): boolean {
    const sel = this.selectedCard();
    return sel?.output.entry.artifact.layoutId === card.output.entry.artifact.layoutId;
  }

  protected scoreRows(output: ConstructionOutput): readonly ScoreRow[] {
    const sb = output.entry.scoreBreakdown;
    return [
      { label: 'Area fit',        value: sb.areaFit },
      { label: 'Proportions',     value: sb.roomProportionScore },
      { label: 'Adjacency',       value: sb.adjacencyProximity },
      { label: 'Wall perimeter',  value: sb.externalWallPerimeterEfficiency },
      { label: 'Hallway',         value: sb.hallwayEfficiency },
      { label: 'Shape regularity', value: sb.roomShapeRegularity },
      { label: 'Loop closure',    value: sb.wallLoopClosure },
      { label: 'Simulation',      value: sb.sourceScore },
    ];
  }

  protected checkPassed(artifact: VerifiedLayoutArtifact, key: string): boolean {
    return (artifact as unknown as Record<string, { passed: boolean }>)[key]?.passed ?? true;
  }

  protected hallwayShare(artifact: VerifiedLayoutArtifact): number {
    const total = artifact.cells.reduce((s, c) => s + c.areaSquareMeters, 0);
    if (total <= 1e-6) return 0;
    const hw = artifact.cells.filter((c) => c.hallway).reduce((s, c) => s + c.areaSquareMeters, 0);
    return hw / total;
  }

  private buildMiniCells(output: ConstructionOutput): readonly MiniCell[] {
    const cells = output.entry.artifact.cells;
    if (!cells.length) return [];

    const allPts = cells.flatMap((c) => c.worldPoints);
    const minX = Math.min(...allPts.map((p) => p.x));
    const maxX = Math.max(...allPts.map((p) => p.x));
    const minY = Math.min(...allPts.map((p) => p.y));
    const maxY = Math.max(...allPts.map((p) => p.y));
    const scale = Math.min((MINI_W - MINI_PAD * 2) / Math.max(1, maxX - minX), (MINI_H - MINI_PAD * 2) / Math.max(1, maxY - minY));
    const ox = (MINI_W - (maxX - minX) * scale) / 2;
    const oy = (MINI_H - (maxY - minY) * scale) / 2;
    const px = (p: { x: number; y: number }) => Number((ox + (p.x - minX) * scale).toFixed(2));
    const py = (p: { x: number; y: number }) => Number((MINI_H - (oy + (p.y - minY) * scale)).toFixed(2));

    return cells.map((cell) => ({
      id: cell.id,
      color: cell.color,
      points: cell.worldPoints.map((p) => `${px(p)},${py(p)}`).join(' '),
      generated: cell.pkg || cell.hallway,
      hallway: cell.hallway,
    }));
  }

  private buildDetailCells(artifact: VerifiedLayoutArtifact | null): readonly DetailCell[] {
    if (!artifact?.cells.length) return [];

    const allPts = artifact.cells.flatMap((c) => c.worldPoints);
    const minX = Math.min(...allPts.map((p) => p.x));
    const maxX = Math.max(...allPts.map((p) => p.x));
    const minY = Math.min(...allPts.map((p) => p.y));
    const maxY = Math.max(...allPts.map((p) => p.y));
    const scale = Math.min((DETAIL_W - DETAIL_PAD * 2) / Math.max(1, maxX - minX), (DETAIL_H - DETAIL_PAD * 2) / Math.max(1, maxY - minY));
    const ox = (DETAIL_W - (maxX - minX) * scale) / 2;
    const oy = (DETAIL_H - (maxY - minY) * scale) / 2;
    const px = (p: { x: number; y: number }) => Number((ox + (p.x - minX) * scale).toFixed(2));
    const py = (p: { x: number; y: number }) => Number((DETAIL_H - (oy + (p.y - minY) * scale)).toFixed(2));

    return artifact.cells.map((cell) => {
      const pts = cell.worldPoints.map((p) => ({ x: px(p), y: py(p) }));
      return {
        id: cell.id,
        label: cell.label || cell.typeId,
        color: cell.color,
        points: pts.map((p) => `${p.x},${p.y}`).join(' '),
        cx: Number((pts.reduce((s, p) => s + p.x, 0) / pts.length).toFixed(2)),
        cy: Number((pts.reduce((s, p) => s + p.y, 0) / pts.length).toFixed(2)),
        generated: cell.pkg || cell.hallway,
      };
    });
  }
}
