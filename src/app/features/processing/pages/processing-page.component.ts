import { Component, computed, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import type { GeometryPoint } from '../../../core/geometry/geometry.exports';
import { LotGeometryService } from '../../../core/geometry/geometry.exports';
import {
  FinalStagingService,
  HallwayInjectionService,
  LayoutProcessingOrchestratorService,
  MassBalanceRenegotiationService,
  ProvisionalCellGenerationService,
  WarpedDiagnosticStagingService,
  UvEdgeNegotiationService,
  ResidualUvAbsorptionService,
  HallwayMergeService,
  CanonicalGeometryService,
  type FinalStagingArguments,
  type HallwayMergeArguments,
  type CanonicalGeometryArguments,
  type HallwayInjectionArguments,
  type MassBalanceRenegotiationArguments,
  type ProvisionalCellGenerationArguments,
  type WarpedDiagnosticStagingArguments,
  type UvEdgeNegotiationArguments,
  type ResidualUvAbsorptionArguments,
  type UvNegotiatedLayoutArtifact,
} from '../../../core/processing/processing.exports';
import { SourceReadService } from '../../../core/source/source.exports';
import { SimulationStageService } from '../../../core/simulation/simulation.exports';

interface ProcessingMetricRow {
  readonly label: string;
  readonly value: string;
}

interface ProcessingPreviewCell {
  readonly id: string;
  readonly label: string;
  readonly displayLabel: string;
  readonly color: string;
  readonly polygon: string;
  readonly cx: number;
  readonly cy: number;
  readonly generated: boolean;
  readonly transferred: boolean;
  readonly hallway: boolean;
}

interface ProcessingPreviewLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly major: boolean;
}

interface ProcessingPreviewModel {
  readonly buildablePolygon: string;
  readonly cells: readonly ProcessingPreviewCell[];
  readonly lines?: readonly ProcessingPreviewLine[];
}

interface ProcessingTraceRow {
  readonly stepId: string;
  readonly severity: string;
  readonly message: string;
}

interface ProcessingPanelSectionRow {
  readonly label: string;
  readonly value: string;
}

interface ProcessingProcessPanel {
  readonly stepNumber: number;
  readonly stepId: string;
  readonly title: string;
  readonly status: 'implemented' | 'pending';
  readonly category: string;
  readonly purpose: string;
  readonly inputSummary: string;
  readonly outputSummary: string;
  readonly summary: string;
  readonly preview: ProcessingPreviewModel | null;
  readonly metrics: readonly ProcessingMetricRow[];
  readonly traces: readonly ProcessingTraceRow[];
  readonly detailRows: readonly ProcessingPanelSectionRow[];
}

interface ProcessingFutureFeature {
  readonly title: string;
  readonly reason: string;
}

