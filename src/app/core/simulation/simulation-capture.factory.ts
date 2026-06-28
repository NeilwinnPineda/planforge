import type { DeterministicCandidateLayout } from '../generation/generation.exports';
import type { LotGeometryResult, GeometryPoint } from '../geometry/geometry.exports';
import type { PipelineReport, ReportPolygonArtifact } from '../reporting/models/pipeline-report.model';
import type { SourceReadSnapshot } from '../source/source.exports';
import type { ProjectSettings } from '../source/source.exports';
import type {
  LayoutExplorationCaptureArtifact,
  SimulationBubbleState,
  SimulationCapturedLayoutSummary,
  SimulationCaptureOutcome,
  SimulationJobState,
} from './models/simulation-runner.model';
import { computeSimulationSatRows, summarizeSatRows } from './simulation-analysis.factory';

// Slice 7 / Simulation capture gating.
// Stage category: simulation.
// Input: one simulation job, canonical lot geometry, and active source settings.
// Output: a capture evaluation describing skip/fail/pass with threshold updates and metrics.
// Owns: front-edge gating, SAT-threshold gating, and capture-report payload shaping.
// Does not own: long-running timer control, physics stepping, or downstream polygon conversion.

export function evaluateSimulationCandidate(
  job: SimulationJobState,
  lotGeometry: LotGeometryResult,
  sourceSettings: ProjectSettings,
): SimulationCaptureOutcome {
  const realBubbles = job.bubbles.filter((bubble) => bubble.placed && !bubble.pkg && !bubble.hallway);
  const thresholdBefore = job.captureThreshold;

  if (!realBubbles.length) {
    return {
      status: 'skip',
      reason: 'No placed real rooms are available for capture evaluation yet.',
      score: 0,
      thresholdBefore,
      thresholdAfter: thresholdBefore,
      frontEdgePassed: false,
      attractionAverage: 0,
      repelAverage: 0,
      evaluatedAtIso: new Date().toISOString(),
      reportStatus: 'idle',
      reportMessage: null,
    };
  }

  const frontEdgePassed = areFrontFacingRoomsTouchingFrontEdge(realBubbles, lotGeometry, sourceSettings);
  const satRows = computeSimulationSatRows(job.bubbles, sourceSettings);
  const attractionAverage = summarizeSatRows(satRows.attractionRows).average;
  const repelAverage = summarizeSatRows(satRows.repelRows).average;
  const score = weightedAverageSat([...satRows.attractionRows, ...satRows.repelRows]);

  if (!frontEdgePassed) {
    return {
      status: 'fail',
      reason: 'Front-facing rooms are not yet touching the road edge within tolerance.',
      score: Number(score.toFixed(4)),
      thresholdBefore,
      thresholdAfter: thresholdBefore,
      frontEdgePassed,
      attractionAverage,
      repelAverage,
      evaluatedAtIso: new Date().toISOString(),
      reportStatus: 'idle',
      reportMessage: null,
    };
  }

  if (score < thresholdBefore) {
    const nextThreshold = sourceSettings.features.simulation.scoreReset
      ? Math.max(
        sourceSettings.simulation.captureThresholds.min,
        sourceSettings.simulation.captureThresholds.start
          - (job.consecutiveCaptureFails + 1) * sourceSettings.simulation.captureThresholds.step,
      )
      : thresholdBefore;

    return {
      status: 'fail',
      reason: 'Weighted SAT score is still below the current capture threshold.',
      score: Number(score.toFixed(4)),
      thresholdBefore,
      thresholdAfter: Number(nextThreshold.toFixed(4)),
      frontEdgePassed,
      attractionAverage,
      repelAverage,
      evaluatedAtIso: new Date().toISOString(),
      reportStatus: 'idle',
      reportMessage: null,
    };
  }

  return {
    status: 'pass',
    reason: 'Candidate passed front-edge and SAT threshold gates.',
    score: Number(score.toFixed(4)),
    thresholdBefore,
    thresholdAfter: sourceSettings.simulation.captureThresholds.start,
    frontEdgePassed,
    attractionAverage,
    repelAverage,
    evaluatedAtIso: new Date().toISOString(),
    reportStatus: 'pending',
    reportMessage: null,
  };
}

