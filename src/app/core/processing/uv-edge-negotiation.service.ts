import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { MassBalancedLayoutArtifact, ProvisionalLayoutCell, UvNegotiatedLayoutArtifact } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface UvEdgeNegotiationArguments {
  readonly quadPoints: readonly { readonly x: number; readonly y: number }[];
  readonly snapThreshold: number;
  readonly majorAxisSnapMultiplier: number;
  readonly minExtent: number;
  readonly shiftGain: number;
  readonly maxPasses: number;
  readonly stableShift: number;
  readonly targetAspectRatio: number;
  readonly maxAspectPasses: number;
}

export interface UvEdgeNegotiationMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly snappedEdgeCount: number;
  readonly majorAxisSnappedEdgeCount: number;
  readonly negotiationPasses: number;
  readonly aspectRescueCount: number;
}

interface UvBox {
  cell: ProvisionalLayoutCell;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

@Injectable({ providedIn: 'root' })
export class UvEdgeNegotiationService {
  readonly stepId = 'processing.uv_edge_negotiation';
  readonly stepLabel = 'UV edge negotiation';
  readonly stageCategory = 'warped-grid' as const;

  // Slice number: 9D — direct continuation of mass balance, replacing the old 9A–9C Voronoi chain.
  // Stage category: warped-grid UV box refinement.
  // Step id: processing.uv_edge_negotiation.
  // Purpose: take already-rectangular mass-balanced cells, re-project their corners to UV space
  // via Newton-Raphson inverse bilinear, cluster close edges (buildSafeSnap), attract edges to
  // the 2 most-shared structural axes (snapToMajorAxes), iteratively shift shared UV edges toward
  // deficit-side neighbors (negotiateEdges, up to maxPasses), roll back if overlap occurs, then
  // rescue boxes with unacceptable world aspect ratios.
  // Inputs: MassBalancedLayoutArtifact (already-rectangular world cells) + quad and snap args.
  // Outputs: UvNegotiatedLayoutArtifact — world-space cells after clustering + negotiation + rescue.
  // Allowed dependencies: MassBalancedLayoutArtifact and local UV math helpers only.
  // Forbidden responsibilities: Voronoi, residual gap detection, hallway generation, final staging.
  // Legacy source: buildClusteredGridCells (buildSafeSnap + snapToMajorAxis + negotiateEdges +
  //   rescueClusteredAspectRatios) — testing/legacy-reference/app/src/app/app.ts lines 5280–5530.
  run(
    request: LayoutProcessingStepRequest<MassBalancedLayoutArtifact, UvEdgeNegotiationArguments>,
  ): LayoutProcessingStepResult<UvNegotiatedLayoutArtifact, UvEdgeNegotiationMetrics> {
    const quad = request.arguments.quadPoints.map((p) => ({ x: p.x, y: p.y }));
    const { snapThreshold, majorAxisSnapMultiplier, minExtent, shiftGain, maxPasses, stableShift, targetAspectRatio, maxAspectPasses } = request.arguments;

    if (!request.artifact.cells.length || quad.length !== 4) {
      return {
        artifact: {
          layoutId: request.artifact.layoutId,
          sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
          generatedAtIso: new Date().toISOString(),
          cells: [],
          quadPoints: quad,
          uvGrid: { uValues: [], vValues: [], majorUValues: [], majorVValues: [] },
        },
        changed: false,
        metrics: {
          inputCellCount: request.artifact.cells.length,
          outputCellCount: 0,
          snappedEdgeCount: 0,
          majorAxisSnappedEdgeCount: 0,
          negotiationPasses: 0,
          aspectRescueCount: 0,
        },
        traces: [
          {
            stepId: this.stepId,
            severity: 'warn',
            message: `UV edge negotiation skipped for ${request.artifact.layoutId}; no cells or invalid quad.`,
          },
        ],
      };
    }

    // All cells (rooms, hallways, pkg) enter the UV grid equally — no special treatment.
    const boxes: UvBox[] = request.artifact.cells
      .map((cell) => {
        const uvPts = cell.worldPoints.map((p) => this.inverseWarpedGrid(p, quad));
        return {
          cell,
          uMin: Math.min(...uvPts.map((p) => p.u)),
          uMax: Math.max(...uvPts.map((p) => p.u)),
          vMin: Math.min(...uvPts.map((p) => p.v)),
          vMax: Math.max(...uvPts.map((p) => p.v)),
        };
      })
      .filter((b) => b.uMax - b.uMin >= minExtent && b.vMax - b.vMin >= minExtent);

    // Count pre-resolution overlapping pairs so the trace captures what entered the resolver.
    let preResolutionOverlapCount = 0;
    for (let oi = 0; oi < boxes.length; oi++) {
      for (let oj = oi + 1; oj < boxes.length; oj++) {
        const a = boxes[oi]; const b = boxes[oj];
        if (
          Math.min(a.uMax, b.uMax) - Math.max(a.uMin, b.uMin) > 1e-6 &&
          Math.min(a.vMax, b.vMax) - Math.max(a.vMin, b.vMin) > 1e-6
        ) preResolutionOverlapCount++;
      }
    }

    // Resolve any pre-existing overlaps inherited from upstream (warped diagnostic Voronoi fallback).
    this.resolveUvOverlaps(boxes);

    // Edge clustering: merge close UV edge positions without collapsing rooms.
    // Source: buildSafeSnap — testing/legacy-reference/app/src/app/app.ts line 5317.
    const uEdges = [...new Set(boxes.flatMap((b) => [b.uMin, b.uMax, 0, 1]))];
    const vEdges = [...new Set(boxes.flatMap((b) => [b.vMin, b.vMax, 0, 1]))];
    const uExtents = boxes.map((b) => ({ min: b.uMin, max: b.uMax }));
    const vExtents = boxes.map((b) => ({ min: b.vMin, max: b.vMax }));
    const snapU = this.buildSafeSnap(uEdges, uExtents, snapThreshold, minExtent);
    const snapV = this.buildSafeSnap(vEdges, vExtents, snapThreshold, minExtent);

    let snappedEdgeCount = 0;
    for (const box of boxes) {
      const u0 = snapU(box.uMin); const u1 = snapU(box.uMax);
      const v0 = snapV(box.vMin); const v1 = snapV(box.vMax);
      if (u0 !== box.uMin) { box.uMin = u0; snappedEdgeCount += 1; }
      if (u1 !== box.uMax) { box.uMax = u1; snappedEdgeCount += 1; }
      if (v0 !== box.vMin) { box.vMin = v0; snappedEdgeCount += 1; }
      if (v1 !== box.vMax) { box.vMax = v1; snappedEdgeCount += 1; }
    }

    // Major axis snap: attract room edges toward the 2 most-shared U and V positions.
    // minExtent guards inside snapToMajorAxes prevent box collapse — no post-snap check needed.
    // Source: findMajorAxes + snapToMajorAxis — testing/legacy-reference/app/src/app/app.ts lines 5396–5425.
    const { count: majorAxisSnappedEdgeCount, majorU, majorV } = this.snapToMajorAxes(boxes, snapThreshold * majorAxisSnapMultiplier, minExtent);

    // Deficit-driven edge negotiation: edge ordering constraint prevents overlaps by construction.
    const negotiationPasses = this.negotiateEdges(boxes, quad, shiftGain, maxPasses, stableShift);

    // Aspect rescue: boundary search bounds each expansion to neighbor edges — overlap-free by construction.
    const aspectRescueCount = this.rescueAspectRatios(boxes, quad, minExtent, targetAspectRatio, maxAspectPasses);

    // Final overlap resolution pass: catches any residual overlaps introduced by snap, negotiation,
    // or aspect rescue that the pre-snap pass did not see.
    this.resolveUvOverlaps(boxes);

    // Collect final UV edge positions for visual diagnostics.
    const round6 = (v: number) => +v.toFixed(6);
    const finalUValues = [...new Set(boxes.flatMap((b) => [round6(b.uMin), round6(b.uMax)]))].sort((a, b) => a - b);
    const finalVValues = [...new Set(boxes.flatMap((b) => [round6(b.vMin), round6(b.vMax)]))].sort((a, b) => a - b);

    // Back-project final UV boxes to world space.
    let droppedCount = 0;
    const cells: ProvisionalLayoutCell[] = [];

    for (const { cell, uMin, uMax, vMin, vMax } of boxes) {
      const worldPoints = [
        this.bilinearQuadPoint(quad, uMin, vMin),
        this.bilinearQuadPoint(quad, uMax, vMin),
        this.bilinearQuadPoint(quad, uMax, vMax),
        this.bilinearQuadPoint(quad, uMin, vMax),
      ];
      const areaSquareMeters = this.polygonArea(worldPoints);
      if (areaSquareMeters <= 1e-6) {
        droppedCount += 1;
        continue;
      }
      const areaDelta = cell.targetSquareMeters > 1e-6
        ? (areaSquareMeters - cell.targetSquareMeters) / cell.targetSquareMeters
        : 0;
      cells.push({
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

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells,
        quadPoints: quad,
        uvGrid: {
          uValues: finalUValues,
          vValues: finalVValues,
          majorUValues: majorU,
          majorVValues: majorV,
        },
      },
      changed: cells.length > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        outputCellCount: cells.length,
        snappedEdgeCount,
        majorAxisSnappedEdgeCount,
        negotiationPasses,
        aspectRescueCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: cells.length > 0 ? 'info' : 'warn',
          message: cells.length > 0
            ? `UV edge negotiation produced ${cells.length} cells in ${negotiationPasses} passes for ${request.artifact.layoutId}${snappedEdgeCount > 0 ? `, ${snappedEdgeCount} edges clustered` : ''}${majorAxisSnappedEdgeCount > 0 ? `, ${majorAxisSnappedEdgeCount} major-axis snapped` : ''}.`
            : `UV edge negotiation produced no cells for ${request.artifact.layoutId}.`,
        },
        ...(preResolutionOverlapCount > 0 ? [{
          stepId: this.stepId,
          severity: 'warn' as const,
          message: `processing.uv_edge_negotiation: ${preResolutionOverlapCount} overlapping UV box pair(s) detected and resolved before edge clustering for ${request.artifact.layoutId}.`,
        }] : []),
      ],
    };
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

