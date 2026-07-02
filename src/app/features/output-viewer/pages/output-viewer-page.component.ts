import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import type {
  ConstructionContractCell,
  ConstructionContractExport,
} from '../../../core/construction/construction-contract.model';
import { createSvgViewportFit } from '../../../core/geometry/svg-fit';

interface ViewerProjectedCell {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly points: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly generated: boolean;
}

interface ViewerProjectedSegment {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface ViewerSummaryRow {
  readonly label: string;
  readonly value: string;
}

const VIEWER_WIDTH = 960;
const VIEWER_HEIGHT = 620;
const VIEWER_PADDING = 28;

@Component({
  selector: 'app-output-viewer-page',
  standalone: true,
  imports: [DecimalPipe, NgFor, NgIf],
  templateUrl: './output-viewer-page.component.html',
  styleUrl: './output-viewer-page.component.scss',
})
export class OutputViewerPageComponent {
  protected readonly fileName = signal('No file loaded');
  protected readonly rawJson = signal('');
  protected readonly parseError = signal<string | null>(null);
  protected readonly contract = signal<ConstructionContractExport | null>(null);
  protected readonly viewerWidth = VIEWER_WIDTH;
  protected readonly viewerHeight = VIEWER_HEIGHT;

  protected readonly roomCells = computed(() =>
    this.contract()?.cells.filter((cell) => !cell.hallway && !cell.pkg) ?? [],
  );
  protected readonly generatedCells = computed(() =>
    this.contract()?.cells.filter((cell) => cell.hallway || cell.pkg) ?? [],
  );
  protected readonly summaryRows = computed<readonly ViewerSummaryRow[]>(() => {
    const contract = this.contract();
    if (!contract) {
      return [];
    }

    return [
      { label: 'Layout id', value: contract.layoutId },
      { label: 'Score', value: contract.score.toFixed(3) },
      { label: 'Rooms', value: `${this.roomCells().length}` },
      { label: 'Generated cells', value: `${this.generatedCells().length}` },
      { label: 'Doors', value: `${contract.doors.length}` },
      { label: 'Windows', value: `${contract.windows.length}` },
      { label: 'Walls', value: `${contract.externalWalls.length}` },
      { label: 'Area', value: `${contract.metrics.totalAreaSqm.toFixed(2)} sq m` },
      { label: 'Perimeter', value: `${contract.metrics.externalWallPerimeterMeters.toFixed(2)} m` },
    ];
  });

  private readonly svgFit = computed(() => {
    const contract = this.contract();
    if (!contract) {
      return null;
    }

    const allPoints = [
      ...contract.cells.flatMap((cell) => cell.worldPoints),
      ...contract.externalWalls.flatMap((wall) => [wall.from, wall.to]),
    ];
    if (!allPoints.length) {
      return null;
    }

    const minX = Math.min(...allPoints.map((point) => point.x));
    const maxX = Math.max(...allPoints.map((point) => point.x));
    const minY = Math.min(...allPoints.map((point) => point.y));
    const maxY = Math.max(...allPoints.map((point) => point.y));

    return createSvgViewportFit(
      { minX, maxX, minY, maxY },
      {
        maxWidth: VIEWER_WIDTH,
        maxHeight: VIEWER_HEIGHT,
        minWidth: VIEWER_WIDTH,
        minHeight: VIEWER_HEIGHT,
        padding: VIEWER_PADDING,
      },
    );
  });

  protected readonly cellPolygons = computed<readonly ViewerProjectedCell[]>(() => {
    const contract = this.contract();
    const fit = this.svgFit();
    if (!contract || !fit) {
      return [];
    }

    return contract.cells.map((cell) => {
      const projected = fit.projectPoints(cell.worldPoints.map((point) => ({ x: point.x, y: point.y })));
      const center = projected.length
        ? {
            x: projected.reduce((sum, point) => sum + point.x, 0) / projected.length,
            y: projected.reduce((sum, point) => sum + point.y, 0) / projected.length,
          }
        : { x: 0, y: 0 };

      return {
        id: cell.id,
        label: cell.label,
        color: cell.color,
        points: projected.map((point) => `${point.x},${point.y}`).join(' '),
        centerX: Number(center.x.toFixed(2)),
        centerY: Number(center.y.toFixed(2)),
        generated: cell.hallway || cell.pkg,
      };
    });
  });

