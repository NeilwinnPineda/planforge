import type { PipelineReport, ReportPolygonArtifact } from './models/pipeline-report.model';
import type { SourceReadSnapshot } from '../source/source.exports';

function buildCategorySummary(polygons: ReportPolygonArtifact[]): Record<string, number> {
  return polygons.reduce<Record<string, number>>((summary, polygon) => {
    summary[polygon.category] = (summary[polygon.category] ?? 0) + 1;
    return summary;
  }, {});
}

function buildMockPolygons(): ReportPolygonArtifact[] {
  return [
    {
      id: 'foyer',
      label: 'Foyer',
      category: 'room',
      color: '#ede3c8',
      vertices: [
        { x: 0, y: 0 },
        { x: 2.2, y: 0 },
        { x: 2.2, y: 1.6 },
        { x: 0, y: 1.6 },
      ],
    },
    {
      id: 'living',
      label: 'Living Room',
      category: 'room',
      color: '#8ecae6',
      vertices: [
        { x: 2.2, y: 0 },
        { x: 6.4, y: 0 },
        { x: 6.4, y: 3.8 },
        { x: 2.2, y: 3.8 },
      ],
    },
    {
      id: 'hall_spine',
      label: 'Hall Spine',
      category: 'circulation',
      color: '#d7e6d1',
      vertices: [
        { x: 1.8, y: 1.4 },
        { x: 2.6, y: 1.4 },
        { x: 2.6, y: 5.6 },
        { x: 1.8, y: 5.6 },
      ],
    },
  ];
}

// Reporting self-test factory.
// Input: the current source snapshot from source intake.
// Output: two early report payloads that mimic simulation capture and layout pass records.
// This block exists to self-test reporting before the rebuilt simulation stage is present.
export function buildReportingSelfTestReports(sourceSnapshot: SourceReadSnapshot): PipelineReport[] {
  const polygons = buildMockPolygons();
  const polygonCount = polygons.length;
  const categories = buildCategorySummary(polygons);
  const validationFindings = sourceSnapshot.validation.messages
    .filter((message) => message.level !== 'pass')
    .map((message) => `${message.scope}: ${message.message}`);

  const sharedFields = {
    runId: `run-${sourceSnapshot.source.meta.id}`,
    outputId: 'layout-self-test-001',
    sourceId: sourceSnapshot.source.meta.id,
    sourceVersion: sourceSnapshot.source.meta.version,
    inputSummary: {
      activeRoomInstances: sourceSnapshot.validation.counts.activeRoomInstances,
      activeRoomTypes: sourceSnapshot.validation.counts.activeRoomTypes,
      frontageSegments: sourceSnapshot.validation.counts.frontageSegments,
    },
    artifactSummary: {
      polygonCount,
      categories,
    },
    artifactContent: {
      polygons,
    },
  } as const;

  return [
    {
      id: 'simulation-capture-layout-self-test-001',
      reportKind: 'simulation-capture',
      lifecycle: 'captured',
      stageId: 'simulation.capture',
      timestamp: new Date().toISOString(),
      validationSummary: {
        status: sourceSnapshot.validation.status,
        findings: validationFindings,
      },
      selectionMetrics: {
        score: 0.74,
        rank: 1,
        reason: 'Self-test capture representing the first inspectable layout candidate.',
      },
      ...sharedFields,
    },
    {
      id: 'layout-pass-layout-self-test-001',
      reportKind: 'layout-pass',
      lifecycle: 'passed',
      stageId: 'selection.pass',
      timestamp: new Date().toISOString(),
      validationSummary: {
        status: 'pass',
        findings: validationFindings.length ? validationFindings : ['Self-test layout accepted for reporting baseline.'],
      },
      selectionMetrics: {
        score: 0.81,
        rank: 1,
        reason: 'Self-test pass record representing an accepted early-stage output.',
      },
      ...sharedFields,
    },
  ];
}