  // Source: findMajorAxes + snapToMajorAxis — testing/legacy-reference/app/src/app/app.ts lines 5396–5425.
  private snapToMajorAxes(
    boxes: Array<{ uMin: number; uMax: number; vMin: number; vMax: number }>,
    threshold: number,
    minExtent: number,
  ): { count: number; majorU: readonly number[]; majorV: readonly number[] } {
    const BOUNDARY_EPS = 0.01;
    let count = 0;

    const findMajorAxes = (edgeVals: number[]): number[] => {
      const freq = new Map<number, number>();
      for (const v of edgeVals) {
        const k = +v.toFixed(6);
        freq.set(k, (freq.get(k) ?? 0) + 1);
      }
      return [...freq.entries()]
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
          box.uMin = axis; count += 1;
        }
        if (Math.abs(box.uMax - axis) < threshold && axis - box.uMin >= minExtent) {
          box.uMax = axis; count += 1;
        }
      }
    }
    for (const axis of majorV) {
      for (const box of boxes) {
        if (Math.abs(box.vMin - axis) < threshold && box.vMax - axis >= minExtent) {
          box.vMin = axis; count += 1;
        }
        if (Math.abs(box.vMax - axis) < threshold && axis - box.vMin >= minExtent) {
          box.vMax = axis; count += 1;
        }
      }
    }

