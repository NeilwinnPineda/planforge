import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { RoomTag } from '../source/source.exports';
import type { HallwayInjectedLayoutArtifact, ProvisionalLayoutCell, WarpedDiagnosticLayoutArtifact } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface WarpedDiagnosticStagingArguments {
  readonly buildablePoints: readonly GeometryPoint[];
  readonly rebalanceIterations: number;
  readonly rebalanceGain: number;
  readonly stableDeviation: number;
  readonly stableRunsRequired: number;
  readonly roomDriftGain: number;
  readonly hallwayDriftGain: number;
}

export interface WarpedDiagnosticStagingMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly warpedSiteCount: number;
  readonly iterationCount: number;
  readonly stableRunCount: number;
}

interface WarpedSite {
  id: string;
  typeId: string;
  label: string;
  color: string;
  tags: readonly RoomTag[];
  pkg: boolean;
  hallway: boolean;
  x: number;
  y: number;
  u: number;
  v: number;
  targetSquareMeters: number;
  weight: number;
}

@Injectable({ providedIn: 'root' })
export class WarpedDiagnosticStagingService {
  readonly stepId = 'processing.diagnostic_staging';
  readonly stepLabel = 'Warped diagnostic staging';
  readonly stageCategory = 'refinement' as const;
  private readonly polygonEpsilon = 0.000001;

