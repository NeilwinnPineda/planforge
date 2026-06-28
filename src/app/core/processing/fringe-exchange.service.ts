import { Injectable } from '@angular/core';
import type { GeometryPoint } from '../geometry/geometry.exports';
import type { FringeExchangedLayoutArtifact, GapAbsorbedLayoutArtifact, ProvisionalLayoutCell } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface FringeExchangeArguments {
  readonly maxTransfers: number;
}

export interface FringeExchangeMetrics {
  readonly inputCellCount: number;
  readonly outputCellCount: number;
  readonly acceptedTransferCount: number;
}

@Injectable({ providedIn: 'root' })
export class FringeExchangeService {
  readonly stepId = 'processing.fringe_exchange';
  readonly stepLabel = 'Fringe exchange';
  readonly stageCategory = 'cleanup' as const;
  private readonly epsilon = 0.000001;

  // Slice number: final-output continuation seam after gap absorption.
  // Stage category: cleanup within downstream layout processing.
  // Step id: processing.fringe_exchange.
  // Purpose: reassign absorbed fringe pieces toward more deficient neighboring owners so the
  // downstream chain gains a real geometry-changing ownership swap checkpoint.
  // Inputs: gap-absorption artifact and explicit transfer budget arguments.
  // Outputs: a fringe-exchange artifact with reassigned absorbed pieces and traces.
  // Allowed dependencies: gap-absorption artifact and local deterministic geometry helpers only.
  // Forbidden responsibilities: simplification, final staging, verification, and page projection.
  run(
    request: LayoutProcessingStepRequest<GapAbsorbedLayoutArtifact, FringeExchangeArguments>,
  ): LayoutProcessingStepResult<FringeExchangedLayoutArtifact, FringeExchangeMetrics> {
    const sourceCells = request.artifact.cells.map((cell) => ({
      ...cell,
      worldPoints: cell.worldPoints.map((point) => ({ x: point.x, y: point.y })),
      tags: [...cell.tags],
    }));
    const baseCells = sourceCells.filter((cell) => !cell.id.includes('__gap__'));
    const gapCells = sourceCells.filter((cell) => cell.id.includes('__gap__'));
    const groupedAreaByOwner = new Map<string, number>();
    sourceCells.forEach((cell) => {
      const ownerKey = this.getOwnerKey(cell.id);
      groupedAreaByOwner.set(ownerKey, (groupedAreaByOwner.get(ownerKey) ?? 0) + cell.areaSquareMeters);
    });

    const ownerLookup = new Map(baseCells.map((cell) => [cell.id, cell]));
    const transferredGapIds = new Set<string>();
    let acceptedTransferCount = 0;

    // Block behavior:
    // Input: absorbed fringe/gap pieces and the current owner area totals.
    // Output: reassigned gap pieces when a neighboring owner is more deficient than the current one.
    const updatedGapCells = gapCells.map((gapCell) => {
      if (acceptedTransferCount >= request.arguments.maxTransfers) {
        return gapCell;
      }

      const currentOwnerKey = this.getOwnerKey(gapCell.id);
      const currentOwner = ownerLookup.get(currentOwnerKey);
      if (!currentOwner || currentOwner.pkg || currentOwner.hallway) {
        return gapCell;
      }

      const neighboringOwners = baseCells.filter((cell) =>
        cell.id !== currentOwner.id
        && !cell.pkg
        && !cell.hallway
        && this.polygonsTouch(gapCell.worldPoints, cell.worldPoints, 0.02),
      );
      if (!neighboringOwners.length) {
        return gapCell;
      }

      const currentDeficiency = this.computeOwnerDeficiency(currentOwner, groupedAreaByOwner.get(currentOwner.id) ?? currentOwner.areaSquareMeters);
      const betterOwner = neighboringOwners
        .map((owner) => ({
          owner,
          deficiency: this.computeOwnerDeficiency(owner, groupedAreaByOwner.get(owner.id) ?? owner.areaSquareMeters),
        }))
        .filter(({ deficiency }) => deficiency > currentDeficiency + 0.05)
        .sort((left, right) => right.deficiency - left.deficiency)[0];

      if (!betterOwner) {
        return gapCell;
      }

      groupedAreaByOwner.set(currentOwner.id, Math.max(0, (groupedAreaByOwner.get(currentOwner.id) ?? 0) - gapCell.areaSquareMeters));
      groupedAreaByOwner.set(betterOwner.owner.id, (groupedAreaByOwner.get(betterOwner.owner.id) ?? 0) + gapCell.areaSquareMeters);
      transferredGapIds.add(gapCell.id);
      acceptedTransferCount += 1;

      return this.rebuildGapCellForOwner(gapCell, betterOwner.owner, acceptedTransferCount);
    });

    const cells = [...baseCells, ...updatedGapCells];

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells,
      },
      changed: acceptedTransferCount > 0,
      metrics: {
        inputCellCount: request.artifact.cells.length,
        outputCellCount: cells.length,
        acceptedTransferCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: acceptedTransferCount > 0 ? 'info' : 'warn',
          message: acceptedTransferCount > 0
            ? `Fringe exchange reassigned ${acceptedTransferCount} absorbed pieces for ${request.artifact.layoutId}.`
            : `Fringe exchange found no better neighboring owner swaps for ${request.artifact.layoutId}.`,
        },
      ],
    };
  }

  private rebuildGapCellForOwner(gapCell: ProvisionalLayoutCell, owner: ProvisionalLayoutCell, transferIndex: number): ProvisionalLayoutCell {
    return {
      id: `${owner.id}__gap__xfr__${transferIndex}`,
      typeId: owner.typeId,
      label: owner.label,
      color: owner.color,
      tags: [...owner.tags],
      pkg: owner.pkg,
      hallway: owner.hallway,
      worldPoints: gapCell.worldPoints.map((point) => ({ x: point.x, y: point.y })),
      areaSquareMeters: gapCell.areaSquareMeters,
      targetSquareMeters: 0,
      areaDelta: 0,
      mass: owner.mass,
    };
  }

  private getOwnerKey(cellId: string): string {
    const markerIndex = cellId.indexOf('__gap__');
    return markerIndex >= 0 ? cellId.slice(0, markerIndex) : cellId;
  }

  private computeOwnerDeficiency(owner: ProvisionalLayoutCell, ownedAreaSquareMeters: number): number {
    return owner.targetSquareMeters > this.epsilon
      ? Math.max(0, owner.targetSquareMeters - ownedAreaSquareMeters) / owner.targetSquareMeters
      : 0;
  }

  private polygonsTouch(left: readonly GeometryPoint[], right: readonly GeometryPoint[], epsilon: number): boolean {
    if (left.some((point) => this.isPointInsideOrOnPolygon(point, right)) || right.some((point) => this.isPointInsideOrOnPolygon(point, left))) {
      return true;
    }

    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
      const leftStart = left[leftIndex];
      const leftEnd = left[(leftIndex + 1) % left.length];
      for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
        const rightStart = right[rightIndex];
        const rightEnd = right[(rightIndex + 1) % right.length];
        if (this.segmentsTouch(leftStart, leftEnd, rightStart, rightEnd, epsilon)) {
          return true;
        }
      }
    }

    return false;
  }

  private segmentsTouch(aStart: GeometryPoint, aEnd: GeometryPoint, bStart: GeometryPoint, bEnd: GeometryPoint, epsilon: number): boolean {
    return this.isPointOnSegment(aStart, bStart, bEnd, epsilon)
      || this.isPointOnSegment(aEnd, bStart, bEnd, epsilon)
      || this.isPointOnSegment(bStart, aStart, aEnd, epsilon)
      || this.isPointOnSegment(bEnd, aStart, aEnd, epsilon)
      || this.segmentsIntersect(aStart, aEnd, bStart, bEnd);
  }

  private segmentsIntersect(aStart: GeometryPoint, aEnd: GeometryPoint, bStart: GeometryPoint, bEnd: GeometryPoint): boolean {
    const ccw = (p1: GeometryPoint, p2: GeometryPoint, p3: GeometryPoint) =>
      (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
    return ccw(aStart, bStart, bEnd) !== ccw(aEnd, bStart, bEnd)
      && ccw(aStart, aEnd, bStart) !== ccw(aStart, aEnd, bEnd);
  }

  private isPointInsideOrOnPolygon(point: GeometryPoint, polygon: readonly GeometryPoint[]): boolean {
    return this.isPointOnPolygonBoundary(point, polygon, this.epsilon) || this.pointInPolygon(point.x, point.y, polygon);
  }

  private pointInPolygon(x: number, y: number, polygon: readonly GeometryPoint[]): boolean {
    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
      const current = polygon[index];
      const previous = polygon[previousIndex];
      const intersects = ((current.y > y) !== (previous.y > y))
        && (x < ((previous.x - current.x) * (y - current.y)) / ((previous.y - current.y) || Number.EPSILON) + current.x);
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  private isPointOnPolygonBoundary(point: GeometryPoint, polygon: readonly GeometryPoint[], epsilon: number): boolean {
    return polygon.some((startPoint, index) => this.isPointOnSegment(point, startPoint, polygon[(index + 1) % polygon.length], epsilon));
  }

  private isPointOnSegment(point: GeometryPoint, startPoint: GeometryPoint, endPoint: GeometryPoint, epsilon: number): boolean {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy);
    if (length <= epsilon) {
      return false;
    }

    const crossDistance = Math.abs(dx * (point.y - startPoint.y) - dy * (point.x - startPoint.x)) / length;
    if (crossDistance > epsilon) {
      return false;
    }

    const dot = (point.x - startPoint.x) * dx + (point.y - startPoint.y) * dy;
    return dot >= -epsilon && dot <= length * length + epsilon;
  }
}
