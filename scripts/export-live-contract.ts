import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createLayoutId } from '../src/app/core/identity/layout-id.factory';
import { deriveLotGeometry } from '../src/app/core/geometry/lot-geometry.factory';
import { buildDeterministicCandidateLayout } from '../src/app/core/generation/candidate-layout.factory';
import { deriveActiveRoomInstances } from '../src/app/core/generation/room-instance.factory';
import {
  applyCaptureOutcomeToJob,
  buildCapturedLayoutArtifact,
  evaluateSimulationCandidate,
} from '../src/app/core/simulation/simulation-capture.factory';
import { buildSimulationJobs, resetSimulationJob } from '../src/app/core/simulation/simulation-runner.factory';
import { stepSimulationJob } from '../src/app/core/simulation/simulation-physics.factory';
import { DESIGN_SOURCE } from '../src/app/core/source/source-data';
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
} from '../src/app/core/processing/processing.exports';
import type {
  FinalStagingArguments,
  HallwayInjectionArguments,
  HallwayMergeArguments,
  ProvisionalCellGenerationArguments,
  ResidualUvAbsorptionArguments,
  UvEdgeNegotiationArguments,
  VerificationArguments,
  WarpedDiagnosticStagingArguments,
} from '../src/app/core/processing/processing.exports';
import { LayoutGalleryService } from '../src/app/core/processing/layout-gallery.service';
import { analyzeConstructionExternalWalls } from '../src/app/core/construction/external-wall.factory';
import { buildDoorPlacements } from '../src/app/core/construction/door-placement.factory';
import { buildWindowPlacements } from '../src/app/core/construction/window-placement.factory';
import { buildConstructionContract } from '../src/app/core/construction/construction-contract.factory';

const TARGET_COUNT = 1000;
const TOP_K = 10;
const MAX_CYCLES_PER_ATTEMPT = 500;
const CAPTURE_PREPARATION_TICKS = 120;
const OUTPUT_PATH = resolve(process.cwd(), 'generated-exports', 'live-layout-contract.json');

type AcceptedEntry = {
  contract: ReturnType<typeof buildConstructionContract>;
  layoutId: string;
  cycle: number;
  score: number;
};

function main(): void {
  const source = DESIGN_SOURCE;
  const lotGeometry = deriveLotGeometry(source.settings.lot.segments);
  const roomInstances = deriveActiveRoomInstances(source);
  const candidateLayout = buildDeterministicCandidateLayout(roomInstances, lotGeometry);

  const topK: AcceptedEntry[] = []; // max TOP_K entries, sorted score desc
  let totalFound = 0;
  let totalCycles = 0;

  let job = buildSimulationJobs(
    roomInstances,
    candidateLayout,
    lotGeometry,
    source.settings,
    {
      jobCount: 1,
      captureThresholdStart: source.settings.simulation.captureThresholds.start,
      hardResetIntervalMs: 4000,
    },
    null,
  )[0];

  console.log(`Searching for ${TARGET_COUNT} accepted layouts, keeping top ${TOP_K}...`);

  while (totalFound < TARGET_COUNT) {
    let found = false;

    for (let cycle = 1; cycle <= MAX_CYCLES_PER_ATTEMPT; cycle += 1) {
      totalCycles += 1;
      let evolvedJob = job;
      for (let tick = 0; tick < CAPTURE_PREPARATION_TICKS; tick += 1) {
        evolvedJob = stepSimulationJob(evolvedJob, lotGeometry, source.settings);
      }

      const outcome = evaluateSimulationCandidate(evolvedJob, lotGeometry, source.settings);
      const evaluatedJob = applyCaptureOutcomeToJob(evolvedJob, outcome);

      if (outcome.status === 'pass') {
        const layoutId = createLayoutId();
        const capture = buildCapturedLayoutArtifact('export-script', layoutId, evaluatedJob, outcome);
        const verified = runVerificationPipeline(capture, lotGeometry);

        if (verified.artifact.accepted) {
          const gallery = new LayoutGalleryService();
          gallery.promote(verified.artifact, capture.sourceScore);
          const entry = gallery.entries()[0];
          const analysis = analyzeConstructionExternalWalls(entry.artifact);
          const doorPlacements = buildDoorPlacements(entry.artifact, analysis.segments);
          const doorWallIds = new Set(
            doorPlacements.filter((door) => door.wallId !== null).map((door) => door.wallId as string),
          );
          const windowPlacements = buildWindowPlacements(analysis.segments, doorWallIds);
          const contract = buildConstructionContract({ entry, analysis, doorPlacements, windowPlacements });

          totalFound += 1;
          const worstInTop = topK.length > 0 ? topK[topK.length - 1].score : -1;
          if (topK.length < TOP_K || entry.score > worstInTop) {
            topK.push({ contract, layoutId, cycle: totalCycles, score: entry.score });
            topK.sort((a, b) => b.score - a.score);
            if (topK.length > TOP_K) topK.pop();
          }
          if (totalFound % 50 === 0 || topK.length <= TOP_K) {
            console.log(`[${totalFound}/${TARGET_COUNT}] score=${entry.score.toFixed(4)}  cycle=${totalCycles}  top=${topK[0].score.toFixed(4)}`);
          }
          found = true;

          job = resetSimulationJob(
            evaluatedJob, roomInstances, candidateLayout, lotGeometry, source.settings,
            source.settings.simulation.captureThresholds.start, null,
          );
          break;
        }
      }

      job = resetSimulationJob(
        evaluatedJob, roomInstances, candidateLayout, lotGeometry, source.settings,
        outcome.status === 'pass' ? source.settings.simulation.captureThresholds.start : evaluatedJob.captureThreshold,
        null,
      );
    }

    if (!found) {
      throw new Error(`Could not find layout #${totalFound + 1} within ${MAX_CYCLES_PER_ATTEMPT} cycles.`);
    }
  }

  const best = topK[0];

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(best.contract, null, 2)}\n`, 'utf8');

  console.log(`\nDone — ${TARGET_COUNT} layouts over ${totalCycles} total cycles.`);
  console.log(`\nTop ${topK.length}:`);
  topK.forEach((e, i) => console.log(`  #${i + 1}  score=${e.score.toFixed(4)}  id=${e.layoutId}`));
  console.log(`\nExported #1 to ${OUTPUT_PATH}`);
  console.log(`cells=${best.contract.cells.length} doors=${best.contract.doors.length} windows=${best.contract.windows.length} walls=${best.contract.externalWalls.length}`);
}

