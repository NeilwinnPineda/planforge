import { Injectable, effect, inject, untracked } from '@angular/core';
import { LotGeometryService } from '../geometry/geometry.exports';
import { SourceReadService } from '../source/source.exports';
import { SimulationStageService } from '../simulation/simulation.exports';
import type { LayoutExplorationCaptureArtifact } from '../simulation/models/simulation-runner.model';
import {
  FinalStagingService,
  HallwayInjectionService,
  HallwayMergeService,
  CanonicalGeometryService,
  ProvisionalCellGenerationService,
  ResidualUvAbsorptionService,
  UvEdgeNegotiationService,
  VerificationService,
  WarpedDiagnosticStagingService,
} from './processing.exports';
import type {
  FinalStagingArguments,
  HallwayInjectionArguments,
  HallwayMergeArguments,
  CanonicalGeometryArguments,
  ProvisionalCellGenerationArguments,
  ResidualUvAbsorptionArguments,
  UvEdgeNegotiationArguments,
  VerificationArguments,
  WarpedDiagnosticStagingArguments,
} from './processing.exports';
import { LayoutGalleryService } from './layout-gallery.service';

@Injectable({ providedIn: 'root' })
export class VerificationOrchestratorService {
  private readonly simulationStageService = inject(SimulationStageService);
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
  private readonly galleryService = inject(LayoutGalleryService);

  private readonly processedIds = new Set<string>();

  constructor() {
    effect(() => {
      const captures = this.simulationStageService.captureArtifacts();
      untracked(() => {
        for (const capture of captures) {
          if (this.processedIds.has(capture.recordId)) continue;
          this.processedIds.add(capture.recordId);
          this.runPipeline(capture);
        }
      });
    }, { allowSignalWrites: true });
  }

  private buildArguments(capture: LayoutExplorationCaptureArtifact): {
    provisional: ProvisionalCellGenerationArguments;
    hallway: HallwayInjectionArguments;
    warpedDiagnostic: WarpedDiagnosticStagingArguments;
    uvEdgeNegotiation: UvEdgeNegotiationArguments;
    residualUvAbsorption: ResidualUvAbsorptionArguments;
    hallwayMerge: HallwayMergeArguments;
    finalStaging: FinalStagingArguments;
    canonicalGeometry: CanonicalGeometryArguments;
    verification: VerificationArguments;
  } {
    const lotGeometry = this.lotGeometryService.getActiveLotGeometry();
    const source = this.sourceReadService.getActiveSourceSnapshot().source;

    const openAccessTypeIds = source.roomCatalog
      .filter((r) => r.tags.includes('open_access'))
      .map((r) => r.id);

    const criticalPairs = [
      ...source.settings.rules.special
        .filter((rule) => rule.note?.toLowerCase().includes('touch mode'))
        .flatMap((rule) => {
          const pairs: { typeA: string; typeB: string; label: string }[] = [];
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

    const frontageBuildableEdges = lotGeometry.lotSegments
      .map((seg, i) => ({
        isRrow: seg.isRrow,
        from: lotGeometry.buildablePoints[i],
        to: lotGeometry.buildablePoints[(i + 1) % lotGeometry.buildablePoints.length],
      }))
      .filter((e) => e.isRrow)
      .map((e) => ({ from: e.from, to: e.to }));

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
      hallwayMerge: { edgeMatchEpsilon: 1e-3 },
      finalStaging: { stageLabel: 'orchestrator checkpoint' },
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

  private runPipeline(capture: LayoutExplorationCaptureArtifact): void {
    try {
      const args = this.buildArguments(capture);
      const ref = { layoutId: capture.layoutId, sourceStageId: 'layout-exploration.capture', sourceScore: capture.sourceScore };

      const provisional = this.provisionalCellGenerationService.run({ artifact: capture, artifactRef: ref, arguments: args.provisional });
      const hallway = this.hallwayInjectionService.run({ artifact: provisional.artifact, artifactRef: { ...ref, sourceStageId: 'processing.provisional_cells' }, arguments: args.hallway });
      const warped = this.warpedDiagnosticStagingService.run({ artifact: hallway.artifact, artifactRef: { ...ref, sourceStageId: 'processing.hallway_injection' }, arguments: args.warpedDiagnostic });
      const uvNeg = this.uvEdgeNegotiationService.run({ artifact: warped.artifact, artifactRef: { ...ref, sourceStageId: 'processing.warped_diagnostic' }, arguments: args.uvEdgeNegotiation });
      const residual = this.residualUvAbsorptionService.run({ artifact: uvNeg.artifact, artifactRef: { ...ref, sourceStageId: 'processing.uv_edge_negotiation' }, arguments: args.residualUvAbsorption });
      const merged = this.hallwayMergeService.run({ artifact: residual.artifact, artifactRef: { ...ref, sourceStageId: 'processing.residual_uv_absorption' }, arguments: args.hallwayMerge });
      const staged = this.finalStagingService.run({ artifact: merged.artifact, artifactRef: { ...ref, sourceStageId: 'processing.hallway_merge' }, arguments: args.finalStaging });
      const canonical = this.canonicalGeometryService.run({ artifact: staged.artifact, artifactRef: { ...ref, sourceStageId: 'processing.final_staging' }, arguments: args.canonicalGeometry });
      const verified = this.verificationService.run({ artifact: canonical.artifact, artifactRef: { ...ref, sourceStageId: 'processing.canonical_geometry' }, arguments: args.verification });

      if (verified.artifact.accepted) {
        this.galleryService.promote(verified.artifact, capture.sourceScore);
      } else {
        this.simulationStageService.cullLayout(capture.layoutId);
      }
    } catch (err) {
      this.simulationStageService.cullLayout(capture.layoutId);
      console.warn(`[VerificationOrchestrator] Pipeline failed for ${capture.layoutId}:`, err);
    }
  }
}
