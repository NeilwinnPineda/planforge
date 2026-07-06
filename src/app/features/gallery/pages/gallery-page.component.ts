import { DecimalPipe, NgFor, NgIf, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ConstructionOutputService, type ConstructionOutput } from '../../../core/construction/construction-output.service';
import { ConstructionContractPushService } from '../../../core/construction/construction-contract-push.service';
import { buildConstructionContract } from '../../../core/construction/construction-contract.factory';
import type { VerifiedLayoutArtifact } from '../../../core/processing/processing.exports';
import { WorkflowVisualStateService } from '../../../core/processing/workflow-visual-state.service';
import { LayoutViewComponent } from '../../../shared/layout-view/layout-view.component';
import { EmptyStateComponent } from '../../../shared/empty-state/empty-state.component';
import { StatusPillComponent } from '../../../shared/status-pill/status-pill.component';
import { StatStripComponent } from '../../../shared/stat-strip/stat-strip.component';

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

interface GalleryHighlightRow {
  readonly label: string;
  readonly value: string;
}

interface GalleryDecisionRow {
  readonly label: string;
  readonly value: string;
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
  imports: [DecimalPipe, NgFor, NgIf, PercentPipe, LayoutViewComponent, EmptyStateComponent, StatusPillComponent, StatStripComponent],
  templateUrl: './gallery-page.component.html',
  styleUrl: './gallery-page.component.scss',
})
export class GalleryPageComponent {
  private readonly outputsService = inject(ConstructionOutputService);
  protected readonly pushService = inject(ConstructionContractPushService);
  private readonly workflowVisualStateService = inject(WorkflowVisualStateService);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly viewMode = signal<'cards' | 'table'>('cards');

  protected readonly miniW = MINI_W;
  protected readonly miniH = MINI_H;
  protected readonly detailW = DETAIL_W;
  protected readonly detailH = DETAIL_H;

  protected readonly checkLabels = [
    { key: 'deficiencyCheck',     label: 'Too small'  },
    { key: 'aspectRatioCheck',    label: 'Bad shape'  },
    { key: 'accessCheck',         label: 'No access'  },
    { key: 'adjacencyCheck',      label: 'Critical adjacency' },
    { key: 'garageFrontageCheck', label: 'Garage placement'  },
    { key: 'sliverCheck',         label: 'Too thin'  },
    { key: 'overlapCheck',        label: 'Overlap'  },
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
  protected readonly stageStatusLabel = computed(() => {
    const count = this.cards().length;
    if (count === 0) return 'Waiting for accepted layouts';
    if (count === 1) return 'One candidate ready for review';
    return `${count} candidates ready for comparison`;
  });
  protected readonly stageStatusTone = computed<'attention' | 'review' | 'ready'>(() => {
    const count = this.cards().length;
    if (count === 0) return 'attention';
    if (count === 1) return 'review';
    return 'ready';
  });
  protected readonly stageSummary = computed(() => {
    const count = this.cards().length;
    if (count === 0) {
      return 'Use this stage to compare accepted layouts after verification and choose which one is strongest before downstream handoff.';
    }

    return `Use this stage to compare accepted layouts side by side and decide which one deserves to move forward. There ${count === 1 ? 'is' : 'are'} currently ${count} candidate${count === 1 ? '' : 's'} available for review.`;
  });
  protected readonly stageNextAction = computed(() => {
    const count = this.cards().length;
    if (count === 0) {
      return 'Go back to Simulation, Processing, and Verification so accepted layouts can flow into the gallery.';
    }
    if (count === 1) {
      return 'Inspect the selected candidate carefully, then keep exploring if you want more options to compare.';
    }
    return 'Compare the top candidates, focus on differences that matter, and keep the strongest layout in view for downstream handoff.';
  });
  protected readonly highlightRows = computed<readonly GalleryHighlightRow[]>(() => {
    const selected = this.selectedCard();
    return [
      { label: 'Current status', value: this.stageStatusLabel() },
      { label: 'Candidates', value: String(this.cards().length) },
      { label: 'Best score', value: this.cards().length ? this.cards()[0].output.entry.score.toFixed(3) : '0.000' },
      { label: 'Selected layout', value: selected?.output.entry.artifact.layoutId ?? 'none yet' },
    ];
  });

  protected readonly selectedCard = computed((): GalleryCard | null => {
    const id = this.selectedId();
    return this.cards().find((c) => c.output.entry.artifact.layoutId === id)
      ?? this.cards()[0]
      ?? null;
  });
  protected readonly decisionRows = computed<readonly GalleryDecisionRow[]>(() => {
    const sel = this.selectedCard();
    if (!sel) {
      return [
        { label: 'Decision state', value: 'No accepted layout to compare yet' },
        { label: 'What to look for', value: 'Wait for accepted verified outputs before making a selection' },
        { label: 'Next move', value: this.stageNextAction() },
      ];
    }

    return [
      { label: 'Selected rank', value: `#${sel.rank}` },
      { label: 'Selection reason', value: 'Compare score, room count, hallway share, and verification checks before treating this as the best option.' },
      { label: 'Next move', value: this.stageNextAction() },
    ];
  });

  protected readonly detailCells = computed((): readonly DetailCell[] =>
    this.buildDetailCells(this.selectedCard()?.output.entry.artifact ?? null),
  );
  protected readonly fallbackArtifact = computed(() => this.workflowVisualStateService.latestRenderableSnapshot()?.verificationResult.artifact ?? null);
  protected readonly fallbackDetailCells = computed(() => this.buildDetailCells(this.fallbackArtifact()));

  protected stageToneClass(): string {
    return `gallery-stage-pill--${this.stageStatusTone()}`;
  }

  protected select(id: string): void {
    this.selectedId.set(id);
  }

  protected exportContract(output: ConstructionOutput): void {
    const contract = buildConstructionContract(output);
    const blob = new Blob([JSON.stringify(contract, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${contract.layoutId}-construction-contract.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected sendToRevit(output: ConstructionOutput): void {
    void this.pushService.pushOutput(output);
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
