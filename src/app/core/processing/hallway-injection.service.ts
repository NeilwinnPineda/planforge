import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { RoomTag } from '../source/source.exports';
import type { HallwayInjectedLayoutArtifact, ProvisionalCellLayoutArtifact, ProvisionalLayoutCell } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface HallwayInjectionArguments {
  readonly buildablePoints: readonly GeometryPoint[];
  readonly hallwayTargetSquareMeters: number;
  readonly spacingMultiplier: number;
  readonly minHallwayAreaSquareMeters: number;
  readonly rebalanceIterations: number;
  readonly rebalanceGain: number;
  readonly roomDriftGain: number;
  readonly hallwayDriftGain: number;
  readonly stableDeviation: number;
  readonly stableRunsRequired: number;
}

export interface HallwayInjectionMetrics {
  readonly inputCellCount: number;
  readonly hallwaySiteCount: number;
  readonly outputCellCount: number;
  readonly droppedHallwayCellCount: number;
}

interface ProcessingSite {
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
export class HallwayInjectionService {
  readonly stepId = 'processing.hallway_injection';
  readonly stepLabel = 'Hallway injection';
  readonly stageCategory = 'refinement' as const;
  private readonly polygonEpsilon = 0.000001;

  // Slice number: next seam after Slice 8A.
  // Stage category: refinement within downstream layout processing.
  // Step id: processing.hallway_injection.
  // Purpose: inject provisional hallway sites and regenerate cells so early circulation space becomes explicit downstream geometry.
  // Inputs: provisional cell artifact plus explicit hallway sampling and rebalance arguments.
  // Outputs: hallway-injected cell artifact with metrics and traces.
  // Allowed dependencies: provisional cells, explicit arguments, and local deterministic geometry helpers only.
  // Forbidden responsibilities: access-graph verification, gap absorption, fringe exchange, simplification, final ranking, and view projection.
  run(
    request: LayoutProcessingStepRequest<ProvisionalCellLayoutArtifact, HallwayInjectionArguments>,
  ): LayoutProcessingStepResult<HallwayInjectedLayoutArtifact, HallwayInjectionMetrics> {
    const polygon = request.arguments.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
    const roomSites = request.artifact.cells.map((cell) => this.buildSiteFromCell(cell));
    const hallwaySites = this.buildHallwaySites(roomSites, request.arguments);

    if (!hallwaySites.length) {
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
          hallwaySiteCount: 0,
          outputCellCount: request.artifact.cells.length,
          droppedHallwayCellCount: 0,
        },
        traces: [
          {
            stepId: this.stepId,
            severity: 'warn',
            message: `No hallway targets were found for ${request.artifact.layoutId}; hallway injection was skipped.`,
          },
        ],
      };
    }

    const allSites = [...roomSites, ...hallwaySites];
    const adjustableSites = allSites.filter((site) => !site.pkg);

