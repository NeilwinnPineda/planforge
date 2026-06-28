import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { LayoutExplorationCaptureArtifact } from '../simulation/models/simulation-runner.model';
import type { SimulationBubbleState } from '../simulation/models/simulation-runner.model';
import type { ProvisionalCellLayoutArtifact, ProvisionalLayoutCell } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepDefinition, LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface ProvisionalCellGenerationArguments {
  readonly buildablePoints: readonly GeometryPoint[];
  readonly snapToAxis: boolean;
  readonly looseBisector: boolean;
  readonly fillerWeightScale: number;
  readonly hallwayWeightScale: number;
}

export interface ProvisionalCellGenerationMetrics {
  readonly placedBubbleCount: number;
  readonly generatedCellCount: number;
  readonly droppedDegenerateCellCount: number;
}

interface WeightedCaptureSite {
  readonly bubble: SimulationBubbleState;
  readonly targetSquareMeters: number;
  readonly weight: number;
}

@Injectable({ providedIn: 'root' })
export class ProvisionalCellGenerationService implements LayoutProcessingStepDefinition<
  LayoutExplorationCaptureArtifact,
  ProvisionalCellGenerationArguments,
  ProvisionalCellGenerationMetrics
> {
  readonly stepId = 'processing.provisional_cells';
  readonly stepLabel = 'Provisional constrained cells';
  readonly stageCategory = 'generation' as const;
  private readonly polygonEpsilon = 0.000001;

  // Slice number: next seam after Slice 7.
  // Stage category: generation within downstream layout processing.
  // Step id: processing.provisional_cells.
  // Purpose: convert one captured layout exploration artifact into provisional constrained cells inside the buildable polygon.
  // Inputs: captured layout bubble artifact and explicit bisector-generation arguments including buildable polygon and weighting scales.
  // Outputs: one provisional cell artifact with canonical world-space polygons and generation metrics.
  // Allowed dependencies: captured layout artifact, explicit processing arguments, and local deterministic geometry helpers only.
  // Forbidden responsibilities: mass balance, hallway injection, edge stepping, gap absorption, simplification, verification, and view projection.
  execute(
    request: LayoutProcessingStepRequest<LayoutExplorationCaptureArtifact, ProvisionalCellGenerationArguments>,
  ): LayoutProcessingStepResult<LayoutExplorationCaptureArtifact, ProvisionalCellGenerationMetrics> {
    const polygon = request.arguments.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
    const sites = this.buildWeightedSites(request.artifact, request.arguments);
    let droppedDegenerateCellCount = 0;

    const cells = sites.flatMap((site, siteIndex) => {
      let cell = [...polygon];

      sites.forEach((otherSite, otherIndex) => {
        if (siteIndex === otherIndex || cell.length < 3) {
          return;
        }

        cell = this.clipCellByBisector(
          cell,
          site.bubble.x,
          site.bubble.y,
          site.weight,
          otherSite.bubble.x,
          otherSite.bubble.y,
          otherSite.weight,
          request.arguments.snapToAxis,
          request.arguments.looseBisector,
        );
      });

      cell = this.removeDuplicatePolygonPoints(cell);
      if (cell.length < 3) {
        droppedDegenerateCellCount += 1;
        return [];
      }

      const areaSquareMeters = this.polygonArea(cell);
      if (areaSquareMeters <= this.polygonEpsilon) {
        droppedDegenerateCellCount += 1;
        return [];
      }

      return [this.buildProvisionalCell(site, cell, areaSquareMeters)];
    });

    return {
      artifact: request.artifact,
      changed: cells.length > 0,
      metrics: {
        placedBubbleCount: sites.length,
        generatedCellCount: cells.length,
        droppedDegenerateCellCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: 'info',
          message: `Generated ${cells.length} provisional cells from ${sites.length} placed bubbles for ${request.artifact.layoutId}.`,
        },
      ],
    };
  }

  run(
    request: LayoutProcessingStepRequest<LayoutExplorationCaptureArtifact, ProvisionalCellGenerationArguments>,
  ): LayoutProcessingStepResult<ProvisionalCellLayoutArtifact, ProvisionalCellGenerationMetrics> {
    const polygon = request.arguments.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
    const sites = this.buildWeightedSites(request.artifact, request.arguments);
    let droppedDegenerateCellCount = 0;

    // Block behavior:
    // Input: placed simulation bubbles plus the canonical buildable polygon.
    // Output: one constrained polygon per surviving site after weighted half-plane clipping.
    // Rule: this is the rebuild equivalent of the legacy constrained Voronoi seed pass, so every cell
    // starts as the full boundary polygon and is clipped by every competing site in turn.
    const cells = sites.flatMap((site, siteIndex) => {
      let cell = [...polygon];

      sites.forEach((otherSite, otherIndex) => {
        if (siteIndex === otherIndex || cell.length < 3) {
          return;
        }

        cell = this.clipCellByBisector(
          cell,
          site.bubble.x,
          site.bubble.y,
          site.weight,
          otherSite.bubble.x,
          otherSite.bubble.y,
          otherSite.weight,
          request.arguments.snapToAxis,
          request.arguments.looseBisector,
        );
      });

      cell = this.removeDuplicatePolygonPoints(cell);
      if (cell.length < 3) {
        droppedDegenerateCellCount += 1;
        return [];
      }

      const areaSquareMeters = this.polygonArea(cell);
      if (areaSquareMeters <= this.polygonEpsilon) {
        droppedDegenerateCellCount += 1;
        return [];
      }

      return [this.buildProvisionalCell(site, cell, areaSquareMeters)];
    });

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.recordId,
        generatedAtIso: new Date().toISOString(),
        cells,
      },
      changed: cells.length > 0,
      metrics: {
        placedBubbleCount: sites.length,
        generatedCellCount: cells.length,
        droppedDegenerateCellCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: 'info',
          message: `Generated ${cells.length} provisional cells from ${sites.length} placed bubbles for ${request.artifact.layoutId}.`,
        },
      ],
    };
  }

  private buildWeightedSites(
    artifact: LayoutExplorationCaptureArtifact,
    argumentsBag: ProvisionalCellGenerationArguments,
  ): WeightedCaptureSite[] {
    // Block behavior:
    // Input: captured bubble artifact and weighting scales for filler and hallway bubbles.
    // Output: deterministic weighted sites carrying target area and initial mass for clipping.
    return artifact.bubbles
      .filter((bubble) => bubble.placed)
      .map((bubble) => {
        const targetSquareMeters = Math.PI * bubble.radiusMeters * bubble.radiusMeters;
        const weightScale = bubble.pkg
          ? argumentsBag.fillerWeightScale
          : bubble.hallway
            ? argumentsBag.hallwayWeightScale
            : 1;

        return {
          bubble,
          targetSquareMeters,
          weight: bubble.radiusMeters * bubble.radiusMeters * weightScale,
        };
      });
  }

  private buildProvisionalCell(
    site: WeightedCaptureSite,
    cell: readonly GeometryPoint[],
    areaSquareMeters: number,
  ): ProvisionalLayoutCell {
    return {
      id: site.bubble.instanceId,
      typeId: site.bubble.typeId,
      label: site.bubble.label,
      color: site.bubble.color,
      tags: [...site.bubble.tags],
      pkg: site.bubble.pkg,
      hallway: site.bubble.hallway,
      worldPoints: cell.map((point) => ({ x: point.x, y: point.y })),
      areaSquareMeters,
      targetSquareMeters: site.targetSquareMeters,
      areaDelta: site.targetSquareMeters > this.polygonEpsilon
        ? (areaSquareMeters - site.targetSquareMeters) / site.targetSquareMeters
        : 0,
      mass: site.weight,
    };
  }

  private clipCellByBisector(
    poly: readonly GeometryPoint[],
    ax: number,
    ay: number,
    weightA: number,
    bx: number,
    by: number,
    weightB: number,
    snapToAxis: boolean,
    loose: boolean,
  ): GeometryPoint[] {
    // Block behavior:
    // Input: current owner polygon plus one competing site pair.
    // Output: the owner polygon clipped to the half-plane that still belongs to site A.
    // Rule: this intentionally mirrors the legacy weighted bisector implementation, including the
    // loose/tight t-range clamp and optional axis snap used by constrained Voronoi stages.
    if (poly.length < 3) {
      return [...poly];
    }

    const dx = bx - ax;
    const dy = by - ay;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < 1e-10) {
      return [...poly];
    }

    const tMin = loose ? 0.15 : 0.3;
    const tMax = loose ? 0.85 : 0.7;
    const t = Math.max(tMin, Math.min(tMax, 0.5 + (weightA - weightB) / (2 * distanceSquared)));
    const midpointX = ax + t * dx;
    const midpointY = ay + t * dy;

    let lineNormalX = dx;
    let lineNormalY = dy;

    if (snapToAxis) {
      const lineAngle = ((Math.atan2(dy, dx) - Math.PI / 2) % Math.PI + Math.PI) % Math.PI;
      const snappedLineAngle = lineAngle <= Math.PI / 4 || lineAngle >= Math.PI * 3 / 4 ? 0 : Math.PI / 2;
      const snappedNormalAngle = snappedLineAngle + Math.PI / 2;
      lineNormalX = Math.cos(snappedNormalAngle);
      lineNormalY = Math.sin(snappedNormalAngle);
    }

    let threshold = lineNormalX * midpointX + lineNormalY * midpointY;
    if (lineNormalX * ax + lineNormalY * ay > threshold) {
      lineNormalX = -lineNormalX;
      lineNormalY = -lineNormalY;
      threshold = -threshold;
    }

    const inside = (point: GeometryPoint) => lineNormalX * point.x + lineNormalY * point.y - threshold <= 0;
    const intersect = (start: GeometryPoint, end: GeometryPoint): GeometryPoint => {
      const edgeDx = end.x - start.x;
      const edgeDy = end.y - start.y;
      const denominator = lineNormalX * edgeDx + lineNormalY * edgeDy;
      if (Math.abs(denominator) < 1e-10) {
        return { x: start.x, y: start.y };
      }

      const tIntersection = (threshold - lineNormalX * start.x - lineNormalY * start.y) / denominator;
      return {
        x: start.x + tIntersection * edgeDx,
        y: start.y + tIntersection * edgeDy,
      };
    };

    const output: GeometryPoint[] = [];
    for (let index = 0; index < poly.length; index += 1) {
      const current = poly[index];
      const next = poly[(index + 1) % poly.length];
      const currentInside = inside(current);
      const nextInside = inside(next);

      if (currentInside) {
        output.push(current);
      }

      if (currentInside !== nextInside) {
        output.push(intersect(current, next));
      }
    }

    return output;
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

  private removeDuplicatePolygonPoints(points: readonly GeometryPoint[]): GeometryPoint[] {
    const deduped = points.filter((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length];
      return Math.hypot(point.x - previous.x, point.y - previous.y) > this.polygonEpsilon;
    });

    if (deduped.length > 2) {
      const first = deduped[0];
      const last = deduped[deduped.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) <= this.polygonEpsilon) {
        deduped.pop();
      }
    }

    return deduped;
  }
}
