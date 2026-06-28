import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { EdgeSteppedLayoutArtifact, MassBalancedLayoutArtifact, ProvisionalLayoutCell } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface BoundaryEdgeSteppingArguments {
  readonly buildablePoints: readonly GeometryPoint[];
  readonly edgeEpsilon: number;
  readonly boundaryMatchEpsilon: number;
  readonly maxStepsPerExteriorEdge: number;
}

export interface BoundaryEdgeSteppingMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly steppedCellCount: number;
  readonly steppedEdgeCount: number;
}

@Injectable({ providedIn: 'root' })
export class BoundaryEdgeSteppingService {
  readonly stepId = 'processing.edge_stepping';
  readonly stepLabel = 'Boundary edge stepping';
  readonly stageCategory = 'refinement' as const;

  // Slice number: next seam after Slice 8C.
  // Stage category: refinement within downstream layout processing.
  // Step id: processing.edge_stepping.
  // Purpose: convert sloped exterior boundary-following edges into orthogonal stepped edges after mass balance.
  // Inputs: mass-balanced cell artifact and explicit boundary-step arguments including the canonical buildable polygon.
  // Outputs: edge-stepped cell artifact with per-step metrics and traces.
  // Allowed dependencies: mass-balanced cells, explicit arguments, and local deterministic boundary helpers only.
  // Forbidden responsibilities: mass rebalance, gap absorption, fringe exchange, simplification, verification, and page projection.
  run(
    request: LayoutProcessingStepRequest<MassBalancedLayoutArtifact, BoundaryEdgeSteppingArguments>,
  ): LayoutProcessingStepResult<EdgeSteppedLayoutArtifact, BoundaryEdgeSteppingMetrics> {
    const boundaryPolygon = request.arguments.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
    let steppedCellCount = 0;
    let steppedEdgeCount = 0;

    // Block behavior:
    // Input: mass-balanced cells plus the canonical buildable boundary.
    // Output: the same cells with only eligible exterior sloped edges replaced by orthogonal steps.
    // Rule: this is a later cleanup/refinement seam and must not silently re-own mass balancing
    // or warped-grid repartition responsibilities.
    const cells = request.artifact.cells.map((cell) => {
      if (cell.pkg) {
        return cell;
      }

      const stepResult = this.orthogonalizeBoundaryEdges(cell.worldPoints, boundaryPolygon, request.arguments);
      if (!stepResult.changed) {
        return cell;
      }

      steppedCellCount += 1;
      steppedEdgeCount += stepResult.steppedEdgeCount;
      const areaSquareMeters = this.polygonArea(stepResult.points);

      return {
        ...cell,
        worldPoints: stepResult.points.map((point) => ({ x: point.x, y: point.y })),
        areaSquareMeters,
        areaDelta: cell.targetSquareMeters > request.arguments.edgeEpsilon
          ? (areaSquareMeters - cell.targetSquareMeters) / cell.targetSquareMeters
          : 0,
      };
    });

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells,
      },
      changed: steppedEdgeCount > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        outputCellCount: cells.length,
        steppedCellCount,
        steppedEdgeCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: 'info',
          message: `Orthogonally stepped ${steppedEdgeCount} exterior edges across ${steppedCellCount} cells for ${request.artifact.layoutId}.`,
        },
      ],
    };
  }

  private orthogonalizeBoundaryEdges(
    polygon: readonly GeometryPoint[],
    boundaryPolygon: readonly GeometryPoint[],
    argumentsBag: BoundaryEdgeSteppingArguments,
  ): { points: GeometryPoint[]; changed: boolean; steppedEdgeCount: number } {
    // Block behavior:
    // Input: one polygon and the active buildable boundary.
    // Output: a deduplicated polygon where qualifying exterior segments are replaced by stepped runs.
    if (polygon.length < 3) {
      return { points: [...polygon], changed: false, steppedEdgeCount: 0 };
    }

    const output: GeometryPoint[] = [];
    let steppedEdgeCount = 0;

    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      if (!output.length) {
        output.push(current);
      }

      const replacement = this.shouldStepBoundaryEdge(current, next, boundaryPolygon, argumentsBag)
        ? this.createOrthogonalStepEdge(current, next, boundaryPolygon, argumentsBag)
        : [next];

      if (replacement.length > 1 || (replacement.length === 1 && (replacement[0].x !== next.x || replacement[0].y !== next.y))) {
        steppedEdgeCount += 1;
      }

      replacement.forEach((point) => output.push(point));
    }

    const deduped = this.removeDuplicatePolygonPoints(output, argumentsBag.edgeEpsilon);
    return {
      points: deduped,
      changed: steppedEdgeCount > 0,
      steppedEdgeCount,
    };
  }

  private shouldStepBoundaryEdge(
    startPoint: GeometryPoint,
    endPoint: GeometryPoint,
    boundaryPolygon: readonly GeometryPoint[],
    argumentsBag: BoundaryEdgeSteppingArguments,
  ): boolean {
    if (!this.isSlopedEdge(startPoint, endPoint, argumentsBag.edgeEpsilon)) {
      return false;
    }

    const samples = [
      startPoint,
      endPoint,
      { x: (startPoint.x + endPoint.x) / 2, y: (startPoint.y + endPoint.y) / 2 },
      { x: startPoint.x + (endPoint.x - startPoint.x) * 0.25, y: startPoint.y + (endPoint.y - startPoint.y) * 0.25 },
      { x: startPoint.x + (endPoint.x - startPoint.x) * 0.75, y: startPoint.y + (endPoint.y - startPoint.y) * 0.75 },
    ];

    return samples.some((point) =>
      this.isPointOnPolygonBoundary(point, boundaryPolygon, argumentsBag.boundaryMatchEpsilon),
    );
  }

  private isSlopedEdge(startPoint: GeometryPoint, endPoint: GeometryPoint, edgeEpsilon: number): boolean {
    const absDx = Math.abs(endPoint.x - startPoint.x);
    const absDy = Math.abs(endPoint.y - startPoint.y);
    return absDx > edgeEpsilon && absDy > edgeEpsilon;
  }

  private createOrthogonalStepEdge(
    startPoint: GeometryPoint,
    endPoint: GeometryPoint,
    boundaryPolygon: readonly GeometryPoint[],
    argumentsBag: BoundaryEdgeSteppingArguments,
  ): GeometryPoint[] {
    const output: GeometryPoint[] = [];
    let cursor = startPoint;

    for (let step = 1; step <= argumentsBag.maxStepsPerExteriorEdge; step += 1) {
      const next = {
        x: startPoint.x + (endPoint.x - startPoint.x) * (step / argumentsBag.maxStepsPerExteriorEdge),
        y: startPoint.y + (endPoint.y - startPoint.y) * (step / argumentsBag.maxStepsPerExteriorEdge),
      };
      const corner = this.pickInteriorStepCorner(cursor, next, boundaryPolygon, argumentsBag.boundaryMatchEpsilon);
      if (!corner) {
        return [endPoint];
      }

      output.push(corner, next);
      cursor = next;
    }

    return output;
  }

  private pickInteriorStepCorner(
    startPoint: GeometryPoint,
    endPoint: GeometryPoint,
    boundaryPolygon: readonly GeometryPoint[],
    boundaryMatchEpsilon: number,
  ): GeometryPoint | null {
    const center = this.polygonCenter(boundaryPolygon);
    const interiorSide = this.lineSide(startPoint, endPoint, center);
    const candidates = [
      { x: endPoint.x, y: startPoint.y },
      { x: startPoint.x, y: endPoint.y },
    ];
    const insideCandidates = candidates.filter((candidate) =>
      this.isSameLineSide(interiorSide, this.lineSide(startPoint, endPoint, candidate), boundaryMatchEpsilon)
      && this.isStepPathInside(startPoint, candidate, endPoint, boundaryPolygon),
    );

    if (insideCandidates.length) {
      return insideCandidates[0];
    }

    return candidates.find((candidate) => this.isStepPathInside(startPoint, candidate, endPoint, boundaryPolygon)) ?? null;
  }

  private isStepPathInside(
    startPoint: GeometryPoint,
    cornerPoint: GeometryPoint,
    endPoint: GeometryPoint,
    boundaryPolygon: readonly GeometryPoint[],
  ): boolean {
    return [
      cornerPoint,
      { x: (startPoint.x + cornerPoint.x) / 2, y: (startPoint.y + cornerPoint.y) / 2 },
      { x: (cornerPoint.x + endPoint.x) / 2, y: (cornerPoint.y + endPoint.y) / 2 },
    ].every((point) => this.isPointInsideOrOnPolygon(point, boundaryPolygon));
  }

  private lineSide(startPoint: GeometryPoint, endPoint: GeometryPoint, point: GeometryPoint): number {
    return (endPoint.x - startPoint.x) * (point.y - startPoint.y) - (endPoint.y - startPoint.y) * (point.x - startPoint.x);
  }

  private isSameLineSide(reference: number, candidate: number, boundaryMatchEpsilon: number): boolean {
    return Math.abs(candidate) <= boundaryMatchEpsilon || reference * candidate >= 0;
  }

  private isPointInsideOrOnPolygon(point: GeometryPoint, polygon: readonly GeometryPoint[]): boolean {
    return this.isPointOnPolygonBoundary(point, polygon, 0.000001) || this.pointInPolygon(point.x, point.y, polygon);
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
    return polygon.some((startPoint, index) =>
      this.isPointOnSegment(point, startPoint, polygon[(index + 1) % polygon.length], epsilon),
    );
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

  private polygonArea(points: readonly GeometryPoint[]): number {
    if (points.length < 3) {
      return 0;
    }

    let total = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      total += current.x * next.y - next.x * current.y;
    }

    return Math.abs(total) / 2;
  }

  private polygonCenter(points: readonly GeometryPoint[]): GeometryPoint {
    const count = Math.max(1, points.length);
    return {
      x: points.reduce((total, point) => total + point.x, 0) / count,
      y: points.reduce((total, point) => total + point.y, 0) / count,
    };
  }

  private removeDuplicatePolygonPoints(points: readonly GeometryPoint[], edgeEpsilon: number): GeometryPoint[] {
    const deduped = points.filter((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length];
      return Math.hypot(point.x - previous.x, point.y - previous.y) > edgeEpsilon;
    });

    if (deduped.length > 2) {
      const first = deduped[0];
      const last = deduped[deduped.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) <= edgeEpsilon) {
        deduped.pop();
      }
    }

    return deduped;
  }
}
