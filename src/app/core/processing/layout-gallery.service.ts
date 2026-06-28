import { Injectable } from '@angular/core';
import { analyzeConstructionExternalWalls } from '../construction/external-wall.factory';
import { LayoutPool } from '../pipeline/layout-pool';
import { DESIGN_SOURCE } from '../source/source-data';
import type { VerifiedLayoutArtifact } from './models/layout-processing-artifact.model';

export interface GalleryScoreBreakdown {
  readonly sourceScore: number;
  readonly areaFit: number;
  readonly hallwayEfficiency: number;
  readonly externalWallPerimeterEfficiency: number;
  readonly externalWallPerimeterMeters: number;
  readonly wallLoopClosure: number;
  readonly roomShapeRegularity: number;
  readonly roomProportionScore: number;
  readonly finalAdjacencyScore: number;
  readonly adjacencyProximity: number;
  readonly areaPerimeterRatio: number;
  readonly verificationCleanliness: number;
}

export interface GalleryEntry {
  readonly artifact: VerifiedLayoutArtifact;
  readonly promotedAtIso: string;
  readonly score: number;
  readonly scoreBreakdown: GalleryScoreBreakdown;
}

@Injectable({ providedIn: 'root' })
export class LayoutGalleryService {
  private readonly pool = new LayoutPool<GalleryEntry>(
    (e) => e.score,
    (e) => e.artifact.layoutId,
    20,
  );
  readonly entries = this.pool.entries;

  promote(artifact: VerifiedLayoutArtifact, sourceScore: number): void {
    const scoreBreakdown = this.scoreArtifact(artifact, sourceScore);
    const score = this.weightedScore(scoreBreakdown);
    this.pool.push({ artifact, promotedAtIso: new Date().toISOString(), score, scoreBreakdown });
  }

  remove(layoutId: string): void {
    this.pool.remove(layoutId);
  }

  clear(): void {
    this.pool.clear();
  }

  private scoreArtifact(artifact: VerifiedLayoutArtifact, sourceScore: number): GalleryScoreBreakdown {
    const realRooms = artifact.cells.filter((cell) => !cell.pkg && !cell.hallway);
    const hallwayArea = artifact.cells
      .filter((cell) => cell.hallway)
      .reduce((sum, cell) => sum + cell.areaSquareMeters, 0);
    const totalArea = artifact.cells.reduce((sum, cell) => sum + cell.areaSquareMeters, 0);

    const areaFit = realRooms.length
      ? realRooms.reduce((sum, cell) => {
          if (cell.targetSquareMeters <= 1e-6) return sum + 1;
          const ratio = cell.areaSquareMeters / cell.targetSquareMeters;
          return sum + Math.min(ratio, 1 / ratio);
        }, 0) / realRooms.length
      : 0;

    const hallwayShare = totalArea > 1e-6 ? hallwayArea / totalArea : 1;
    const hallwayEfficiency = 1 - this.clamp01((hallwayShare - 0.06) / 0.16);

    const externalWallAnalysis = analyzeConstructionExternalWalls(artifact);
    const externalWallPerimeterEfficiency = this.externalWallPerimeterScore(
      externalWallAnalysis.externalWallPerimeterMeters,
      externalWallAnalysis.constructedAreaSquareMeters,
    );
    const wallLoopClosure = externalWallAnalysis.loops.length
      ? externalWallAnalysis.loops.filter((loop) => loop.closed).length / externalWallAnalysis.loops.length
      : 0;
    const roomShapeRegularity = realRooms.length
      ? realRooms.reduce((sum, cell) => sum + this.shapeRegularityScore(cell.worldPoints, cell.areaSquareMeters), 0) / realRooms.length
      : 0;
    const roomProportionScore = realRooms.length
      ? realRooms.reduce((sum, cell) => sum + this.roomProportionScore(cell.worldPoints), 0) / realRooms.length
      : 0;
    const finalAdjacencyScore = artifact.adjacencyCheck.passed
      ? 1
      : this.clamp01(1 - artifact.adjacencyCheck.failures.length / Math.max(1, realRooms.length));
    const adjacencyProximity = this.computeAdjacencyProximity(artifact);

    const checkCount = [
      artifact.deficiencyCheck,
      artifact.aspectRatioCheck,
      artifact.accessCheck,
      artifact.adjacencyCheck,
      artifact.garageFrontageCheck,
      artifact.sliverCheck,
      artifact.overlapCheck,
    ].filter((check) => check.passed).length;
    const verificationCleanliness = checkCount / 7;

    return {
      sourceScore: this.clamp01(sourceScore),
      areaFit: this.clamp01(areaFit),
      hallwayEfficiency: this.clamp01(hallwayEfficiency),
      externalWallPerimeterEfficiency,
      externalWallPerimeterMeters: externalWallAnalysis.externalWallPerimeterMeters,
      wallLoopClosure: this.clamp01(wallLoopClosure),
      roomShapeRegularity: this.clamp01(roomShapeRegularity),
      roomProportionScore: this.clamp01(roomProportionScore),
      finalAdjacencyScore,
      adjacencyProximity,
      areaPerimeterRatio: externalWallAnalysis.areaPerimeterRatio,
      verificationCleanliness,
    };
  }