export function applyCaptureOutcomeToJob(
  job: SimulationJobState,
  outcome: SimulationCaptureOutcome,
): SimulationJobState {
  if (outcome.status === 'skip') {
    return {
      ...job,
      lastCaptureOutcome: outcome,
    };
  }

  if (outcome.status === 'fail') {
    return {
      ...job,
      captureThreshold: outcome.thresholdAfter,
      consecutiveCaptureFails: job.consecutiveCaptureFails + 1,
      failedCount: job.failedCount + 1,
      lastCaptureOutcome: outcome,
    };
  }

  return {
    ...job,
    captureThreshold: outcome.thresholdAfter,
    consecutiveCaptureFails: 0,
    capturedCount: job.capturedCount + 1,
    lastCaptureOutcome: outcome,
  };
}

export function buildCapturedLayoutSummary(
  instanceId: string,
  layoutId: string,
  job: SimulationJobState,
  outcome: SimulationCaptureOutcome,
): SimulationCapturedLayoutSummary {
  return {
    id: `${layoutId}::${instanceId}::job-${job.index + 1}::${Date.now()}`,
    layoutId,
    instanceId,
    jobIndex: job.index,
    capturedAtIso: outcome.evaluatedAtIso,
    score: outcome.score,
    attractionAverage: outcome.attractionAverage,
    repelAverage: outcome.repelAverage,
    bubbleCount: job.bubbles.filter((bubble) => bubble.placed).length,
  };
}

export function buildCapturedLayoutArtifact(
  instanceId: string,
  layoutId: string,
  job: SimulationJobState,
  outcome: SimulationCaptureOutcome,
): LayoutExplorationCaptureArtifact {
  return {
    recordId: `${layoutId}::${instanceId}::job-${job.index + 1}::${Date.now()}`,
    layoutId,
    coreId: instanceId,
    runnerIndex: job.index,
    capturedAtIso: outcome.evaluatedAtIso,
    sourceScore: outcome.score,
    attractionAverage: outcome.attractionAverage,
    repelAverage: outcome.repelAverage,
    bubbles: job.bubbles.map((bubble) => ({
      ...bubble,
      tags: [...bubble.tags],
    })),
  };
}

export function buildSimulationCaptureReport(
  instanceId: string,
  layoutId: string,
  sourceSnapshot: SourceReadSnapshot,
  candidateLayout: DeterministicCandidateLayout,
  job: SimulationJobState,
  outcome: SimulationCaptureOutcome,
): PipelineReport {
  const polygons = buildBubbleArtifacts(job.bubbles);

  return {
    id: `simulation-capture-${layoutId}-${instanceId}-job-${job.index + 1}-${Date.now()}`,
    reportKind: 'simulation-capture',
    lifecycle: 'captured',
    runId: `${instanceId}/job-${job.index + 1}`,
    outputId: layoutId,
    stageId: 'simulation.capture',
    timestamp: outcome.evaluatedAtIso,
    sourceId: sourceSnapshot.source.meta.id,
    sourceVersion: sourceSnapshot.source.meta.version,
    inputSummary: {
      activeRoomInstances: sourceSnapshot.validation.counts.activeRoomInstances,
      activeRoomTypes: sourceSnapshot.validation.counts.activeRoomTypes,
      frontageSegments: sourceSnapshot.validation.counts.frontageSegments,
    },
    artifactSummary: {
      polygonCount: polygons.length,
      categories: buildCategorySummary(polygons),
    },
    validationSummary: {
      status: sourceSnapshot.validation.status,
      findings: [
        `Front edge passed: ${outcome.frontEdgePassed ? 'yes' : 'no'}`,
        `Attraction average: ${outcome.attractionAverage.toFixed(4)}`,
        `Repel average: ${outcome.repelAverage.toFixed(4)}`,
      ],
    },
    selectionMetrics: {
      score: outcome.score,
      reason: `${outcome.reason} Seed set: ${candidateLayout.seedSetLabel}.`,
    },
    artifactContent: {
      polygons,
    },
  };
}