function runVerificationPipeline(
  capture: ReturnType<typeof buildCapturedLayoutArtifact>,
  lotGeometry: ReturnType<typeof deriveLotGeometry>,
) {
  const args = buildVerificationArguments(lotGeometry);
  const ref = { layoutId: capture.layoutId, sourceStageId: 'layout-exploration.capture', sourceScore: capture.sourceScore };

  const provisional = new ProvisionalCellGenerationService().run({ artifact: capture, artifactRef: ref, arguments: args.provisional });
  const hallway = new HallwayInjectionService().run({ artifact: provisional.artifact, artifactRef: { ...ref, sourceStageId: 'processing.provisional_cells' }, arguments: args.hallway });
  const warped = new WarpedDiagnosticStagingService().run({ artifact: hallway.artifact, artifactRef: { ...ref, sourceStageId: 'processing.hallway_injection' }, arguments: args.warpedDiagnostic });
  const uvNeg = new UvEdgeNegotiationService().run({ artifact: warped.artifact, artifactRef: { ...ref, sourceStageId: 'processing.warped_diagnostic' }, arguments: args.uvEdgeNegotiation });
  const residual = new ResidualUvAbsorptionService().run({ artifact: uvNeg.artifact, artifactRef: { ...ref, sourceStageId: 'processing.uv_edge_negotiation' }, arguments: args.residualUvAbsorption });
  const merged = new HallwayMergeService().run({ artifact: residual.artifact, artifactRef: { ...ref, sourceStageId: 'processing.residual_uv_absorption' }, arguments: args.hallwayMerge });
  const staged = new FinalStagingService().run({ artifact: merged.artifact, artifactRef: { ...ref, sourceStageId: 'processing.hallway_merge' }, arguments: args.finalStaging });
  const canonical = new CanonicalGeometryService().run({ artifact: staged.artifact, artifactRef: { ...ref, sourceStageId: 'processing.final_staging' }, arguments: args.canonicalGeometry });
  return new VerificationService().run({ artifact: canonical.artifact, artifactRef: { ...ref, sourceStageId: 'processing.canonical_geometry' }, arguments: args.verification });
}

function buildVerificationArguments(lotGeometry: ReturnType<typeof deriveLotGeometry>): {
  provisional: ProvisionalCellGenerationArguments;
  hallway: HallwayInjectionArguments;
  warpedDiagnostic: WarpedDiagnosticStagingArguments;
  uvEdgeNegotiation: UvEdgeNegotiationArguments;
  residualUvAbsorption: ResidualUvAbsorptionArguments;
  hallwayMerge: HallwayMergeArguments;
  finalStaging: FinalStagingArguments;
  canonicalGeometry: {
    vertexSnapGridMeters: number;
    edgeSplitToleranceMeters: number;
    minSegmentLengthMeters: number;
  };
  verification: VerificationArguments;
} {
  const source = DESIGN_SOURCE;
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
    hallwayMerge: { edgeMatchEpsilon: 1e-3 },
    finalStaging: { stageLabel: 'export-script' },
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

main();
