import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { ProvisionalLayoutCell, UvBoxedLayoutArtifact, WarpedRebalancedSiteArtifact, WarpedUvSite } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface UvVoronoiBoxingArguments {
  readonly snapThreshold: number;
  readonly minExtent: number;
  readonly majorAxisSnapMultiplier: number;
}

export interface UvVoronoiBoxingMetrics {
  readonly inputSiteCount: number;
  readonly hallwaySiteCount: number;
  readonly roomSiteCount: number;
  readonly outputCellCount: number;
  readonly droppedDegenerateCellCount: number;
  readonly majorAxisSnappedEdgeCount: number;
  readonly usedFallbackBoxes: boolean;
}

@Injectable({ providedIn: 'root' })
export class UvVoronoiBoxingService {
  readonly stepId = 'processing.uv_voronoi_boxing';
  readonly stepLabel = 'UV Voronoi boxing';
  readonly stageCategory = 'warped-grid' as const;

  // Slice number: 9C — third step of the real verification-feeding warped pipeline.
  // Stage category: warped-grid UV box generation.
  // Step id: processing.uv_voronoi_boxing.
  // Purpose: run power Voronoi in UV space on ALL rebalanced sites (rooms + hallways), then
  // quantize ALL cells to UV axis-aligned bounding boxes so every site's box is bounded by its
  // neighbors and no pair overlaps, merge close edges safely, attract edges to the 2 most-shared
  // structural axes (major axis snap), grow deficit boxes into free UV gaps, fall back to unsnapped
  // boxes if snapping produces overlaps, then back-project each UV rectangle to world space.
  // Hallways are boxed alongside rooms — their world rectangles pass through to 9D which filters
  // them out before negotiation; their UV territory is then recovered as residuals by 9E.
  // Inputs: WarpedRebalancedSiteArtifact (UV sites + quad) and snap/extent/axis-snap arguments.
  // Outputs: UvBoxedLayoutArtifact — world-space rectangular ProvisionalLayoutCells (all sites).
  // Allowed dependencies: WarpedRebalancedSiteArtifact and local deterministic UV geometry helpers only.
  // Forbidden responsibilities: deficit edge negotiation, residual gap detection, hallway/filler
  //   residual generation, final staging, and verification.
  // Legacy source: buildWarpedQuadCells (ALL sites boxing)
  //   testing/legacy-reference/app/src/app/app.ts lines 5970–6113.
  run(
    request: LayoutProcessingStepRequest<WarpedRebalancedSiteArtifact, UvVoronoiBoxingArguments>,
  ): LayoutProcessingStepResult<UvBoxedLayoutArtifact, UvVoronoiBoxingMetrics> {
    const quad = request.artifact.quadPoints.map((p) => ({ x: p.x, y: p.y }));
    const sites = request.artifact.sites;
    const { snapThreshold, minExtent, majorAxisSnapMultiplier } = request.arguments;

    if (!sites.length || quad.length !== 4) {
      return {
        artifact: {
          layoutId: request.artifact.layoutId,
          sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
          generatedAtIso: new Date().toISOString(),
          cells: [],
          quadPoints: quad,
        },
        changed: false,
        metrics: {
          inputSiteCount: sites.length,
          hallwaySiteCount: 0,
          roomSiteCount: 0,
          outputCellCount: 0,
          droppedDegenerateCellCount: 0,
          majorAxisSnappedEdgeCount: 0,
          usedFallbackBoxes: false,
        },
        traces: [
          {
            stepId: this.stepId,
            severity: 'warn',
            message: `UV Voronoi boxing skipped for ${request.artifact.layoutId}; no sites or invalid quad.`,
          },
        ],
      };
    }

    const uvClip = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const uvWeights = this.scaleSitesToUvPowerWeights(sites);

    // Run Voronoi on ALL sites — hallways participate to shape room boundaries.
    const uvCells = sites.map((site, i) => {
      let cell = [...uvClip];
      for (let j = 0; j < sites.length; j += 1) {
        if (i === j || cell.length < 3) continue;
        cell = this.clipCellByBisector(cell, site.u, site.v, uvWeights[i], sites[j].u, sites[j].v, uvWeights[j]);
      }
      return { site, uvPoly: cell };
    }).filter((c) => c.uvPoly.length >= 3);

    const hallwaySiteCount = sites.filter((s) => s.hallway).length;

    const cellBoxes = uvCells.map(({ uvPoly }) => ({
      uMin: Math.min(...uvPoly.map((p) => p.x)),
      uMax: Math.max(...uvPoly.map((p) => p.x)),
      vMin: Math.min(...uvPoly.map((p) => p.y)),
      vMax: Math.max(...uvPoly.map((p) => p.y)),
    }));

    const uEdges = [...new Set(cellBoxes.flatMap((b) => [b.uMin, b.uMax, 0, 1]))];
    const vEdges = [...new Set(cellBoxes.flatMap((b) => [b.vMin, b.vMax, 0, 1]))];
    const uExtents = cellBoxes.map((b) => ({ min: b.uMin, max: b.uMax }));
    const vExtents = cellBoxes.map((b) => ({ min: b.vMin, max: b.vMax }));
    const snapU = this.buildSafeSnap(uEdges, uExtents, snapThreshold, minExtent);
    const snapV = this.buildSafeSnap(vEdges, vExtents, snapThreshold, minExtent);

    const snappedBoxes = uvCells
      .map(({ site, uvPoly }) => ({
        site,
        uMin: snapU(Math.min(...uvPoly.map((p) => p.x))),
        uMax: snapU(Math.max(...uvPoly.map((p) => p.x))),
        vMin: snapV(Math.min(...uvPoly.map((p) => p.y))),
        vMax: snapV(Math.max(...uvPoly.map((p) => p.y))),
      }))
      .filter((b) => b.uMax - b.uMin >= minExtent && b.vMax - b.vMin >= minExtent);

    const unsnappedBoxes = uvCells
      .map(({ site, uvPoly }) => ({
        site,
        uMin: Math.min(...uvPoly.map((p) => p.x)),
        uMax: Math.max(...uvPoly.map((p) => p.x)),
        vMin: Math.min(...uvPoly.map((p) => p.y)),
        vMax: Math.max(...uvPoly.map((p) => p.y)),
      }))
      .filter((b) => b.uMax - b.uMin >= minExtent && b.vMax - b.vMin >= minExtent);

    // Major axis snap: attract room edges toward the 2 most-shared U and V positions.
    // Only applied when safe-snap boxes are already clean (no overlaps).
    // Rolled back if the snap introduces overlaps.
    // Source: snapToMajorAxis — testing/legacy-reference/app/src/app/app.ts lines 5408–5428 (re-enabled after hallway filter).
    let majorAxisSnappedEdgeCount = 0;
    if (!this.hasOverlappingUvBoxes(snappedBoxes)) {
      const preSnapState = snappedBoxes.map((b) => ({ uMin: b.uMin, uMax: b.uMax, vMin: b.vMin, vMax: b.vMax }));
      majorAxisSnappedEdgeCount = this.snapToMajorAxes(snappedBoxes, snapThreshold * majorAxisSnapMultiplier, minExtent);
      if (this.hasOverlappingUvBoxes(snappedBoxes)) {
        snappedBoxes.forEach((b, i) => {
          b.uMin = preSnapState[i].uMin;
          b.uMax = preSnapState[i].uMax;
          b.vMin = preSnapState[i].vMin;
          b.vMax = preSnapState[i].vMax;
        });
        majorAxisSnappedEdgeCount = 0;
      }
    }

    this.absorbFreeUvSpace(snappedBoxes, quad, minExtent);
    const hasOverlap = this.hasOverlappingUvBoxes(snappedBoxes);
    if (hasOverlap) {
      this.absorbFreeUvSpace(unsnappedBoxes, quad, minExtent);
    }

    const safeBoxes = hasOverlap ? unsnappedBoxes : snappedBoxes;

    let droppedDegenerateCellCount = 0;
    const cells: ProvisionalLayoutCell[] = [];

    for (const { site, uMin, uMax, vMin, vMax } of safeBoxes) {
      const worldPoints = [
        this.bilinearQuadPoint(quad, uMin, vMin),
        this.bilinearQuadPoint(quad, uMax, vMin),
        this.bilinearQuadPoint(quad, uMax, vMax),
        this.bilinearQuadPoint(quad, uMin, vMax),
      ];
      const areaSquareMeters = this.polygonArea(worldPoints);
      if (areaSquareMeters <= 1e-6) {
        droppedDegenerateCellCount += 1;
        continue;
      }
      const areaDelta = site.targetSquareMeters > 1e-6
        ? (areaSquareMeters - site.targetSquareMeters) / site.targetSquareMeters
        : 0;

      cells.push({
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
        areaDelta,
        mass: site.weight,
      });
    }

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells,
        quadPoints: quad,
      },
      changed: cells.length > 0,
      metrics: {
        inputSiteCount: sites.length,
        hallwaySiteCount,
        roomSiteCount: uvCells.filter((c) => !c.site.hallway).length,
        outputCellCount: cells.length,
        droppedDegenerateCellCount,
        majorAxisSnappedEdgeCount,
        usedFallbackBoxes: hasOverlap,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: cells.length > 0 ? 'info' : 'warn',
          message: cells.length > 0
            ? `UV Voronoi boxing produced ${cells.length} cells for ${request.artifact.layoutId} (${hallwaySiteCount} hallway sites included in full tiling${hasOverlap ? ', fallback to unsnapped boxes' : ''}${majorAxisSnappedEdgeCount > 0 ? `, ${majorAxisSnappedEdgeCount} edges major-axis snapped` : ''}).`
            : `UV Voronoi boxing produced no cells for ${request.artifact.layoutId}.`,
        },
      ],
    };
  }

  // Source: snapToMajorAxis — testing/legacy-reference/app/src/app/app.ts lines 5395–5428.
  // Finds the 2 most-shared U and V edge positions across all room boxes and attracts
  // any room edge within `threshold` of a major axis toward it, gated by minExtent.
  private snapToMajorAxes(
    boxes: Array<{ uMin: number; uMax: number; vMin: number; vMax: number }>,
    threshold: number,
    minExtent: number,
  ): number {
    const BOUNDARY_EPS = 0.01;
    let snappedCount = 0;

    const findMajorAxes = (edgeVals: number[]): number[] => {
      const count = new Map<number, number>();
      for (const v of edgeVals) {
        const k = +v.toFixed(6);
        count.set(k, (count.get(k) ?? 0) + 1);
      }
      return [...count.entries()]
        .filter(([v]) => v > BOUNDARY_EPS && v < 1 - BOUNDARY_EPS)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([v]) => v);
    };

    const majorU = findMajorAxes(boxes.flatMap((b) => [b.uMin, b.uMax]));
    const majorV = findMajorAxes(boxes.flatMap((b) => [b.vMin, b.vMax]));

    for (const axis of majorU) {
      for (const box of boxes) {
        if (Math.abs(box.uMin - axis) < threshold && box.uMax - axis >= minExtent) {
          box.uMin = axis;
          snappedCount += 1;
        }
        // Re-read uMin after potential snap before checking uMax.
        if (Math.abs(box.uMax - axis) < threshold && axis - box.uMin >= minExtent) {
          box.uMax = axis;
          snappedCount += 1;
        }
      }
    }

    for (const axis of majorV) {
      for (const box of boxes) {
        if (Math.abs(box.vMin - axis) < threshold && box.vMax - axis >= minExtent) {
          box.vMin = axis;
          snappedCount += 1;
        }
        // Re-read vMin after potential snap before checking vMax.
        if (Math.abs(box.vMax - axis) < threshold && axis - box.vMin >= minExtent) {
          box.vMax = axis;
          snappedCount += 1;
        }
      }
    }

    return snappedCount;
  }

  // Source: buildSafeSnap inside buildClusteredGridCells — testing/legacy-reference/app/src/app/app.ts line 5317.
  private buildSafeSnap(
    edgeValues: number[],
    extents: Array<{ min: number; max: number }>,
    snapThreshold: number,
    minExtent: number,
  ): (v: number) => number {
    const r = (v: number) => +v.toFixed(8);
    const unique = [...new Set(edgeValues.map(r))].sort((a, b) => a - b);
    const snapMap = new Map<number, number>(unique.map((v) => [v, v]));

    for (let i = 0; i < unique.length - 1; i += 1) {
      const a = snapMap.get(unique[i])!;
      const b = snapMap.get(unique[i + 1])!;
      if (b - a > snapThreshold) continue;
      const merged = (a + b) / 2;

      const safe = extents.every((ext) => {
        const lo = snapMap.get(r(ext.min)) ?? ext.min;
        const hi = snapMap.get(r(ext.max)) ?? ext.max;
        const newLo = lo === a || lo === b ? merged : lo;
        const newHi = hi === a || hi === b ? merged : hi;
        return newHi - newLo >= minExtent;
      });

      if (safe) {
        snapMap.set(unique[i], merged);
        snapMap.set(unique[i + 1], merged);
      }
    }

    return (v: number) => snapMap.get(r(v)) ?? v;
  }

  // Source: absorbFreeUvSpace — testing/legacy-reference/app/src/app/app.ts line 6114.
  // Expands deficit boxes into free adjacent UV gaps, prioritizing largest shortage first.
  private absorbFreeUvSpace(
    boxes: Array<{ site: WarpedUvSite; uMin: number; uMax: number; vMin: number; vMax: number }>,
    quad: readonly { x: number; y: number }[],
    minExtent: number,
  ): void {
    const OVERLAP_EPS = 1e-5;
    const MIN_GROWTH_AREA_SQM = 0.01;
    const EMERGENCY_PASS_LIMIT = 1000;

    const worldArea = (box: { uMin: number; uMax: number; vMin: number; vMax: number }) => {
      const pts = [
        this.bilinearQuadPoint(quad, box.uMin, box.vMin),
        this.bilinearQuadPoint(quad, box.uMax, box.vMin),
        this.bilinearQuadPoint(quad, box.uMax, box.vMax),
        this.bilinearQuadPoint(quad, box.uMin, box.vMax),
      ];
      return this.polygonArea(pts);
    };
    const overlapsOnV = (a: { vMin: number; vMax: number }, b: { vMin: number; vMax: number }) =>
      Math.min(a.vMax, b.vMax) - Math.max(a.vMin, b.vMin) > OVERLAP_EPS;
    const overlapsOnU = (a: { uMin: number; uMax: number }, b: { uMin: number; uMax: number }) =>
      Math.min(a.uMax, b.uMax) - Math.max(a.uMin, b.uMin) > OVERLAP_EPS;

    let pass = 0;
    while (true) {
      let anyGrowth = false;
      boxes.sort((a, b) => Math.max(0, b.site.targetSquareMeters - worldArea(b)) - Math.max(0, a.site.targetSquareMeters - worldArea(a)));

      for (const box of boxes) {
        if (Math.max(0, box.site.targetSquareMeters - worldArea(box)) <= 0.05) continue;

        const leftBound = boxes.reduce((best, o) => (o === box || !overlapsOnV(box, o) || o.uMax > box.uMin + OVERLAP_EPS) ? best : Math.max(best, o.uMax), 0);
        const rightBound = boxes.reduce((best, o) => (o === box || !overlapsOnV(box, o) || o.uMin < box.uMax - OVERLAP_EPS) ? best : Math.min(best, o.uMin), 1);
        const bottomBound = boxes.reduce((best, o) => (o === box || !overlapsOnU(box, o) || o.vMax > box.vMin + OVERLAP_EPS) ? best : Math.max(best, o.vMax), 0);
        const topBound = boxes.reduce((best, o) => (o === box || !overlapsOnU(box, o) || o.vMin < box.vMax - OVERLAP_EPS) ? best : Math.min(best, o.vMin), 1);

        const candidates = [
          { side: 'left' as const, gap: Math.max(0, box.uMin - leftBound) },
          { side: 'right' as const, gap: Math.max(0, rightBound - box.uMax) },
          { side: 'bottom' as const, gap: Math.max(0, box.vMin - bottomBound) },
          { side: 'top' as const, gap: Math.max(0, topBound - box.vMax) },
        ].filter((c) => c.gap > OVERLAP_EPS);

        let bestCandidate: null | { areaGain: number; apply: () => void } = null;
        for (const candidate of candidates) {
          const next = { ...box };
          if (candidate.side === 'left') next.uMin = leftBound;
          if (candidate.side === 'right') next.uMax = rightBound;
          if (candidate.side === 'bottom') next.vMin = bottomBound;
          if (candidate.side === 'top') next.vMax = topBound;
          if (next.uMax - next.uMin < minExtent || next.vMax - next.vMin < minExtent) continue;

          const areaGain = worldArea(next) - worldArea(box);
          if (areaGain <= 1e-6) continue;
          if (!bestCandidate || areaGain > bestCandidate.areaGain) {
            bestCandidate = {
              areaGain,
              apply: () => { box.uMin = next.uMin; box.uMax = next.uMax; box.vMin = next.vMin; box.vMax = next.vMax; },
            };
          }
        }

        if (bestCandidate && bestCandidate.areaGain > MIN_GROWTH_AREA_SQM) {
          bestCandidate.apply();
          anyGrowth = true;
        }
      }

      if (!anyGrowth) break;
      pass += 1;
      if (pass >= EMERGENCY_PASS_LIMIT) break;
    }
  }

  // Source: hasOverlappingUvBoxes — testing/legacy-reference/app/src/app/app.ts line 6217.
  private hasOverlappingUvBoxes(boxes: Array<{ uMin: number; uMax: number; vMin: number; vMax: number }>): boolean {
    const OVERLAP_EPS = 1e-5;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const uOverlap = Math.min(boxes[i].uMax, boxes[j].uMax) - Math.max(boxes[i].uMin, boxes[j].uMin);
        const vOverlap = Math.min(boxes[i].vMax, boxes[j].vMax) - Math.max(boxes[i].vMin, boxes[j].vMin);
        if (uOverlap > OVERLAP_EPS && vOverlap > OVERLAP_EPS) return true;
      }
    }
    return false;
  }

  // Source: scaleSitesToUvPowerWeights — testing/legacy-reference/app/src/app/app.ts line 6361.
  private scaleSitesToUvPowerWeights(sites: readonly { u: number; v: number; weight: number }[]): number[] {
    if (!sites.length) return [];
    const positiveWeights = sites.map((s) => Math.max(s.weight, 1e-6));
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

  // Source: clipCellByBisector — testing/legacy-reference/app/src/app/app.ts line 2692.
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
    const t = Math.max(0.15, Math.min(0.85, 0.5 + (wA - wB) / (2 * d2)));
    const pmx = ax + t * dx;
    const pmy = ay + t * dy;
    let C = dx;
    let D = dy;
    let E = C * pmx + D * pmy;
    if (C * ax + D * ay > E) { C = -C; D = -D; E = -E; }
    const inside = (px: number, py: number) => C * px + D * py - E <= 0;
    const intersect = (x1: number, y1: number, x2: number, y2: number) => {
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
}

