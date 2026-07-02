import { Component, computed, effect, inject } from '@angular/core';
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import type { GeometryPoint } from '../../../core/geometry/geometry.exports';
import { LotGeometryService } from '../../../core/geometry/geometry.exports';
import { ProcessingPipelineService } from '../../../core/processing/processing.exports';
import { WorkflowVisualStateService } from '../../../core/processing/workflow-visual-state.service';
import { SimulationStageService } from '../../../core/simulation/simulation.exports';

interface InspectorCell {
  readonly id: string;
  readonly label: string;
  readonly typeId: string;
  readonly color: string;
  readonly polygon: string;
  readonly cx: number;
  readonly cy: number;
  readonly areaSquareMeters: number;
  readonly targetSquareMeters: number;
  readonly areaDelta: number;
  readonly aspectRatio: number;
  readonly deficiencyFail: boolean;
  readonly aspectFail: boolean;
  readonly accessFail: boolean;
  readonly garageFrontageFail: boolean;
  readonly sliverFail: boolean;
  readonly overlapFail: boolean;
  readonly failureStroke: string | null;
  readonly failureTags: string;
}

interface CheckSummary {
  readonly label: string;
  readonly passed: boolean;
  readonly failures: readonly { label: string; detail: string }[];
  readonly strokeColor: string;
}

interface CheckInspectorCell {
  readonly polygon: string;
  readonly color: string;
  readonly cx: number;
  readonly cy: number;
  readonly label: string;
  readonly failing: boolean;
}

interface CheckInspectorPanel {
  readonly label: string;
  readonly passed: boolean;
  readonly strokeColor: string;
  readonly cells: readonly CheckInspectorCell[];
  readonly failures: readonly { readonly label: string; readonly detail: string }[];
}

interface VerificationHighlightRow {
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'app-verification-page',
  standalone: true,
  imports: [NgFor, NgIf, DecimalPipe],
  templateUrl: './verification-page.component.html',
  styleUrl: './verification-page.component.scss',
})
export class VerificationPageComponent {
  private readonly simulationStageService = inject(SimulationStageService);
  private readonly lotGeometryService = inject(LotGeometryService);
  private readonly processingPipelineService = inject(ProcessingPipelineService);
  private readonly workflowVisualStateService = inject(WorkflowVisualStateService);

  private readonly numberFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  constructor() {
    effect(() => {
      const snapshot = this.livePipelineSnapshot();
      if (!snapshot) return;
      void this.processingPipelineService.postVerificationDiagnostic(snapshot);
    });
  }