    const computeCells = () => allSites.map((site, siteIndex) => {
      let cell = [...polygon];
      allSites.forEach((otherSite, otherIndex) => {
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
        );
      });

      return { site, cell: this.removeDuplicatePolygonPoints(cell) };
    }).filter(({ cell }) => cell.length >= 3);

    let stableRuns = 0;
    for (let iteration = 0; iteration < request.arguments.rebalanceIterations; iteration += 1) {
      const cells = computeCells();
      const oldTotalWeight = adjustableSites.reduce((total, site) => total + site.weight, 0);
      let maxDeviation = 0;

      cells.forEach(({ site, cell }) => {
        if (site.pkg || site.targetSquareMeters <= 0) {
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

      const newTotalWeight = adjustableSites.reduce((total, site) => total + site.weight, 0);
      if (oldTotalWeight > 0 && newTotalWeight > 0) {
        const normalization = oldTotalWeight / newTotalWeight;
        adjustableSites.forEach((site) => {
          site.weight = Math.max(0.01, site.weight * normalization);
        });
      }

      stableRuns = maxDeviation < request.arguments.stableDeviation ? stableRuns + 1 : 0;
      if (stableRuns >= request.arguments.stableRunsRequired) {
        break;
      }
    }

    let droppedHallwayCellCount = 0;
    const cells = computeCells().flatMap(({ site, cell }) => {
      const areaSquareMeters = this.polygonArea(cell);
      if (site.hallway && areaSquareMeters < request.arguments.minHallwayAreaSquareMeters) {
        droppedHallwayCellCount += 1;
        return [];
      }

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
      changed: hallwaySites.length > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        hallwaySiteCount: hallwaySites.length,
        outputCellCount: cells.length,
        droppedHallwayCellCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: 'info',
          message: `Injected ${hallwaySites.length} hallway sites and regenerated ${cells.length} cells for ${request.artifact.layoutId}.`,
        },
        {
          stepId: this.stepId,
          severity: 'warn',
          message: 'This rebuild step currently uses direct-path hallway seeding from foyer to sleeping targets until the legacy access-graph path sampler is migrated.',
        },
      ],
    };
  }

  private buildSiteFromCell(cell: ProvisionalLayoutCell): ProcessingSite {
    const centroid = this.polygonCenter(cell.worldPoints);
    return {
      id: cell.id,
      typeId: cell.typeId,
      label: cell.label,
      color: cell.color,
      tags: cell.tags,
      pkg: cell.pkg,
      hallway: cell.hallway,
      x: centroid.x,
      y: centroid.y,
      targetSquareMeters: cell.targetSquareMeters,
      weight: Math.max(0.01, cell.mass),
    };
  }

  private buildHallwaySites(
    roomSites: readonly ProcessingSite[],
    argumentsBag: HallwayInjectionArguments,
  ): ProcessingSite[] {
    const foyerSite = roomSites.find((site) => site.typeId === 'foyer');
    const targets = roomSites.filter((site) =>
      !site.pkg
      && !site.hallway
      && site.id !== foyerSite?.id
      && site.tags.includes('sleeping'),
    );

    if (!foyerSite || !targets.length) {
      return [];
    }

    const hallwayRadius = Math.sqrt(argumentsBag.hallwayTargetSquareMeters / Math.PI);
    const spacing = hallwayRadius * argumentsBag.spacingMultiplier;
    const minDistanceSquared = spacing * spacing;
    const hallwaySites: ProcessingSite[] = [];
    let index = 0;

    const tooClose = (x: number, y: number) =>
      hallwaySites.some((site) => (site.x - x) ** 2 + (site.y - y) ** 2 < minDistanceSquared);

    targets.forEach((target) => {
      const pathPoints = [foyerSite, target];
      let carry = 0;

      for (let pointIndex = 0; pointIndex < pathPoints.length - 1; pointIndex += 1) {
        const start = pathPoints[pointIndex];
        const end = pathPoints[pointIndex + 1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const segmentLength = Math.hypot(dx, dy);
        if (segmentLength < this.polygonEpsilon) {
          continue;
        }

        let distance = carry;
        while (distance <= segmentLength) {
          const t = distance / segmentLength;
          const x = start.x + dx * t;
          const y = start.y + dy * t;

          if (!tooClose(x, y)) {
            hallwaySites.push({
              id: `generated_hallway_${index + 1}`,
              typeId: 'generated_hallway',
              label: 'Hall',
              color: '#d4d0c0',
              tags: ['open_access'],
              pkg: false,
              hallway: true,
              x,
              y,
              targetSquareMeters: argumentsBag.hallwayTargetSquareMeters,
              weight: hallwayRadius * hallwayRadius,
            });
            index += 1;
          }

          distance += spacing;
        }

        carry = distance - segmentLength;
      }
    });

    return hallwaySites;
  }

  private buildCell(site: ProcessingSite, cell: readonly GeometryPoint[], areaSquareMeters: number): ProvisionalLayoutCell {
    return {
      id: site.id,
      typeId: site.hallway ? 'generated_hallway' : site.typeId,
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
  ): GeometryPoint[] {
    if (poly.length < 3) {
      return [...poly];
    }

    const dx = bx - ax;
    const dy = by - ay;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < 1e-10) {
      return [...poly];
    }

    const t = Math.max(0.15, Math.min(0.85, 0.5 + (weightA - weightB) / (2 * distanceSquared)));
    const midpointX = ax + t * dx;
    const midpointY = ay + t * dy;
    let lineNormalX = dx;
    let lineNormalY = dy;
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