  private weightedScore(score: GalleryScoreBreakdown): number {
    return Number((
      score.sourceScore                    * 0.08
      + score.areaFit                      * 0.18
      + score.hallwayEfficiency            * 0.07
      + score.externalWallPerimeterEfficiency * 0.11
      + score.roomShapeRegularity          * 0.07
      + score.roomProportionScore          * 0.22  // long rooms hit hard
      + score.finalAdjacencyScore          * 0.10
      + score.adjacencyProximity           * 0.07
      + score.wallLoopClosure              * 0.06
      + score.verificationCleanliness      * 0.04
    ).toFixed(4));
  }

  private externalWallPerimeterScore(perimeter: number, constructedArea: number): number {
    if (perimeter <= 1e-6 || constructedArea <= 1e-6) return 0;
    const idealSquarePerimeter = 4 * Math.sqrt(constructedArea);
    return this.clamp01(idealSquarePerimeter / perimeter);
  }

  private shapeRegularityScore(points: readonly { readonly x: number; readonly y: number }[], area: number): number {
    if (points.length < 3 || area <= 1e-6) return 0;
    let perimeter = 0;
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      perimeter += Math.hypot(point.x - next.x, point.y - next.y);
    });
    if (perimeter <= 1e-6) return 0;
    return this.clamp01((4 * Math.PI * area) / (perimeter * perimeter));
  }

  private roomProportionScore(points: readonly { readonly x: number; readonly y: number }[]): number {
    if (points.length < 3) return 0;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const minSide = Math.min(width, height);
    const maxSide = Math.max(width, height);
    if (minSide <= 1e-6) return 0;
    const aspectRatio = maxSide / minSide;
    // Grace up to 1.8:1, zero at 3.6:1. Long rooms score very low.
    return 1 - this.clamp01((aspectRatio - 1.8) / 1.8);
  }

  private computeAdjacencyProximity(artifact: VerifiedLayoutArtifact): number {
    const maxDistMeters = 5;
    const minScore = 4;

    const centroidByType = new Map<string, { x: number; y: number }>();
    for (const cell of artifact.cells) {
      if (cell.pkg || cell.hallway || centroidByType.has(cell.typeId)) continue;
      centroidByType.set(cell.typeId, this.polygonCentroid(cell.worldPoints));
    }

    const seenPairs = new Set<string>();
    let total = 0;
    let count = 0;

    for (const [typeA, neighbors] of Object.entries(DESIGN_SOURCE.settings.adjacency.exceptions)) {
      for (const [typeB, score] of Object.entries(neighbors)) {
        if ((score as number) < minScore) continue;
        const pairKey = [typeA, typeB].sort().join('|');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const cA = centroidByType.get(typeA);
        const cB = centroidByType.get(typeB);
        if (!cA || !cB) continue;

        const dist = Math.hypot(cB.x - cA.x, cB.y - cA.y);
        total += this.clamp01(1 - dist / maxDistMeters);
        count++;
      }
    }

    return count > 0 ? Number((total / count).toFixed(4)) : 1;
  }

  private polygonCentroid(points: readonly { readonly x: number; readonly y: number }[]): { x: number; y: number } {
    return {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: points.reduce((s, p) => s + p.y, 0) / points.length,
    };
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}
