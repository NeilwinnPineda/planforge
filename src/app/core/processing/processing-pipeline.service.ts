import { inject, Injectable } from '@angular/core';
import { LotGeometryService } from '../geometry/geometry.exports';
import { ReportingEndpointService } from '../reporting/reporting-endpoint.service';
import type { PipelineReport } from '../reporting/models/pipeline-report.model';
import { SourceReadService } from '../source/source.exports';
import type { LayoutExplorationCaptureArtifact } from '../simulation/models/simulation-runner.model';
import {
  CanonicalGeometryService,
  FinalStagingService,
  HallwayInjectionService,
  HallwayMergeService,
  ProvisionalCellGenerationService,
  ResidualUvAbsorptionService,
  UvEdgeNegotiationService,
  VerificationService,
  WarpedDiagnosticStagingService,
  type CanonicalGeometryArguments,
  type FinalStagingArguments,
  type HallwayInjectionArguments,
  type HallwayMergeArguments,
  type ProvisionalCellGenerationArguments,
  type ResidualUvAbsorptionArguments,
  type UvEdgeNegotiationArguments,
  type VerificationArguments,
  type WarpedDiagnosticStagingArguments,
} from './processing.exports';

export interface ProcessingPipelineArgumentsBundle {
  readonly provisional: ProvisionalCellGenerationArguments;
  readonly hallway: HallwayInjectionArguments;
  readonly warpedDiagnostic: WarpedDiagnosticStagingArguments;
  readonly uvEdgeNegotiation: UvEdgeNegotiationArguments;
  readonly residualUvAbsorption: ResidualUvAbsorptionArguments;
  readonly hallwayMerge: HallwayMergeArguments;
  readonly finalStaging: FinalStagingArguments;
  readonly canonicalGeometry: CanonicalGeometryArguments;
  readonly verification: VerificationArguments;
}

export interface ProcessingPipelineSnapshot {
  readonly capture: LayoutExplorationCaptureArtifact;
  readonly argumentsBundle: ProcessingPipelineArgumentsBundle;
  readonly provisionalResult: ReturnType<ProvisionalCellGenerationService['run']>;
  readonly hallwayResult: ReturnType<HallwayInjectionService['run']>;
  readonly warpedDiagnosticResult: ReturnType<WarpedDiagnosticStagingService['run']>;
  readonly uvEdgeNegotiationResult: ReturnType<UvEdgeNegotiationService['run']>;
  readonly residualUvAbsorptionResult: ReturnType<ResidualUvAbsorptionService['run']>;
  readonly hallwayMergeResult: ReturnType<HallwayMergeService['run']>;
  readonly finalStagingResult: ReturnType<FinalStagingService['run']>;
  readonly canonicalGeometryResult: ReturnType<CanonicalGeometryService['run']>;
  readonly verificationResult: ReturnType<VerificationService['run']>;
}

@Injectable({ providedIn: 'root' })
export class ProcessingPipelineService {
  private readonly lotGeometryService = inject(LotGeometryService);
  private readonly sourceReadService = inject(SourceReadService);
  private readonly provisionalCellGenerationService = inject(ProvisionalCellGenerationService);
  private readonly hallwayInjectionService = inject(HallwayInjectionService);
  private readonly warpedDiagnosticStagingService = inject(WarpedDiagnosticStagingService);
  private readonly uvEdgeNegotiationService = inject(UvEdgeNegotiationService);
  private readonly residualUvAbsorptionService = inject(ResidualUvAbsorptionService);
  private readonly hallwayMergeService = inject(HallwayMergeService);
  private readonly finalStagingService = inject(FinalStagingService);
  private readonly canonicalGeometryService = inject(CanonicalGeometryService);
  private readonly verificationService = inject(VerificationService);
  private readonly reportingEndpointService = inject(ReportingEndpointService);