@Component({
  selector: 'app-processing-page',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './processing-page.component.html',
  styleUrl: './processing-page.component.scss',
})
export class ProcessingPageComponent {
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
  private readonly processingOrchestratorService = inject(LayoutProcessingOrchestratorService);
  private readonly previewWidth = 560;
  private readonly previewHeight = 380;
  private readonly numberFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  protected readonly captureArtifacts = this.simulationStageService.captureArtifacts;
  protected readonly activeCaptureArtifact = computed(() => this.captureArtifacts()[0] ?? null);
  protected readonly lotGeometry = this.lotGeometryService.getActiveLotGeometry();
  protected readonly provisionalArguments: ProvisionalCellGenerationArguments = {
    buildablePoints: this.lotGeometry.buildablePoints,
    snapToAxis: false,
    looseBisector: true,
    fillerWeightScale: 0.35,
    hallwayWeightScale: 0.25,
  };
  protected readonly hallwayArguments: HallwayInjectionArguments = {
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
  protected readonly massBalanceArguments: MassBalanceRenegotiationArguments = {
    buildablePoints: this.lotGeometry.buildablePoints,
    rebalanceIterations: 18,
    rebalanceGain: 0.05,
    stableDeviation: 0.02,
    stableRunsRequired: 3,
    roomDriftGain: 0.05,
    hallwayDriftGain: 0.08,
  };
  protected readonly warpedDiagnosticArguments: WarpedDiagnosticStagingArguments = {
    buildablePoints: this.lotGeometry.buildablePoints,
    rebalanceIterations: 18,
    rebalanceGain: 0.18,
    stableDeviation: 0.02,
    stableRunsRequired: 3,
    roomDriftGain: 0.05,
    hallwayDriftGain: 0.08,
  };
  protected readonly finalStagingArguments: FinalStagingArguments = {
    stageLabel: 'app-next processing checkpoint',
  };
  protected readonly uvEdgeNegotiationArguments: UvEdgeNegotiationArguments = {
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
  protected readonly residualUvAbsorptionArguments: ResidualUvAbsorptionArguments = {
    fillerColor: '#e8dfc8',
    hallwayColor: '#d4d0c0',
  };
  protected readonly hallwayMergeArguments: HallwayMergeArguments = {
    edgeMatchEpsilon: 1e-3,
  };
  protected readonly canonicalGeometryArguments: CanonicalGeometryArguments = {
    vertexSnapGridMeters: 0.001,
    edgeSplitToleranceMeters: 0.001,
    minSegmentLengthMeters: 0.01,
  };
  protected readonly provisionalResult = computed(() => {
    const artifact = this.activeCaptureArtifact();
    if (!artifact) {
      return null;
    }

    return this.provisionalCellGenerationService.run({
      artifact,
      artifactRef: {
        layoutId: artifact.layoutId,
        sourceStageId: 'layout-exploration.capture',
        sourceScore: artifact.sourceScore,
      },
      arguments: this.provisionalArguments,
    });
  });
  protected readonly hallwayResult = computed(() => {
    const provisionalResult = this.provisionalResult();
    if (!provisionalResult) {
      return null;
    }

    this.processingOrchestratorService.runOrderedSteps(
      {
        artifact: this.activeCaptureArtifact()!,
        artifactRef: {
          layoutId: this.activeCaptureArtifact()!.layoutId,
          sourceStageId: 'layout-exploration.capture',
          sourceScore: this.activeCaptureArtifact()!.sourceScore,
        },
        arguments: this.provisionalArguments,
      },
      [this.provisionalCellGenerationService],
    );

    return this.hallwayInjectionService.run({
      artifact: provisionalResult.artifact,
      artifactRef: {
        layoutId: provisionalResult.artifact.layoutId,
        sourceStageId: 'processing.provisional_cells',
        sourceScore: this.activeCaptureArtifact()?.sourceScore,
      },
      arguments: this.hallwayArguments,
    });
  });
  protected readonly warpedDiagnosticResult = computed(() => {
    const hallwayResult = this.hallwayResult();
    if (!hallwayResult) {
      return null;
    }

    return this.warpedDiagnosticStagingService.run({
      artifact: hallwayResult.artifact,
      artifactRef: {
        layoutId: hallwayResult.artifact.layoutId,
        sourceStageId: 'processing.hallway_injection',
        sourceScore: this.activeCaptureArtifact()?.sourceScore,
      },
      arguments: this.warpedDiagnosticArguments,
    });
  });
  protected readonly hallwayMergeResult = computed(() => {
    const residualUvAbsorptionResult = this.residualUvAbsorptionResult();
    if (!residualUvAbsorptionResult) return null;

    return this.hallwayMergeService.run({
      artifact: residualUvAbsorptionResult.artifact,
      artifactRef: {
        layoutId: residualUvAbsorptionResult.artifact.layoutId,
        sourceStageId: 'processing.residual_uv_absorption',
        sourceScore: this.activeCaptureArtifact()?.sourceScore,
      },
      arguments: this.hallwayMergeArguments,
    });
  });

  protected readonly finalStagingResult = computed(() => {
    const hallwayMergeResult = this.hallwayMergeResult();
    if (!hallwayMergeResult) {
      return null;
    }

    return this.finalStagingService.run({
      artifact: hallwayMergeResult.artifact,
      artifactRef: {
        layoutId: hallwayMergeResult.artifact.layoutId,
        sourceStageId: 'processing.hallway_merge',
        sourceScore: this.activeCaptureArtifact()?.sourceScore,
      },
      arguments: this.finalStagingArguments,
    });
  });
  protected readonly canonicalGeometryResult = computed(() => {
    const finalStagingResult = this.finalStagingResult();
    if (!finalStagingResult) {
      return null;
    }

    return this.canonicalGeometryService.run({
      artifact: finalStagingResult.artifact,
      artifactRef: {
        layoutId: finalStagingResult.artifact.layoutId,
        sourceStageId: 'processing.final_staging',
        sourceScore: this.activeCaptureArtifact()?.sourceScore,
      },
      arguments: this.canonicalGeometryArguments,
    });
  });
  protected readonly massBalanceResult = computed(() => {
    const warpedDiagnosticResult = this.warpedDiagnosticResult();
    if (!warpedDiagnosticResult) {
      return null;
    }

    return this.massBalanceRenegotiationService.run({
      artifact: warpedDiagnosticResult.artifact,
      artifactRef: {
        layoutId: warpedDiagnosticResult.artifact.layoutId,
        sourceStageId: 'processing.diagnostic_staging',
        sourceScore: this.activeCaptureArtifact()?.sourceScore,
      },
      arguments: this.massBalanceArguments,
    });
  });
  protected readonly uvEdgeNegotiationResult = computed(() => {
    const warpedDiagnosticResult = this.warpedDiagnosticResult();
    if (!warpedDiagnosticResult) {
      return null;
    }

    return this.uvEdgeNegotiationService.run({
      artifact: warpedDiagnosticResult.artifact,
      artifactRef: {
        layoutId: warpedDiagnosticResult.artifact.layoutId,
        sourceStageId: 'processing.warped_diagnostic',
        sourceScore: this.activeCaptureArtifact()?.sourceScore,
      },
      arguments: this.uvEdgeNegotiationArguments,
    });
  });
  protected readonly residualUvAbsorptionResult = computed(() => {
    const uvEdgeNegotiationResult = this.uvEdgeNegotiationResult();
    if (!uvEdgeNegotiationResult) {
      return null;
    }

    return this.residualUvAbsorptionService.run({
      artifact: uvEdgeNegotiationResult.artifact,
      artifactRef: {
        layoutId: uvEdgeNegotiationResult.artifact.layoutId,
        sourceStageId: 'processing.uv_edge_negotiation',
        sourceScore: this.activeCaptureArtifact()?.sourceScore,
      },
      arguments: this.residualUvAbsorptionArguments,
    });
  });
  protected readonly coverageDiagnostic = computed(() => {
    const finalStagingResult = this.finalStagingResult();
    const canonicalGeometryResult = this.canonicalGeometryResult();
    const uvNegResult = this.uvEdgeNegotiationResult();
    if (!finalStagingResult || !canonicalGeometryResult || !uvNegResult) return null;

    const quad = uvNegResult.artifact.quadPoints;
    if (quad.length !== 4) return null;

    const cells = canonicalGeometryResult.artifact.cells;

    // Buildable area via shoelace.
    const bpts = this.lotGeometry.buildablePoints;
    let buildableArea = 0;
    for (let i = 0; i < bpts.length; i++) {
      const j = (i + 1) % bpts.length;
      buildableArea += bpts[i].x * bpts[j].y - bpts[j].x * bpts[i].y;
    }
    buildableArea = Math.abs(buildableArea) / 2;

    const totalCellArea = cells.reduce((sum, cell) => sum + cell.areaSquareMeters, 0);
    const coveragePct = buildableArea > 0 ? (totalCellArea / buildableArea) * 100 : 0;
    const deadSpaceSqm = Math.max(0, buildableArea - totalCellArea);

    // Re-project each final cell to a UV box.
    const uvBoxes = cells.map((cell) => {
      const uvPts = cell.worldPoints.map((p) => this.inverseWarpedGridLocal(p, quad));
      return {
        uMin: Math.min(...uvPts.map((p) => p.u)),
        uMax: Math.max(...uvPts.map((p) => p.u)),
        vMin: Math.min(...uvPts.map((p) => p.v)),
        vMax: Math.max(...uvPts.map((p) => p.v)),
      };
    });

    // 20×20 UV grid scan — 400 sample tile centers.
    const N = 20;
    const EPS = 1e-4;
    let gapTiles = 0;
    let overlapTiles = 0;
    for (let ui = 0; ui < N; ui++) {
      for (let vi = 0; vi < N; vi++) {
        const u = (ui + 0.5) / N;
        const v = (vi + 0.5) / N;
        const covering = uvBoxes.filter(
          (b) => u > b.uMin + EPS && u < b.uMax - EPS && v > b.vMin + EPS && v < b.vMax - EPS,
        );
        if (covering.length === 0) gapTiles += 1;
        if (covering.length > 1) overlapTiles += 1;
      }
    }

    // Pairwise UV overlap check across all output cells.
    let pairOverlapCount = 0;
    for (let i = 0; i < uvBoxes.length; i++) {
      for (let j = i + 1; j < uvBoxes.length; j++) {
        const uOv = Math.min(uvBoxes[i].uMax, uvBoxes[j].uMax) - Math.max(uvBoxes[i].uMin, uvBoxes[j].uMin);
        const vOv = Math.min(uvBoxes[i].vMax, uvBoxes[j].vMax) - Math.max(uvBoxes[i].vMin, uvBoxes[j].vMin);
        if (uOv > EPS && vOv > EPS) pairOverlapCount += 1;
      }
    }

    return {
      buildableArea,
      totalCellArea,
      coveragePct,
      deadSpaceSqm,
      gapTiles,
      overlapTiles,
      pairOverlapCount,
      gridN: N,
      totalTiles: N * N,
      pass: gapTiles === 0 && overlapTiles === 0 && pairOverlapCount === 0,
    };
  });

  protected readonly processingOverviewRows = computed<readonly ProcessingMetricRow[]>(() => {
    const artifact = this.activeCaptureArtifact();
    const provisionalResult = this.provisionalResult();
    const hallwayResult = this.hallwayResult();
    const finalStagingResult = this.finalStagingResult();
    const canonicalGeometryResult = this.canonicalGeometryResult();
    const warpedDiagnosticResult = this.warpedDiagnosticResult();

    if (!artifact || !provisionalResult || !hallwayResult || !finalStagingResult || !canonicalGeometryResult || !warpedDiagnosticResult) {
      return [];
    }

    return [
      { label: 'Layout ID', value: artifact.layoutId },
      { label: 'Record ID', value: artifact.recordId },
      { label: 'Source core', value: artifact.coreId },
      { label: 'Source runner', value: String(artifact.runnerIndex + 1) },
      { label: 'Source score', value: this.numberFormatter.format(artifact.sourceScore) },
      { label: 'Captured bubbles', value: String(artifact.bubbles.filter((bubble) => bubble.placed).length) },
      { label: 'Current cells', value: String(canonicalGeometryResult.metrics.outputCellCount) },
    ];
  });
  protected readonly hallwayTraceRows = computed<readonly ProcessingTraceRow[]>(() => {
    const hallwayResult = this.hallwayResult();
    if (!hallwayResult) {
      return [];
    }

    return hallwayResult.traces.map((trace) => ({
      stepId: trace.stepId,
      severity: trace.severity,
      message: trace.message,
    }));
  });

  // Slice 8C / Processing panel assembly.
  // Stage category: projection/presentation.
  // Step id: processing.page_panels
  // Purpose: expose the full downstream processing sequence as one self-describing panel per step without letting the page own step logic.
  // Inputs: captured layout artifact, implemented step results through post-step mass balance, declared pipeline order, and documented expected step contracts.
  // Outputs: read-only panel models for implemented and pending processing steps, now pushed through final staged output while keeping each step boundary explicit.
  // Allowed dependencies: processing artifacts, step results, and pipeline documentation mirrored into presentation metadata.
  // Forbidden responsibilities: geometry mutation, hidden shared processing state, and step execution internals.
  protected readonly processPanels = computed<readonly ProcessingProcessPanel[]>(() => {
    const captureArtifact = this.activeCaptureArtifact();
    const provisionalResult = this.provisionalResult();
    const hallwayResult = this.hallwayResult();
    const finalStagingResult = this.finalStagingResult();
    const canonicalGeometryResult = this.canonicalGeometryResult();
    const warpedDiagnosticResult = this.warpedDiagnosticResult();
    const uvEdgeNegotiationResult = this.uvEdgeNegotiationResult();
    const residualUvAbsorptionResult = this.residualUvAbsorptionResult();
    const hallwayMergeResult = this.hallwayMergeResult();

    if (!captureArtifact || !provisionalResult || !hallwayResult || !finalStagingResult || !canonicalGeometryResult || !warpedDiagnosticResult) {
      return [];
    }

    const capturePreview = this.buildPreviewModel(captureArtifact.bubbles.map((bubble) => ({
      id: bubble.instanceId,
      label: bubble.label,
      color: bubble.color,
      worldPoints: this.buildBubblePolygonPoints(bubble.x, bubble.y, bubble.radiusMeters),
    })));
    const provisionalPreview = this.buildPreviewModel(provisionalResult.artifact.cells);
    const hallwayPreview = this.buildPreviewModel(hallwayResult.artifact.cells);
    const captureMetrics: readonly ProcessingMetricRow[] = [
      { label: 'Placed bubbles', value: String(captureArtifact.bubbles.filter((bubble) => bubble.placed).length) },
      { label: 'Attraction average', value: this.numberFormatter.format(captureArtifact.attractionAverage) },
      { label: 'Repel average', value: this.numberFormatter.format(captureArtifact.repelAverage) },
      { label: 'Source score', value: this.numberFormatter.format(captureArtifact.sourceScore) },
    ];
    const provisionalMetrics: readonly ProcessingMetricRow[] = [
      { label: 'Placed bubbles', value: String(provisionalResult.metrics.placedBubbleCount) },
      { label: 'Generated cells', value: String(provisionalResult.metrics.generatedCellCount) },
      { label: 'Dropped degenerate cells', value: String(provisionalResult.metrics.droppedDegenerateCellCount) },
    ];
    const hallwayMetrics: readonly ProcessingMetricRow[] = [
      { label: 'Input cells', value: String(hallwayResult.metrics.inputCellCount) },
      { label: 'Hallway sites', value: String(hallwayResult.metrics.hallwaySiteCount) },
      { label: 'Output cells', value: String(hallwayResult.metrics.outputCellCount) },
      { label: 'Dropped hallway cells', value: String(hallwayResult.metrics.droppedHallwayCellCount) },
    ];
    const warpedDiagnosticMetrics: readonly ProcessingMetricRow[] = [
      { label: 'Input cells', value: String(warpedDiagnosticResult.metrics.inputCellCount) },
      { label: 'Output cells', value: String(warpedDiagnosticResult.metrics.outputCellCount) },
      { label: 'Warped sites', value: String(warpedDiagnosticResult.metrics.warpedSiteCount) },
      { label: 'Iteration count', value: String(warpedDiagnosticResult.metrics.iterationCount) },
      { label: 'Stable runs', value: String(warpedDiagnosticResult.metrics.stableRunCount) },
    ];
    const finalStagingMetrics: readonly ProcessingMetricRow[] = [
      { label: 'Output cells', value: String(finalStagingResult.metrics.outputCellCount) },
      { label: 'Total area', value: `${this.numberFormatter.format(finalStagingResult.metrics.totalAreaSquareMeters)} sq m` },
      { label: 'Room cells', value: String(finalStagingResult.metrics.roomCellCount) },
      { label: 'Hallway cells', value: String(finalStagingResult.metrics.hallwayCellCount) },
    ];
    const canonicalGeometryMetrics: readonly ProcessingMetricRow[] = [
      { label: 'Output cells', value: String(canonicalGeometryResult.metrics.outputCellCount) },
      { label: 'Shared vertices', value: String(canonicalGeometryResult.metrics.canonicalVertexCount) },
      { label: 'Inserted splits', value: String(canonicalGeometryResult.metrics.insertedVertexCount) },
      { label: 'Dropped degenerates', value: String(canonicalGeometryResult.metrics.droppedDegenerateCellCount) },
    ];

    return [
      {
        stepNumber: 0,
        stepId: 'layout-exploration.capture',
        title: 'Layout exploration capture',
        status: 'implemented',
        category: 'Simulation handoff',
        purpose: 'Freeze one accepted simulation result into a stable artifact that downstream processing can consume without talking back to the live simulation loop.',
        inputSummary: 'Accepted bubble layout from the Layout Exploration core plus capture score and diagnostic averages.',
        outputSummary: 'One captured layout artifact with placed bubbles, score context, and source identifiers.',
        summary: `${captureArtifact.bubbles.filter((bubble) => bubble.placed).length} placed bubbles from ${captureArtifact.layoutId}`,
        preview: capturePreview,
        metrics: captureMetrics,
        traces: [],
        detailRows: [
          { label: 'Layout ID', value: captureArtifact.layoutId },
          { label: 'Record ID', value: captureArtifact.recordId },
          { label: 'Source core', value: captureArtifact.coreId },
          { label: 'Captured at', value: captureArtifact.capturedAtIso },
        ],
      },
      {
        stepNumber: 1,
        stepId: 'processing.provisional_cells',
        title: 'Provisional constrained cells',
        status: 'implemented',
        category: 'Partition generation',
        purpose: 'Convert accepted bubbles into the first provisional room, hallway, and filler cells clipped to the buildable envelope.',
        inputSummary: 'Captured bubble layout artifact and buildable polygon arguments.',
        outputSummary: 'Canonical provisional cell artifact with typed cells, target areas, area deltas, and traces.',
        summary: `${provisionalResult.metrics.generatedCellCount} cells generated`,
        preview: provisionalPreview,
        metrics: provisionalMetrics,
        traces: provisionalResult.traces.map((trace) => ({
          stepId: trace.stepId,
          severity: trace.severity,
          message: trace.message,
        })),
        detailRows: [
          { label: 'Snap to axis', value: this.provisionalArguments.snapToAxis ? 'Yes' : 'No' },
          { label: 'Loose bisector', value: this.provisionalArguments.looseBisector ? 'Yes' : 'No' },
          { label: 'Filler weight scale', value: this.provisionalArguments.fillerWeightScale.toFixed(2) },
          { label: 'Hallway weight scale', value: this.provisionalArguments.hallwayWeightScale.toFixed(2) },
        ],
      },
      {
        stepNumber: 2,
        stepId: 'processing.hallway_injection',
        title: 'Hallway injection',
        status: 'implemented',
        category: 'Circulation refinement',
        purpose: 'Introduce explicit hallway territory as its own bounded circulation pass without collapsing back into the provisional partition step.',
        inputSummary: 'Provisional constrained cells plus hallway injection arguments and the same buildable boundary.',
        outputSummary: 'Updated canonical cell artifact with hallway cells and rebalanced neighboring room/filler cells.',
        summary: `${hallwayResult.metrics.hallwaySiteCount} hallway sites / ${hallwayResult.metrics.outputCellCount} output cells`,
        preview: hallwayPreview,
        metrics: hallwayMetrics,
        traces: this.hallwayTraceRows(),
        detailRows: [
          { label: 'Hallway target', value: `${this.hallwayArguments.hallwayTargetSquareMeters.toFixed(2)} sq m` },
          { label: 'Spacing multiplier', value: this.hallwayArguments.spacingMultiplier.toFixed(2) },
          { label: 'Min hallway area', value: `${this.hallwayArguments.minHallwayAreaSquareMeters.toFixed(2)} sq m` },
          { label: 'Room drift gain', value: this.hallwayArguments.roomDriftGain.toFixed(2) },
        ],
      },
      {
        stepNumber: 3,
        stepId: 'processing.diagnostic_staging',
        title: 'Warped orthogonalization',
        status: 'implemented',
        category: 'Warped orthogonalization',
        purpose: 'Repartition the current canonical cells through constrained warped grid space so the orthogonalized alternative is inspectable before mass negotiation and boundary edge cleanup.',
        inputSummary: 'Hallway-injected canonical cells plus a four-corner buildable quad and warped-grid rebalance arguments.',
        outputSummary: 'Warped orthogonalized artifact with remapped world-space cells for later mass negotiation and boundary cleanup.',
        summary: `${warpedDiagnosticResult.metrics.outputCellCount} warped-grid cells staged from ${warpedDiagnosticResult.metrics.warpedSiteCount} warped sites`,
        preview: this.buildPreviewModel(warpedDiagnosticResult.artifact.cells),
        metrics: warpedDiagnosticMetrics,
        traces: warpedDiagnosticResult.traces.map((trace) => ({
          stepId: trace.stepId,
          severity: trace.severity,
          message: trace.message,
        })),
        detailRows: [
          { label: 'Rebalance gain', value: this.warpedDiagnosticArguments.rebalanceGain.toFixed(2) },
          { label: 'Stable deviation', value: this.warpedDiagnosticArguments.stableDeviation.toFixed(2) },
          { label: 'Room drift gain', value: this.warpedDiagnosticArguments.roomDriftGain.toFixed(2) },
          { label: 'Hallway drift gain', value: this.warpedDiagnosticArguments.hallwayDriftGain.toFixed(2) },
        ],
      },
      {
        stepNumber: 5,
        stepId: 'processing.warped_site_projection',
        title: 'UV edge clustering and negotiation',
        status: uvEdgeNegotiationResult ? 'implemented' : 'pending',
        category: 'UV clustering',
        purpose: 'Re-project already-rectangular mass-balanced cells to UV, cluster close edges (buildSafeSnap), attract edges to the 2 most-shared structural axes (major lines), iteratively shift shared UV edges toward deficit-side neighbors, then rescue boxes with unacceptable world aspect ratios.',
        inputSummary: 'Mass-balanced rectangular world cells plus buildable quad from arguments.',
        outputSummary: 'World-space cells with clustered, major-axis-aligned, and negotiated UV box extents ready for residual absorption.',
        summary: uvEdgeNegotiationResult
          ? `${uvEdgeNegotiationResult.metrics.outputCellCount} cells — ${uvEdgeNegotiationResult.metrics.snappedEdgeCount} edges clustered, ${uvEdgeNegotiationResult.metrics.majorAxisSnappedEdgeCount} major-axis snapped, ${uvEdgeNegotiationResult.metrics.negotiationPasses} negotiation passes`
          : 'Pending — depends on warped orthogonalization.',
        preview: uvEdgeNegotiationResult ? this.buildUvNegotiationPreviewModel(uvEdgeNegotiationResult.artifact) : null,
        metrics: uvEdgeNegotiationResult
          ? [
              { label: 'Input cells', value: String(uvEdgeNegotiationResult.metrics.inputCellCount) },
              { label: 'Output cells', value: String(uvEdgeNegotiationResult.metrics.outputCellCount) },
              { label: 'Edges clustered', value: String(uvEdgeNegotiationResult.metrics.snappedEdgeCount) },
              { label: 'Major axis snapped', value: String(uvEdgeNegotiationResult.metrics.majorAxisSnappedEdgeCount) },
              { label: 'Negotiation passes', value: String(uvEdgeNegotiationResult.metrics.negotiationPasses) },
              { label: 'Aspect ratio rescues', value: String(uvEdgeNegotiationResult.metrics.aspectRescueCount) },
            ]
          : [],
        traces: uvEdgeNegotiationResult
          ? uvEdgeNegotiationResult.traces.map((trace) => ({
              stepId: trace.stepId,
              severity: trace.severity,
              message: trace.message,
            }))
          : [],
        detailRows: [
          { label: 'Snap threshold', value: this.uvEdgeNegotiationArguments.snapThreshold.toFixed(2) },
          { label: 'Major axis multiplier', value: this.uvEdgeNegotiationArguments.majorAxisSnapMultiplier.toFixed(1) },
          { label: 'Shift gain', value: this.uvEdgeNegotiationArguments.shiftGain.toFixed(2) },
          { label: 'Max passes', value: String(this.uvEdgeNegotiationArguments.maxPasses) },
          { label: 'Target aspect ratio', value: this.uvEdgeNegotiationArguments.targetAspectRatio.toFixed(1) },
          { label: 'Migration source', value: 'buildClusteredGridCells (buildSafeSnap + snapToMajorAxis + negotiateEdges) — testing/app/src/app/app.ts line 5280' },
        ],
      },
      {
        stepNumber: 9,
        stepId: 'processing.residual_uv_absorption',
        title: 'Residual UV absorption',
        status: residualUvAbsorptionResult ? 'implemented' : 'pending',
        category: 'Warped grid gap fill',
        purpose: 'Scan uncovered UV grid tiles after negotiated room boxes are placed, grow each seed into the largest uncovered rectangle, attempt absorption into adjacent deficit rooms first, then emit remaining gaps as hallway or filler residual cells.',
        inputSummary: 'UV-negotiated world cells plus quad from negotiation step, plus filler/hallway color arguments.',
        outputSummary: 'Merged room + residual cells — the clusteredGridCells equivalent ready for final staging and verification.',
        summary: residualUvAbsorptionResult
          ? `${residualUvAbsorptionResult.metrics.outputCellCount} cells (${residualUvAbsorptionResult.metrics.residualCellCount} residuals, ${residualUvAbsorptionResult.metrics.absorbedRectCount} absorbed)`
          : 'Pending — depends on UV edge negotiation.',
        preview: residualUvAbsorptionResult ? this.buildPreviewModel(residualUvAbsorptionResult.artifact.cells) : null,
        metrics: residualUvAbsorptionResult
          ? [
              { label: 'Input cells', value: String(residualUvAbsorptionResult.metrics.inputCellCount) },
              { label: 'Output cells', value: String(residualUvAbsorptionResult.metrics.outputCellCount) },
              { label: 'Residual cells', value: String(residualUvAbsorptionResult.metrics.residualCellCount) },
              { label: 'Absorbed into rooms', value: String(residualUvAbsorptionResult.metrics.absorbedRectCount) },
            ]
          : [],
        traces: residualUvAbsorptionResult
          ? residualUvAbsorptionResult.traces.map((trace) => ({
              stepId: trace.stepId,
              severity: trace.severity,
              message: trace.message,
            }))
          : [],
        detailRows: [
          { label: 'Filler color', value: this.residualUvAbsorptionArguments.fillerColor },
          { label: 'Hallway color', value: this.residualUvAbsorptionArguments.hallwayColor },
          { label: 'Migration source', value: 'buildResidualUvQuads + tryAbsorbResidualUvRect — testing/app/src/app/app.ts line 5584' },
          { label: 'Stage note', value: 'Fifth and final step of the real verification-feeding warped pipeline (Slice 9E)' },
        ],
      },
      {
        stepNumber: 7,
        stepId: 'processing.hallway_merge',
        title: 'Connected hallway merge',
        status: hallwayMergeResult ? 'implemented' : 'pending',
        category: 'Hallway consolidation',
        purpose: 'Find all hallway cells that share an edge, group them into connected components via BFS, then merge each component into a single polygon by removing interior shared edges and tracing the remaining boundary.',
        inputSummary: 'Residual-absorbed cells — rooms plus individual hallway rectangles from UV grid and residual fill.',
        outputSummary: 'Same rooms, with connected hallway groups replaced by single merged polygons.',
        summary: hallwayMergeResult
          ? `${hallwayMergeResult.metrics.inputHallwayCount} hallways → ${hallwayMergeResult.metrics.outputHallwayCount} (${hallwayMergeResult.metrics.mergedGroupCount} groups merged)`
          : 'Pending — depends on residual UV absorption.',
        preview: hallwayMergeResult ? this.buildPreviewModel(hallwayMergeResult.artifact.cells) : null,
        metrics: hallwayMergeResult
          ? [
              { label: 'Input cells', value: String(hallwayMergeResult.metrics.inputCellCount) },
              { label: 'Output cells', value: String(hallwayMergeResult.metrics.outputCellCount) },
              { label: 'Input hallways', value: String(hallwayMergeResult.metrics.inputHallwayCount) },
              { label: 'Output hallways', value: String(hallwayMergeResult.metrics.outputHallwayCount) },
              { label: 'Merged groups', value: String(hallwayMergeResult.metrics.mergedGroupCount) },
            ]
          : [],
        traces: hallwayMergeResult
          ? hallwayMergeResult.traces.map((trace) => ({ stepId: trace.stepId, severity: trace.severity, message: trace.message }))
          : [],
        detailRows: [
          { label: 'Edge match epsilon', value: this.hallwayMergeArguments.edgeMatchEpsilon.toExponential(0) },
        ],
      },
      {
        stepNumber: 8,
        stepId: 'processing.final_staging',
        title: 'Final staged output',
        status: 'implemented',
        category: 'Output staging',
        purpose: 'Stage the current downstream cells as the checkpoint before canonical geometry rebuild.',
        inputSummary: 'Residual-absorbed cells from 9E (ResidualUvAbsorptionService) and staging metadata.',
        outputSummary: 'Final staged layout artifact ready for pre-verification canonical geometry.',
        summary: `${finalStagingResult.metrics.outputCellCount} cells staged across ${this.numberFormatter.format(finalStagingResult.metrics.totalAreaSquareMeters)} sq m`,
        preview: this.buildPreviewModel(finalStagingResult.artifact.cells),
        metrics: finalStagingMetrics,
        traces: finalStagingResult.traces.map((trace) => ({
          stepId: trace.stepId,
          severity: trace.severity,
          message: trace.message,
        })),
        detailRows: [
          { label: 'Stage label', value: this.finalStagingArguments.stageLabel },
          { label: 'Output layout id', value: finalStagingResult.artifact.layoutId },
          { label: 'Generated pieces staged', value: String(this.countGeneratedCells(finalStagingResult.artifact.cells)) },
          { label: 'Source chain', value: 'Warped orthogonalization → UV cluster + negotiate → Residual absorption → Hallway merge → Final staging' },
        ],
      },
      {
        stepNumber: 10,
        stepId: 'processing.canonical_geometry',
        title: 'Canonical geometry',
        status: 'implemented',
        category: 'Pre-verification topology',
        purpose: 'Rebuild staged per-cell polygons onto shared snapped vertices, split edges at T-junctions, and recompute cell areas before verification consumes the artifact.',
        inputSummary: 'Final staged layout cells with independently owned world-space polygon loops.',
        outputSummary: 'FinalStagedLayoutArtifact-compatible cells whose shared boundaries use identical vertex coordinates.',
        summary: `${canonicalGeometryResult.metrics.outputCellCount} cells canonicalized with ${canonicalGeometryResult.metrics.insertedVertexCount} inserted edge split(s)`,
        preview: this.buildPreviewModel(canonicalGeometryResult.artifact.cells),
        metrics: canonicalGeometryMetrics,
        traces: canonicalGeometryResult.traces.map((trace) => ({
          stepId: trace.stepId,
          severity: trace.severity,
          message: trace.message,
        })),
        detailRows: [
          { label: 'Vertex grid', value: `${this.canonicalGeometryArguments.vertexSnapGridMeters.toFixed(3)} m` },
          { label: 'Split tolerance', value: `${this.canonicalGeometryArguments.edgeSplitToleranceMeters.toFixed(3)} m` },
          { label: 'Minimum segment', value: `${this.canonicalGeometryArguments.minSegmentLengthMeters.toFixed(2)} m` },
          { label: 'Verification source', value: 'Verification consumes this canonical artifact.' },
        ],
      },
    ];
  });

  protected readonly futureFeatures: readonly ProcessingFutureFeature[] = [
    { title: 'Mass balance renegotiation', reason: 'Bypassed — Power Voronoi repartitioning destroys the rectangular grid produced by warped orthogonalization. Area correction is handled by UV edge negotiation instead.' },
    { title: 'Boundary edge stepping', reason: 'Removed — was a diagnostic-only branch that snapped edges to the lot boundary. Not in the verification-feeding chain.' },
    { title: 'Gap absorption', reason: 'Deferred — fills unclaimed gap fragments between cells. Legacy source: buildGapAbsorptionResult (app.ts line 3732). Needs source-faithful migration.' },
    { title: 'Fringe exchange', reason: 'Deferred — reassigns boundary fringe tiles between rooms for compactness. Legacy source: buildFringeExchangeResult / addRoomNegotiationFaces (app.ts line 3986).' },
    { title: 'Polygon simplification', reason: 'Deferred — reduces redundant polygon vertices after refinement. Legacy source: buildSimplificationResult / buildSimplificationFaces (app.ts line 4298).' },
    { title: 'Survivor ranking and promotion', reason: 'Deferred — ranks accepted layouts by score, promotes survivors to gallery, and bridges toward the Revit handoff queue. Depends on verification being stable.' },
    { title: 'Street frontage rule', reason: 'Deferred — verifies that foyer and garage cells touch the RROW/front-edge boundary. Requires lot boundary tagging in the UV pipeline output.' },
  ];

  // Slice 8C / Processing inspection projection.
  // Stage category: projection/presentation.
  // Inputs: canonical buildable polygon plus the currently selected processing-step cells in world space.
  // Outputs: SVG-ready polygons for read-only inspection of any implemented downstream processing step.
  // Allowed dependencies: canonical processing artifacts only.
  // Forbidden responsibilities: processing-step geometry mutation and processing orchestration.
  private buildPreviewModel(cells: readonly { id: string; label: string; color: string; worldPoints: readonly GeometryPoint[] }[]): ProcessingPreviewModel {
    const buildablePoints = this.lotGeometry.buildablePoints.map((point) => ({ x: point.x, y: point.y }));
    const allPoints = [...buildablePoints, ...cells.flatMap((cell) => cell.worldPoints)];
    const minX = Math.min(...allPoints.map((point) => point.x));
    const maxX = Math.max(...allPoints.map((point) => point.x));
    const minY = Math.min(...allPoints.map((point) => point.y));
    const maxY = Math.max(...allPoints.map((point) => point.y));
    const padding = 24;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min(
      (this.previewWidth - padding * 2) / spanX,
      (this.previewHeight - padding * 2) / spanY,
    );
    const offsetX = (this.previewWidth - spanX * scale) / 2;
    const offsetY = (this.previewHeight - spanY * scale) / 2;

    const projectPoint = (point: GeometryPoint) => ({
      x: Number((offsetX + (point.x - minX) * scale).toFixed(2)),
      y: Number((this.previewHeight - (offsetY + (point.y - minY) * scale)).toFixed(2)),
    });
    const projectPolygon = (points: readonly GeometryPoint[]) => points.map((point) => {
      const projected = projectPoint(point);
      return `${projected.x},${projected.y}`;
    }).join(' ');

    return {
      buildablePolygon: projectPolygon(buildablePoints),
      cells: cells.map((cell) => {
        const projectedPoints = cell.worldPoints.map((point) => projectPoint(point));
        const centerX = projectedPoints.reduce((total, point) => total + point.x, 0) / projectedPoints.length;
        const centerY = projectedPoints.reduce((total, point) => total + point.y, 0) / projectedPoints.length;

        return {
          id: cell.id,
          label: cell.label,
          displayLabel: this.buildPreviewLabel(cell.id, cell.label),
          color: cell.color,
          polygon: projectedPoints.map((point) => `${point.x},${point.y}`).join(' '),
          cx: Number(centerX.toFixed(2)),
          cy: Number(centerY.toFixed(2)),
          generated: cell.id.includes('__gap__'),
          transferred: cell.id.includes('__xfr__'),
          hallway: cell.id.includes('hallway'),
        };
      }),
    };
  }

  private buildUvNegotiationPreviewModel(artifact: UvNegotiatedLayoutArtifact): ProcessingPreviewModel {
    const base = this.buildPreviewModel(artifact.cells);
    const { uValues, vValues, majorUValues, majorVValues } = artifact.uvGrid;
    const quad = artifact.quadPoints;
    if (!quad.length || (!uValues.length && !vValues.length)) return base;

    const buildablePoints = this.lotGeometry.buildablePoints.map((p) => ({ x: p.x, y: p.y }));
    const allPoints = [...buildablePoints, ...artifact.cells.flatMap((c) => c.worldPoints)];
    const minX = Math.min(...allPoints.map((p) => p.x));
    const maxX = Math.max(...allPoints.map((p) => p.x));
    const minY = Math.min(...allPoints.map((p) => p.y));
    const maxY = Math.max(...allPoints.map((p) => p.y));
    const padding = 24;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((this.previewWidth - padding * 2) / spanX, (this.previewHeight - padding * 2) / spanY);
    const offsetX = (this.previewWidth - spanX * scale) / 2;
    const offsetY = (this.previewHeight - spanY * scale) / 2;

    const projectSvg = (wx: number, wy: number) => ({
      x: Number((offsetX + (wx - minX) * scale).toFixed(2)),
      y: Number((this.previewHeight - (offsetY + (wy - minY) * scale)).toFixed(2)),
    });

    // Bilinear projection from UV to world space — constant-U and constant-V lines are straight in world space.
    const [p0, p1, p2, p3] = quad as [typeof quad[0], typeof quad[0], typeof quad[0], typeof quad[0]];
    const uvToWorld = (u: number, v: number) => ({
      x: (1 - u) * (1 - v) * p0.x + u * (1 - v) * p1.x + u * v * p2.x + (1 - u) * v * p3.x,
      y: (1 - u) * (1 - v) * p0.y + u * (1 - v) * p1.y + u * v * p2.y + (1 - u) * v * p3.y,
    });

    const majorUSet = new Set(majorUValues.map((v) => +v.toFixed(6)));
    const majorVSet = new Set(majorVValues.map((v) => +v.toFixed(6)));

    const lines: ProcessingPreviewLine[] = [];
    for (const u of uValues) {
      const a = projectSvg(uvToWorld(u, 0).x, uvToWorld(u, 0).y);
      const b = projectSvg(uvToWorld(u, 1).x, uvToWorld(u, 1).y);
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, major: majorUSet.has(+u.toFixed(6)) });
    }
    for (const v of vValues) {
      const a = projectSvg(uvToWorld(0, v).x, uvToWorld(0, v).y);
      const b = projectSvg(uvToWorld(1, v).x, uvToWorld(1, v).y);
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, major: majorVSet.has(+v.toFixed(6)) });
    }

    return { ...base, lines };
  }

  private buildPreviewLabel(cellId: string, fallbackLabel: string): string {
    const compactId = cellId
      .replace(/^layout-[^:]+:/, '')
      .replace(/^simulation-[^:]+:/, '')
      .replace(/__gap__xfr__\d+$/, ' xfr')
      .replace(/__gap__\d+$/, ' gap');
    return compactId.length <= 18 ? compactId : fallbackLabel;
  }

  private countGeneratedCells(cells: readonly { id: string }[]): number {
    return cells.filter((cell) => cell.id.includes('__gap__')).length;
  }

  private buildBubblePolygonPoints(centerX: number, centerY: number, radiusMeters: number): GeometryPoint[] {
    return Array.from({ length: 12 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 12;
      return {
        x: centerX + Math.cos(angle) * radiusMeters,
        y: centerY + Math.sin(angle) * radiusMeters,
      };
    });
  }

  private inverseWarpedGridLocal(
    world: { x: number; y: number },
    quad: readonly { x: number; y: number }[],
  ): { u: number; v: number } {
    let u = 0.5;
    let v = 0.5;
    const [p0, p1, p2, p3] = quad;
    for (let iter = 0; iter < 10; iter++) {
      const px = (1 - u) * (1 - v) * p0.x + u * (1 - v) * p1.x + u * v * p2.x + (1 - u) * v * p3.x;
      const py = (1 - u) * (1 - v) * p0.y + u * (1 - v) * p1.y + u * v * p2.y + (1 - u) * v * p3.y;
      const dux = (1 - v) * (p1.x - p0.x) + v * (p2.x - p3.x);
      const duy = (1 - v) * (p1.y - p0.y) + v * (p2.y - p3.y);
      const dvx = (1 - u) * (p3.x - p0.x) + u * (p2.x - p1.x);
      const dvy = (1 - u) * (p3.y - p0.y) + u * (p2.y - p1.y);
      const rx = world.x - px;
      const ry = world.y - py;
      const det = dux * dvy - duy * dvx;
      if (Math.abs(det) < 1e-10) break;
      u = Math.max(0, Math.min(1, u + (dvy * rx - dvx * ry) / det));
      v = Math.max(0, Math.min(1, v + (dux * ry - duy * rx) / det));
    }
    return { u, v };
  }
}
