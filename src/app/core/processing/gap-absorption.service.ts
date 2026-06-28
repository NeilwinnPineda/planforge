import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { EdgeSteppedLayoutArtifact, GapAbsorbedLayoutArtifact, ProvisionalLayoutCell } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface GapAbsorptionArguments {
  readonly buildablePoints: readonly GeometryPoint[];
  readonly gridStepMeters: number;
  readonly minRegionSquareMeters: number;
}

export interface GapAbsorptionMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly absorbedTileCount: number;
  readonly absorbedAreaSquareMeters: number;
  readonly residueAreaSquareMeters: number;
  readonly gapCount: number;
}

@Injectable({ providedIn: 'root' })
export class GapAbsorptionService {
  readonly stepId = 'processing.gap_absorption';
  readonly stepLabel = 'Gap absorption';
  readonly stageCategory = 'refinement' as const;
  private readonly epsilon = 0.000001;

  // Slice number: legacy downstream diagnostic port after boundary edge stepping.
  // Stage category: refinement/diagnostic within downstream layout processing.
  // Step id: processing.gap_absorption.
  // Purpose: mirror the old raster absorption pass that fills unclaimed gap tiles back into
  // neighboring rooms after edge stepping, without mutating the canonical source cells.
  // Inputs: edge-stepped cells plus buildable polygon and raster step settings.
  // Outputs: a diagnostic artifact made of owned raster tiles, along with absorbed/residue metrics.
  // Allowed dependencies: edge-stepped cells, explicit raster arguments, and local deterministic geometry helpers only.
  // Forbidden responsibilities: canonical room repartition, fringe exchange, simplification, verification, and final staging ownership.
  run(
    request: LayoutProcessingStepRequest<EdgeSteppedLayoutArtifact, GapAbsorptionArguments>,
  ): LayoutProcessingStepResult<GapAbsorbedLayoutArtifact, GapAbsorptionMetrics> {
    const buildablePolygon = request.arguments.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
    const ownerCells = request.artifact.cells
      .map((cell) => ({
        ...cell,
        tags: [...cell.tags],
        worldPoints: cell.worldPoints.map((point) => ({ x: point.x, y: point.y })),
      }))
      .filter((cell) => cell.worldPoints.length >= 3);

    if (buildablePolygon.length < 3 || !ownerCells.length) {
      return {
        artifact: {
          layoutId: request.artifact.layoutId,
          sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
          generatedAtIso: new Date().toISOString(),
          cells: [],
        },
        changed: false,
        metrics: {
          inputCellCount: request.artifact.cells.length,
          outputCellCount: 0,
          absorbedTileCount: 0,
          absorbedAreaSquareMeters: 0,
          residueAreaSquareMeters: 0,
          gapCount: 0,
        },
        traces: [
          {
            stepId: this.stepId,
            severity: 'warn',
            message: `Gap absorption skipped for ${request.artifact.layoutId}; missing buildable polygon or edge-stepped owners.`,
          },
        ],
      };
    }

    const gridStepMeters = Math.max(0.25, request.arguments.gridStepMeters);
    const cellAreaSquareMeters = gridStepMeters * gridStepMeters;
    const minX = Math.min(...buildablePolygon.map((point) => point.x));
    const maxX = Math.max(...buildablePolygon.map((point) => point.x));
    const minY = Math.min(...buildablePolygon.map((point) => point.y));
    const maxY = Math.max(...buildablePolygon.map((point) => point.y));
    const gcols = Math.max(1, Math.ceil((maxX - minX) / gridStepMeters));
    const grows = Math.max(1, Math.ceil((maxY - minY) / gridStepMeters));
    const ownerCoverage = new Int32Array(gcols * grows).fill(-2); // -2 outside, -1 residue/white, >=0 owner

    const ownerByColor = new Map(ownerCells.map((owner, ownerIndex) => [owner.color, ownerIndex]));
    const ownerRegionAreas = new Map<number, number[]>();
    const idxOf = (row: number, col: number) => row * gcols + col;
    const centerOf = (row: number, col: number) => ({
      x: minX + (col + 0.5) * gridStepMeters,
      y: minY + (row + 0.5) * gridStepMeters,
    });

    for (let row = 0; row < grows; row += 1) {
      for (let col = 0; col < gcols; col += 1) {
        const center = centerOf(row, col);
        if (!this.isPointInsideOrOnPolygon(center, buildablePolygon)) {
          continue;
        }

        ownerCoverage[idxOf(row, col)] = -1;
        for (let ownerIndex = 0; ownerIndex < ownerCells.length; ownerIndex += 1) {
          if (this.isPointInsideOrOnPolygon(center, ownerCells[ownerIndex].worldPoints)) {
            ownerCoverage[idxOf(row, col)] = ownerIndex;
            break;
          }
        }
      }
    }

    // Legacy close pass: seal one-cell white seams when the same owner flanks both sides.
    const closedCoverage = new Int32Array(ownerCoverage);
    for (let row = 0; row < grows; row += 1) {
      for (let col = 0; col < gcols; col += 1) {
        const index = idxOf(row, col);
        if (ownerCoverage[index] !== -1) {
          continue;
        }

        const left = col > 0 ? ownerCoverage[idxOf(row, col - 1)] : -1;
        const right = col + 1 < gcols ? ownerCoverage[idxOf(row, col + 1)] : -1;
        const up = row > 0 ? ownerCoverage[idxOf(row - 1, col)] : -1;
        const down = row + 1 < grows ? ownerCoverage[idxOf(row + 1, col)] : -1;

        let fill = -1;
        if (left >= 0 && left === right) {
          fill = left;
        } else if (up >= 0 && up === down) {
          fill = up;
        } else {
          const counts = new Map<number, number>();
          [left, right, up, down].forEach((owner) => {
            if (owner < 0) {
              return;
            }
            counts.set(owner, (counts.get(owner) ?? 0) + 1);
          });
          counts.forEach((count, owner) => {
            if (fill < 0 && count >= 3) {
              fill = owner;
            }
          });
        }

        if (fill >= 0) {
          closedCoverage[index] = fill;
        }
      }
    }
    for (let index = 0; index < ownerCoverage.length; index += 1) {
      ownerCoverage[index] = closedCoverage[index];
    }

    const buildRegions = (includeWhite: boolean) => {
      const visited = new Uint8Array(ownerCoverage.length);
      const regions: Array<{ ownerIndex: number; tiles: number[] }> = [];

      for (let row = 0; row < grows; row += 1) {
        for (let col = 0; col < gcols; col += 1) {
          const start = idxOf(row, col);
          if (visited[start]) {
            continue;
          }
          const ownerIndex = ownerCoverage[start];
          if (ownerIndex === -2 || (!includeWhite && ownerIndex < 0)) {
            continue;
          }

          const tiles: number[] = [];
          const queue = [start];
          visited[start] = 1;

          while (queue.length) {
            const current = queue.shift()!;
            tiles.push(current);
            const r = Math.floor(current / gcols);
            const c = current % gcols;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr < 0 || nr >= grows || nc < 0 || nc >= gcols) {
                continue;
              }
              const next = idxOf(nr, nc);
              if (visited[next] || ownerCoverage[next] !== ownerIndex) {
                continue;
              }
              visited[next] = 1;
              queue.push(next);
            }
          }

          regions.push({ ownerIndex, tiles });
        }
      }

