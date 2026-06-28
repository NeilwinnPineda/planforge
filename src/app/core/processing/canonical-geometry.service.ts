import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { FinalStagedLayoutArtifact, ProvisionalLayoutCell } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface CanonicalGeometryArguments {
  readonly vertexSnapGridMeters: number;
  readonly edgeSplitToleranceMeters: number;
  readonly minSegmentLengthMeters: number;
}

export interface CanonicalGeometryMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly canonicalVertexCount: number;
  readonly insertedVertexCount: number;
  readonly droppedDegenerateCellCount: number;
}

@Injectable({ providedIn: 'root' })
export class CanonicalGeometryService {
  readonly stepId = 'processing.canonical_geometry';
  readonly stepLabel = 'Canonical geometry';
  readonly stageCategory = 'refinement' as const;

  run(
    request: LayoutProcessingStepRequest<FinalStagedLayoutArtifact, CanonicalGeometryArguments>,
  ): LayoutProcessingStepResult<FinalStagedLayoutArtifact, CanonicalGeometryMetrics> {
    const { vertexSnapGridMeters, edgeSplitToleranceMeters, minSegmentLengthMeters } = request.arguments;
    const canonicalByKey = new Map<string, GeometryPoint>();
    const canonicalVertices: GeometryPoint[] = [];

    const canonicalize = (point: GeometryPoint): GeometryPoint => {
      const snapped = {
        x: this.snap(point.x, vertexSnapGridMeters),
        y: this.snap(point.y, vertexSnapGridMeters),
      };
      const key = this.pointKey(snapped);
      const existing = canonicalByKey.get(key);
      if (existing) return existing;
      canonicalByKey.set(key, snapped);
      canonicalVertices.push(snapped);
      return snapped;
    };

    const snappedCells = request.artifact.cells.map((cell) => ({
      cell,
      points: this.cleanLoop(cell.worldPoints.map(canonicalize), minSegmentLengthMeters),
    }));

    let insertedVertexCount = 0;
    let droppedDegenerateCellCount = 0;
    const outputCells: ProvisionalLayoutCell[] = [];

    for (const { cell, points } of snappedCells) {
      if (points.length < 3) {
        droppedDegenerateCellCount += 1;
        continue;
      }

      const rebuilt: GeometryPoint[] = [];
      for (let i = 0; i < points.length; i += 1) {
        const from = points[i];
        const to = points[(i + 1) % points.length];
        const splitPoints = this.splitEdgeByCanonicalVertices(
          from,
          to,
          canonicalVertices,
          edgeSplitToleranceMeters,
          minSegmentLengthMeters,
        );
        insertedVertexCount += Math.max(0, splitPoints.length - 2);
        for (const point of splitPoints.slice(0, -1)) {
          rebuilt.push(point);
        }
      }

      const worldPoints = this.cleanLoop(rebuilt, minSegmentLengthMeters);
      const areaSquareMeters = this.polygonArea(worldPoints);
      if (worldPoints.length < 3 || areaSquareMeters <= 1e-6) {
        droppedDegenerateCellCount += 1;
        continue;
      }

      outputCells.push({
        ...cell,
        tags: [...cell.tags],
        worldPoints,
        areaSquareMeters,
        areaDelta: cell.targetSquareMeters > 1e-6
          ? (areaSquareMeters - cell.targetSquareMeters) / cell.targetSquareMeters
          : 0,
      });
    }

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells: outputCells,
      },
      changed: insertedVertexCount > 0 || droppedDegenerateCellCount > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        outputCellCount: outputCells.length,
        canonicalVertexCount: canonicalVertices.length,
        insertedVertexCount,
        droppedDegenerateCellCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: droppedDegenerateCellCount > 0 ? 'warn' : 'info',
          message: droppedDegenerateCellCount > 0
            ? `Canonical geometry rebuilt ${outputCells.length} cells, inserted ${insertedVertexCount} shared vertices, and dropped ${droppedDegenerateCellCount} degenerate cell(s) for ${request.artifact.layoutId}.`
            : `Canonical geometry rebuilt ${outputCells.length} cells with ${canonicalVertices.length} shared vertices and ${insertedVertexCount} inserted edge split(s) for ${request.artifact.layoutId}.`,
        },
      ],
    };
  }

  private splitEdgeByCanonicalVertices(
    from: GeometryPoint,
    to: GeometryPoint,
    vertices: readonly GeometryPoint[],
    tolerance: number,
    minSegmentLength: number,
  ): GeometryPoint[] {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= minSegmentLength * minSegmentLength) return [from, to];

    const candidates = vertices
      .map((point) => ({
        point,
        t: ((point.x - from.x) * dx + (point.y - from.y) * dy) / lenSq,
      }))
      .filter(({ point, t }) => {
        if (t < -tolerance || t > 1 + tolerance) return false;
        const clampedT = Math.max(0, Math.min(1, t));
        const closest = { x: from.x + dx * clampedT, y: from.y + dy * clampedT };
        return Math.hypot(point.x - closest.x, point.y - closest.y) <= tolerance;
      })
      .map(({ point, t }) => ({ point, t: Math.max(0, Math.min(1, t)) }))
      .sort((left, right) => left.t - right.t);

    const split: GeometryPoint[] = [];
    for (const candidate of candidates) {
      const previous = split.at(-1);
      if (previous && this.samePoint(previous, candidate.point)) continue;
      if (previous && this.distance(previous, candidate.point) < minSegmentLength) continue;
      split.push(candidate.point);
    }

    if (!split.length || !this.samePoint(split[0], from)) split.unshift(from);
    if (!this.samePoint(split.at(-1)!, to)) split.push(to);
    return split;
  }

  private cleanLoop(points: readonly GeometryPoint[], minSegmentLength: number): GeometryPoint[] {
    const cleaned: GeometryPoint[] = [];
    for (const point of points) {
      const previous = cleaned.at(-1);
      if (previous && (this.samePoint(previous, point) || this.distance(previous, point) < minSegmentLength)) continue;
      cleaned.push(point);
    }
    if (cleaned.length > 1 && this.samePoint(cleaned[0], cleaned.at(-1)!)) cleaned.pop();
    return cleaned;
  }

  private polygonArea(points: readonly GeometryPoint[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  private snap(value: number, grid: number): number {
    return Math.round(value / grid) * grid;
  }

  private pointKey(point: GeometryPoint): string {
    return `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
  }

  private samePoint(a: GeometryPoint, b: GeometryPoint): boolean {
    return this.pointKey(a) === this.pointKey(b);
  }

  private distance(a: GeometryPoint, b: GeometryPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
