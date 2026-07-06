import type { ActiveRoomInstance } from '../generation/generation.exports';
import type { ProjectSettings } from '../source/source.exports';
import type { SimulationBubbleState } from './models/simulation-runner.model';

export interface SimulationMetricRow {
  label: string;
  value: string;
}

export interface SimulationSatRow {
  roomA: string;
  roomB: string;
  value: number;
  score: number;
  mode: 'attraction' | 'repulsion';
}

export interface SimulationSatSummary {
  average: number;
  sampleCount: number;
}

export function buildSimulationLotMetrics(
  bubbles: SimulationBubbleState[],
  buildableArea: number,
  lotArea: number,
  frontageMeters: number,
  averageSideSetback: number,
  allocatedArea: number,
): SimulationMetricRow[] {
  const fillers = bubbles.filter((bubble) => bubble.pkg);
  const hallways = bubbles.filter((bubble) => bubble.hallway);
  const fillerArea = fillers.reduce((total, bubble) => total + bubble.targetAreaSquareMeters, 0);
  const hallwayArea = hallways.reduce((total, bubble) => total + bubble.targetAreaSquareMeters, 0);
  const generatedArea = fillerArea + hallwayArea;
  const freeSpace = Number(Math.max(0, buildableArea - allocatedArea - generatedArea).toFixed(2));

  return [
    { label: 'Lot area', value: `${lotArea.toFixed(2)} sq m` },
    { label: 'Buildable area', value: `${buildableArea.toFixed(2)} sq m` },
    { label: 'Program area', value: `${allocatedArea.toFixed(2)} sq m` },
    { label: 'Generated support area', value: `${generatedArea.toFixed(2)} sq m` },
    { label: 'Unclaimed buildable area', value: `${freeSpace.toFixed(2)} sq m` },
    { label: 'Fillers added', value: `${fillers.length} / ${fillerArea.toFixed(2)} sq m` },
    { label: 'Hallways added', value: `${hallways.length} / ${hallwayArea.toFixed(2)} sq m` },
    { label: 'Street frontage', value: `${frontageMeters.toFixed(2)} m` },
    { label: 'Average non-road setback', value: `${averageSideSetback.toFixed(2)} m` },
  ];
}

export function buildSimulationForceMetrics(sourceSettings: ProjectSettings): SimulationMetricRow[] {
  const forces = sourceSettings.simulation.forces;
  const fillerHallwayMatrix =
    sourceSettings.adjacency.exceptions['filler']?.['hallway']
    ?? sourceSettings.adjacency.generatedTypeDefaults['hallway']
    ?? sourceSettings.adjacency.defaultScore;

  return [
    { label: 'Base attraction', value: forces.baseAttractionForce.toFixed(3) },
    { label: 'Base repulsion', value: forces.baseRepulsionForce.toFixed(3) },
    { label: 'Front edge modifier', value: forces.frontEdgeAttractionModifier.toFixed(2) },
    { label: 'Filler edge attraction', value: forces.fillerEdgeAttractionForce.toFixed(3) },
    { label: 'Attraction collision cap', value: `${(forces.attractionCollisionRatioCap * 100).toFixed(0)}%` },
    { label: 'Filler edge cap', value: `${(forces.fillerEdgeCollisionRatioCap * 100).toFixed(0)}%` },
    { label: 'Collision push', value: forces.globalCollisionPush.toFixed(3) },
    { label: 'Filler / hallway matrix', value: fillerHallwayMatrix.toFixed(0) },
    { label: 'Matrix neutral score', value: sourceSettings.adjacency.defaultScore.toFixed(0) },
    { label: 'Shake loop', value: `${forces.shakeLoopDurationMs} ms` },
    { label: 'Shake impulse', value: forces.shakeRoomMagnitude.toFixed(3) },
    { label: 'Auto shake interval', value: `${forces.autoShakeIntervalMs} ms` },
    { label: 'SAT reset below', value: `${(forces.satResetThreshold * 100).toFixed(0)}%` },
  ];
}

export function buildSimulationRoomRows(roomInstances: ActiveRoomInstance[]): SimulationMetricRow[] {
  return roomInstances.map((roomInstance) => ({
    label: roomInstance.label,
    value: `${roomInstance.radiusMeters.toFixed(2)} m / ${roomInstance.targetAreaSquareMeters.toFixed(2)} sq m`,
  }));
}

export function computeSimulationSatRows(
  bubbles: SimulationBubbleState[],
  sourceSettings: ProjectSettings,
): { attractionRows: SimulationSatRow[]; repelRows: SimulationSatRow[] } {
  const realBubbles = bubbles.filter((bubble) => bubble.placed && !bubble.pkg && !bubble.hallway);
  const attractionRows: SimulationSatRow[] = [];
  const repelRows: SimulationSatRow[] = [];

  for (let leftIndex = 0; leftIndex < realBubbles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < realBubbles.length; rightIndex += 1) {
      const left = realBubbles[leftIndex];
      const right = realBubbles[rightIndex];
      const scoreValue = getAdjacencyScore(left, right, sourceSettings);
      const distance = Math.hypot(right.x - left.x, right.y - left.y) || 0.0001;

      if (scoreValue >= 4) {
        const target = left.radiusMeters + right.radiusMeters + sourceSettings.simulation.forces.pullLinkGap;
        attractionRows.push({
          roomA: left.label,
          roomB: right.label,
          value: scoreValue,
          score: Number(Math.min(1, target / distance).toFixed(4)),
          mode: 'attraction',
        });
      } else if (scoreValue <= 2) {
        const gapTarget = scoreValue <= 1 ? 1.5 : 0.5;
        const comfort = left.radiusMeters + right.radiusMeters + gapTarget;
        const actualGap = Math.max(0, distance - (left.radiusMeters + right.radiusMeters));
        repelRows.push({
          roomA: left.label,
          roomB: right.label,
          value: scoreValue,
          score: Number(Math.min(1, actualGap / Math.max(0.0001, comfort)).toFixed(4)),
          mode: 'repulsion',
        });
      }
    }
  }

  attractionRows.sort((left, right) => left.score - right.score);
  repelRows.sort((left, right) => left.score - right.score);
  return { attractionRows, repelRows };
}

export function summarizeSatRows(rows: SimulationSatRow[]): SimulationSatSummary {
  if (!rows.length) {
    return { average: 0, sampleCount: 0 };
  }

  const average = rows.reduce((total, row) => total + row.score, 0) / rows.length;
  return {
    average: Number(average.toFixed(4)),
    sampleCount: rows.length,
  };
}

function getAdjacencyScore(
  left: SimulationBubbleState,
  right: SimulationBubbleState,
  sourceSettings: ProjectSettings,
): number {
  return sourceSettings.adjacency.exceptions[left.typeId]?.[right.typeId]
    ?? sourceSettings.adjacency.exceptions[right.typeId]?.[left.typeId]
    ?? (left.typeId === right.typeId ? sourceSettings.adjacency.sameTypeDefault : sourceSettings.adjacency.defaultScore);
}
