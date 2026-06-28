import { Component, computed, effect, inject } from '@angular/core';
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import type { GeometryPoint } from '../../../core/geometry/geometry.exports';
import { LotGeometryService } from '../../../core/geometry/geometry.exports';
import {
  FinalStagingService,
  HallwayInjectionService,
  HallwayMergeService,
  CanonicalGeometryService,
  LayoutProcessingOrchestratorService,
  MassBalanceRenegotiationService,
  ProvisionalCellGenerationService,
  ResidualUvAbsorptionService,
  UvEdgeNegotiationService,
  VerificationService,
  WarpedDiagnosticStagingService,
  type FinalStagingArguments,
  type HallwayInjectionArguments,
  type HallwayMergeArguments,
  type CanonicalGeometryArguments,
  type MassBalanceRenegotiationArguments,
  type ProvisionalCellGenerationArguments,
  type ResidualUvAbsorptionArguments,
  type UvEdgeNegotiationArguments,
  type VerificationArguments,
  type WarpedDiagnosticStagingArguments,
} from '../../../core/processing/processing.exports';
import { SimulationStageService } from '../../../core/simulation/simulation.exports';
import { SourceReadService } from '../../../core/source/source.exports';
import { ReportingEndpointService } from '../../../core/reporting/reporting-endpoint.service';
import type { PipelineReport } from '../../../core/reporting/models/pipeline-report.model';

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
  private readonly sourceReadService = inject(SourceReadService);
  private readonly provisionalCellGenerationService = inject(ProvisionalCellGenerationService);
  private readonly hallwayInjectionService = inject(HallwayInjectionService);
  private readonly massBalanceRenegotiationService = inject(MassBalanceRenegotiationService);
  private readonly warpedDiagnosticStagingService = inject(WarpedDiagnosticStagingService);
  private readonly uvEdgeNegotiationService = inject(UvEdgeNegotiationService);
  private readonly residualUvAbsorptionService = inject(ResidualUvAbsorptionService);
  private readonly hallwayMergeService = inject(HallwayMergeService);
  private readonly finalStagingService = inject(FinalStagingService);
  private readonly canonicalGeometryService = inject(CanonicalGeometryService);
  private readonly verificationService = inject(VerificationService);
  private readonly processingOrchestratorService = inject(LayoutProcessingOrchestratorService);
  private readonly reportingEndpointService = inject(ReportingEndpointService);

  private readonly numberFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  constructor() {
    effect(() => {
      const vr = this.verificationResult();
      const uvNeg = this.uvEdgeNegotiationResult();
      const residual = this.residualUvAbsorptionResult();
      const merge = this.hallwayMergeResult();
      if (!vr || !uvNeg || !residual || !merge) return;

      const findings: string[] = [
        ...uvNeg.traces.filter((t) => t.severity !== 'info').map((t) => `[${t.stepId}] ${t.message}`),
        ...residual.traces.filter((t) => t.severity !== 'info').map((t) => `[${t.stepId}] ${t.message}`),
        ...merge.traces.filter((t) => t.severity !== 'info').map((t) => `[${t.stepId}] ${t.message}`),
      ];

      const categoryCount = vr.artifact.cells.reduce<Record<string, number>>((acc, c) => {
        const cat = c.hallway ? 'circulation' : c.pkg ? 'boundary' : 'room';
        acc[cat] = (acc[cat] ?? 0) + 1;
        return acc;
      }, {});

      const report: PipelineReport = {
        id: `pipeline-diag-${vr.artifact.layoutId}-${Date.now()}`,
        reportKind: 'layout-pass',
        lifecycle: vr.artifact.accepted ? 'passed' : 'captured',
        runId: vr.artifact.layoutId,
        outputId: vr.artifact.layoutId,
        stageId: 'processing.pipeline-diagnostic',
        timestamp: new Date().toISOString(),
        sourceId: vr.artifact.sourceCaptureRecordId,
        sourceVersion: '1',
        inputSummary: {
          activeRoomInstances: vr.artifact.cells.filter((c) => !c.pkg && !c.hallway).length,
          activeRoomTypes: new Set(vr.artifact.cells.map((c) => c.typeId)).size,
          frontageSegments: 0,
        },
        artifactSummary: {
          polygonCount: vr.artifact.cells.length,
          categories: categoryCount,
        },
        validationSummary: {
          status: findings.length > 0 ? 'warn' : 'pass',
          findings,
        },
        selectionMetrics: {
          score: 0,
          reason: vr.artifact.accepted ? 'accepted' : `culled: ${vr.artifact.cullReasons.join(', ')}`,
        },
        artifactContent: {
          polygons: vr.artifact.cells.map((c) => ({
            id: c.id,
            label: c.label || c.typeId,
            category: (c.hallway ? 'circulation' : c.pkg ? 'boundary' : 'room') as 'room' | 'circulation' | 'boundary',
            color: c.color,
            vertices: c.worldPoints.map((p) => ({ x: p.x, y: p.y })),
          })),
        },
      };

      void this.reportingEndpointService.postReport(report);
    });
  }

  protected readonly lotGeometry = this.lotGeometryService.getActiveLotGeometry();
  protected readonly activeCaptureArtifact = computed(() => this.simulationStageService.captureArtifacts()[0] ?? null);

  protected readonly verificationArguments: VerificationArguments = (() => {
    const source = this.sourceReadService.getActiveSourceSnapshot().source;
    const openAccessTypeIds = source.roomCatalog
      .filter((r) => r.tags.includes('open_access'))
      .map((r) => r.id);
    const criticalPairs = [
      ...source.settings.rules.special
        .filter((rule) => rule.note?.toLowerCase().includes('touch mode'))
        .flatMap((rule) => {
          const pairs = [];
          for (let i = 0; i < rule.rooms.length - 1; i++) {
            for (let j = i + 1; j < rule.rooms.length; j++) {
              pairs.push({ typeA: rule.rooms[i], typeB: rule.rooms[j], label: rule.label });
            }
          }
          return pairs;
        }),
      ...source.settings.rules.blockers
        .filter((rule) => rule.rooms.length === 2)
        .map((rule) => ({ typeA: rule.rooms[0], typeB: rule.rooms[1], label: rule.label })),
    ];
    const frontageBuildableEdges = this.lotGeometry.lotSegments
      .map((seg, i) => ({
        isRrow: seg.isRrow,
        from: this.lotGeometry.buildablePoints[i],
        to: this.lotGeometry.buildablePoints[(i + 1) % this.lotGeometry.buildablePoints.length],
      }))
      .filter((e) => e.isRrow)
      .map((e) => ({ from: e.from, to: e.to }));
    return {
      deficiencyThreshold: 0.75,
      aspectRatioThreshold: 4.5,
      openAccessTypeIds,
      foyerTypeIds: ['foyer'],
      criticalPairs,
      adjacencyEdgeEpsilon: 1e-3,
      garageTypeIds: ['garage'],
      frontageBuildableEdges,
      sliverMinDimension: 0.5,
    };
  })();

  private readonly provisionalArguments: ProvisionalCellGenerationArguments = {
    buildablePoints: this.lotGeometry.buildablePoints,
    snapToAxis: false,
    looseBisector: true,
    fillerWeightScale: 0.35,
    hallwayWeightScale: 0.25,
  };
  private readonly hallwayArguments: HallwayInjectionArguments = {
    buildablePoints: this.lotGeometry.buildablePoints,
    hallwayTargetSquareMeters: 2,
    spacingMultiplier: 3,
    minHallwayAreaSquareMeters: 0.5,
    rebalanceIterations: 24,
    rebalanceGain: 0.12,
    roomDriftGain: 0.08,
    hallwayDriftGain: 0.14,
    stableDeviation: 0.02,
    stableRunsRequired: 3,
  };
  private readonly massBalanceArguments: MassBalanceRenegotiationArguments = {
    buildablePoints: this.lotGeometry.buildablePoints,
    rebalanceIterations: 18,
    rebalanceGain: 0.05,
    stableDeviation: 0.02,
    stableRunsRequired: 3,
    roomDriftGain: 0.05,
    hallwayDriftGain: 0.08,
  };
  private readonly warpedDiagnosticArguments: WarpedDiagnosticStagingArguments = {
    buildablePoints: this.lotGeometry.buildablePoints,
    rebalanceIterations: 18,
    rebalanceGain: 0.18,
    stableDeviation: 0.02,
    stableRunsRequired: 3,
    roomDriftGain: 0.05,
    hallwayDriftGain: 0.08,
  };
  private readonly uvEdgeNegotiationArguments: UvEdgeNegotiationArguments = {
    quadPoints: this.lotGeometry.buildablePoints,
    snapThreshold: 0.05,
    majorAxisSnapMultiplier: 1.5,
    minExtent: 0.04,
    shiftGain: 0.05,
    maxPasses: 8,
    stableShift: 1e-4,
    targetAspectRatio: 4.5,
    maxAspectPasses: 10,
  };
  private readonly residualUvAbsorptionArguments: ResidualUvAbsorptionArguments = {
    fillerColor: '#e8dfc8',
    hallwayColor: '#d4d0c0',
  };
  private readonly hallwayMergeArguments: HallwayMergeArguments = { edgeMatchEpsilon: 1e-3 };
  private readonly finalStagingArguments: FinalStagingArguments = { stageLabel: 'verification-page checkpoint' };
  private readonly canonicalGeometryArguments: CanonicalGeometryArguments = {
    vertexSnapGridMeters: 0.001,
    edgeSplitToleranceMeters: 0.001,
    minSegmentLengthMeters: 0.01,
  };

  private readonly provisionalResult = computed(() => {
    const artifact = this.activeCaptureArtifact();
    if (!artifact) return null;
    return this.provisionalCellGenerationService.run({
      artifact,
      artifactRef: { layoutId: artifact.layoutId, sourceStageId: 'layout-exploration.capture', sourceScore: artifact.sourceScore },
      arguments: this.provisionalArguments,
    });
  });

  private readonly hallwayResult = computed(() => {
    const provisionalResult = this.provisionalResult();
    if (!provisionalResult) return null;
    this.processingOrchestratorService.runOrderedSteps(
      { artifact: this.activeCaptureArtifact()!, artifactRef: { layoutId: this.activeCaptureArtifact()!.layoutId, sourceStageId: 'layout-exploration.capture', sourceScore: this.activeCaptureArtifact()!.sourceScore }, arguments: this.provisionalArguments },
      [this.provisionalCellGenerationService],
    );
    return this.hallwayInjectionService.run({
      artifact: provisionalResult.artifact,
      artifactRef: { layoutId: provisionalResult.artifact.layoutId, sourceStageId: 'processing.provisional_cells', sourceScore: this.activeCaptureArtifact()?.sourceScore },
      arguments: this.hallwayArguments,
    });
  });

  private readonly warpedDiagnosticResult = computed(() => {
    const hallwayResult = this.hallwayResult();
    if (!hallwayResult) return null;
    return this.warpedDiagnosticStagingService.run({
      artifact: hallwayResult.artifact,
      artifactRef: { layoutId: hallwayResult.artifact.layoutId, sourceStageId: 'processing.hallway_injection', sourceScore: this.activeCaptureArtifact()?.sourceScore },
      arguments: this.warpedDiagnosticArguments,
    });
  });

  private readonly uvEdgeNegotiationResult = computed(() => {
    const warpedDiagnosticResult = this.warpedDiagnosticResult();
    if (!warpedDiagnosticResult) return null;
    return this.uvEdgeNegotiationService.run({
      artifact: warpedDiagnosticResult.artifact,
      artifactRef: { layoutId: warpedDiagnosticResult.artifact.layoutId, sourceStageId: 'processing.warped_diagnostic', sourceScore: this.activeCaptureArtifact()?.sourceScore },
      arguments: this.uvEdgeNegotiationArguments,
    });
  });

  private readonly residualUvAbsorptionResult = computed(() => {
    const uvEdgeNegotiationResult = this.uvEdgeNegotiationResult();
    if (!uvEdgeNegotiationResult) return null;
    return this.residualUvAbsorptionService.run({
      artifact: uvEdgeNegotiationResult.artifact,
      artifactRef: { layoutId: uvEdgeNegotiationResult.artifact.layoutId, sourceStageId: 'processing.uv_edge_negotiation', sourceScore: this.activeCaptureArtifact()?.sourceScore },
      arguments: this.residualUvAbsorptionArguments,
    });
  });

  private readonly hallwayMergeResult = computed(() => {
    const residualUvAbsorptionResult = this.residualUvAbsorptionResult();
    if (!residualUvAbsorptionResult) return null;
    return this.hallwayMergeService.run({
      artifact: residualUvAbsorptionResult.artifact,
      artifactRef: { layoutId: residualUvAbsorptionResult.artifact.layoutId, sourceStageId: 'processing.residual_uv_absorption', sourceScore: this.activeCaptureArtifact()?.sourceScore },
      arguments: this.hallwayMergeArguments,
    });
  });

  private readonly finalStagingResult = computed(() => {
    const hallwayMergeResult = this.hallwayMergeResult();
    if (!hallwayMergeResult) return null;
    return this.finalStagingService.run({
      artifact: hallwayMergeResult.artifact,
      artifactRef: { layoutId: hallwayMergeResult.artifact.layoutId, sourceStageId: 'processing.hallway_merge', sourceScore: this.activeCaptureArtifact()?.sourceScore },
      arguments: this.finalStagingArguments,
    });
  });

  private readonly canonicalGeometryResult = computed(() => {
    const finalStagingResult = this.finalStagingResult();
    if (!finalStagingResult) return null;
    return this.canonicalGeometryService.run({
      artifact: finalStagingResult.artifact,
      artifactRef: { layoutId: finalStagingResult.artifact.layoutId, sourceStageId: 'processing.final_staging', sourceScore: this.activeCaptureArtifact()?.sourceScore },
      arguments: this.canonicalGeometryArguments,
    });
  });

  protected readonly verificationResult = computed(() => {
    const canonicalGeometryResult = this.canonicalGeometryResult();
    if (!canonicalGeometryResult) return null;
    return this.verificationService.run({
      artifact: canonicalGeometryResult.artifact,
      artifactRef: { layoutId: canonicalGeometryResult.artifact.layoutId, sourceStageId: 'processing.canonical_geometry', sourceScore: this.activeCaptureArtifact()?.sourceScore },
      arguments: this.verificationArguments,
    });
  });

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