function buildBubbleArtifacts(bubbles: SimulationBubbleState[]): ReportPolygonArtifact[] {
  return bubbles
    .filter((bubble) => bubble.placed)
    .map((bubble) => ({
      id: bubble.instanceId,
      label: bubble.label,
      category: bubble.hallway ? 'circulation' : bubble.pkg ? 'boundary' : 'room',
      color: bubble.color,
      vertices: buildBubblePolygonVertices(bubble.x, bubble.y, bubble.radiusMeters),
    }));
}

function buildBubblePolygonVertices(centerX: number, centerY: number, radius: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 8 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 8;
    return {
      x: Number((centerX + Math.cos(angle) * radius).toFixed(4)),
      y: Number((centerY + Math.sin(angle) * radius).toFixed(4)),
    };
  });
}

function buildCategorySummary(polygons: ReportPolygonArtifact[]): Record<string, number> {
  return polygons.reduce<Record<string, number>>((summary, polygon) => {
    summary[polygon.category] = (summary[polygon.category] ?? 0) + 1;
    return summary;
  }, {});
}

function areFrontFacingRoomsTouchingFrontEdge(
  realBubbles: SimulationBubbleState[],
  lotGeometry: LotGeometryResult,
  sourceSettings: ProjectSettings,
): boolean {
  const rrowIndex = lotGeometry.lotSegments.findIndex((segment) => segment.isRrow);

  if (rrowIndex < 0 || lotGeometry.buildablePoints.length < 2) {
    return true;
  }

  const edgeStart = lotGeometry.buildablePoints[rrowIndex];
  const edgeEnd = lotGeometry.buildablePoints[(rrowIndex + 1) % lotGeometry.buildablePoints.length];
  const frontFacingBubbles = realBubbles.filter((bubble) => bubble.tags.includes('front_facing'));

  if (!frontFacingBubbles.length) {
    return true;
  }

  return frontFacingBubbles.every((bubble) => {
    const distance = distanceToSegment(
      { x: bubble.x, y: bubble.y },
      edgeStart,
      edgeEnd,
    );

    return distance <= bubble.radiusMeters * (1 + sourceSettings.simulation.forces.frontEdgeTouchTolerance);
  });
}

function distanceToSegment(point: GeometryPoint, segmentStart: GeometryPoint, segmentEnd: GeometryPoint): number {
  const segmentDx = segmentEnd.x - segmentStart.x;
  const segmentDy = segmentEnd.y - segmentStart.y;
  const segmentLengthSquared = segmentDx * segmentDx + segmentDy * segmentDy;

  if (segmentLengthSquared <= 1e-9) {
    return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segmentStart.x) * segmentDx + (point.y - segmentStart.y) * segmentDy) / segmentLengthSquared,
    ),
  );

  const projectionX = segmentStart.x + t * segmentDx;
  const projectionY = segmentStart.y + t * segmentDy;
  return Math.hypot(point.x - projectionX, point.y - projectionY);
}

function weightedAverageSat(
  rows: Array<{ value: number; score: number }>,
): number {
  if (!rows.length) {
    return 0;
  }

  let weightedScore = 0;
  let totalWeight = 0;

  rows.forEach((row) => {
    const weight = getSatWeight(row.value);
    weightedScore += row.score * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? Number((weightedScore / totalWeight).toFixed(4)) : 0;
}

function getSatWeight(value: number): number {
  if (value === 5 || value === 1) {
    return 4;
  }

  if (value === 4 || value === 2) {
    return 2;
  }

  return 1;
}