      return regions;
    };

    let regions = buildRegions(false);
    regions
      .filter((region) => region.ownerIndex >= 0)
      .forEach((region) => {
        const areas = ownerRegionAreas.get(region.ownerIndex) ?? [];
        areas.push(region.tiles.length * cellAreaSquareMeters);
        ownerRegionAreas.set(region.ownerIndex, areas);
      });

    // Legacy small-region surrender: small white pockets go to the smallest adjacent room.
    buildRegions(true)
      .filter((region) => region.ownerIndex === -1)
      .forEach((region) => {
        const areaSquareMeters = region.tiles.length * cellAreaSquareMeters;
        if (areaSquareMeters >= request.arguments.minRegionSquareMeters) {
          return;
        }

        const neighborOwners = new Set<number>();
        region.tiles.forEach((tileIndex) => {
          const row = Math.floor(tileIndex / gcols);
          const col = tileIndex % gcols;
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= grows || nc < 0 || nc >= gcols) {
              continue;
            }
            const owner = ownerCoverage[idxOf(nr, nc)];
            if (owner >= 0) {
              neighborOwners.add(owner);
            }
          }
        });

        let winner = -1;
        let smallestArea = Number.POSITIVE_INFINITY;
        neighborOwners.forEach((owner) => {
          const localMin = Math.min(...(ownerRegionAreas.get(owner) ?? [Number.POSITIVE_INFINITY]));
          if (localMin < smallestArea) {
            smallestArea = localMin;
            winner = owner;
          }
        });

        if (winner >= 0) {
          region.tiles.forEach((tileIndex) => {
            ownerCoverage[tileIndex] = winner;
          });
        }
      });

    regions = buildRegions(false);
    const gapCount = buildRegions(true).filter((region) => region.ownerIndex === -1).length;

    const rasterCells: ProvisionalLayoutCell[] = [];
    let absorbedTileCount = 0;
    let residueAreaSquareMeters = 0;

    for (let row = 0; row < grows; row += 1) {
      for (let col = 0; col < gcols; col += 1) {
        const index = idxOf(row, col);
        const ownerIndex = ownerCoverage[index];
        if (ownerIndex === -2) {
          continue;
        }
        if (ownerIndex < 0) {
          residueAreaSquareMeters += cellAreaSquareMeters;
          continue;
        }

        const owner = ownerCells[ownerIndex];
        const x0 = minX + col * gridStepMeters;
        const x1 = Math.min(maxX, x0 + gridStepMeters);
        const y0 = minY + row * gridStepMeters;
        const y1 = Math.min(maxY, y0 + gridStepMeters);
        absorbedTileCount += 1;
        rasterCells.push({
          id: `${owner.id}__gap_tile__${row}_${col}`,
          typeId: owner.typeId,
          label: owner.label,
          color: owner.color,
          tags: [...owner.tags],
          pkg: owner.pkg,
          hallway: owner.hallway,
          worldPoints: [
            { x: x0, y: y0 },
            { x: x1, y: y0 },
            { x: x1, y: y1 },
            { x: x0, y: y1 },
          ],
          areaSquareMeters: (x1 - x0) * (y1 - y0),
          targetSquareMeters: owner.targetSquareMeters,
          areaDelta: owner.areaDelta,
          mass: owner.mass,
        });
      }
    }

    const absorbedAreaSquareMeters = absorbedTileCount * cellAreaSquareMeters;

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells: rasterCells,
      },
      changed: absorbedTileCount > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        outputCellCount: rasterCells.length,
        absorbedTileCount,
        absorbedAreaSquareMeters,
        residueAreaSquareMeters,
        gapCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: residueAreaSquareMeters > 0.1 ? 'warn' : 'info',
          message: `Legacy-style gap absorption rasterized ${absorbedTileCount} owned tiles for ${request.artifact.layoutId}; residue ${residueAreaSquareMeters.toFixed(2)} sq m across ${gapCount} white regions.`,
        },
      ],
    };
  }

  private isPointInsideOrOnPolygon(point: GeometryPoint, polygon: readonly GeometryPoint[]): boolean {
    return this.isPointOnPolygonBoundary(point, polygon, this.epsilon) || this.pointInPolygon(point.x, point.y, polygon);
  }

  private pointInPolygon(x: number, y: number, polygon: readonly GeometryPoint[]): boolean {
    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
      const current = polygon[index];
      const previous = polygon[previousIndex];
      const intersects = ((current.y > y) !== (previous.y > y))
        && (x < ((previous.x - current.x) * (y - current.y)) / ((previous.y - current.y) || Number.EPSILON) + current.x);
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  private isPointOnPolygonBoundary(point: GeometryPoint, polygon: readonly GeometryPoint[], epsilon: number): boolean {
    return polygon.some((startPoint, index) => this.isPointOnSegment(point, startPoint, polygon[(index + 1) % polygon.length], epsilon));
  }

  private isPointOnSegment(point: GeometryPoint, startPoint: GeometryPoint, endPoint: GeometryPoint, epsilon: number): boolean {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy);
    if (length <= epsilon) {
      return false;
    }
    const crossDistance = Math.abs(dx * (point.y - startPoint.y) - dy * (point.x - startPoint.x)) / length;
    if (crossDistance > epsilon) {
      return false;
    }
    const dot = (point.x - startPoint.x) * dx + (point.y - startPoint.y) * dy;
    return dot >= -epsilon && dot <= length * length + epsilon;
  }
}
