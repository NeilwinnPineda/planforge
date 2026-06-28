import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { RoomTag } from '../source/source.exports';
import type { MassBalancedLayoutArtifact, ProvisionalLayoutCell, WarpedDiagnosticLayoutArtifact } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface MassBalanceRenegotiationArguments {
  readonly buildablePoints: readonly GeometryPoint[];
  readonly rebalanceIterations: number;
  readonly rebalanceGain: number;
  readonly stableDeviation: number;
  readonly stableRunsRequired: number;
  readonly roomDriftGain: number;
  readonly hallwayDriftGain: number;
}

export interface MassBalanceRenegotiationMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly iterationCount: number;
  readonly stableRunCount: number;
  readonly finalMaxDeviation: number;
}

interface MassBalanceSite {
  id: string;
  typeId: string;
  label: string;
  color: string;
  tags: readonly RoomTag[];
  pkg: boolean;
  hallway: boolean;
  x: number;
  y: number;
  targetSquareMeters: number;
  weight: number;
}

@Injectable({ providedIn: 'root' })
export class MassBalanceRenegotiationService {
  readonly stepId = 'processing.mass_balance';
  readonly stepLabel = 'Mass balance renegotiation';
  readonly stageCategory = 'refinement' as const;
  private readonly polygonEpsilon = 0.000001;

  // Slice number: next seam after Slice 8B.
  // Stage category: refinement within downstream layout processing.
  // Step id: processing.mass_balance.
  // Purpose: renegotiate already-generated cells toward their target areas after warped orthogonalization and before later cleanup passes.
  // Inputs: warped orthogonalized cell artifact and explicit mass-balance iteration arguments including the buildable polygon.
  // Outputs: mass-balanced cell artifact with updated weights, polygons, metrics, and traces.
  // Allowed dependencies: warped orthogonalized cells, explicit arguments, and local deterministic geometry helpers only.
  // Forbidden responsibilities: hallway seeding, warped orthogonalization, edge stepping, gap absorption, fringe exchange, simplification, verification, and page projection.
  run(
    request: LayoutProcessingStepRequest<WarpedDiagnosticLayoutArtifact, MassBalanceRenegotiationArguments>,
  ): LayoutProcessingStepResult<MassBalancedLayoutArtifact, MassBalanceRenegotiationMetrics> {
    const polygon = request.arguments.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
    const sites = request.artifact.cells.map((cell) => this.buildSiteFromCell(cell));
    const adjustableSites = sites.filter((site) => !site.pkg);
    const initialTotalWeight = adjustableSites.reduce((total, site) => total + Math.max(site.weight, 0.01), 0);

    // Block behavior:
    // Input: warped orthogonalized cells converted to weighted site centroids.
    // Output: a recomputed constrained partition that is repeatedly renegotiated toward target area.
    // Rule: this stays a full repartition step, not a local patch operation, so every iteration
    // rebuilds the whole ownership map from the current site masses.
    const computeCells = () => sites.map((site, siteIndex) => {
      let cell = [...polygon];
      sites.forEach((otherSite, otherIndex) => {
        if (siteIndex === otherIndex || cell.length < 3) {
          return;
        }

        cell = this.clipCellByBisector(
          cell,
          site.x,
          site.y,
          site.weight,
          otherSite.x,
          otherSite.y,
          otherSite.weight,
          true,
          true,
        );
      });

      return { site, cell: this.removeDuplicatePolygonPoints(cell) };
    }).filter(({ cell }) => cell.length >= 3);

    let stableRuns = 0;
    let iterationCount = 0;
    let finalMaxDeviation = 0;

    for (let iteration = 0; iteration < request.arguments.rebalanceIterations; iteration += 1) {
      // Block behavior:
      // Input: current site masses and centroid positions.
      // Output: updated masses and centroid drift that reduce target-area error for the next pass.
      iterationCount = iteration + 1;
      const cells = computeCells();
      const cellById = new Map(cells.map(({ site, cell }) => [site.id, cell]));
      let maxDeviation = 0;

      adjustableSites.forEach((site) => {
        const cell = cellById.get(site.id);
        if (!cell || site.targetSquareMeters <= this.polygonEpsilon) {
          return;
        }

        const actualArea = Math.max(0.05, this.polygonArea(cell));
        const ratio = site.targetSquareMeters / actualArea;
        maxDeviation = Math.max(maxDeviation, Math.abs(ratio - 1));
        site.weight = Math.max(0.01, site.weight * (1 + request.arguments.rebalanceGain * (ratio - 1)));

        const centroid = this.polygonCenter(cell);
        const driftGain = site.hallway ? request.arguments.hallwayDriftGain : request.arguments.roomDriftGain;
        site.x += (centroid.x - site.x) * driftGain;
        site.y += (centroid.y - site.y) * driftGain;
      });

      const currentTotalWeight = adjustableSites.reduce((total, site) => total + site.weight, 0);
      if (currentTotalWeight > 0 && initialTotalWeight > 0) {
        const normalization = initialTotalWeight / currentTotalWeight;
        adjustableSites.forEach((site) => {
          site.weight = Math.max(0.01, site.weight * normalization);
        });
      }

      stableRuns = maxDeviation < request.arguments.stableDeviation ? stableRuns + 1 : 0;
      finalMaxDeviation = maxDeviation;
      if (stableRuns >= request.arguments.stableRunsRequired) {
        break;
      }
    }

    const cells = computeCells().flatMap(({ site, cell }) => {
      const areaSquareMeters = this.polygonArea(cell);
      if (areaSquareMeters <= this.polygonEpsilon) {
        return [];
      }

      return [this.buildCell(site, cell, areaSquareMeters)];
    });

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells,
      },
      changed: cells.length > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        outputCellCount: cells.length,
        iterationCount,
        stableRunCount: stableRuns,
        finalMaxDeviation,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: 'info',
          message: `Mass-balanced ${cells.length} cells for ${request.artifact.layoutId} across ${iterationCount} iterations.`,
        },
      ],
    };
  }

  private buildSiteFromCell(cell: ProvisionalLayoutCell): MassBalanceSite {
    // Block behavior:
    // Input: one warped orthogonalized cell.
    // Output: one renegotiation site centered on that cell with its carried target area and mass.
    const centroid = this.polygonCenter(cell.worldPoints);
    return {
      id: cell.id,
      typeId: cell.typeId,
      label: cell.label,
      color: cell.color,
      tags: [...cell.tags],
      pkg: cell.pkg,
      hallway: cell.hallway,
      x: centroid.x,
      y: centroid.y,
      targetSquareMeters: cell.targetSquareMeters,
      weight: Math.max(0.01, cell.mass),
    };
  }

  private buildCell(site: MassBalanceSite, cell: readonly GeometryPoint[], areaSquareMeters: number): ProvisionalLayoutCell {
    return {
      id: site.id,
      typeId: site.typeId,
      label: site.label,
      color: site.color,
      tags: [...site.tags],
      pkg: site.pkg,
      hallway: site.hallway,
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
    // Input: current owner polygon plus one competing mass-balance site pair.
    // Output: a clipped owner polygon using the same legacy half-plane ownership rule.
    // Rule: mass balance uses snapped-axis loose clipping so area pressure can move territory
    // without immediately starving lighter neighbors.
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

  private polygonCenter(points: readonly GeometryPoint[]): GeometryPoint {
    const count = Math.max(1, points.length);
    return {
      x: points.reduce((total, point) => total + point.x, 0) / count,
      y: points.reduce((total, point) => total + point.y, 0) / count,
    };
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