  buildArguments(stageLabel: string): ProcessingPipelineArgumentsBundle {
    const lotGeometry = this.lotGeometryService.getActiveLotGeometry();
    const source = this.sourceReadService.getActiveSourceSnapshot().source;

    const openAccessTypeIds = source.roomCatalog
      .filter((room) => room.tags.includes('open_access'))
      .map((room) => room.id);

    const criticalPairs = [
      ...source.settings.rules.special
        .filter((rule) => rule.note?.toLowerCase().includes('touch mode'))
        .flatMap((rule) => {
          const pairs: { typeA: string; typeB: string; label: string }[] = [];
          for (let i = 0; i < rule.rooms.length - 1; i += 1) {
            for (let j = i + 1; j < rule.rooms.length; j += 1) {
              pairs.push({ typeA: rule.rooms[i], typeB: rule.rooms[j], label: rule.label });
            }
          }
          return pairs;
        }),
      ...source.settings.rules.blockers
        .filter((rule) => rule.rooms.length === 2)
        .map((rule) => ({ typeA: rule.rooms[0], typeB: rule.rooms[1], label: rule.label })),
    ];

    const frontageBuildableEdges = lotGeometry.lotSegments
      .map((segment, index) => ({
        isRrow: segment.isRrow,
        from: lotGeometry.buildablePoints[index],
        to: lotGeometry.buildablePoints[(index + 1) % lotGeometry.buildablePoints.length],
      }))
      .filter((edge) => edge.isRrow)
      .map((edge) => ({ from: edge.from, to: edge.to }));

    return {
      provisional: {
        buildablePoints: lotGeometry.buildablePoints,
        snapToAxis: false,
        looseBisector: true,
        fillerWeightScale: 0.35,
        hallwayWeightScale: 0.25,
      },
      hallway: {
        buildablePoints: lotGeometry.buildablePoints,
        hallwayTargetSquareMeters: 2,
        spacingMultiplier: 3,
        minHallwayAreaSquareMeters: 0.5,
        rebalanceIterations: 24,
        rebalanceGain: 0.12,
        roomDriftGain: 0.08,
        hallwayDriftGain: 0.14,
        stableDeviation: 0.02,
        stableRunsRequired: 3,
      },
      warpedDiagnostic: {
        buildablePoints: lotGeometry.buildablePoints,
        rebalanceIterations: 18,
        rebalanceGain: 0.18,
        stableDeviation: 0.02,
        stableRunsRequired: 3,
        roomDriftGain: 0.05,
        hallwayDriftGain: 0.08,
      },
      uvEdgeNegotiation: {
        quadPoints: lotGeometry.buildablePoints,
        snapThreshold: 0.05,
        majorAxisSnapMultiplier: 1.5,
        minExtent: 0.04,
        shiftGain: 0.05,
        maxPasses: 8,
        stableShift: 1e-4,
        targetAspectRatio: 4.5,
        maxAspectPasses: 10,
      },
      residualUvAbsorption: {
        fillerColor: '#e8dfc8',
        hallwayColor: '#d4d0c0',
      },
      hallwayMerge: {
        edgeMatchEpsilon: 1e-3,
      },
      finalStaging: {
        stageLabel,
      },
      canonicalGeometry: {
        vertexSnapGridMeters: 0.001,
        edgeSplitToleranceMeters: 0.001,
        minSegmentLengthMeters: 0.01,
      },
      verification: {
        deficiencyThreshold: 0.75,
        aspectRatioThreshold: 4.5,
        openAccessTypeIds,
        foyerTypeIds: ['foyer'],
        criticalPairs,
        adjacencyEdgeEpsilon: 1e-3,
        garageTypeIds: ['garage'],
        frontageBuildableEdges,
        sliverMinDimension: 0.5,
      },
    };
  }

