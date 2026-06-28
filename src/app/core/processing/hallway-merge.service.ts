import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { HallwayMergedLayoutArtifact, ProvisionalLayoutCell, ResidualAbsorbedLayoutArtifact } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface HallwayMergeArguments {
  readonly edgeMatchEpsilon: number;
}

export interface HallwayMergeMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly inputHallwayCount: number;
  readonly outputHallwayCount: number;
  readonly mergedGroupCount: number;
}

@Injectable({ providedIn: 'root' })
export class HallwayMergeService {
  readonly stepId = 'processing.hallway_merge';
  readonly stepLabel = 'Connected hallway merge';
  readonly stageCategory = 'refinement' as const;

  // Purpose: find all hallway cells that share an edge, group them into connected components,
  // and merge each component into a single polygon by removing interior shared edges and
  // tracing the remaining boundary. Room and pkg cells pass through unchanged.
  // Inputs: residual-absorbed cells (rooms + individual hallway rectangles from UV grid + residual fill).
  // Outputs: same rooms, but connected hallway groups replaced by single merged polygons.
  run(
    request: LayoutProcessingStepRequest<ResidualAbsorbedLayoutArtifact, HallwayMergeArguments>,
  ): LayoutProcessingStepResult<HallwayMergedLayoutArtifact, HallwayMergeMetrics> {
    const eps = request.arguments.edgeMatchEpsilon;
    const rooms = request.artifact.cells.filter((c) => !c.hallway);
    const hallways = request.artifact.cells.filter((c) => c.hallway);

    const components = this.findConnectedComponents(hallways, eps);

    const mergedHallways: ProvisionalLayoutCell[] = [];
    let mergedGroupCount = 0;
    let degenerateGroupCount = 0;

    for (const component of components) {
      if (component.length === 1) {
        mergedHallways.push(component[0]);
      } else {
        const merged = this.mergeGroup(component, eps);
        if (merged) {
          mergedHallways.push(merged);
          mergedGroupCount += 1;
        } else {
          degenerateGroupCount += 1;
          mergedHallways.push(...component);
        }
      }
    }

    const cells = [...rooms, ...mergedHallways];

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells,
      },
      changed: mergedGroupCount > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        outputCellCount: cells.length,
        inputHallwayCount: hallways.length,
        outputHallwayCount: mergedHallways.length,
        mergedGroupCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: 'info',
          message: `Hallway merge: ${hallways.length} hallway cells → ${mergedHallways.length} (${mergedGroupCount} groups merged) for ${request.artifact.layoutId}.`,
        },
        ...(degenerateGroupCount > 0 ? [{
          stepId: this.stepId,
          severity: 'warn' as const,
          message: `processing.hallway_merge: ${degenerateGroupCount} hallway group(s) produced a degenerate (holed) polygon and were left as individual cells for ${request.artifact.layoutId}.`,
        }] : []),
      ],
    };
  }

  private findConnectedComponents(
    hallways: readonly ProvisionalLayoutCell[],
    eps: number,
  ): ProvisionalLayoutCell[][] {
    const adj = new Map<number, number[]>();
    for (let i = 0; i < hallways.length; i++) adj.set(i, []);

    for (let i = 0; i < hallways.length; i++) {
      for (let j = i + 1; j < hallways.length; j++) {
        if (this.sharesEdge(hallways[i].worldPoints, hallways[j].worldPoints, eps)) {
          adj.get(i)!.push(j);
          adj.get(j)!.push(i);
        }
      }
    }

    const visited = new Set<number>();
    const components: ProvisionalLayoutCell[][] = [];

    for (let i = 0; i < hallways.length; i++) {
      if (visited.has(i)) continue;
      const group: number[] = [];
      const queue = [i];
      visited.add(i);
      while (queue.length) {
        const curr = queue.shift()!;
        group.push(curr);
        for (const nb of adj.get(curr)!) {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        }
      }
      components.push(group.map((idx) => hallways[idx]));
    }

    return components;
  }

  private sharesEdge(
    a: readonly GeometryPoint[],
    b: readonly GeometryPoint[],
    eps: number,
  ): boolean {
    const near = (p: GeometryPoint, q: GeometryPoint) =>
      Math.abs(p.x - q.x) < eps && Math.abs(p.y - q.y) < eps;

    for (let i = 0; i < a.length; i++) {
      const a0 = a[i]; const a1 = a[(i + 1) % a.length];
      for (let j = 0; j < b.length; j++) {
        const b0 = b[j]; const b1 = b[(j + 1) % b.length];
        // Shared edge: a's edge (a0→a1) is the reverse of b's edge (b0→b1)
        if (near(a0, b1) && near(a1, b0)) return true;
      }
    }
    return false;
  }

  private mergeGroup(cells: ProvisionalLayoutCell[], eps: number): ProvisionalLayoutCell | null {
    // Snap to eps grid so near-identical vertices (within the same tolerance used
    // by sharesEdge) produce the same key, ensuring shared edges cancel correctly.
    const snap = (v: number) => Math.round(v / eps) * eps;
    const vKey = (p: GeometryPoint) => `${snap(p.x)},${snap(p.y)}`;
    const eKey = (f: GeometryPoint, t: GeometryPoint) => `${vKey(f)}|${vKey(t)}`;

    // Collect all directed edges; cancel interior pairs (shared edges appear in opposite directions).
    const forward = new Map<string, { from: GeometryPoint; to: GeometryPoint }>();

    for (const cell of cells) {
      const pts = cell.worldPoints;
      for (let i = 0; i < pts.length; i++) {
        const from = pts[i];
        const to = pts[(i + 1) % pts.length];
        const fk = eKey(from, to);
        const rk = eKey(to, from);

        if (forward.has(rk)) {
          // Reverse already present — both edges are interior; cancel.
          forward.delete(rk);
        } else {
          forward.set(fk, { from, to });
        }
      }
    }

    if (!forward.size) return null;

    // Build fromKey → next edge map for boundary tracing.
    const next = new Map<string, { from: GeometryPoint; to: GeometryPoint }>();
    for (const edge of forward.values()) next.set(vKey(edge.from), edge);

    const startEdge = forward.values().next().value!;
    const polygon: GeometryPoint[] = [];
    let cur = startEdge;

    for (let iter = 0; iter < forward.size + 1; iter++) {
      polygon.push(cur.from);
      const nxt = next.get(vKey(cur.to));
      if (!nxt || vKey(nxt.from) === vKey(startEdge.from)) break;
      cur = nxt;
    }

    if (polygon.length < 3) return null;

    const rep = cells[0];
    const area = this.polygonArea(polygon);
    const totalTarget = cells.reduce((s, c) => s + c.targetSquareMeters, 0);

    return {
      id: `${rep.id}__hallway_merged`,
      typeId: rep.typeId,
      label: rep.label,
      color: rep.color,
      tags: [...rep.tags],
      pkg: false,
      hallway: true,
      worldPoints: polygon,
      areaSquareMeters: area,
      targetSquareMeters: totalTarget,
      areaDelta: totalTarget > 1e-6 ? (area - totalTarget) / totalTarget : 0,
      mass: rep.mass,
    };
  }

  private polygonArea(points: readonly GeometryPoint[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }
}