  // Slice number: active downstream continuation after boundary stepping.
  // Stage category: refinement / diagnostic staging within downstream layout processing.
  // Step id: processing.diagnostic_staging.
  // Purpose: rebuild the warped-grid orthogonalization lineage as a separately inspectable downstream artifact before mass negotiation and boundary edge cleanup.
  // Inputs: hallway-injected canonical cell artifact plus explicit warped-grid rebalance arguments and a four-corner buildable quad.
  // Outputs: warped diagnostic artifact with remapped world-space cells, metrics, and traces.
  // Allowed dependencies: hallway-injected canonical cells, explicit arguments, and local deterministic warped-grid helpers only.
  // Forbidden responsibilities: gap absorption, fringe exchange, simplification, verification, and page projection.
  run(
    request: LayoutProcessingStepRequest<HallwayInjectedLayoutArtifact, WarpedDiagnosticStagingArguments>,
  ): LayoutProcessingStepResult<WarpedDiagnosticLayoutArtifact, WarpedDiagnosticStagingMetrics> {
    const quad = request.arguments.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
    if (quad.length !== 4) {
      return {
        artifact: {
          layoutId: request.artifact.layoutId,
          sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
          generatedAtIso: new Date().toISOString(),
          cells: request.artifact.cells,
        },
        changed: false,
        metrics: {
          inputCellCount: request.artifact.cells.length,
          outputCellCount: request.artifact.cells.length,
          warpedSiteCount: 0,
          iterationCount: 0,
          stableRunCount: 0,
        },
        traces: [
          {
            stepId: this.stepId,
            severity: 'warn',
            message: `Warped diagnostic staging skipped for ${request.artifact.layoutId}; buildable polygon is not a four-corner quad.`,
          },
        ],
      };
    }

    const sites = request.artifact.cells.map((cell) => this.buildWarpedSite(cell, quad));
    const adjustedSites = sites.map((site) => ({ ...site }));
    const adjustableSites = adjustedSites.filter((site) => !site.pkg);
    const initialTotalWeight = adjustableSites.reduce((sum, site) => sum + Math.max(site.weight, 0.01), 0);

    let stableRuns = 0;
    let iterationCount = 0;

    for (let iteration = 0; iteration < request.arguments.rebalanceIterations; iteration += 1) {
      // Block behavior:
      // Input: current warped sites in UV space with carried target areas.
      // Output: updated UV masses and UV centroid drift that prepare the snapped orthogonal pass.
      // Rule: this stays in warped-grid coordinates until final reconstruction so the grid logic
      // remains the source of orthogonalization rather than a later visual cleanup trick.
      iterationCount = iteration + 1;
      const cells = this.buildUvVoronoiCells(quad, adjustedSites);
      const cellById = new Map(cells.map((cell) => [cell.id, cell]));
      let maxDeviation = 0;

      adjustableSites.forEach((site) => {
        const cell = cellById.get(site.id);
        if (!cell || site.targetSquareMeters <= this.polygonEpsilon) {
          return;
        }

        const actualArea = Math.max(0.05, this.polygonArea(cell.worldPoints));
        const ratio = site.targetSquareMeters / actualArea;
        maxDeviation = Math.max(maxDeviation, Math.abs(ratio - 1));
        site.weight = Math.max(0.01, site.weight * (1 + request.arguments.rebalanceGain * (ratio - 1)));

        const centroid = this.polygonCenter(cell.worldPoints);
        const centroidUv = this.inverseWarpedGrid(centroid, quad);
        const driftGain = site.hallway ? request.arguments.hallwayDriftGain : request.arguments.roomDriftGain;
        site.u = Math.max(0, Math.min(1, site.u + (centroidUv.u - site.u) * driftGain));
        site.v = Math.max(0, Math.min(1, site.v + (centroidUv.v - site.v) * driftGain));
        const driftedWorld = this.bilinearQuadPoint(quad, site.u, site.v);
        site.x = driftedWorld.x;
        site.y = driftedWorld.y;
      });

      const currentTotalWeight = adjustableSites.reduce((sum, site) => sum + site.weight, 0);
      if (currentTotalWeight > 0 && initialTotalWeight > 0) {
        const normalization = initialTotalWeight / currentTotalWeight;
        adjustableSites.forEach((site) => {
          site.weight = Math.max(0.01, site.weight * normalization);
        });
      }

      stableRuns = maxDeviation < request.arguments.stableDeviation ? stableRuns + 1 : 0;
      if (stableRuns >= request.arguments.stableRunsRequired) {
        break;
      }
    }

    const cells = this.buildWarpedQuadCells(quad, adjustedSites).map((cell) => ({
      id: cell.id,
      typeId: cell.typeId,
      label: cell.label,
      color: cell.color,
      tags: [...cell.tags],
      pkg: cell.pkg,
      hallway: cell.hallway,
      worldPoints: cell.worldPoints.map((point) => ({ x: point.x, y: point.y })),
      areaSquareMeters: cell.areaSquareMeters,
      targetSquareMeters: cell.targetSquareMeters,
      areaDelta: cell.areaDelta,
      mass: cell.mass,
    }));

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
        warpedSiteCount: adjustedSites.length,
        iterationCount,
        stableRunCount: stableRuns,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: 'info',
          message: `Warped diagnostic staging rebuilt ${cells.length} snapped warped-grid cells for ${request.artifact.layoutId}.`,
        },
      ],
    };
  }

  private buildWarpedSite(cell: ProvisionalLayoutCell, quad: readonly GeometryPoint[]): WarpedSite {
    // Block behavior:
    // Input: one hallway-injected world-space cell and the active buildable quad.
    // Output: one warped-grid site carrying both world centroid and inverse-mapped UV position.
    const center = this.polygonCenter(cell.worldPoints);
    const uv = this.inverseWarpedGrid(center, quad);
    return {
      id: cell.id,
      typeId: cell.typeId,
      label: cell.label,
      color: cell.color,
      tags: [...cell.tags],
      pkg: cell.pkg,
      hallway: cell.hallway,
      x: center.x,
      y: center.y,
      u: uv.u,
      v: uv.v,
      targetSquareMeters: cell.targetSquareMeters,
      weight: Math.max(0.01, cell.mass),
    };
  }

  private buildUvVoronoiCells(
    quad: readonly GeometryPoint[],
    sites: readonly WarpedSite[],
  ): ProvisionalLayoutCell[] {
    // Block behavior:
    // Input: warped-grid sites living in UV coordinates.
    // Output: constrained Voronoi polygons in UV, remapped back into world coordinates.
    // Rule: this is the non-orthogonal intermediate partition used to drive mass drift before the
    // snapped warped-grid box reconstruction happens.
    const uvClip = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const uvWeights = this.scaleSitesToUvPowerWeights(sites);

    return sites.flatMap((site, siteIndex) => {
      let cell = [...uvClip];
      sites.forEach((otherSite, otherIndex) => {
        if (siteIndex === otherIndex || cell.length < 3) {
          return;
        }

        cell = this.clipCellByBisector(
          cell,
          site.u,
          site.v,
          uvWeights[siteIndex],
          otherSite.u,
          otherSite.v,
          uvWeights[otherIndex],
          true,
          false,
        );
      });

      if (cell.length < 3) {
        return [];
      }

      const worldPoints = cell.map((point) => this.bilinearQuadPoint(quad, point.x, point.y));
      const areaSquareMeters = this.polygonArea(worldPoints);
      if (areaSquareMeters <= this.polygonEpsilon) {
        return [];
      }

      return [{
        id: site.id,
        typeId: site.typeId,
        label: site.label,
        color: site.color,
        tags: [...site.tags],
        pkg: site.pkg,
        hallway: site.hallway,
        worldPoints,
        areaSquareMeters,
        targetSquareMeters: site.targetSquareMeters,
        areaDelta: site.targetSquareMeters > this.polygonEpsilon
          ? (areaSquareMeters - site.targetSquareMeters) / site.targetSquareMeters
          : 0,
        mass: site.weight,
      }];
    });
  }

  private buildWarpedQuadCells(
    quad: readonly GeometryPoint[],
    sites: readonly WarpedSite[],
  ): ProvisionalLayoutCell[] {
    // Block behavior:
    // Input: rebalanced warped-grid sites.
    // Output: snapped UV boxes mapped back into world-space orthogonalized cells.
    // Rule: this mirrors the legacy warped-grid orthogonalization path: constrained UV Voronoi
    // first, snapped UV extents second, free-space absorption third, overlap fallback last.
    const snapThreshold = 0.05;
    const minExtent = 0.04;
    const uvClip = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const uvWeights = this.scaleSitesToUvPowerWeights(sites);

    const uvCells = sites.map((site, siteIndex) => {
      let cell = [...uvClip];
      sites.forEach((otherSite, otherIndex) => {
        if (siteIndex === otherIndex || cell.length < 3) {
          return;
        }

        cell = this.clipCellByBisector(
          cell,
          site.u,
          site.v,
          uvWeights[siteIndex],
          otherSite.u,
          otherSite.v,
          uvWeights[otherIndex],
          true,
          false,
        );
      });

      return { site, uvPolygon: cell };
    }).filter(({ uvPolygon }) => uvPolygon.length >= 3);

    const cellBoxes = uvCells.map(({ uvPolygon }) => ({
      uMin: Math.min(...uvPolygon.map((point) => point.x)),
      uMax: Math.max(...uvPolygon.map((point) => point.x)),
      vMin: Math.min(...uvPolygon.map((point) => point.y)),
      vMax: Math.max(...uvPolygon.map((point) => point.y)),
    }));

    const buildSafeSnap = (
      edgeValues: readonly number[],
      extents: readonly { min: number; max: number }[],
    ): ((value: number) => number) => {
      // Block behavior:
      // Input: candidate UV edge positions and per-cell extents on one axis.
      // Output: a snap function that merges nearby edges only when all boxes keep minimum span.
      const round = (value: number) => Number(value.toFixed(8));
      const unique = [...new Set(edgeValues.map(round))].sort((left, right) => left - right);
      const snapMap = new Map<number, number>(unique.map((value) => [value, value]));

      for (let index = 0; index < unique.length - 1; index += 1) {
        const left = snapMap.get(unique[index])!;
        const right = snapMap.get(unique[index + 1])!;
        if (right - left > snapThreshold) {
          continue;
        }

        const merged = (left + right) / 2;
        const safe = extents.every((extent) => {
          const low = snapMap.get(round(extent.min)) ?? extent.min;
          const high = snapMap.get(round(extent.max)) ?? extent.max;
          const newLow = low === left || low === right ? merged : low;
          const newHigh = high === left || high === right ? merged : high;
          return newHigh - newLow >= minExtent;
        });

        if (safe) {
          snapMap.set(unique[index], merged);
          snapMap.set(unique[index + 1], merged);
        }
      }

      return (value: number) => snapMap.get(round(value)) ?? value;
    };

    const uEdges = [...new Set(cellBoxes.flatMap((box) => [box.uMin, box.uMax, 0, 1]))];
    const vEdges = [...new Set(cellBoxes.flatMap((box) => [box.vMin, box.vMax, 0, 1]))];
    const snapU = buildSafeSnap(uEdges, cellBoxes.map((box) => ({ min: box.uMin, max: box.uMax })));
    const snapV = buildSafeSnap(vEdges, cellBoxes.map((box) => ({ min: box.vMin, max: box.vMax })));

    const boxes = uvCells.map(({ site, uvPolygon }) => ({
      site,
      uMin: snapU(Math.min(...uvPolygon.map((point) => point.x))),
      uMax: snapU(Math.max(...uvPolygon.map((point) => point.x))),
      vMin: snapV(Math.min(...uvPolygon.map((point) => point.y))),
      vMax: snapV(Math.max(...uvPolygon.map((point) => point.y))),
    })).filter((box) => box.uMax - box.uMin >= minExtent && box.vMax - box.vMin >= minExtent);

    this.absorbFreeUvSpace(boxes, quad, minExtent);

    const unsnappedBoxes = uvCells.map(({ site, uvPolygon }) => ({
      site,
      uMin: Math.min(...uvPolygon.map((point) => point.x)),
      uMax: Math.max(...uvPolygon.map((point) => point.x)),
      vMin: Math.min(...uvPolygon.map((point) => point.y)),
      vMax: Math.max(...uvPolygon.map((point) => point.y)),
    })).filter((box) => box.uMax - box.uMin >= minExtent && box.vMax - box.vMin >= minExtent);

    this.resolveUvOverlaps(boxes);
    let safeBoxes = boxes;
    if (this.hasOverlappingUvBoxes(boxes)) {
      this.absorbFreeUvSpace(unsnappedBoxes, quad, minExtent);
      this.resolveUvOverlaps(unsnappedBoxes);
      safeBoxes = unsnappedBoxes;
    }

    return safeBoxes.flatMap(({ site, uMin, uMax, vMin, vMax }) => {
      const quadUv = [
        { x: uMin, y: vMin },
        { x: uMax, y: vMin },
        { x: uMax, y: vMax },
        { x: uMin, y: vMax },
      ];
      const worldPoints = quadUv.map((point) => this.bilinearQuadPoint(quad, point.x, point.y));
      const areaSquareMeters = this.polygonArea(worldPoints);
      if (areaSquareMeters <= this.polygonEpsilon) {
        return [];
      }

      return [{
        id: site.id,
        typeId: site.typeId,
        label: site.label,
        color: site.color,
        tags: [...site.tags],
        pkg: site.pkg,
        hallway: site.hallway,
        worldPoints,
        areaSquareMeters,
        targetSquareMeters: site.targetSquareMeters,
        areaDelta: site.targetSquareMeters > this.polygonEpsilon
          ? (areaSquareMeters - site.targetSquareMeters) / site.targetSquareMeters
          : 0,
        mass: site.weight,
      }];
    });
  }

  private absorbFreeUvSpace(
    boxes: Array<{
      site: WarpedSite;
      uMin: number;
      uMax: number;
      vMin: number;
      vMax: number;
    }>,
    quad: readonly GeometryPoint[],
    minExtent: number,
  ): void {
    // Block behavior:
    // Input: snapped UV boxes that may leave recoverable unclaimed strips between neighbors.
    // Output: in-place growth of underfilled boxes into safe free UV gaps.
    const overlapEpsilon = 0.00001;
    const minGrowthAreaSquareMeters = 0.01;
    const emergencyPassLimit = 1000;
    const worldArea = (box: { uMin: number; uMax: number; vMin: number; vMax: number }) => {
      const points = [
        this.bilinearQuadPoint(quad, box.uMin, box.vMin),
        this.bilinearQuadPoint(quad, box.uMax, box.vMin),
        this.bilinearQuadPoint(quad, box.uMax, box.vMax),
        this.bilinearQuadPoint(quad, box.uMin, box.vMax),
      ];
      return this.polygonArea(points);
    };
    const overlapsOnV = (a: { vMin: number; vMax: number }, b: { vMin: number; vMax: number }) =>
      Math.min(a.vMax, b.vMax) - Math.max(a.vMin, b.vMin) > overlapEpsilon;
    const overlapsOnU = (a: { uMin: number; uMax: number }, b: { uMin: number; uMax: number }) =>
      Math.min(a.uMax, b.uMax) - Math.max(a.uMin, b.uMin) > overlapEpsilon;

    let pass = 0;
    while (true) {
      let anyGrowth = false;
      boxes.sort((left, right) => {
        const shortageLeft = Math.max(0, left.site.targetSquareMeters - worldArea(left));
        const shortageRight = Math.max(0, right.site.targetSquareMeters - worldArea(right));
        return shortageRight - shortageLeft;
      });

      for (const box of boxes) {
        const shortage = Math.max(0, box.site.targetSquareMeters - worldArea(box));
        if (shortage <= 0.05) {
          continue;
        }

        const leftBound = boxes.reduce((best, other) => {
          if (other === box || !overlapsOnV(box, other) || other.uMax > box.uMin + overlapEpsilon) {
            return best;
          }
          return Math.max(best, other.uMax);
        }, 0);
        const rightBound = boxes.reduce((best, other) => {
          if (other === box || !overlapsOnV(box, other) || other.uMin < box.uMax - overlapEpsilon) {
            return best;
          }
          return Math.min(best, other.uMin);
        }, 1);
        const bottomBound = boxes.reduce((best, other) => {
          if (other === box || !overlapsOnU(box, other) || other.vMax > box.vMin + overlapEpsilon) {
            return best;
          }
          return Math.max(best, other.vMax);
        }, 0);
        const topBound = boxes.reduce((best, other) => {
          if (other === box || !overlapsOnU(box, other) || other.vMin < box.vMax - overlapEpsilon) {
            return best;
          }
          return Math.min(best, other.vMin);
        }, 1);

        const candidates = [
          { side: 'left' as const, gap: Math.max(0, box.uMin - leftBound) },
          { side: 'right' as const, gap: Math.max(0, rightBound - box.uMax) },
          { side: 'bottom' as const, gap: Math.max(0, box.vMin - bottomBound) },
          { side: 'top' as const, gap: Math.max(0, topBound - box.vMax) },
        ].filter((candidate) => candidate.gap > overlapEpsilon);

        let bestCandidate: null | { areaGain: number; apply: () => void } = null;
        for (const candidate of candidates) {
          const next = { ...box };
          if (candidate.side === 'left') next.uMin = leftBound;
          if (candidate.side === 'right') next.uMax = rightBound;
          if (candidate.side === 'bottom') next.vMin = bottomBound;
          if (candidate.side === 'top') next.vMax = topBound;
          if (next.uMax - next.uMin < minExtent || next.vMax - next.vMin < minExtent) {
            continue;
          }

          const areaGain = worldArea(next) - worldArea(box);
          if (areaGain <= 0.000001) {
            continue;
          }

          if (!bestCandidate || areaGain > bestCandidate.areaGain) {
            bestCandidate = {
              areaGain,
              apply: () => {
                box.uMin = next.uMin;
                box.uMax = next.uMax;
                box.vMin = next.vMin;
                box.vMax = next.vMax;
              },
            };
          }
        }

        if (bestCandidate && bestCandidate.areaGain > minGrowthAreaSquareMeters) {
          bestCandidate.apply();
          anyGrowth = true;
        }
      }

      if (!anyGrowth) {
        break;
      }

      pass += 1;
      if (pass >= emergencyPassLimit) {
        break;
      }
    }
  }

  private hasOverlappingUvBoxes(
    boxes: readonly { uMin: number; uMax: number; vMin: number; vMax: number }[],
  ): boolean {
    const overlapEpsilon = 0.00001;
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const uOverlap = Math.min(boxes[leftIndex].uMax, boxes[rightIndex].uMax) - Math.max(boxes[leftIndex].uMin, boxes[rightIndex].uMin);
        const vOverlap = Math.min(boxes[leftIndex].vMax, boxes[rightIndex].vMax) - Math.max(boxes[leftIndex].vMin, boxes[rightIndex].vMin);
        if (uOverlap > overlapEpsilon && vOverlap > overlapEpsilon) {
          return true;
        }
      }
    }

    return false;
  }

  private resolveUvOverlaps(
    boxes: Array<{ uMin: number; uMax: number; vMin: number; vMax: number }>,
  ): void {
    const EPS = 1e-6;
    for (let pass = 0; pass < 8; pass++) {
      let anyFixed = false;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
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

  private scaleSitesToUvPowerWeights(sites: readonly WarpedSite[]): number[] {
    if (!sites.length) {
      return [];
    }

    const baseWeights = sites.map((site) => Math.max(0.01, site.weight));
    const meanWeight = baseWeights.reduce((sum, weight) => sum + weight, 0) / baseWeights.length;
    let pairDistanceSum = 0;
    let pairCount = 0;

    for (let outerIndex = 0; outerIndex < sites.length; outerIndex += 1) {
      for (let innerIndex = outerIndex + 1; innerIndex < sites.length; innerIndex += 1) {
        pairDistanceSum += Math.hypot(sites[outerIndex].u - sites[innerIndex].u, sites[outerIndex].v - sites[innerIndex].v);
        pairCount += 1;
      }
    }

    const meanPairDistance = pairCount ? pairDistanceSum / pairCount : 0.35;
    const scale = meanPairDistance * meanPairDistance * 0.35;
    return baseWeights.map((weight) => ((weight / meanWeight) - 1) * scale);
  }

  private clipCellByBisector(
    polygon: readonly GeometryPoint[],
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
    // Input: current UV owner polygon plus one competing UV site pair.
    // Output: a clipped UV polygon using the legacy weighted half-plane rule.
    // Rule: warped-grid clipping is snapped-axis and tight so the orthogonal intent is already
    // present before the final UV box reconstruction runs.
    if (polygon.length < 3) {
      return [...polygon];
    }

    const dx = bx - ax;
    const dy = by - ay;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < 1e-10) {
      return [...polygon];
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
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
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

  private bilinearQuadPoint(quad: readonly GeometryPoint[], u: number, v: number): GeometryPoint {
    const [p0, p1, p2, p3] = quad;
    const oneMinusU = 1 - u;
    const oneMinusV = 1 - v;

    return {
      x: oneMinusU * oneMinusV * p0.x + u * oneMinusV * p1.x + u * v * p2.x + oneMinusU * v * p3.x,
      y: oneMinusU * oneMinusV * p0.y + u * oneMinusV * p1.y + u * v * p2.y + oneMinusU * v * p3.y,
    };
  }

  private inverseWarpedGrid(world: GeometryPoint, quad: readonly GeometryPoint[]): { u: number; v: number } {
    const [p0, p1, p2, p3] = quad;
    let u = 0.5;
    let v = 0.5;

    for (let iteration = 0; iteration < 10; iteration += 1) {
      const point = this.bilinearQuadPoint(quad, u, v);
      const dPdu = {
        x: (1 - v) * (p1.x - p0.x) + v * (p2.x - p3.x),
        y: (1 - v) * (p1.y - p0.y) + v * (p2.y - p3.y),
      };
      const dPdv = {
        x: (1 - u) * (p3.x - p0.x) + u * (p2.x - p1.x),
        y: (1 - u) * (p3.y - p0.y) + u * (p2.y - p1.y),
      };
      const rx = world.x - point.x;
      const ry = world.y - point.y;
      const determinant = dPdu.x * dPdv.y - dPdu.y * dPdv.x;
      if (Math.abs(determinant) < 1e-10) {
        break;
      }

      u = Math.max(0, Math.min(1, u + (dPdv.y * rx - dPdv.x * ry) / determinant));
      v = Math.max(0, Math.min(1, v + (dPdu.x * ry - dPdu.y * rx) / determinant));
    }

    return { u, v };
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
}
