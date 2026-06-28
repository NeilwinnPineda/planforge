import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { MassBalancedLayoutArtifact, WarpedSiteArtifact } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface WarpedSiteProjectionArguments {
  readonly quadPoints: readonly GeometryPoint[];
}

export interface WarpedSiteProjectionMetrics {
  readonly inputCellCount: number;
  readonly projectedSiteCount: number;
  readonly skippedDegenerateCellCount: number;
}

@Injectable({ providedIn: 'root' })
export class WarpedSiteProjectionService {
  readonly stepId = 'processing.warped_site_projection';
  readonly stepLabel = 'Warped site projection';
  readonly stageCategory = 'warped-grid' as const;

  // Slice number: 9A — first step of the real verification-feeding warped pipeline.
  // Stage category: warped-grid projection.
  // Step id: processing.warped_site_projection.
  // Purpose: project each mass-balanced cell centroid into UV space via Newton-Raphson
  // inverse bilinear quad mapping to produce typed Voronoi sites for downstream warped rebalancing.
  // Inputs: mass-balanced layout artifact and a 4-corner buildable quad argument.
  // Outputs: WarpedSiteArtifact carrying UV site list (id, u, v, weight, radiusMeters, targetSquareMeters)
  //   plus the quad for downstream back-projection.
  // Allowed dependencies: mass-balanced cells and explicit quad argument only.
  // Forbidden responsibilities: UV Voronoi generation, weight rebalancing, world back-projection,
  //   residual absorption, edge negotiation, and final staging.
  // Legacy source: buildPanel2WarpedSites in testing/app/src/app/app.ts (line 2948).
  run(
    request: LayoutProcessingStepRequest<MassBalancedLayoutArtifact, WarpedSiteProjectionArguments>,
  ): LayoutProcessingStepResult<WarpedSiteArtifact, WarpedSiteProjectionMetrics> {
    const quad = request.arguments.quadPoints.map((p) => ({ x: p.x, y: p.y }));

    if (quad.length !== 4) {
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
          inputCellCount: request.artifact.cells.length,
          projectedSiteCount: 0,
          skippedDegenerateCellCount: 0,
        },
        traces: [
          {
            stepId: this.stepId,
            severity: 'warn',
            message: `Warped site projection skipped for ${request.artifact.layoutId}; buildable quad must have exactly 4 corners, got ${quad.length}.`,
          },
        ],
      };
    }

    let skippedDegenerateCellCount = 0;

    const sites = request.artifact.cells
      .filter((cell) => {
        if (cell.worldPoints.length < 3) {
          skippedDegenerateCellCount += 1;
          return false;
        }
        return true;
      })
      .map((cell) => {
        const centroid = this.polygonCentroid(cell.worldPoints);
        const uv = this.inverseWarpedGrid(centroid, quad);
        const radiusMeters = Math.sqrt(Math.max(cell.targetSquareMeters, 0.05) / Math.PI);
        return {
          id: cell.id,
          typeId: cell.typeId,
          label: cell.label,
          color: cell.color,
          tags: [...cell.tags],
          pkg: cell.pkg,
          hallway: cell.hallway,
          u: uv.u,
          v: uv.v,
          radiusMeters,
          targetSquareMeters: cell.targetSquareMeters,
          weight: cell.mass,
        };
      });

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        sites,
        quadPoints: quad,
      },
      changed: sites.length > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        projectedSiteCount: sites.length,
        skippedDegenerateCellCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: sites.length > 0 ? 'info' : 'warn',
          message: sites.length > 0
            ? `Warped site projection mapped ${sites.length} cells to UV space for ${request.artifact.layoutId}.`
            : `Warped site projection produced no UV sites for ${request.artifact.layoutId}.`,
        },
      ],
    };
  }

  private polygonCentroid(points: readonly GeometryPoint[]): GeometryPoint {
    const n = points.length;
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / n,
      y: points.reduce((sum, p) => sum + p.y, 0) / n,
    };
  }

  // Newton-Raphson inverse bilinear quad map: world → (u, v).
  // Source: inverseWarpedGrid in testing/app/src/app/app.ts (line 5160).
  private inverseWarpedGrid(
    world: GeometryPoint,
    quad: readonly { x: number; y: number }[],
  ): { u: number; v: number } {
    const [p0, p1, p2, p3] = quad;
    let u = 0.5;
    let v = 0.5;

    for (let iter = 0; iter < 10; iter += 1) {
      const p = this.bilinearQuadPoint(quad, u, v);
      const dPdu = {
        x: (1 - v) * (p1.x - p0.x) + v * (p2.x - p3.x),
        y: (1 - v) * (p1.y - p0.y) + v * (p2.y - p3.y),
      };
      const dPdv = {
        x: (1 - u) * (p3.x - p0.x) + u * (p2.x - p1.x),
        y: (1 - u) * (p3.y - p0.y) + u * (p2.y - p1.y),
      };
      const rx = world.x - p.x;
      const ry = world.y - p.y;
      const det = dPdu.x * dPdv.y - dPdu.y * dPdv.x;
      if (Math.abs(det) < 1e-10) {
        break;
      }
      u = Math.max(0, Math.min(1, u + (dPdv.y * rx - dPdv.x * ry) / det));
      v = Math.max(0, Math.min(1, v + (dPdu.x * ry - dPdu.y * rx) / det));
    }

    return { u, v };
  }

  private bilinearQuadPoint(
    quad: readonly { x: number; y: number }[],
    u: number,
    v: number,
  ): GeometryPoint {
    const [p0, p1, p2, p3] = quad;
    return {
      x: (1 - u) * (1 - v) * p0.x + u * (1 - v) * p1.x + u * v * p2.x + (1 - u) * v * p3.x,
      y: (1 - u) * (1 - v) * p0.y + u * (1 - v) * p1.y + u * v * p2.y + (1 - u) * v * p3.y,
    };
  }
}