  protected readonly wallSegments = computed<readonly ViewerProjectedSegment[]>(() => {
    const fit = this.svgFit();
    const walls = this.contract()?.externalWalls ?? [];
    if (!fit) {
      return [];
    }

    return walls.map((wall) => this.projectSegment(wall.id, wall.from, wall.to));
  });

  protected readonly doorSegments = computed<readonly ViewerProjectedSegment[]>(() => {
    const fit = this.svgFit();
    const doors = this.contract()?.doors ?? [];
    if (!fit) {
      return [];
    }

    return doors.map((door) => this.projectSegment(door.id, door.wallFromWorld, door.wallToWorld, 0.18));
  });

  protected readonly windowSegments = computed<readonly ViewerProjectedSegment[]>(() => {
    const fit = this.svgFit();
    const windows = this.contract()?.windows ?? [];
    if (!fit) {
      return [];
    }

    return windows.map((window) => this.projectSegment(window.id, window.wallFromWorld, window.wallToWorld, 0.28));
  });

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    void file.text().then((text) => {
      this.loadContractText(text, file.name);
      if (input) {
        input.value = '';
      }
    });
  }

  protected onJsonInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.rawJson.set(target?.value ?? '');
  }

  protected loadFromText(): void {
    this.loadContractText(this.rawJson(), 'pasted contract');
  }

  protected clearViewer(): void {
    this.fileName.set('No file loaded');
    this.rawJson.set('');
    this.parseError.set(null);
    this.contract.set(null);
  }

  protected trackByLabel(_: number, row: ViewerSummaryRow): string {
    return row.label;
  }

  protected trackByCell(_: number, cell: ConstructionContractCell): string {
    return cell.id;
  }

  protected trackBySegment(_: number, segment: ViewerProjectedSegment): string {
    return segment.id;
  }

  private loadContractText(text: string, label: string): void {
    this.rawJson.set(text);
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!isConstructionContractExport(parsed)) {
        throw new Error('JSON does not match the construction contract shape.');
      }

      this.contract.set(parsed);
      this.fileName.set(label);
      this.parseError.set(null);
    } catch (error) {
      this.contract.set(null);
      this.fileName.set(label);
      this.parseError.set(error instanceof Error ? error.message : 'Could not parse contract JSON.');
    }
  }

  private projectSegment(
    id: string,
    from: { readonly x: number; readonly y: number },
    to: { readonly x: number; readonly y: number },
    trimRatio = 0,
  ): ViewerProjectedSegment {
    const fit = this.svgFit();
    if (!fit) {
      return { id, x1: 0, y1: 0, x2: 0, y2: 0 };
    }

    const start = fit.projectPoint(from);
    const end = fit.projectPoint(to);
    if (trimRatio <= 0) {
      return { id, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const x1 = start.x + dx * trimRatio;
    const y1 = start.y + dy * trimRatio;
    const x2 = end.x - dx * trimRatio;
    const y2 = end.y - dy * trimRatio;
    return {
      id,
      x1: Number(x1.toFixed(2)),
      y1: Number(y1.toFixed(2)),
      x2: Number(x2.toFixed(2)),
      y2: Number(y2.toFixed(2)),
    };
  }
}

function isConstructionContractExport(value: unknown): value is ConstructionContractExport {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ConstructionContractExport>;
  return candidate.schemaVersion === '1.0'
    && typeof candidate.layoutId === 'string'
    && typeof candidate.exportedAtIso === 'string'
    && typeof candidate.score === 'number'
    && Array.isArray(candidate.cells)
    && Array.isArray(candidate.doors)
    && Array.isArray(candidate.windows)
    && Array.isArray(candidate.externalWalls)
    && !!candidate.metrics;
}