  protected readonly lotGeometry = this.lotGeometryService.getActiveLotGeometry();
  protected readonly liveCaptureArtifact = computed(() => this.simulationStageService.captureArtifacts()[0] ?? null);
  protected readonly livePipelineSnapshot = computed(() => {
    const artifact = this.liveCaptureArtifact();
    return artifact
      ? this.processingPipelineService.runFromCapture(artifact, 'verification-page checkpoint')
      : null;
  });
  protected readonly pipelineSnapshot = computed(() =>
    this.livePipelineSnapshot() ?? this.workflowVisualStateService.latestRenderableSnapshot(),
  );
  protected readonly activeCaptureArtifact = computed(() =>
    this.liveCaptureArtifact() ?? this.pipelineSnapshot()?.capture ?? null,
  );
  protected readonly verificationResult = computed(() => this.pipelineSnapshot()?.verificationResult ?? null);
  protected readonly stageStatusLabel = computed(() => {
    const vr = this.verificationResult();
    if (!vr) return 'Waiting for verification input';
    return vr.artifact.accepted ? 'Layout passed verification' : 'Layout failed verification';
  });
  protected readonly stageStatusTone = computed<'ready' | 'attention'>(() => {
    const vr = this.verificationResult();
    return vr?.artifact.accepted ? 'ready' : 'attention';
  });
  protected readonly stageSummary = computed(() => {
    const vr = this.verificationResult();
    if (!vr) {
      return 'Verification begins after Processing finishes a cleaned layout that is ready to judge.';
    }
    if (vr.artifact.accepted) {
      return 'This layout passed the current verification checks and can move forward into downstream comparison and construction staging.';
    }
    return 'This layout did not pass verification yet. Use the highlighted layout and failure groups below to see what is blocking it.';
  });
  protected readonly stageNextAction = computed(() => {
    const vr = this.verificationResult();
    if (!vr) {
      return 'Go to Processing first so Verification has a cleaned layout to inspect.';
    }
    if (vr.artifact.accepted) {
      return 'Open Candidate Gallery or Construction Output next to compare and stage this verified layout.';
    }
    return 'Review the highlighted failure categories first, then trace the problem rooms back through Processing or Simulation if needed.';
  });
  protected readonly failedCheckCount = computed(() => this.checkSummaries().filter((summary) => !summary.passed).length);
  protected readonly failedCellCount = computed(() => this.inspectorCells().filter((cell) => Boolean(cell.failureStroke)).length);
  protected readonly highlightRows = computed<readonly VerificationHighlightRow[]>(() => {
    const vr = this.verificationResult();
    return [
      { label: 'Current status', value: this.stageStatusLabel() },
      { label: 'Checks failing', value: String(this.failedCheckCount()) },
      { label: 'Problem rooms', value: String(this.failedCellCount()) },
      { label: 'Cells reviewed', value: vr ? String(vr.artifact.cells.length) : '0' },
    ];
  });
  protected readonly failingCheckSummaries = computed(() => this.checkSummaries().filter((summary) => !summary.passed));
  protected readonly passingCheckSummaries = computed(() => this.checkSummaries().filter((summary) => summary.passed));

  protected readonly checkSummaries = computed<readonly CheckSummary[]>(() => {
    const vr = this.verificationResult();
    if (!vr) return [];
    return [
      { label: 'Deficiency', passed: vr.artifact.deficiencyCheck.passed, failures: vr.artifact.deficiencyCheck.failures.map((f) => ({ label: f.label || f.typeId, detail: f.detail })), strokeColor: '#c0392b' },
      { label: 'Aspect Ratio', passed: vr.artifact.aspectRatioCheck.passed, failures: vr.artifact.aspectRatioCheck.failures.map((f) => ({ label: f.label || f.typeId, detail: f.detail })), strokeColor: '#e67e22' },
      { label: 'Access', passed: vr.artifact.accessCheck.passed, failures: vr.artifact.accessCheck.failures.map((f) => ({ label: f.label || f.typeId, detail: f.detail })), strokeColor: '#8e44ad' },
      { label: 'Critical Touch', passed: vr.artifact.adjacencyCheck.passed, failures: vr.artifact.adjacencyCheck.failures.map((f) => ({ label: f.label, detail: f.detail })), strokeColor: '#2980b9' },
      { label: 'Garage Frontage', passed: vr.artifact.garageFrontageCheck.passed, failures: vr.artifact.garageFrontageCheck.failures.map((f) => ({ label: f.label, detail: f.detail })), strokeColor: '#16a085' },
      { label: 'Slivers', passed: vr.artifact.sliverCheck.passed, failures: vr.artifact.sliverCheck.failures.map((f) => ({ label: f.label || f.typeId, detail: f.detail })), strokeColor: '#f39c12' },
      { label: 'Overlaps', passed: vr.artifact.overlapCheck.passed, failures: vr.artifact.overlapCheck.failures.map((f) => ({ label: f.label, detail: f.detail })), strokeColor: '#922b21' },
    ];
  });

