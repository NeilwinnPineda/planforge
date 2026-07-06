import { NgFor, NgIf } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';

export interface LayoutViewCell {
  readonly id?: string;
  readonly polygon?: string;
  readonly points?: string;
  readonly color: string;
  readonly label?: string;
  readonly displayLabel?: string;
  readonly cx?: number;
  readonly cy?: number;
  readonly radiusPixels?: number;
  readonly areaSquareMeters?: number;
  readonly generated?: boolean;
  readonly hallway?: boolean;
  readonly problem?: boolean;
  readonly failing?: boolean;
}

export interface LayoutViewLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly major?: boolean;
}

export interface LayoutViewMarker {
  readonly x?: number;
  readonly y?: number;
  readonly cx?: number;
  readonly cy?: number;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
  readonly angle?: number;
  readonly width?: number;
  readonly height?: number;
  readonly radius?: number;
  readonly radiusPixels?: number;
  readonly title?: string;
}

export interface LayoutViewAnnotation {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly kind?: 'label' | 'bearing' | 'distance' | 'setback' | 'scale';
  readonly anchor?: 'start' | 'middle' | 'end';
}

export interface LayoutViewPoint {
  readonly x: number;
  readonly y: number;
  readonly kind?: 'lot' | 'buildable';
  readonly radius?: number;
}

export interface LayoutViewScaleBar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly label: string;
}

@Component({
  selector: 'app-layout-view',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './layout-view.component.html',
  styleUrl: './layout-view.component.scss',
})
export class LayoutViewComponent {
  readonly width = input(760);
  readonly height = input(460);
  readonly cells = input<readonly LayoutViewCell[]>([]);
  readonly lotPolygon = input('');
  readonly buildablePolygon = input('');
  readonly exteriorLines = input<readonly LayoutViewLine[]>([]);
  readonly interiorLines = input<readonly LayoutViewLine[]>([]);
  readonly guideLines = input<readonly LayoutViewLine[]>([]);
  readonly windows = input<readonly LayoutViewMarker[]>([]);
  readonly doors = input<readonly LayoutViewMarker[]>([]);
  readonly annotations = input<readonly LayoutViewAnnotation[]>([]);
  readonly points = input<readonly LayoutViewPoint[]>([]);
  readonly scaleBar = input<LayoutViewScaleBar | null>(null);
  readonly problemIds = input<ReadonlySet<string>>(new Set());
  readonly showControls = input(true);
  readonly compact = input(false);
  readonly ariaLabel = input('Layout preview');

  protected readonly labelsVisible = signal(true);
  protected readonly openingsVisible = signal(true);
  protected readonly problemsVisible = signal(true);
  protected readonly hoveredIndex = signal<number | null>(null);

  protected readonly hoveredCell = computed(() => {
    const index = this.hoveredIndex();
    return index === null ? null : this.cells()[index] ?? null;
  });

  protected cellPoints(cell: LayoutViewCell): string { return cell.polygon ?? cell.points ?? ''; }
  protected cellLabel(cell: LayoutViewCell): string { return cell.displayLabel ?? cell.label ?? cell.id ?? 'Room'; }
  protected isProblem(cell: LayoutViewCell): boolean {
    return !!cell.problem || !!cell.failing || (!!cell.id && this.problemIds().has(cell.id));
  }
  protected markerX(marker: LayoutViewMarker): number { return marker.cx ?? marker.x ?? 0; }
  protected markerY(marker: LayoutViewMarker): number { return marker.cy ?? marker.y ?? 0; }
}