    return { count, majorU, majorV };
  }

  // Source: negotiateEdges in buildClusteredGridCells — testing/legacy-reference/app/src/app/app.ts line 5430.
  private negotiateEdges(
    workBoxes: UvBox[],
    quad: readonly { x: number; y: number }[],
    shiftGain: number,
    maxPasses: number,
    stableShift: number,
  ): number {
    const EPS = 1e-6;

    const deficitOf = (box: UvBox) => {
      const target = box.cell.targetSquareMeters;
      if (target <= 0) return 0;
      return Math.max(0, target - this.worldArea(box.uMin, box.uMax, box.vMin, box.vMax, quad)) / target;
    };

    const negotiateAxis = (
      getMin: (b: UvBox) => number,
      getMax: (b: UvBox) => number,
      setMin: (b: UvBox, v: number) => void,
      setMax: (b: UvBox, v: number) => void,
    ): number => {
      const edgeByPos = [...new Set(workBoxes.flatMap((b) => [+getMin(b).toFixed(8), +getMax(b).toFixed(8)]))].sort((a, b) => a - b);

      const entries = edgeByPos
        .map((u, posIdx) => {
          if (u < EPS || u > 1 - EPS) return null;
          const left = workBoxes.filter((b) => Math.abs(getMax(b) - u) < EPS);
          const right = workBoxes.filter((b) => Math.abs(getMin(b) - u) < EPS);
          if (!left.length || !right.length) return null;
          const dL = left.reduce((s, b) => s + deficitOf(b), 0) / left.length;
          const dR = right.reduce((s, b) => s + deficitOf(b), 0) / right.length;
          return { posIdx, left, right, dL, dR };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => Math.max(b.dL, b.dR) - Math.max(a.dL, a.dR));

      let maxShift = 0;
      for (const { posIdx, left, right, dL, dR } of entries) {
        const u = edgeByPos[posIdx];
        let shift = (dL - dR) * shiftGain;
        if (Math.abs(shift) < EPS) continue;

        const prevEdge = posIdx > 0 ? edgeByPos[posIdx - 1] : 0;
        const nextEdge = posIdx < edgeByPos.length - 1 ? edgeByPos[posIdx + 1] : 1;
        shift = Math.max(shift, prevEdge + EPS - u);
        shift = Math.min(shift, nextEdge - EPS - u);

        if (Math.abs(shift) < EPS) continue;
        maxShift = Math.max(maxShift, Math.abs(shift));
        edgeByPos[posIdx] = u + shift;
        left.forEach((b) => setMax(b, getMax(b) + shift));
        right.forEach((b) => setMin(b, getMin(b) + shift));
      }
      return maxShift;
    };

    let pass = 0;
    for (; pass < maxPasses; pass += 1) {
      const mu = negotiateAxis(
        (b) => b.uMin, (b) => b.uMax,
        (b, v) => { b.uMin = v; }, (b, v) => { b.uMax = v; },
      );
      const mv = negotiateAxis(
        (b) => b.vMin, (b) => b.vMax,
        (b, v) => { b.vMin = v; }, (b, v) => { b.vMax = v; },
      );
      if (Math.max(mu, mv) < stableShift) break;
    }
    return pass;
  }

  // Source: rescueClusteredAspectRatios — testing/legacy-reference/app/src/app/app.ts line 5736.
  private rescueAspectRatios(
    boxes: UvBox[],
    quad: readonly { x: number; y: number }[],
    minExtent: number,
    targetRatio: number,
    maxPasses: number,
  ): number {
    const OVERLAP_EPS = 1e-5;
    let totalRescued = 0;

    const worldAspect = (box: UvBox) => {
      const points = [
        this.bilinearQuadPoint(quad, box.uMin, box.vMin),
        this.bilinearQuadPoint(quad, box.uMax, box.vMin),
        this.bilinearQuadPoint(quad, box.uMax, box.vMax),
        this.bilinearQuadPoint(quad, box.uMin, box.vMax),
      ];
      const w = (Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) + Math.hypot(points[2].x - points[3].x, points[2].y - points[3].y)) / 2;
      const h = (Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y) + Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y)) / 2;
      if (Math.min(w, h) < 1e-6) return 1;
      return Math.max(w, h) / Math.min(w, h);
    };

    const overlapsOnV = (a: UvBox, b: UvBox) => Math.min(a.vMax, b.vMax) - Math.max(a.vMin, b.vMin) > OVERLAP_EPS;
    const overlapsOnU = (a: UvBox, b: UvBox) => Math.min(a.uMax, b.uMax) - Math.max(a.uMin, b.uMin) > OVERLAP_EPS;

    for (let pass = 0; pass < maxPasses; pass += 1) {
      let changed = false;
      const candidates = boxes
        .map((box) => ({ box, aspect: worldAspect(box) }))
        .filter((entry) => entry.aspect > targetRatio)
        .sort((a, b) => b.aspect - a.aspect);

      if (!candidates.length) break;

      for (const { box } of candidates) {
        const width = box.uMax - box.uMin;
        const height = box.vMax - box.vMin;
        const widenU = width < height;

        if (widenU) {
          const leftBound = boxes.reduce((best, other) => {
            if (other === box || !overlapsOnV(box, other) || other.uMax > box.uMin + OVERLAP_EPS) return best;
            return Math.max(best, other.uMax);
          }, 0);
          const rightBound = boxes.reduce((best, other) => {
            if (other === box || !overlapsOnV(box, other) || other.uMin < box.uMax - OVERLAP_EPS) return best;
            return Math.min(best, other.uMin);
          }, 1);

          const growLeft = Math.max(0, box.uMin - leftBound);
          const growRight = Math.max(0, rightBound - box.uMax);
          if (growLeft <= OVERLAP_EPS && growRight <= OVERLAP_EPS) continue;

          if (growLeft >= growRight && growLeft > OVERLAP_EPS) {
            box.uMin = Math.max(0, leftBound); changed = true;
          } else if (growRight > OVERLAP_EPS) {
            box.uMax = Math.min(1, rightBound); changed = true;
          }
        } else {
          const bottomBound = boxes.reduce((best, other) => {
            if (other === box || !overlapsOnU(box, other) || other.vMax > box.vMin + OVERLAP_EPS) return best;
            return Math.max(best, other.vMax);
          }, 0);
          const topBound = boxes.reduce((best, other) => {
            if (other === box || !overlapsOnU(box, other) || other.vMin < box.vMax - OVERLAP_EPS) return best;
            return Math.min(best, other.vMin);
          }, 1);

          const growBottom = Math.max(0, box.vMin - bottomBound);
          const growTop = Math.max(0, topBound - box.vMax);
          if (growBottom <= OVERLAP_EPS && growTop <= OVERLAP_EPS) continue;

          if (growBottom >= growTop && growBottom > OVERLAP_EPS) {
            box.vMin = Math.max(0, bottomBound); changed = true;
          } else if (growTop > OVERLAP_EPS) {
            box.vMax = Math.min(1, topBound); changed = true;
          }
        }

        if (box.uMax - box.uMin < minExtent || box.vMax - box.vMin < minExtent) continue;
        totalRescued += 1;
      }

      if (!changed) break;
    }

    return totalRescued;
  }

  private worldArea(uMin: number, uMax: number, vMin: number, vMax: number, quad: readonly { x: number; y: number }[]): number {
    return this.polygonArea([
      this.bilinearQuadPoint(quad, uMin, vMin),
      this.bilinearQuadPoint(quad, uMax, vMin),
      this.bilinearQuadPoint(quad, uMax, vMax),
      this.bilinearQuadPoint(quad, uMin, vMax),
    ]);
  }

  private polygonArea(points: readonly GeometryPoint[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  private bilinearQuadPoint(quad: readonly { x: number; y: number }[], u: number, v: number): GeometryPoint {
    const [p0, p1, p2, p3] = quad;
    return {
      x: (1 - u) * (1 - v) * p0.x + u * (1 - v) * p1.x + u * v * p2.x + (1 - u) * v * p3.x,
      y: (1 - u) * (1 - v) * p0.y + u * (1 - v) * p1.y + u * v * p2.y + (1 - u) * v * p3.y,
    };
  }

  // Source: inverseWarpedGrid — testing/legacy-reference/app/src/app/app.ts line 5160.
  private inverseWarpedGrid(world: GeometryPoint, quad: readonly { x: number; y: number }[]): { u: number; v: number } {
    let u = 0.5;
    let v = 0.5;
    for (let iter = 0; iter < 10; iter += 1) {
      const p = this.bilinearQuadPoint(quad, u, v);
      const [p0, p1, p2, p3] = quad;
      const dPdu = { x: (1 - v) * (p1.x - p0.x) + v * (p2.x - p3.x), y: (1 - v) * (p1.y - p0.y) + v * (p2.y - p3.y) };
      const dPdv = { x: (1 - u) * (p3.x - p0.x) + u * (p2.x - p1.x), y: (1 - u) * (p3.y - p0.y) + u * (p2.y - p1.y) };
      const rx = world.x - p.x; const ry = world.y - p.y;
      const det = dPdu.x * dPdv.y - dPdu.y * dPdv.x;
      if (Math.abs(det) < 1e-10) break;
      u = Math.max(0, Math.min(1, u + (dPdv.y * rx - dPdv.x * ry) / det));
      v = Math.max(0, Math.min(1, v + (dPdu.x * ry - dPdu.y * rx) / det));
    }
    return { u, v };
  }
}