  protected readonly checkInspectorPanels = computed<readonly CheckInspectorPanel[]>(() => {
    const vr = this.verificationResult();
    const cells = this.inspectorCells();
    if (!vr) return [];

    const make = (
      label: string,
      strokeColor: string,
      passed: boolean,
      failIds: Set<string>,
      failures: readonly { label: string; detail: string }[],
    ): CheckInspectorPanel => ({
      label,
      strokeColor,
      passed,
      failures,
      cells: cells.map((c) => ({
        polygon: c.polygon,
        color: c.color,
        cx: c.cx,
        cy: c.cy,
        label: c.label,
        failing: failIds.has(c.id),
      })),
    });

    return [
      make('Deficiency', '#c0392b', vr.artifact.deficiencyCheck.passed,
        new Set(vr.artifact.deficiencyCheck.failures.map((f) => f.cellId)),
        vr.artifact.deficiencyCheck.failures.map((f) => ({ label: f.label || f.typeId, detail: f.detail }))),
      make('Aspect Ratio', '#e67e22', vr.artifact.aspectRatioCheck.passed,
        new Set(vr.artifact.aspectRatioCheck.failures.map((f) => f.cellId)),
        vr.artifact.aspectRatioCheck.failures.map((f) => ({ label: f.label || f.typeId, detail: f.detail }))),
      make('Access', '#8e44ad', vr.artifact.accessCheck.passed,
        new Set(vr.artifact.accessCheck.failures.map((f) => f.cellId)),
        vr.artifact.accessCheck.failures.map((f) => ({ label: f.label || f.typeId, detail: f.detail }))),
      make('Critical Touch', '#2980b9', vr.artifact.adjacencyCheck.passed,
        new Set(vr.artifact.adjacencyCheck.failures.map((f) => f.cellId)),
        vr.artifact.adjacencyCheck.failures.map((f) => ({ label: f.label, detail: f.detail }))),
      make('Garage Frontage', '#16a085', vr.artifact.garageFrontageCheck.passed,
        new Set(vr.artifact.garageFrontageCheck.failures.map((f) => f.cellId)),
        vr.artifact.garageFrontageCheck.failures.map((f) => ({ label: f.label, detail: f.detail }))),
      make('Slivers', '#f39c12', vr.artifact.sliverCheck.passed,
        new Set(vr.artifact.sliverCheck.failures.map((f) => f.cellId)),
        vr.artifact.sliverCheck.failures.map((f) => ({ label: f.label || f.typeId, detail: f.detail }))),
      make('Overlaps', '#922b21', vr.artifact.overlapCheck.passed,
        new Set(vr.artifact.overlapCheck.failures.map((f) => f.cellId)),
        vr.artifact.overlapCheck.failures.map((f) => ({ label: f.label, detail: f.detail }))),
    ];
  });

