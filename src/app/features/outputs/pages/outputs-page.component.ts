import { DecimalPipe, NgFor, NgIf, PercentPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { type ConstructionOutput, ConstructionOutputService } from '../../../core/construction/construction-output.service';
import { ConstructionContractPushService } from '../../../core/construction/construction-contract-push.service';

interface OutputCardCell {
  readonly id: string;
  readonly color: string;
  readonly points: string;
  readonly generated: boolean;
  readonly hallway: boolean;
}

interface OutputCard {
  readonly rank: number;
  readonly output: ConstructionOutput;
  readonly cells: readonly OutputCardCell[];
  readonly totalAreaSqm: number;
  readonly roomCount: number;
  readonly windowCount: number;
  readonly doorCount: number;
}

interface ScoreFactor {
  readonly label: string;
  readonly value: number;
}

const MINI_W = 280;
const MINI_H = 170;
const MINI_PAD = 12;

@Component({
  selector: 'app-outputs-page',
  standalone: true,
  imports: [DecimalPipe, NgFor, NgIf, PercentPipe],
  templateUrl: './outputs-page.component.html',
  styleUrl: './outputs-page.component.scss',
})
export class OutputsPageComponent {
  private readonly outputsService = inject(ConstructionOutputService);
  protected readonly pushService = inject(ConstructionContractPushService);

  protected readonly outputs = this.outputsService.outputs;

  protected readonly cards = computed((): readonly OutputCard[] =>
    this.outputs().map((output, index) => ({
      rank: index + 1,
      output,
      cells: this.buildMiniCells(output),
      totalAreaSqm: output.entry.artifact.cells.reduce((s, c) => s + c.areaSquareMeters, 0),
      roomCount: output.entry.artifact.cells.filter((c) => !c.pkg && !c.hallway).length,
      windowCount: output.windowPlacements.length,
      doorCount: output.doorPlacements.length,
    })),
  );

  protected readonly svgWidth = MINI_W;
  protected readonly svgHeight = MINI_H;

  protected scoreFactors(output: ConstructionOutput): readonly ScoreFactor[] {
    const sb = output.entry.scoreBreakdown;
    return [
      { label: 'Area fit',     value: sb.areaFit },
      { label: 'Proportions',  value: sb.roomProportionScore },
      { label: 'Adjacency',    value: sb.adjacencyProximity },
      { label: 'Perimeter',    value: sb.externalWallPerimeterEfficiency },
      { label: 'Hallway',      value: sb.hallwayEfficiency },
    ];
  }

  private buildMiniCells(output: ConstructionOutput): readonly OutputCardCell[] {
    const { artifact } = output.entry;
    if (!artifact.cells.length) return [];

    const allPoints = artifact.cells.flatMap((c) => c.worldPoints);
    const minX = Math.min(...allPoints.map((p) => p.x));
    const maxX = Math.max(...allPoints.map((p) => p.x));
    const minY = Math.min(...allPoints.map((p) => p.y));
    const maxY = Math.max(...allPoints.map((p) => p.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((MINI_W - MINI_PAD * 2) / spanX, (MINI_H - MINI_PAD * 2) / spanY);
    const offsetX = (MINI_W - spanX * scale) / 2;
    const offsetY = (MINI_H - spanY * scale) / 2;
    const project = (p: { readonly x: number; readonly y: number }) => ({
      x: Number((offsetX + (p.x - minX) * scale).toFixed(2)),
      y: Number((MINI_H - (offsetY + (p.y - minY) * scale)).toFixed(2)),
    });

    return artifact.cells.map((cell) => {
      const pts = cell.worldPoints.map(project);
      return {
        id: cell.id,
        color: cell.color,
        points: pts.map((p) => `${p.x},${p.y}`).join(' '),
        generated: cell.pkg || cell.hallway,
        hallway: cell.hallway,
      };
    });
  }
}
