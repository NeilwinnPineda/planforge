import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { ProvisionalLayoutCell, ResidualAbsorbedLayoutArtifact, UvNegotiatedLayoutArtifact } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface ResidualUvAbsorptionArguments {
  readonly fillerColor: string;
  readonly hallwayColor: string;
}

export interface ResidualUvAbsorptionMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly residualCellCount: number;
  readonly absorbedRectCount: number;
}

interface UvBox {
  cell: ProvisionalLayoutCell;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

@Injectable({ providedIn: 'root' })
export class ResidualUvAbsorptionService {
  readonly stepId = 'processing.residual_uv_absorption';
  readonly stepLabel = 'Residual UV absorption';
  readonly stageCategory = 'warped-grid' as const;

  // Slice number: 9E — fifth and final step of the real verification-feeding warped pipeline.
  // Stage category: warped-grid gap fill.
  // Step id: processing.residual_uv_absorption.
  // Purpose: back-project negotiated room cells to UV boxes, scan uncovered UV grid tiles for
  // gaps, grow each seed into the largest uncovered rectangle (maximal-rect scan), attempt
  // absorption into adjacent deficit rooms first, then emit remaining gaps as hallway or filler
  // residual cells. Hallway residuals are interior gaps; filler residuals touch the UV boundary.
  // Inputs: UvNegotiatedLayoutArtifact (world-space room cells + quad) and color arguments.
  // Outputs: ResidualAbsorbedLayoutArtifact — merged rooms + residuals, the clusteredGridCells
  //   equivalent feeding final staging and verification.
  // Allowed dependencies: UvNegotiatedLayoutArtifact quad and world cells; local UV math only.
  // Forbidden responsibilities: edge negotiation, aspect ratio rescue, verification.
  // Legacy source: buildResidualUvQuads + tryAbsorbResidualUvRect inside buildClusteredGridCells
  //   in testing/legacy-reference/app/src/app/app.ts (line 5584).
  run(
    request: LayoutProcessingStepRequest<UvNegotiatedLayoutArtifact, ResidualUvAbsorptionArguments>,
  ): LayoutProcessingStepResult<ResidualAbsorbedLayoutArtifact, ResidualUvAbsorptionMetrics> {
    const quad = request.artifact.quadPoints.map((p) => ({ x: p.x, y: p.y }));
    const { fillerColor, hallwayColor } = request.arguments;

    if (!request.artifact.cells.length || quad.length !== 4) {
      return {
        artifact: {
          layoutId: request.artifact.layoutId,
          sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
          generatedAtIso: new Date().toISOString(),
          cells: [],
        },
        changed: false,
        metrics: { inputCellCount: request.artifact.cells.length, outputCellCount: 0, residualCellCount: 0, absorbedRectCount: 0 },
        traces: [
          {
            stepId: this.stepId,
            severity: 'warn',
            message: `Residual UV absorption skipped for ${request.artifact.layoutId}; no cells or invalid quad.`,
          },
        ],
      };
    }

    // Back-project each world cell to a mutable UV box for gap scanning and absorption.
    const boxes: UvBox[] = request.artifact.cells.map((cell) => {
      const uvPts = cell.worldPoints.map((p) => this.inverseWarpedGrid(p, quad));
      return {
        cell,
        uMin: Math.min(...uvPts.map((p) => p.u)),
        uMax: Math.max(...uvPts.map((p) => p.u)),
        vMin: Math.min(...uvPts.map((p) => p.v)),
        vMax: Math.max(...uvPts.map((p) => p.v)),
      };
    });

    // Build residual cells from uncovered UV space.
    const { residuals, absorbedRectCount } = this.buildResidualUvQuads(quad, boxes, fillerColor, hallwayColor);

    // Resolve any room-room overlaps that absorption expansion may have introduced before
    // the safe-residuals filter runs (so it sees a clean room state).
    this.resolveUvOverlaps(boxes);

    // Filter residuals that would overlap existing (possibly expanded by absorption) boxes.
    const safeResiduals = residuals.filter((residual) => {
      const residualBox = { uMin: residual.uMin, uMax: residual.uMax, vMin: residual.vMin, vMax: residual.vMax };
      return !this.hasOverlappingUvBoxes([
        ...boxes.map((b) => ({ uMin: b.uMin, uMax: b.uMax, vMin: b.vMin, vMax: b.vMax })),
        residualBox,
      ]);
    });
    const droppedOverlapCount = residuals.length - safeResiduals.length;

    // Back-project room boxes (may have expanded from absorption) to world space.
    const outputCells: ProvisionalLayoutCell[] = [];

    for (const { cell, uMin, uMax, vMin, vMax } of boxes) {
      const worldPoints = [
        this.bilinearQuadPoint(quad, uMin, vMin),
        this.bilinearQuadPoint(quad, uMax, vMin),
        this.bilinearQuadPoint(quad, uMax, vMax),
        this.bilinearQuadPoint(quad, uMin, vMax),
      ];
      const areaSquareMeters = this.polygonArea(worldPoints);
      if (areaSquareMeters <= 1e-6) continue;
      const areaDelta = cell.targetSquareMeters > 1e-6
        ? (areaSquareMeters - cell.targetSquareMeters) / cell.targetSquareMeters
        : 0;
      outputCells.push({
        id: cell.id,
        typeId: cell.typeId,
        label: cell.label,
        color: cell.color,
        tags: cell.tags,
        pkg: cell.pkg,
        hallway: cell.hallway,
        worldPoints,
        areaSquareMeters,
        targetSquareMeters: cell.targetSquareMeters,
        areaDelta,
        mass: cell.mass,
      });
    }

    // Back-project residual UV rects to world space and emit as filler/hallway cells.
    for (const residual of safeResiduals) {
      const { uMin, uMax, vMin, vMax, cell: residualCell } = residual;
      const worldPoints = [
        this.bilinearQuadPoint(quad, uMin, vMin),
        this.bilinearQuadPoint(quad, uMax, vMin),
        this.bilinearQuadPoint(quad, uMax, vMax),
        this.bilinearQuadPoint(quad, uMin, vMax),
      ];
      const areaSquareMeters = this.polygonArea(worldPoints);
      if (areaSquareMeters <= 1e-6) continue;
      outputCells.push({
        id: residualCell.id,
        typeId: residualCell.typeId,
        label: '',
        color: residualCell.color,
        tags: [],
        pkg: residualCell.pkg,
        hallway: residualCell.hallway,
        worldPoints,
        areaSquareMeters,
        targetSquareMeters: 0,
        areaDelta: 0,
        mass: 0,
      });
    }

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells: outputCells,
      },
      changed: outputCells.length > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        outputCellCount: outputCells.length,
        residualCellCount: safeResiduals.length,
        absorbedRectCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: outputCells.length > 0 ? 'info' : 'warn',
          message: outputCells.length > 0
            ? `Residual UV absorption produced ${outputCells.length} cells (${safeResiduals.length} residuals, ${absorbedRectCount} absorbed into rooms) for ${request.artifact.layoutId}.`
            : `Residual UV absorption produced no cells for ${request.artifact.layoutId}.`,
        },
        ...(droppedOverlapCount > 0 ? [{
          stepId: this.stepId,
          severity: 'warn' as const,
          message: `processing.residual_uv_absorption: ${droppedOverlapCount} residual(s) dropped due to UV overlap with existing cells for ${request.artifact.layoutId}.`,
        }] : []),
      ],
    };
  }

  // Greedy maximal-rect scan of uncovered UV space — source: buildResidualUvQuads
  // (testing/legacy-reference/app/src/app/app.ts line 5587).
  private buildResidualUvQuads(
    quad: readonly { x: number; y: number }[],
    safeBoxes: UvBox[],
    fillerColor: string,
    hallwayColor: string,
  ): {
    residuals: Array<{ cell: Partial<ProvisionalLayoutCell> & { id: string; typeId: string; color: string; pkg: boolean; hallway: boolean }; uMin: number; uMax: number; vMin: number; vMax: number }>;
    absorbedRectCount: number;
  } {
    const edgeValuesU = [...new Set(safeBoxes.flatMap((box) => [0, 1, box.uMin, box.uMax]).map((v) => +v.toFixed(8)))].sort((a, b) => a - b);
    const edgeValuesV = [...new Set(safeBoxes.flatMap((box) => [0, 1, box.vMin, box.vMax]).map((v) => +v.toFixed(8)))].sort((a, b) => a - b);

    const containsCenter = (uMin: number, uMax: number, vMin: number, vMax: number, box: UvBox) => {
      const u = (uMin + uMax) * 0.5;
      const v = (vMin + vMax) * 0.5;
      return u > box.uMin + 1e-6 && u < box.uMax - 1e-6 && v > box.vMin + 1e-6 && v < box.vMax - 1e-6;
    };

    const worldArea = (uMin: number, uMax: number, vMin: number, vMax: number) => {
      const points = [
        this.bilinearQuadPoint(quad, uMin, vMin),
        this.bilinearQuadPoint(quad, uMax, vMin),
        this.bilinearQuadPoint(quad, uMax, vMax),
        this.bilinearQuadPoint(quad, uMin, vMax),
      ];
      return this.polygonArea(points);
    };

    const sharedEdgeLength = (
      rect: { uMin: number; uMax: number; vMin: number; vMax: number },
      box: UvBox,
    ) => {
      const EPS = 1e-6;
      if (Math.abs(rect.uMax - box.uMin) <= EPS || Math.abs(rect.uMin - box.uMax) <= EPS) {
        return Math.max(0, Math.min(rect.vMax, box.vMax) - Math.max(rect.vMin, box.vMin));
      }
      if (Math.abs(rect.vMax - box.vMin) <= EPS || Math.abs(rect.vMin - box.vMax) <= EPS) {
        return Math.max(0, Math.min(rect.uMax, box.uMax) - Math.max(rect.uMin, box.uMin));
      }
      return 0;
    };

    // Build coverage grid.
    const covered: boolean[][] = [];
    for (let ui = 0; ui < edgeValuesU.length - 1; ui += 1) {
      covered[ui] = [];
      for (let vi = 0; vi < edgeValuesV.length - 1; vi += 1) {
        const uMin = edgeValuesU[ui];
        const uMax = edgeValuesU[ui + 1];
        const vMin = edgeValuesV[vi];
        const vMax = edgeValuesV[vi + 1];
        covered[ui][vi] = safeBoxes.some((box) => containsCenter(uMin, uMax, vMin, vMax, box));
      }
    }

    const residuals: Array<{ cell: { id: string; typeId: string; color: string; pkg: boolean; hallway: boolean }; uMin: number; uMax: number; vMin: number; vMax: number }> = [];
    let absorbedRectCount = 0;

    while (true) {
      let seedU = -1;
      let seedV = -1;
      for (let vi = 0; vi < edgeValuesV.length - 1 && seedU < 0; vi += 1) {
        for (let ui = 0; ui < edgeValuesU.length - 1; ui += 1) {
          if (!covered[ui][vi]) {
            seedU = ui;
            seedV = vi;
            break;
          }
        }
      }
      if (seedU < 0) break;

      let bestRect: { u0: number; u1: number; v0: number; v1: number; area: number } | null = null;
      for (let u1 = seedU + 1; u1 <= edgeValuesU.length - 1 && !covered[u1 - 1][seedV]; u1 += 1) {
        let maxV = seedV + 1;
        while (maxV <= edgeValuesV.length - 1) {
          let full = true;
          for (let u = seedU; u < u1; u += 1) {
            if (covered[u][maxV - 1]) {
              full = false;
              break;
            }
          }
          if (!full) break;
          const area = (edgeValuesU[u1] - edgeValuesU[seedU]) * (edgeValuesV[maxV] - edgeValuesV[seedV]);
          if (!bestRect || area > bestRect.area) {
            bestRect = { u0: seedU, u1, v0: seedV, v1: maxV, area };
          }
          maxV += 1;
        }
      }
      if (!bestRect) break;

      for (let u = bestRect.u0; u < bestRect.u1; u += 1) {
        for (let v = bestRect.v0; v < bestRect.v1; v += 1) {
          covered[u][v] = true;
        }
      }

      const rect = {
        uMin: edgeValuesU[bestRect.u0],
        uMax: edgeValuesU[bestRect.u1],
        vMin: edgeValuesV[bestRect.v0],
        vMax: edgeValuesV[bestRect.v1],
      };

      if (this.tryAbsorbResidualUvRect(rect, safeBoxes, quad)) {
        absorbedRectCount += 1;
        continue;
      }

      const areaSquareMeters = worldArea(rect.uMin, rect.uMax, rect.vMin, rect.vMax);
      if (areaSquareMeters <= 1e-6) continue;

      const sharedLength = safeBoxes.reduce((best, box) => Math.max(best, sharedEdgeLength(rect, box)), 0);
      const touchesBoundary = rect.uMin <= 1e-6 || rect.vMin <= 1e-6 || rect.uMax >= 1 - 1e-6 || rect.vMax >= 1 - 1e-6;
      if (sharedLength <= 1e-6 && !touchesBoundary) continue;

      const treatAsFiller = touchesBoundary;
      residuals.push({
        cell: {
          id: `${treatAsFiller ? 'generated_filler' : 'generated_hallway'}_residual_${rect.uMin.toFixed(4)}_${rect.vMin.toFixed(4)}`,
          typeId: treatAsFiller ? 'generated_filler' : 'generated_hallway',
          color: treatAsFiller ? fillerColor : hallwayColor,
          pkg: treatAsFiller,
          hallway: !treatAsFiller,
        },
        uMin: rect.uMin,
        uMax: rect.uMax,
        vMin: rect.vMin,
        vMax: rect.vMax,
      });
    }

    return { residuals, absorbedRectCount };
  }

  // Tries to expand an adjacent deficit room box to absorb a small residual gap.
  // Source: tryAbsorbResidualUvRect in testing/legacy-reference/app/src/app/app.ts (line 5839).
  private tryAbsorbResidualUvRect(
    rect: { uMin: number; uMax: number; vMin: number; vMax: number },
    safeBoxes: UvBox[],
    quad: readonly { x: number; y: number }[],
  ): boolean {
    const EPS = 1e-6;
    const MAX_ASPECT_RATIO = 5.25;
    const MAX_ASPECT_GROWTH = 1.8;

    const worldArea = (box: { uMin: number; uMax: number; vMin: number; vMax: number }) => {
      const points = [
        this.bilinearQuadPoint(quad, box.uMin, box.vMin),
        this.bilinearQuadPoint(quad, box.uMax, box.vMin),
        this.bilinearQuadPoint(quad, box.uMax, box.vMax),
        this.bilinearQuadPoint(quad, box.uMin, box.vMax),
      ];
      return this.polygonArea(points);
    };

    const uvAspectRatio = (box: { uMin: number; uMax: number; vMin: number; vMax: number }) => {
      const width = Math.max(box.uMax - box.uMin, EPS);
      const height = Math.max(box.vMax - box.vMin, EPS);
      return Math.max(width, height) / Math.min(width, height);
    };

    const compactEnough = (
      current: { uMin: number; uMax: number; vMin: number; vMax: number },
      next: { uMin: number; uMax: number; vMin: number; vMax: number },
    ) => {
      const currentAspect = uvAspectRatio(current);
      const nextAspect = uvAspectRatio(next);
      return nextAspect <= MAX_ASPECT_RATIO && nextAspect <= Math.max(currentAspect + MAX_ASPECT_GROWTH, currentAspect * 1.6);
    };

    const overlapsOtherBoxes = (
      next: { uMin: number; uMax: number; vMin: number; vMax: number },
      currentBox: UvBox,
    ) => safeBoxes.some((other) => {
      if (other === currentBox) return false;
      const uOverlap = Math.min(next.uMax, other.uMax) - Math.max(next.uMin, other.uMin);
      const vOverlap = Math.min(next.vMax, other.vMax) - Math.max(next.vMin, other.vMin);
      return uOverlap > EPS && vOverlap > EPS;
    });

    const candidates = safeBoxes.flatMap((box) => {
      const shortageSqm = Math.max(0, box.cell.targetSquareMeters - worldArea(box));
      const options: Array<{ box: UvBox; next: { uMin: number; uMax: number; vMin: number; vMax: number }; coverage: number; shortageSqm: number }> = [];

      if (Math.abs(rect.uMax - box.uMin) <= EPS && rect.vMin >= box.vMin - EPS && rect.vMax <= box.vMax + EPS) {
        options.push({ box, next: { ...box, uMin: rect.uMin }, coverage: rect.vMax - rect.vMin, shortageSqm });
      }
      if (Math.abs(rect.uMin - box.uMax) <= EPS && rect.vMin >= box.vMin - EPS && rect.vMax <= box.vMax + EPS) {
        options.push({ box, next: { ...box, uMax: rect.uMax }, coverage: rect.vMax - rect.vMin, shortageSqm });
      }
      if (Math.abs(rect.vMax - box.vMin) <= EPS && rect.uMin >= box.uMin - EPS && rect.uMax <= box.uMax + EPS) {
        options.push({ box, next: { ...box, vMin: rect.vMin }, coverage: rect.uMax - rect.uMin, shortageSqm });
      }
      if (Math.abs(rect.vMin - box.vMax) <= EPS && rect.uMin >= box.uMin - EPS && rect.uMax <= box.uMax + EPS) {
        options.push({ box, next: { ...box, vMax: rect.vMax }, coverage: rect.uMax - rect.uMin, shortageSqm });
      }

      return options.filter((option) =>
        option.coverage > EPS
        && option.shortageSqm > 0.01
        && compactEnough(box, option.next)
        && !overlapsOtherBoxes(option.next, box),
      );
    });

    if (!candidates.length) return false;

    candidates.sort((a, b) => b.shortageSqm - a.shortageSqm || b.coverage - a.coverage);

    const winner = candidates[0];
    winner.box.uMin = winner.next.uMin;
    winner.box.uMax = winner.next.uMax;
    winner.box.vMin = winner.next.vMin;
    winner.box.vMax = winner.next.vMax;
    return true;
  }

  private resolveUvOverlaps(boxes: UvBox[]): void {
    const EPS = 1e-6;
    for (let pass = 0; pass < 8; pass += 1) {
      let anyFixed = false;
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]; const b = boxes[j];
          const uOv = Math.min(a.uMax, b.uMax) - Math.max(a.uMin, b.uMin);
          const vOv = Math.min(a.vMax, b.vMax) - Math.max(a.vMin, b.vMin);
          if (uOv <= EPS || vOv <= EPS) continue;
          if (uOv <= vOv) {
            const mid = (Math.max(a.uMin, b.uMin) + Math.min(a.uMax, b.uMax)) / 2;
            if (a.uMax > b.uMin + EPS) { a.uMax = mid; b.uMin = mid; }
            else { b.uMax = mid; a.uMin = mid; }
          } else {
            const mid = (Math.max(a.vMin, b.vMin) + Math.min(a.vMax, b.vMax)) / 2;
            if (a.vMax > b.vMin + EPS) { a.vMax = mid; b.vMin = mid; }
            else { b.vMax = mid; a.vMin = mid; }
          }
          anyFixed = true;
        }
      }
      if (!anyFixed) break;
    }
  }

  private hasOverlappingUvBoxes(boxes: readonly { uMin: number; uMax: number; vMin: number; vMax: number }[]): boolean {
    const EPS = 1e-6;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapU = Math.min(a.uMax, b.uMax) - Math.max(a.uMin, b.uMin);
        const overlapV = Math.min(a.vMax, b.vMax) - Math.max(a.vMin, b.vMin);
        if (overlapU > EPS && overlapV > EPS) return true;
      }
    }
    return false;
  }

  private polygonArea(points: readonly GeometryPoint[]): number {
    const n = points.length;
    let area = 0;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  private bilinearQuadPoint(
    quad: readonly { x: number; y: number }[],
    u: number,
    v: number,
  ): GeometryPoint {
    const [p0, p1, p2, p3] = quad;
    return {
      x: (1 - u) * (1 - v) * p0.x + u * (1 - v) * p1.x + u * v * p2.x + (1 - u) * v * p3.x,
      y: (1 - u) * (1 - v) * p0.y + u * (1 - v) * p1.y + u * v * p2.y + (1 - u) * v * p3.y,
    };
  }

  // Newton-Raphson inverse bilinear quad map: world → (u, v).
  // Source: inverseWarpedGrid in testing/legacy-reference/app/src/app/app.ts (line 5160).
  private inverseWarpedGrid(
    world: GeometryPoint,
    quad: readonly { x: number; y: number }[],
  ): { u: number; v: number } {
    let u = 0.5;
    let v = 0.5;

    for (let iter = 0; iter < 10; iter += 1) {
      const p = this.bilinearQuadPoint(quad, u, v);
      const [p0, p1, p2, p3] = quad;
      const dPdu = {
        x: (1 - v) * (p1.x - p0.x) + v * (p2.x - p3.x),
        y: (1 - v) * (p1.y - p0.y) + v * (p2.y - p3.y),
      };
      const dPdv = {
        x: (1 - u) * (p3.x - p0.x) + u * (p2.x - p1.x),
        y: (1 - u) * (p3.y - p0.y) + u * (p2.y - p1.y),
      };
      const rx = world.x - p.x;
      const ry = world.y - p.y;
      const det = dPdu.x * dPdv.y - dPdu.y * dPdv.x;
      if (Math.abs(det) < 1e-10) break;
      u = Math.max(0, Math.min(1, u + (dPdv.y * rx - dPdv.x * ry) / det));
      v = Math.max(0, Math.min(1, v + (dPdu.x * ry - dPdu.y * rx) / det));
    }

    return { u, v };
  }
}

