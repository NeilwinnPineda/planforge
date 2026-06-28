import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { type GalleryEntry, LayoutGalleryService } from '../processing/layout-gallery.service';
import { analyzeConstructionExternalWalls, type ConstructionExternalWallAnalysis } from './external-wall.factory';
import { buildDoorPlacements, type ConstructionDoorPlacement } from './door-placement.factory';
import { buildWindowPlacements, type ConstructionWindowPlacement } from './window-placement.factory';
import { buildSpawnHeatmap, type SpawnHeatmap } from '../simulation/spawn-heatmap.factory';
import { LayoutPool } from '../pipeline/layout-pool';

export type { GalleryEntry, SpawnHeatmap };

export interface ConstructionOutput {
  readonly entry: GalleryEntry;
  readonly analysis: ConstructionExternalWallAnalysis;
  readonly windowPlacements: readonly ConstructionWindowPlacement[];
  readonly doorPlacements: readonly ConstructionDoorPlacement[];
}

@Injectable({ providedIn: 'root' })
export class ConstructionOutputService {
  private readonly gallery = inject(LayoutGalleryService);

  private readonly processedIds = new Set<string>();
  private readonly pool = new LayoutPool<ConstructionOutput>(
    (o) => o.entry.score,
    (o) => o.entry.artifact.layoutId,
    null,
  );

  readonly outputs = this.pool.entries;

  readonly spawnHeatmap = computed((): SpawnHeatmap | null => {
    const centroids: { x: number; y: number }[] = [];
    for (const output of this.outputs()) {
      for (const cell of output.entry.artifact.cells) {
        if (cell.pkg || cell.hallway || !cell.worldPoints.length) continue;
        const pts = cell.worldPoints;
        centroids.push({
          x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
          y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
        });
      }
    }
    return buildSpawnHeatmap(centroids);
  });

  constructor() {
    effect(() => {
      const entries = this.gallery.entries();
      untracked(() => {
        for (const entry of entries) {
          const id = entry.artifact.layoutId;
          if (this.processedIds.has(id)) continue;
          this.processedIds.add(id);

          const analysis = analyzeConstructionExternalWalls(entry.artifact);
          const doorPlacements = buildDoorPlacements(entry.artifact, analysis.segments);
          const doorWallIds = new Set(
            doorPlacements.filter((d) => d.wallId !== null).map((d) => d.wallId as string),
          );
          const windowPlacements = buildWindowPlacements(analysis.segments, doorWallIds);
          this.pool.push({ entry, analysis, windowPlacements, doorPlacements });
        }
      });
    }, { allowSignalWrites: true });
  }
}
