// Early reporting contract for app-next.
// Input: stage-level report data describing simulation capture or layout pass output.
// Output: typed report payloads suitable for endpoint logging and later historical inspection.
// This block owns report structure only. It does not perform HTTP transport or UI presentation.

export type PipelineReportKind = 'simulation-capture' | 'layout-pass';
export type PipelineLifecycle = 'captured' | 'accepted' | 'passed';

export interface ReportPolygonVertex {
  x: number;
  y: number;
}

export interface ReportPolygonArtifact {
  id: string;
  label: string;
  category: 'room' | 'circulation' | 'boundary';
  color: string;
  vertices: ReportPolygonVertex[];
}

export interface PipelineReport {
  id: string;
  reportKind: PipelineReportKind;
  lifecycle: PipelineLifecycle;
  runId: string;
  outputId: string;
  stageId: string;
  timestamp: string;
  sourceId: string;
  sourceVersion: string;
  inputSummary: {
    activeRoomInstances: number;
    activeRoomTypes: number;
    frontageSegments: number;
  };
  artifactSummary: {
    polygonCount: number;
    categories: Record<string, number>;
  };
  validationSummary: {
    status: 'pass' | 'warn' | 'fail';
    findings: string[];
  };
  selectionMetrics: {
    score: number;
    rank?: number;
    reason: string;
  };
  artifactContent: {
    polygons: ReportPolygonArtifact[];
  };
}
