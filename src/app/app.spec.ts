import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { DESIGN_SOURCE, DESIGN_SOURCE_VALIDATION, validateDesignSource } from './core/source/source.exports';
import { buildReportingSelfTestReports } from './core/reporting/reporting-self-test.factory';
import { appRoutes } from './app.routes';
import { deriveLotGeometry } from './core/geometry/geometry.exports';
import { buildDeterministicCandidateLayout, deriveActiveRoomInstances } from './core/generation/generation.exports';
import {
  CanonicalGeometryService,
  VerificationService,
  type FinalStagedLayoutArtifact,
  type VerifiedLayoutArtifact,
} from './core/processing/processing.exports';
import { LayoutGalleryService } from './core/processing/layout-gallery.service';
import {
  applyCaptureOutcomeToJob,
  buildSimulationCaptureReport,
  buildSimulationJobs,
  computeSimulationSatRows,
  evaluateSimulationCandidate,
  shakeSimulationJob,
  stepSimulationJob,
} from './core/simulation/simulation.exports';

describe('App', () => {
  let fixture: ComponentFixture<App> | null = null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(appRoutes)],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = null;
  });

  it('creates the planforge shell', () => {
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance).toBeTruthy();
    expect(compiled.querySelector('h1')?.textContent).toContain('Residential Layout Studio');
    expect(compiled.textContent).toContain('Set up the project, generate layout options, review what works, and prepare the strongest result for export.');
  });

  it('keeps the local app-next source artifact valid', () => {
    const validation = validateDesignSource(DESIGN_SOURCE);

    expect(validation.status).toBe('pass');
    expect(validation.counts.activeRoomInstances).toBeGreaterThan(0);
    expect(validation.counts.frontageSegments).toBe(1);
    expect(validation.messages.some((message) => message.level === 'fail')).toBe(false);
    expect(DESIGN_SOURCE_VALIDATION.status).toBe('pass');
  });

  it('builds self-test reports with geometry content for endpoint inspection', () => {
    const reports = buildReportingSelfTestReports({
      source: DESIGN_SOURCE,
      validation: DESIGN_SOURCE_VALIDATION,
      origin: 'default',
    });

    expect(reports).toHaveLength(2);
    expect(reports[0].reportKind).toBe('simulation-capture');
    expect(reports[1].reportKind).toBe('layout-pass');
    expect(reports.every((report) => report.artifactContent.polygons.length > 0)).toBe(true);
    expect(reports.every((report) => report.artifactSummary.polygonCount === report.artifactContent.polygons.length)).toBe(true);
  });

  it('derives canonical lot and buildable polygons from the active source', () => {
    const lotGeometry = deriveLotGeometry(DESIGN_SOURCE.settings.lot.segments);

    expect(lotGeometry.lotPoints.length).toBeGreaterThanOrEqual(3);
    expect(lotGeometry.buildablePoints.length).toBeGreaterThanOrEqual(3);
    expect(lotGeometry.lotAreaSquareMeters).toBeGreaterThan(lotGeometry.buildableAreaSquareMeters);
    expect(lotGeometry.frontageSegments).toBe(1);
    expect(lotGeometry.closureErrorMeters).toBeLessThan(0.01);
  });

  it('derives active room instances and a deterministic candidate layout', () => {
    const roomInstances = deriveActiveRoomInstances(DESIGN_SOURCE);
    const lotGeometry = deriveLotGeometry(DESIGN_SOURCE.settings.lot.segments);
    const candidateLayout = buildDeterministicCandidateLayout(roomInstances, lotGeometry);

    expect(roomInstances.length).toBeGreaterThan(0);
    expect(candidateLayout.seeds.length).toBe(roomInstances.length);
    expect(candidateLayout.method).toBe('deterministic-band-seeding');
    expect(candidateLayout.seeds.some((seed) => seed.band === 'front')).toBe(true);
  });

  it('builds simulation jobs from the deterministic candidate layout', () => {
    const roomInstances = deriveActiveRoomInstances(DESIGN_SOURCE);
    const lotGeometry = deriveLotGeometry(DESIGN_SOURCE.settings.lot.segments);
    const candidateLayout = buildDeterministicCandidateLayout(roomInstances, lotGeometry);
    const jobs = buildSimulationJobs(roomInstances, candidateLayout, lotGeometry, DESIGN_SOURCE.settings, {
      jobCount: 1,
      captureThresholdStart: DESIGN_SOURCE.settings.simulation.captureThresholds.start,
      hardResetIntervalMs: 4000,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs.every((job) => job.bubbles.length >= roomInstances.length)).toBe(true);
    expect(jobs.some((job) => job.bubbles.some((bubble) => bubble.pkg))).toBe(true);
    expect(jobs.every((job) => job.captureThreshold === DESIGN_SOURCE.settings.simulation.captureThresholds.start)).toBe(true);
  });

  it('shakes a simulation job without changing bubble identity', () => {
    const lotGeometry = deriveLotGeometry(DESIGN_SOURCE.settings.lot.segments);
    const roomInstances = deriveActiveRoomInstances(DESIGN_SOURCE);
    const candidateLayout = buildDeterministicCandidateLayout(roomInstances, lotGeometry);
    const [job] = buildSimulationJobs(roomInstances, candidateLayout, lotGeometry, DESIGN_SOURCE.settings, {
      jobCount: 1,
      captureThresholdStart: DESIGN_SOURCE.settings.simulation.captureThresholds.start,
      hardResetIntervalMs: 4000,
    });
    const shakenJob = shakeSimulationJob(job);

    expect(shakenJob.shakeCount).toBe(job.shakeCount + 1);
    expect(shakenJob.bubbles.map((bubble) => bubble.instanceId)).toEqual(
      job.bubbles.map((bubble) => bubble.instanceId),
    );
  });

  it('steps a simulation job with bounded motion inside the buildable geometry', () => {
    const lotGeometry = deriveLotGeometry(DESIGN_SOURCE.settings.lot.segments);
    const roomInstances = deriveActiveRoomInstances(DESIGN_SOURCE);
    const candidateLayout = buildDeterministicCandidateLayout(roomInstances, lotGeometry);
    const [job] = buildSimulationJobs(roomInstances, candidateLayout, lotGeometry, DESIGN_SOURCE.settings, {
      jobCount: 1,
      captureThresholdStart: DESIGN_SOURCE.settings.simulation.captureThresholds.start,
      hardResetIntervalMs: 4000,
    });
    const steppedJob = stepSimulationJob(job, lotGeometry, DESIGN_SOURCE.settings);

    expect(steppedJob.tickCount).toBe(job.tickCount + 1);
    expect(steppedJob.bubbles).toHaveLength(job.bubbles.length);
    expect(
      steppedJob.bubbles.every((bubble) =>
        bubble.x >= lotGeometry.buildableBounds.minX
        && bubble.x <= lotGeometry.buildableBounds.maxX
        && bubble.y >= lotGeometry.buildableBounds.minY
        && bubble.y <= lotGeometry.buildableBounds.maxY,
      ),
    ).toBe(true);
  });

  it('computes simulation SAT rows from the active bubbles', () => {
    const lotGeometry = deriveLotGeometry(DESIGN_SOURCE.settings.lot.segments);
    const roomInstances = deriveActiveRoomInstances(DESIGN_SOURCE);
    const candidateLayout = buildDeterministicCandidateLayout(roomInstances, lotGeometry);
    const [job] = buildSimulationJobs(roomInstances, candidateLayout, lotGeometry, DESIGN_SOURCE.settings, {
      jobCount: 1,
      captureThresholdStart: DESIGN_SOURCE.settings.simulation.captureThresholds.start,
      hardResetIntervalMs: 4000,
    });
    const satRows = computeSimulationSatRows(job.bubbles, DESIGN_SOURCE.settings);

    expect(satRows.attractionRows.length + satRows.repelRows.length).toBeGreaterThan(0);
  });

  it('evaluates a simulation candidate with explicit pass or fail reasoning', () => {
    const lotGeometry = deriveLotGeometry(DESIGN_SOURCE.settings.lot.segments);
    const roomInstances = deriveActiveRoomInstances(DESIGN_SOURCE);
    const candidateLayout = buildDeterministicCandidateLayout(roomInstances, lotGeometry);
    const [job] = buildSimulationJobs(roomInstances, candidateLayout, lotGeometry, DESIGN_SOURCE.settings, {
      jobCount: 1,
      captureThresholdStart: DESIGN_SOURCE.settings.simulation.captureThresholds.start,
      hardResetIntervalMs: 4000,
    });
    const outcome = evaluateSimulationCandidate(job, lotGeometry, DESIGN_SOURCE.settings);
    const evaluatedJob = applyCaptureOutcomeToJob(job, outcome);

    expect(['fail', 'pass']).toContain(outcome.status);
    expect(outcome.reason.length).toBeGreaterThan(0);
    expect(evaluatedJob.lastCaptureOutcome?.reason).toBe(outcome.reason);
  });

  it('builds a simulation capture report from an accepted candidate summary', () => {
    const lotGeometry = deriveLotGeometry(DESIGN_SOURCE.settings.lot.segments);
    const roomInstances = deriveActiveRoomInstances(DESIGN_SOURCE);
    const candidateLayout = buildDeterministicCandidateLayout(roomInstances, lotGeometry);
    const [job] = buildSimulationJobs(roomInstances, candidateLayout, lotGeometry, DESIGN_SOURCE.settings, {
      jobCount: 1,
      captureThresholdStart: DESIGN_SOURCE.settings.simulation.captureThresholds.start,
      hardResetIntervalMs: 4000,
    });
    const report = buildSimulationCaptureReport(
      'test-core',
      'LTESTCAPTURE001',
      { source: DESIGN_SOURCE, validation: DESIGN_SOURCE_VALIDATION, origin: 'default' },
      candidateLayout,
      job,
      {
        status: 'pass',
        reason: 'Test capture accepted.',
        score: 0.81,
        thresholdBefore: 0.7,
        thresholdAfter: 0.7,
        frontEdgePassed: true,
        attractionAverage: 0.8,
        repelAverage: 0.82,
        evaluatedAtIso: new Date().toISOString(),
        reportStatus: 'pending',
        reportMessage: null,
      },
    );

    expect(report.reportKind).toBe('simulation-capture');
    expect(report.outputId).toBe('LTESTCAPTURE001');
    expect(report.artifactContent.polygons.length).toBeGreaterThan(0);
  });

  it('ranks smaller construction external-wall perimeter higher', () => {
    const gallery = new LayoutGalleryService();
    const compact = buildVerifiedSingleRoomArtifact('compact-layout', 10, 16);
    const exposed = buildVerifiedSingleRoomArtifact('exposed-layout', 4, 40);

    gallery.promote(compact, 0.8);
    gallery.promote(exposed, 0.8);

    const entries = gallery.entries();

    expect(entries[0].artifact.layoutId).toBe('compact-layout');
    expect(entries[0].scoreBreakdown.externalWallPerimeterMeters).toBeLessThan(entries[1].scoreBreakdown.externalWallPerimeterMeters);
    expect(entries[0].scoreBreakdown.externalWallPerimeterEfficiency).toBeGreaterThan(entries[1].scoreBreakdown.externalWallPerimeterEfficiency);
  });

  it('canonicalizes near-shared room vertices before overlap verification', () => {
    const artifact: FinalStagedLayoutArtifact = {
      layoutId: 'canonical-overlap-regression',
      sourceCaptureRecordId: 'test-capture',
      generatedAtIso: new Date().toISOString(),
      cells: [
        {
          id: 'living',
          typeId: 'living',
          label: 'Living Room',
          color: '#8ecae6',
          tags: [],
          pkg: false,
          hallway: false,
          worldPoints: [
            { x: 6.934, y: 4.966 },
            { x: 11.999, y: 4.968 },
            { x: 11.997, y: 9.081 },
            { x: 6.932, y: 9.079 },
          ],
          areaSquareMeters: 20,
          targetSquareMeters: 0,
          areaDelta: 0,
          mass: 1,
        },
        {
          id: 'foyer',
          typeId: 'foyer',
          label: 'Foyer',
          color: '#ede3c8',
          tags: [],
          pkg: false,
          hallway: false,
          worldPoints: [
            { x: 6.934, y: 3.002 },
            { x: 9.437, y: 3.003 },
            { x: 9.437, y: 4.967 },
            { x: 6.934, y: 4.966 },
          ],
          areaSquareMeters: 4,
          targetSquareMeters: 0,
          areaDelta: 0,
          mass: 1,
        },
        {
          id: 'shared_bath',
          typeId: 'shared_bath',
          label: 'Shared Bath',
          color: '#6db8a0',
          tags: [],
          pkg: false,
          hallway: false,
          worldPoints: [
            { x: 9.437, y: 3.003 },
            { x: 11.999, y: 3.003 },
            { x: 11.999, y: 4.968 },
            { x: 9.437, y: 4.967 },
          ],
          areaSquareMeters: 5,
          targetSquareMeters: 0,
          areaDelta: 0,
          mass: 1,
        },
      ],
    };
    const verification = new VerificationService();
    const canonical = new CanonicalGeometryService().run({
      artifact,
      artifactRef: { layoutId: artifact.layoutId, sourceStageId: 'test' },
      arguments: {
        vertexSnapGridMeters: 0.001,
        edgeSplitToleranceMeters: 0.001,
        minSegmentLengthMeters: 0.01,
      },
    });

    const result = verification.run({
      artifact: canonical.artifact,
      artifactRef: { layoutId: artifact.layoutId, sourceStageId: 'processing.canonical_geometry' },
      arguments: {
        deficiencyThreshold: 0.75,
        aspectRatioThreshold: 99,
        openAccessTypeIds: ['living', 'foyer', 'shared_bath'],
        foyerTypeIds: ['foyer'],
        criticalPairs: [],
        adjacencyEdgeEpsilon: 1e-3,
        garageTypeIds: [],
        frontageBuildableEdges: [],
        sliverMinDimension: 0,
      },
    });

    expect(canonical.metrics.insertedVertexCount).toBeGreaterThan(0);
    expect(result.artifact.overlapCheck.passed).toBe(true);
  });
});

function buildVerifiedSingleRoomArtifact(layoutId: string, width: number, height: number): VerifiedLayoutArtifact {
  const area = width * height;
  const passedCheck = { passed: true, failures: [] };

  return {
    layoutId,
    sourceCaptureRecordId: `${layoutId}-capture`,
    generatedAtIso: new Date().toISOString(),
    accepted: true,
    deficiencyCheck: passedCheck,
    aspectRatioCheck: passedCheck,
    accessCheck: passedCheck,
    adjacencyCheck: passedCheck,
    garageFrontageCheck: passedCheck,
    sliverCheck: passedCheck,
    overlapCheck: passedCheck,
    cullReasons: [],
    cells: [
      {
        id: `${layoutId}-room`,
        typeId: 'bedroom',
        label: 'Bedroom',
        color: '#d8e6d4',
        tags: [],
        pkg: false,
        hallway: false,
        worldPoints: [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ],
        areaSquareMeters: area,
        targetSquareMeters: area,
        areaDelta: 0,
        mass: area,
      },
    ],
  };
}
