import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type {
  FinalStagedLayoutArtifact,
  VerificationCheckResult,
  VerificationFailure,
  VerifiedLayoutArtifact,
} from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface VerificationCriticalPair {
  readonly typeA: string;
  readonly typeB: string;
  readonly label: string;
}

export interface VerificationArguments {
  readonly deficiencyThreshold: number;
  readonly aspectRatioThreshold: number;
  readonly openAccessTypeIds: readonly string[];
  readonly foyerTypeIds: readonly string[];
  readonly criticalPairs: readonly VerificationCriticalPair[];
  readonly adjacencyEdgeEpsilon: number;
  readonly garageTypeIds: readonly string[];
  readonly frontageBuildableEdges: readonly { readonly from: GeometryPoint; readonly to: GeometryPoint }[];
  readonly sliverMinDimension: number;
}

export interface VerificationMetrics {
  readonly inputCellCount: number;
  readonly accepted: boolean;
  readonly deficiencyFailureCount: number;
  readonly aspectFailureCount: number;
  readonly accessFailureCount: number;
  readonly adjacencyFailureCount: number;
  readonly garageFrontageFailureCount: number;
  readonly foyerFrontageFailureCount: number;
  readonly sliverFailureCount: number;
  readonly overlapFailureCount: number;
}

@Injectable({ providedIn: 'root' })
export class VerificationService {
  readonly stepId = 'processing.verification';
  readonly stepLabel = 'Layout verification';
  readonly stageCategory = 'verification' as const;