  protected readonly inspectorCells = computed<readonly InspectorCell[]>(() => {
    const vr = this.verificationResult();
    if (!vr) return [];

    const buildablePoints = this.lotGeometry.buildablePoints.map((p) => ({ x: p.x, y: p.y }));
    const allPoints = [...buildablePoints, ...vr.artifact.cells.flatMap((c) => c.worldPoints)];
    const minX = Math.min(...allPoints.map((p) => p.x));
    const maxX = Math.max(...allPoints.map((p) => p.x));
    const minY = Math.min(...allPoints.map((p) => p.y));
    const maxY = Math.max(...allPoints.map((p) => p.y));
    const padding = 32;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((this.previewWidth - padding * 2) / spanX, (this.previewHeight - padding * 2) / spanY);
    const offsetX = (this.previewWidth - spanX * scale) / 2;
    const offsetY = (this.previewHeight - spanY * scale) / 2;

    const project = (p: GeometryPoint) => ({
      x: Number((offsetX + (p.x - minX) * scale).toFixed(2)),
      y: Number((this.previewHeight - (offsetY + (p.y - minY) * scale)).toFixed(2)),
    });
    const projectPolygon = (pts: readonly GeometryPoint[]) =>
      pts.map((p) => { const q = project(p); return `${q.x},${q.y}`; }).join(' ');

    const deficiencyIds = new Set(vr.artifact.deficiencyCheck.failures.map((f) => f.cellId));
    const aspectIds = new Set(vr.artifact.aspectRatioCheck.failures.map((f) => f.cellId));
    const accessIds = new Set(vr.artifact.accessCheck.failures.map((f) => f.cellId));
    const garageIds = new Set(vr.artifact.garageFrontageCheck.failures.map((f) => f.cellId));
    const sliverIds = new Set(vr.artifact.sliverCheck.failures.map((f) => f.cellId));
    const overlapIds = new Set(vr.artifact.overlapCheck.failures.map((f) => f.cellId));

    return vr.artifact.cells.map((cell) => {
      const pts = cell.worldPoints.map((p) => project(p));
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

      const defFail = deficiencyIds.has(cell.id);
      const aspFail = aspectIds.has(cell.id);
      const accFail = accessIds.has(cell.id);
      const garFail = garageIds.has(cell.id);
      const slvFail = sliverIds.has(cell.id);
      const ovlFail = overlapIds.has(cell.id);

      const failureStroke = defFail ? '#c0392b' : aspFail ? '#e67e22' : accFail ? '#8e44ad' : garFail ? '#16a085' : slvFail ? '#f39c12' : ovlFail ? '#922b21' : null;
      const tags = [defFail ? 'DEF' : '', aspFail ? 'ASP' : '', accFail ? 'ACC' : '', garFail ? 'GAR' : '', slvFail ? 'SLV' : '', ovlFail ? 'OVL' : ''].filter(Boolean).join(' ');

      const minX2 = Math.min(...cell.worldPoints.map((p) => p.x));
      const maxX2 = Math.max(...cell.worldPoints.map((p) => p.x));
      const minY2 = Math.min(...cell.worldPoints.map((p) => p.y));
      const maxY2 = Math.max(...cell.worldPoints.map((p) => p.y));
      const w = maxX2 - minX2; const h = maxY2 - minY2;
      const aspectRatio = Math.min(w, h) > 1e-6 ? Math.max(w, h) / Math.min(w, h) : 1;

      return {
        id: cell.id,
        label: cell.label || cell.typeId,
        typeId: cell.typeId,
        color: cell.color,
        polygon: projectPolygon(cell.worldPoints),
        cx: Number(cx.toFixed(1)),
        cy: Number(cy.toFixed(1)),
        areaSquareMeters: cell.areaSquareMeters,
        targetSquareMeters: cell.targetSquareMeters,
        areaDelta: cell.areaDelta,
        aspectRatio,
        deficiencyFail: defFail,
        aspectFail: aspFail,
        accessFail: accFail,
        garageFrontageFail: garFail,
        sliverFail: slvFail,
        overlapFail: ovlFail,
        failureStroke,
        failureTags: tags,
      };
    });
  });

  protected readonly buildablePolygon = computed(() => {
    const pts = this.lotGeometry.buildablePoints;
    const allPoints = [...pts, ...(this.verificationResult()?.artifact.cells.flatMap((c) => c.worldPoints) ?? [])];
    if (!allPoints.length) return '';
    const minX = Math.min(...allPoints.map((p) => p.x));
    const maxX = Math.max(...allPoints.map((p) => p.x));
    const minY = Math.min(...allPoints.map((p) => p.y));
    const maxY = Math.max(...allPoints.map((p) => p.y));
    const padding = 32;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((this.previewWidth - padding * 2) / spanX, (this.previewHeight - padding * 2) / spanY);
    const offsetX = (this.previewWidth - spanX * scale) / 2;
    const offsetY = (this.previewHeight - spanY * scale) / 2;
    return pts.map((p) => {
      const x = Number((offsetX + (p.x - minX) * scale).toFixed(2));
      const y = Number((this.previewHeight - (offsetY + (p.y - minY) * scale)).toFixed(2));
      return `${x},${y}`;
    }).join(' ');
  });

  protected readonly previewWidth = 860;
  protected readonly previewHeight = 540;

  protected readonly fmt = (n: number) => this.numberFormatter.format(n);
}