  runFromCapture(
    capture: LayoutExplorationCaptureArtifact,
    stageLabel: string,
  ): ProcessingPipelineSnapshot {
    const argumentsBundle = this.buildArguments(stageLabel);
    const artifactRef = {
      layoutId: capture.layoutId,
      sourceStageId: 'layout-exploration.capture',
      sourceScore: capture.sourceScore,
    };

    const provisionalResult = this.provisionalCellGenerationService.run({
      artifact: capture,
      artifactRef,
      arguments: argumentsBundle.provisional,
    });
    const hallwayResult = this.hallwayInjectionService.run({
      artifact: provisionalResult.artifact,
      artifactRef: { ...artifactRef, sourceStageId: 'processing.provisional_cells' },
      arguments: argumentsBundle.hallway,
    });
    const warpedDiagnosticResult = this.warpedDiagnosticStagingService.run({
      artifact: hallwayResult.artifact,
      artifactRef: { ...artifactRef, sourceStageId: 'processing.hallway_injection' },
      arguments: argumentsBundle.warpedDiagnostic,
    });
    const uvEdgeNegotiationResult = this.uvEdgeNegotiationService.run({
      artifact: warpedDiagnosticResult.artifact,
      artifactRef: { ...artifactRef, sourceStageId: 'processing.warped_diagnostic' },
      arguments: argumentsBundle.uvEdgeNegotiation,
    });
    const residualUvAbsorptionResult = this.residualUvAbsorptionService.run({
      artifact: uvEdgeNegotiationResult.artifact,
      artifactRef: { ...artifactRef, sourceStageId: 'processing.uv_edge_negotiation' },
      arguments: argumentsBundle.residualUvAbsorption,
    });
    const hallwayMergeResult = this.hallwayMergeService.run({
      artifact: residualUvAbsorptionResult.artifact,
      artifactRef: { ...artifactRef, sourceStageId: 'processing.residual_uv_absorption' },
      arguments: argumentsBundle.hallwayMerge,
    });
    const finalStagingResult = this.finalStagingService.run({
      artifact: hallwayMergeResult.artifact,
      artifactRef: { ...artifactRef, sourceStageId: 'processing.hallway_merge' },
      arguments: argumentsBundle.finalStaging,
    });
    const canonicalGeometryResult = this.canonicalGeometryService.run({
      artifact: finalStagingResult.artifact,
      artifactRef: { ...artifactRef, sourceStageId: 'processing.final_staging' },
      arguments: argumentsBundle.canonicalGeometry,
    });
    const verificationResult = this.verificationService.run({
      artifact: canonicalGeometryResult.artifact,
      artifactRef: { ...artifactRef, sourceStageId: 'processing.canonical_geometry' },
      arguments: argumentsBundle.verification,
    });

    return {
      capture,
      argumentsBundle,
      provisionalResult,
      hallwayResult,
      warpedDiagnosticResult,
      uvEdgeNegotiationResult,
      residualUvAbsorptionResult,
      hallwayMergeResult,
      finalStagingResult,
      canonicalGeometryResult,
      verificationResult,
    };
  }

  buildVerificationDiagnosticReport(snapshot: ProcessingPipelineSnapshot): PipelineReport {
    const verificationArtifact = snapshot.verificationResult.artifact;
    const findings: string[] = [
      ...snapshot.uvEdgeNegotiationResult.traces
        .filter((trace) => trace.severity !== 'info')
        .map((trace) => `[${trace.stepId}] ${trace.message}`),
      ...snapshot.residualUvAbsorptionResult.traces
        .filter((trace) => trace.severity !== 'info')
        .map((trace) => `[${trace.stepId}] ${trace.message}`),
      ...snapshot.hallwayMergeResult.traces
        .filter((trace) => trace.severity !== 'info')
        .map((trace) => `[${trace.stepId}] ${trace.message}`),
    ];

    const categoryCount = verificationArtifact.cells.reduce<Record<string, number>>((accumulator, cell) => {
      const category = cell.hallway ? 'circulation' : cell.pkg ? 'boundary' : 'room';
      accumulator[category] = (accumulator[category] ?? 0) + 1;
      return accumulator;
    }, {});

    return {
      id: `pipeline-diag-${verificationArtifact.layoutId}-${Date.now()}`,
      reportKind: 'layout-pass',
      lifecycle: verificationArtifact.accepted ? 'passed' : 'captured',
      runId: verificationArtifact.layoutId,
      outputId: verificationArtifact.layoutId,
      stageId: 'processing.pipeline-diagnostic',
      timestamp: new Date().toISOString(),
      sourceId: verificationArtifact.sourceCaptureRecordId,
      sourceVersion: '1',
      inputSummary: {
        activeRoomInstances: verificationArtifact.cells.filter((cell) => !cell.pkg && !cell.hallway).length,
        activeRoomTypes: new Set(verificationArtifact.cells.map((cell) => cell.typeId)).size,
        frontageSegments: 0,
      },
      artifactSummary: {
        polygonCount: verificationArtifact.cells.length,
        categories: categoryCount,
      },
      validationSummary: {
        status: findings.length > 0 ? 'warn' : 'pass',
        findings,
      },
      selectionMetrics: {
        score: 0,
        reason: verificationArtifact.accepted
          ? 'accepted'
          : `culled: ${verificationArtifact.cullReasons.join(', ')}`,
      },
      artifactContent: {
        polygons: verificationArtifact.cells.map((cell) => ({
          id: cell.id,
          label: cell.label || cell.typeId,
          category: (cell.hallway ? 'circulation' : cell.pkg ? 'boundary' : 'room') as 'room' | 'circulation' | 'boundary',
          color: cell.color,
          vertices: cell.worldPoints.map((point) => ({ x: point.x, y: point.y })),
        })),
      },
    };
  }

  async postVerificationDiagnostic(snapshot: ProcessingPipelineSnapshot): Promise<void> {
    await this.reportingEndpointService.postReport(this.buildVerificationDiagnosticReport(snapshot));
  }
}