  // Purpose: run the four canonical verification checks on final staged cells.
  // Deficiency: non-hallway/non-pkg rooms below the area threshold fail.
  // Aspect ratio: any non-pkg cell with a world bounding-box ratio above threshold fails.
  // Access: BFS from all foyer cells through the world adjacency graph; any room not reachable fails.
  // Critical touch: configured room type pairs must share a world-space edge.
  // Inputs: FinalStagedLayoutArtifact plus explicit threshold and rule arguments.
  // Outputs: VerifiedLayoutArtifact — same cells plus per-check results and an accepted flag.
  // Forbidden responsibilities: geometry mutation, cell generation, promotion, ranking.
  run(
    request: LayoutProcessingStepRequest<FinalStagedLayoutArtifact, VerificationArguments>,
  ): LayoutProcessingStepResult<VerifiedLayoutArtifact, VerificationMetrics> {
    const {
      deficiencyThreshold,
      aspectRatioThreshold,
      openAccessTypeIds,
      foyerTypeIds,
      criticalPairs,
      adjacencyEdgeEpsilon,
      garageTypeIds,
      frontageBuildableEdges,
      sliverMinDimension,
    } = request.arguments;
    const cells = request.artifact.cells;

    // 1. Deficiency check.
    const deficiencyFailures: VerificationFailure[] = cells
      .filter((c) => !c.pkg && !c.hallway && c.targetSquareMeters > 1e-6 && c.areaSquareMeters < c.targetSquareMeters * deficiencyThreshold)
      .map((c) => ({
        cellId: c.id,
        label: c.label,
        typeId: c.typeId,
        detail: `${(c.areaSquareMeters / c.targetSquareMeters * 100).toFixed(1)}% of ${c.targetSquareMeters.toFixed(2)} sq m target`,
      }));

    // 2. Aspect ratio check — hallways are excluded (long corridors always exceed threshold).
    const aspectFailures: VerificationFailure[] = cells
      .filter((c) => !c.pkg && !c.hallway && this.worldAspectRatio(c.worldPoints) >= aspectRatioThreshold)
      .map((c) => ({
        cellId: c.id,
        label: c.label,
        typeId: c.typeId,
        detail: `${this.worldAspectRatio(c.worldPoints).toFixed(2)}:1`,
      }));

    // 3. Access check — BFS from all foyer cells through full adjacency graph.
    const adj = this.buildAdjacencyGraph(cells, adjacencyEdgeEpsilon);
    const reachable = new Set<number>();
    for (let i = 0; i < cells.length; i++) {
      if (foyerTypeIds.includes(cells[i].typeId)) reachable.add(i);
    }
    const queue = [...reachable];
    while (queue.length) {
      const curr = queue.shift()!;
      for (const nb of adj.get(curr) ?? []) {
        if (!reachable.has(nb)) { reachable.add(nb); queue.push(nb); }
      }
    }
    const accessFailures: VerificationFailure[] = cells
      .filter((c, i) => {
        if (c.pkg || c.hallway) return false;
        if (openAccessTypeIds.includes(c.typeId)) return false;
        return !reachable.has(i);
      })
      .map((c) => ({
        cellId: c.id,
        label: c.label,
        typeId: c.typeId,
        detail: 'not reachable from foyer through adjacency graph',
      }));

    // 4. Critical touch check — pairs that must share a world-space edge.
    const adjacencyFailures: VerificationFailure[] = criticalPairs
      .filter((pair) => {
        const aCells = cells.filter((c) => c.typeId === pair.typeA);
        const bCells = cells.filter((c) => c.typeId === pair.typeB);
        if (!aCells.length || !bCells.length) return true;
        return !aCells.some((a) => bCells.some((b) => this.sharesEdge(a.worldPoints, b.worldPoints, adjacencyEdgeEpsilon)));
      })
      .map((pair) => ({
        cellId: '',
        label: pair.label,
        typeId: `${pair.typeA}/${pair.typeB}`,
        detail: `${pair.typeA} does not touch ${pair.typeB}`,
      }));

    // 5. Garage frontage check — garage must have at least one edge collinear with the
    // front buildable boundary. Fails when other rooms occupy the frontage and block
    // the garage from reaching the street.
    const garageTypeIdSet = new Set(garageTypeIds);
    const garageCells = cells.filter((c) => garageTypeIdSet.has(c.typeId));
    const garageHasFrontage = garageCells.length === 0
      || frontageBuildableEdges.length === 0
      || garageCells.some((garage) =>
          frontageBuildableEdges.some((fe) =>
            this.sharesEdge(garage.worldPoints, [fe.from, fe.to], adjacencyEdgeEpsilon)));
    const garageFrontageFailures: VerificationFailure[] = garageHasFrontage ? [] : garageCells.map((c) => ({
      cellId: c.id,
      label: c.label,
      typeId: c.typeId,
      detail: 'garage does not touch the front buildable boundary — rooms blocking street frontage',
    }));

    // 6. Foyer frontage check — foyer must touch the front buildable boundary.
    const foyerTypeIdSet = new Set(foyerTypeIds);
    const foyerCells = cells.filter((c) => foyerTypeIdSet.has(c.typeId));
    const foyerHasFrontage = foyerCells.length === 0
      || frontageBuildableEdges.length === 0
      || foyerCells.some((foyer) =>
          frontageBuildableEdges.some((fe) =>
            this.sharesEdge(foyer.worldPoints, [fe.from, fe.to], adjacencyEdgeEpsilon)));
    const foyerFrontageFailures: VerificationFailure[] = foyerHasFrontage ? [] : foyerCells.map((c) => ({
      cellId: c.id,
      label: c.label,
      typeId: c.typeId,
      detail: 'foyer does not touch the front buildable boundary',
    }));

    // 8. Sliver check — non-pkg, non-hallway cells below the minimum dimension threshold.
    // Hallways are narrow by design and must not be penalised for it.
    const sliverFailures: VerificationFailure[] = cells
      .filter((c) => !c.pkg && !c.hallway && this.minDimension(c.worldPoints) < sliverMinDimension)
      .map((c) => ({
        cellId: c.id,
        label: c.label,
        typeId: c.typeId,
        detail: `min dimension ${this.minDimension(c.worldPoints).toFixed(3)} m < ${sliverMinDimension} m`,
      }));

    // 9. Overlap check — non-pkg cell pairs whose polygons actually intersect (not just touch).
    const overlapCellIndices = new Set<number>();
    const overlapDescriptions = new Map<number, string[]>();
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].pkg) continue;
      for (let j = i + 1; j < cells.length; j++) {
        if (cells[j].pkg) continue;
        if (this.polygonsOverlap(cells[i].worldPoints, cells[j].worldPoints)) {
          overlapCellIndices.add(i);
          overlapCellIndices.add(j);
          if (!overlapDescriptions.has(i)) overlapDescriptions.set(i, []);
          if (!overlapDescriptions.has(j)) overlapDescriptions.set(j, []);
          overlapDescriptions.get(i)!.push(cells[j].label);
          overlapDescriptions.get(j)!.push(cells[i].label);
        }
      }
    }
    const overlapFailures: VerificationFailure[] = [...overlapCellIndices].map((i) => ({
      cellId: cells[i].id,
      label: cells[i].label,
      typeId: cells[i].typeId,
      detail: `overlaps with: ${overlapDescriptions.get(i)!.join(', ')}`,
    }));

    const deficiencyCheck: VerificationCheckResult = { passed: deficiencyFailures.length === 0, failures: deficiencyFailures };
    const aspectRatioCheck: VerificationCheckResult = { passed: aspectFailures.length === 0, failures: aspectFailures };
    const accessCheck: VerificationCheckResult = { passed: accessFailures.length === 0, failures: accessFailures };
    const adjacencyCheck: VerificationCheckResult = { passed: adjacencyFailures.length === 0, failures: adjacencyFailures };
    const garageFrontageCheck: VerificationCheckResult = { passed: garageFrontageFailures.length === 0, failures: garageFrontageFailures };
    const foyerFrontageCheck: VerificationCheckResult = { passed: foyerFrontageFailures.length === 0, failures: foyerFrontageFailures };
    const sliverCheck: VerificationCheckResult = { passed: sliverFailures.length === 0, failures: sliverFailures };
    const overlapCheck: VerificationCheckResult = { passed: overlapFailures.length === 0, failures: overlapFailures };

    const cullReasons: string[] = [];
    if (!deficiencyCheck.passed) cullReasons.push(`deficiency: ${deficiencyFailures.map((f) => `${f.label} (${f.detail})`).join(', ')}`);
    if (!aspectRatioCheck.passed) cullReasons.push(`aspect ratio: ${aspectFailures.map((f) => `${f.label} (${f.detail})`).join(', ')}`);
    if (!accessCheck.passed) cullReasons.push(`access: ${accessFailures.map((f) => f.label).join(', ')}`);
    if (!adjacencyCheck.passed) cullReasons.push(`critical touch: ${adjacencyFailures.map((f) => f.label).join(', ')}`);
    if (!garageFrontageCheck.passed) cullReasons.push(`garage frontage: blocked from street boundary`);
    if (!foyerFrontageCheck.passed) cullReasons.push(`foyer frontage: foyer does not touch the front boundary`);
    if (!sliverCheck.passed) cullReasons.push(`slivers: ${sliverFailures.map((f) => `${f.label} (${f.detail})`).join(', ')}`);
    if (!overlapCheck.passed) cullReasons.push(`overlaps: ${overlapFailures.map((f) => f.label).join(', ')}`);

    const accepted = cullReasons.length === 0;

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells,
        accepted,
        deficiencyCheck,
        aspectRatioCheck,
        accessCheck,
        adjacencyCheck,
        garageFrontageCheck,
        foyerFrontageCheck,
        sliverCheck,
        overlapCheck,
        cullReasons,
      },
      changed: true,
      metrics: {
        inputCellCount: cells.length,
        accepted,
        deficiencyFailureCount: deficiencyFailures.length,
        aspectFailureCount: aspectFailures.length,
        accessFailureCount: accessFailures.length,
        adjacencyFailureCount: adjacencyFailures.length,
        garageFrontageFailureCount: garageFrontageFailures.length,
        foyerFrontageFailureCount: foyerFrontageFailures.length,
        sliverFailureCount: sliverFailures.length,
        overlapFailureCount: overlapFailures.length,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: accepted ? 'info' : 'warn',
          message: accepted
            ? `Verification passed — ${cells.length} cells for ${request.artifact.layoutId}.`
            : `Verification failed — ${cullReasons.length} issue(s): ${cullReasons.join('; ')}`,
        },
      ],
    };
  }

  private worldAspectRatio(points: readonly GeometryPoint[]): number {
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const w = maxX - minX;
    const h = maxY - minY;
    if (Math.min(w, h) < 1e-6) return 1;
    return Math.max(w, h) / Math.min(w, h);
  }

  private buildAdjacencyGraph(
    cells: readonly { worldPoints: readonly GeometryPoint[]; pkg: boolean }[],
    eps: number,
  ): Map<number, number[]> {
    const adj = new Map<number, number[]>();
    for (let i = 0; i < cells.length; i++) adj.set(i, []);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].pkg) continue;
      for (let j = i + 1; j < cells.length; j++) {
        if (cells[j].pkg) continue;
        if (this.sharesEdge(cells[i].worldPoints, cells[j].worldPoints, eps)) {
          adj.get(i)!.push(j);
          adj.get(j)!.push(i);
        }
      }
    }
    return adj;
  }

  // Detects shared boundary between two polygons by checking for collinear overlapping edge
  // segments. The original exact-reverse-vertex check missed partial edge sharing (different-sized
  // cells sharing only part of a boundary edge), which caused the adjacency graph to drop valid
  // connections and fail the access BFS check on rooms that visually touch.
  private sharesEdge(
    a: readonly GeometryPoint[],
    b: readonly GeometryPoint[],
    eps: number,
  ): boolean {
    for (let i = 0; i < a.length; i++) {
      const a0 = a[i]; const a1 = a[(i + 1) % a.length];
      const dx = a1.x - a0.x; const dy = a1.y - a0.y;
      const lenA = Math.hypot(dx, dy);
      if (lenA < eps) continue;
      const ux = dx / lenA; const uy = dy / lenA;
      const nx = -uy; const ny = ux;
      for (let j = 0; j < b.length; j++) {
        const b0 = b[j]; const b1 = b[(j + 1) % b.length];
        // Both endpoints of b's edge must lie on the same line as a's edge.
        if (Math.abs((b0.x - a0.x) * nx + (b0.y - a0.y) * ny) > eps) continue;
        if (Math.abs((b1.x - a0.x) * nx + (b1.y - a0.y) * ny) > eps) continue;
        // Their 1D projections onto a's axis must overlap by more than eps.
        const tb0 = (b0.x - a0.x) * ux + (b0.y - a0.y) * uy;
        const tb1 = (b1.x - a0.x) * ux + (b1.y - a0.y) * uy;
        const bLo = Math.min(tb0, tb1); const bHi = Math.max(tb0, tb1);
        if (Math.min(lenA, bHi) - Math.max(0, bLo) > eps) return true;
      }
    }
    return false;
  }

  private minDimension(points: readonly GeometryPoint[]): number {
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    return Math.min(maxX - minX, maxY - minY);
  }

  private polygonsOverlap(a: readonly GeometryPoint[], b: readonly GeometryPoint[]): boolean {
    const aMinX = Math.min(...a.map((p) => p.x)); const aMaxX = Math.max(...a.map((p) => p.x));
    const aMinY = Math.min(...a.map((p) => p.y)); const aMaxY = Math.max(...a.map((p) => p.y));
    const bMinX = Math.min(...b.map((p) => p.x)); const bMaxX = Math.max(...b.map((p) => p.x));
    const bMinY = Math.min(...b.map((p) => p.y)); const bMaxY = Math.max(...b.map((p) => p.y));
    if (aMaxX <= bMinX || bMaxX <= aMinX || aMaxY <= bMinY || bMaxY <= aMinY) return false;
    for (let i = 0; i < a.length; i++) {
      const a0 = a[i]; const a1 = a[(i + 1) % a.length];
      for (let j = 0; j < b.length; j++) {
        const b0 = b[j]; const b1 = b[(j + 1) % b.length];
        if (this.segmentsCross(a0, a1, b0, b1)) return true;
      }
    }
    return false;
  }

  private segmentsCross(p1: GeometryPoint, p2: GeometryPoint, p3: GeometryPoint, p4: GeometryPoint): boolean {
    const cross = (o: GeometryPoint, a: GeometryPoint, b: GeometryPoint) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const d1 = cross(p3, p4, p1); const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3); const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
        && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

}
