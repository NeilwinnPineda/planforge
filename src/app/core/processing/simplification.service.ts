import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { FringeExchangedLayoutArtifact, ProvisionalLayoutCell, SimplifiedLayoutArtifact } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface SimplificationArguments {
  readonly angleEpsilon: number;
  readonly distanceEpsilon: number;
}

export interface SimplificationMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly removedVertexCount: number;
  readonly simplifiedCellCount: number;
}

@Injectable({ providedIn: 'root' })
export class SimplificationService {
  readonly stepId = 'processing.simplification';
  readonly stepLabel = 'Simplification';
  readonly stageCategory = 'cleanup' as const;

  // Slice number: final-output continuation seam after fringe exchange.
  // Stage category: cleanup within downstream layout processing.
  // Step id: processing.simplification.
  // Purpose: remove obviously redundant vertices from downstream polygons so final staging receives
  // cleaner geometry without re-owning upstream repartition or transfer logic.
  // Inputs: fringe-exchange artifact and explicit simplification tolerances.
  // Outputs: simplified layout artifact, per-run metrics, and traces.
  // Allowed dependencies: fringe-exchange cells, explicit arguments, and local deterministic geometry helpers only.
  // Forbidden responsibilities: repartition, mass balancing, final staging, verification, and page projection.
  run(
    request: LayoutProcessingStepRequest<FringeExchangedLayoutArtifact, SimplificationArguments>,
  ): LayoutProcessingStepResult<SimplifiedLayoutArtifact, SimplificationMetrics> {
    let removedVertexCount = 0;
    let simplifiedCellCount = 0;

    const cells = request.artifact.cells.map((cell) => {
      const simplifiedPoints = this.simplifyPolygon(cell.worldPoints, request.arguments);
      removedVertexCount += Math.max(0, cell.worldPoints.length - simplifiedPoints.length);
      if (simplifiedPoints.length !== cell.worldPoints.length) {
        simplifiedCellCount += 1;
      }

      const areaSquareMeters = this.polygonArea(simplifiedPoints);
      return this.buildCell(cell, simplifiedPoints, areaSquareMeters);
    });

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells,
      },
      changed: simplifiedCellCount > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        outputCellCount: cells.length,
        removedVertexCount,
        simplifiedCellCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: 'info',
          message: `Simplified ${simplifiedCellCount} cells and removed ${removedVertexCount} redundant vertices for ${request.artifact.layoutId}.`,
        },
      ],
    };
  }

  private buildCell(cell: ProvisionalLayoutCell, points: readonly GeometryPoint[], areaSquareMeters: number): ProvisionalLayoutCell {
    return {
      ...cell,
      tags: [...cell.tags],
      worldPoints: points.map((point) => ({ x: point.x, y: point.y })),
      areaSquareMeters,
      areaDelta: cell.targetSquareMeters > 0.000001
        ? (areaSquareMeters - cell.targetSquareMeters) / cell.targetSquareMeters
        : 0,
    };
  }

  private simplifyPolygon(points: readonly GeometryPoint[], argumentsBag: SimplificationArguments): GeometryPoint[] {
    if (points.length < 4) {
      return points.map((point) => ({ x: point.x, y: point.y }));
    }

    const deduped = points.filter((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length];
      return Math.hypot(point.x - previous.x, point.y - previous.y) > argumentsBag.distanceEpsilon;
    });

    if (deduped.length < 4) {
      return deduped.map((point) => ({ x: point.x, y: point.y }));
    }

    const simplified = deduped.filter((point, index) => {
      const previous = deduped[(index - 1 + deduped.length) % deduped.length];
      const next = deduped[(index + 1) % deduped.length];
      return !this.isNearCollinear(previous, point, next, argumentsBag.angleEpsilon);
    });

    return (simplified.length >= 3 ? simplified : deduped).map((point) => ({ x: point.x, y: point.y }));
  }

  private isNearCollinear(previous: GeometryPoint, current: GeometryPoint, next: GeometryPoint, epsilon: number): boolean {
    const leftX = current.x - previous.x;
    const leftY = current.y - previous.y;
    const rightX = next.x - current.x;
    const rightY = next.y - current.y;
    const leftLength = Math.hypot(leftX, leftY);
    const rightLength = Math.hypot(rightX, rightY);
    if (leftLength <= epsilon || rightLength <= epsilon) {
      return true;
    }

    const cross = Math.abs(leftX * rightY - leftY * rightX) / (leftLength * rightLength);
    return cross <= epsilon;
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
}
