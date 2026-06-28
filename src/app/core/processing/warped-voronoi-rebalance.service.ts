import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { WarpedRebalancedSiteArtifact, WarpedSiteArtifact, WarpedUvSite } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface WarpedVoronoiRebalanceArguments {
  readonly rebalanceIterations: number;
  readonly rebalanceGain: number;
  readonly roomDriftGain: number;
  readonly hallwayDriftGain: number;
  readonly stableDeviation: number;
  readonly stableRunsRequired: number;
}

export interface WarpedVoronoiRebalanceMetrics {
  readonly inputSiteCount: number;
  readonly outputSiteCount: number;
  readonly iterationCount: number;
  readonly stableRunCount: number;
  readonly finalMaxDelta: number;
}

@Injectable({ providedIn: 'root' })
export class WarpedVoronoiRebalanceService {
  readonly stepId = 'processing.warped_voronoi_rebalance';
  readonly stepLabel = 'Warped Voronoi rebalance';
  readonly stageCategory = 'warped-grid' as const;

  // Slice number: 9B — second step of the real verification-feeding warped pipeline.
  // Stage category: warped-grid rebalance.
  // Step id: processing.warped_voronoi_rebalance.
  // Purpose: run UV-space Voronoi iteratively while adjusting site weights and drifting
  // centroids under neighbor deficit pressure until area targets converge or the
  // iteration budget is exhausted.
  // Inputs: WarpedSiteArtifact (UV sites + quad) and explicit rebalance arguments.
  // Outputs: WarpedRebalancedSiteArtifact with converged UV site weights and positions.
  // Allowed dependencies: WarpedSiteArtifact and local deterministic UV geometry helpers only.
  // Forbidden responsibilities: UV boxing, world projection, edge negotiation, residual
  //   absorption, and final staging.
  // Legacy source: rebalanceWarpedSites in testing/app/src/app/app.ts (line 6244).
  run(
    request: LayoutProcessingStepRequest<WarpedSiteArtifact, WarpedVoronoiRebalanceArguments>,
  ): LayoutProcessingStepResult<WarpedRebalancedSiteArtifact, WarpedVoronoiRebalanceMetrics> {
    const quad = request.artifact.quadPoints.map((p) => ({ x: p.x, y: p.y }));
    const inputSites = request.artifact.sites;

    if (!inputSites.length || quad.length !== 4) {
      return {
        artifact: {
          layoutId: request.artifact.layoutId,
          sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
          generatedAtIso: new Date().toISOString(),
          sites: [],
          quadPoints: quad,
        },
        changed: false,
        metrics: {
          inputSiteCount: inputSites.length,
          outputSiteCount: 0,
          iterationCount: 0,
          stableRunCount: 0,
          finalMaxDelta: 0,
        },
        traces: [
          {
            stepId: this.stepId,
            severity: 'warn',
            message: `Warped Voronoi rebalance skipped for ${request.artifact.layoutId}; no UV sites or invalid quad.`,
          },
        ],
      };
    }

    const args = request.arguments;
    const NEIGHBOR_TOUCH_EPSILON = 0.02;
    const ROOM_NEIGHBOR_YIELD_FACTOR = 0.4;
    const HALLWAY_NEIGHBOR_YIELD_FACTOR = 0.85;
    const SURPLUS_TO_DEFICIENT_BOOST = 0.2;

    const adjustedSites = inputSites.map((site) => ({ ...site }));
    const adjustableSites = adjustedSites.filter((site) => !site.pkg);
    const initialTotalWeight = adjustableSites.reduce((sum, site) => sum + Math.max(site.weight, 1e-6), 0);

    let stableRuns = 0;
    let iterationCount = 0;
    let finalMaxDelta = 0;

    for (let iter = 0; iter < args.rebalanceIterations; iter += 1) {
      iterationCount += 1;
      const cells = this.buildUVVoronoiCells(quad, adjustedSites);
      const cellById = new Map(cells.map((cell) => [cell.id, cell]));
      const shortageSqmById = new Map<string, number>();
      const shortageRatioById = new Map<string, number>();
      const adjacency = new Map<string, string[]>();

      const adjustableCells = cells.filter((cell) => {
        const site = adjustedSites.find((s) => s.id === cell.id);
        return site && !site.pkg;
      });

      for (let i = 0; i < adjustableCells.length; i += 1) {
        for (let j = i + 1; j < adjustableCells.length; j += 1) {
          if (!this.polygonsTouch(adjustableCells[i].worldPoints, adjustableCells[j].worldPoints, NEIGHBOR_TOUCH_EPSILON)) {
            continue;
          }
          const a = adjustableCells[i].id;
          const b = adjustableCells[j].id;
          if (!adjacency.has(a)) adjacency.set(a, []);
          if (!adjacency.has(b)) adjacency.set(b, []);
          adjacency.get(a)!.push(b);
          adjacency.get(b)!.push(a);
        }
      }

      for (const site of adjustableSites) {
        const cell = cellById.get(site.id);
        if (!cell || cell.areaSquareMeters <= 1e-6 || site.targetSquareMeters <= 1e-6) {
          continue;
        }
        const shortageSqm = site.targetSquareMeters - cell.areaSquareMeters;
        shortageSqmById.set(site.id, shortageSqm);
        shortageRatioById.set(site.id, shortageSqm / Math.max(site.targetSquareMeters, 1));
      }

      let maxDelta = 0;

      for (const site of adjustableSites) {
        const cell = cellById.get(site.id);
        if (!cell || cell.areaSquareMeters <= 1e-6 || site.targetSquareMeters <= 1e-6) {
          continue;
        }

        const shortageSqm = shortageSqmById.get(site.id) ?? 0;
        const neighborIds = adjacency.get(site.id) ?? [];
        const positiveNeighborNeedSqm = neighborIds.length
          ? neighborIds.reduce((sum, nid) => sum + Math.max(0, shortageSqmById.get(nid) ?? 0), 0) / neighborIds.length
          : 0;
        const neighborSurplusSqm = neighborIds.length
          ? neighborIds.reduce((sum, nid) => sum + Math.max(0, -(shortageSqmById.get(nid) ?? 0)), 0) / neighborIds.length
          : 0;

        let effectiveShortageSqm = shortageSqm;
        if (shortageSqm < 0 && positiveNeighborNeedSqm > 0) {
          const yieldFactor = site.hallway ? HALLWAY_NEIGHBOR_YIELD_FACTOR : ROOM_NEIGHBOR_YIELD_FACTOR;
          effectiveShortageSqm -= positiveNeighborNeedSqm * yieldFactor;
        } else if (shortageSqm > 0 && neighborSurplusSqm > 0) {
          effectiveShortageSqm += neighborSurplusSqm * SURPLUS_TO_DEFICIENT_BOOST;
        }

        const pressureSignal = Math.max(-1, Math.min(1, effectiveShortageSqm / Math.max(site.targetSquareMeters, 1)));
        maxDelta = Math.max(maxDelta, Math.abs(pressureSignal));

        const idx = adjustedSites.findIndex((s) => s.id === site.id);
        if (idx < 0) continue;

        adjustedSites[idx] = {
          ...adjustedSites[idx],
          weight: Math.max(0.01, adjustedSites[idx].weight * (1 + args.rebalanceGain * pressureSignal)),
        };

        const centroid = cell.centroid;
        const centroidUv = this.inverseWarpedGrid(centroid, quad);
        const baseDriftGain = site.hallway ? args.hallwayDriftGain : args.roomDriftGain;
        const shortageRatio = Math.max(0, shortageRatioById.get(site.id) ?? 0);
        const compliance = Math.max(0.2, 1 - Math.min(1, shortageRatio));
        const driftGain = baseDriftGain * compliance;
        const newU = Math.max(0, Math.min(1, adjustedSites[idx].u + (centroidUv.u - adjustedSites[idx].u) * driftGain));
        const newV = Math.max(0, Math.min(1, adjustedSites[idx].v + (centroidUv.v - adjustedSites[idx].v) * driftGain));
        adjustedSites[idx] = { ...adjustedSites[idx], u: newU, v: newV };
      }

      const currentTotalWeight = adjustableSites.reduce((sum, site) => {
        const idx = adjustedSites.findIndex((s) => s.id === site.id);
        return sum + (idx >= 0 ? adjustedSites[idx].weight : site.weight);
      }, 0);

      if (currentTotalWeight > 1e-6 && initialTotalWeight > 1e-6) {
        const normalizeScale = initialTotalWeight / currentTotalWeight;
        for (let i = 0; i < adjustedSites.length; i += 1) {
          if (!adjustedSites[i].pkg) {
            adjustedSites[i] = { ...adjustedSites[i], weight: adjustedSites[i].weight * normalizeScale };
          }
        }
      }

      finalMaxDelta = maxDelta;
      stableRuns = maxDelta < args.stableDeviation ? stableRuns + 1 : 0;
      if (stableRuns >= args.stableRunsRequired) {
        break;
      }
    }

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        sites: adjustedSites,
        quadPoints: quad,
      },
      changed: true,
      metrics: {
        inputSiteCount: inputSites.length,
        outputSiteCount: adjustedSites.length,
        iterationCount,
        stableRunCount: stableRuns,
        finalMaxDelta,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: finalMaxDelta < args.stableDeviation ? 'info' : 'warn',
          message: finalMaxDelta < args.stableDeviation
            ? `Warped Voronoi rebalance converged in ${iterationCount} iterations for ${request.artifact.layoutId}.`
            : `Warped Voronoi rebalance ran ${iterationCount} iterations without full convergence for ${request.artifact.layoutId}; final max delta ${finalMaxDelta.toFixed(4)}.`,
        },
      ],
    };
  }

  // Runs power Voronoi clipping in UV space and back-projects to world for area measurement.
  // Source: buildUVVoronoiCells in testing/app/src/app/app.ts (line 5208).
  private buildUVVoronoiCells(
    quad: readonly { x: number; y: number }[],
    sites: readonly WarpedUvSite[],
  ): Array<{ id: string; worldPoints: GeometryPoint[]; areaSquareMeters: number; centroid: GeometryPoint }> {
    const uvClip = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const uvWeights = this.scaleSitesToUvPowerWeights(sites);

    return sites.flatMap((site, i) => {
      let cell = [...uvClip];
      for (let j = 0; j < sites.length; j += 1) {
        if (i === j || cell.length < 3) continue;
        cell = this.clipCellByBisector(cell, site.u, site.v, uvWeights[i], sites[j].u, sites[j].v, uvWeights[j]);
      }

      if (cell.length < 3) return [];

      const worldPoints = cell.map((p) => this.bilinearQuadPoint(quad, p.x, p.y));
      const areaSquareMeters = this.polygonArea(worldPoints);
      const n = worldPoints.length;
      const centroid = {
        x: worldPoints.reduce((sum, p) => sum + p.x, 0) / n,
        y: worldPoints.reduce((sum, p) => sum + p.y, 0) / n,
      };

      return [{ id: site.id, worldPoints, areaSquareMeters, centroid }];
    });
  }

  // Source: scaleSitesToUvPowerWeights in testing/app/src/app/app.ts (line 6356).
  private scaleSitesToUvPowerWeights(sites: readonly { u: number; v: number; weight: number }[]): number[] {
    if (!sites.length) return [];

    const positiveWeights = sites.map((site) => Math.max(site.weight, 1e-6));
    const meanWeight = positiveWeights.reduce((sum, w) => sum + w, 0) / positiveWeights.length;

    let pairDistanceSum = 0;
    let pairCount = 0;
    for (let i = 0; i < sites.length; i += 1) {
      for (let j = i + 1; j < sites.length; j += 1) {
        const du = sites[i].u - sites[j].u;
        const dv = sites[i].v - sites[j].v;
        pairDistanceSum += du * du + dv * dv;
        pairCount += 1;
      }
    }

    const meanPairDistanceSq = pairCount > 0 ? pairDistanceSum / pairCount : 0.15;
    const weightScale = meanPairDistanceSq * 0.35;

    return positiveWeights.map((w) => (w / meanWeight) * weightScale);
  }

  // Source: clipCellByBisector in testing/app/src/app/app.ts (line 2692).
  private clipCellByBisector(
    poly: { x: number; y: number }[],
    ax: number, ay: number, wA: number,
    bx: number, by: number, wB: number,
  ): { x: number; y: number }[] {
    if (poly.length < 3) return poly;
    const dx = bx - ax;
    const dy = by - ay;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-10) return poly;

    const tMin = 0.15;
    const tMax = 0.85;
    const t = Math.max(tMin, Math.min(tMax, 0.5 + (wA - wB) / (2 * d2)));
    const pmx = ax + t * dx;
    const pmy = ay + t * dy;

    let C = dx;
    let D = dy;
    let E = C * pmx + D * pmy;
    if (C * ax + D * ay > E) { C = -C; D = -D; E = -E; }

    const inside = (px: number, py: number) => C * px + D * py - E <= 0;
    const intersect = (x1: number, y1: number, x2: number, y2: number): { x: number; y: number } => {
      const edx = x2 - x1;
      const edy = y2 - y1;
      const denom = C * edx + D * edy;
      if (Math.abs(denom) < 1e-10) return { x: x1, y: y1 };
      const ti = (E - C * x1 - D * y1) / denom;
      return { x: x1 + ti * edx, y: y1 + ti * edy };
    };

    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < poly.length; i += 1) {
      const cur = poly[i];
      const nxt = poly[(i + 1) % poly.length];
      const ci = inside(cur.x, cur.y);
      const ni = inside(nxt.x, nxt.y);
      if (ci) out.push(cur);
      if (ci !== ni) out.push(intersect(cur.x, cur.y, nxt.x, nxt.y));
    }
    return out;
  }

  private bilinearQuadPoint(quad: readonly { x: number; y: number }[], u: number, v: number): GeometryPoint {
    const [p0, p1, p2, p3] = quad;
    return {
      x: (1 - u) * (1 - v) * p0.x + u * (1 - v) * p1.x + u * v * p2.x + (1 - u) * v * p3.x,
      y: (1 - u) * (1 - v) * p0.y + u * (1 - v) * p1.y + u * v * p2.y + (1 - u) * v * p3.y,
    };
  }

  private inverseWarpedGrid(world: GeometryPoint, quad: readonly { x: number; y: number }[]): { u: number; v: number } {
    const [p0, p1, p2, p3] = quad;
    let u = 0.5;
    let v = 0.5;

    for (let iter = 0; iter < 10; iter += 1) {
      const p = this.bilinearQuadPoint(quad, u, v);
      const dPdu = { x: (1 - v) * (p1.x - p0.x) + v * (p2.x - p3.x), y: (1 - v) * (p1.y - p0.y) + v * (p2.y - p3.y) };
      const dPdv = { x: (1 - u) * (p3.x - p0.x) + u * (p2.x - p1.x), y: (1 - u) * (p3.y - p0.y) + u * (p2.y - p1.y) };
      const rx = world.x - p.x;
      const ry = world.y - p.y;
      const det = dPdu.x * dPdv.y - dPdu.y * dPdv.x;
      if (Math.abs(det) < 1e-10) break;
      u = Math.max(0, Math.min(1, u + (dPdv.y * rx - dPdv.x * ry) / det));
      v = Math.max(0, Math.min(1, v + (dPdu.x * ry - dPdu.y * rx) / det));
    }

    return { u, v };
  }

  private polygonArea(points: readonly GeometryPoint[]): number {
    if (points.length < 3) return 0;
    let total = 0;
    for (let i = 0; i < points.length; i += 1) {
      const cur = points[i];
      const next = points[(i + 1) % points.length];
      total += cur.x * next.y - next.x * cur.y;
    }
    return Math.abs(total) / 2;
  }

  private polygonsTouch(left: readonly GeometryPoint[], right: readonly GeometryPoint[], epsilon: number): boolean {
    for (let i = 0; i < left.length; i += 1) {
      const a = left[i];
      const b = left[(i + 1) % left.length];
      for (let j = 0; j < right.length; j += 1) {
        const c = right[j];
        const d = right[(j + 1) % right.length];
        if (this.isPointOnSegment(a, c, d, epsilon) || this.isPointOnSegment(c, a, b, epsilon)) return true;
        if (this.segmentsIntersect(a, b, c, d)) return true;
      }
    }
    return false;
  }

  private segmentsIntersect(a: GeometryPoint, b: GeometryPoint, c: GeometryPoint, d: GeometryPoint): boolean {
    const ccw = (p1: GeometryPoint, p2: GeometryPoint, p3: GeometryPoint) =>
      (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  }

  private isPointOnSegment(p: GeometryPoint, a: GeometryPoint, b: GeometryPoint, epsilon: number): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= epsilon) return false;
    const cross = Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
    if (cross > epsilon) return false;
    const dot = (p.x - a.x) * dx + (p.y - a.y) * dy;
    return dot >= -epsilon && dot <= len * len + epsilon;
  }
}
