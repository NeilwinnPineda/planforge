import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ConstructionContractPushService } from './construction-contract-push.service';
import { ConstructionOutputService, type ConstructionOutput } from './construction-output.service';

describe('ConstructionContractPushService', () => {
  const outputsSignal = signal<readonly ConstructionOutput[]>([]);
  const outputsServiceStub = {
    outputs: outputsSignal.asReadonly(),
  };

  beforeEach(() => {
    outputsSignal.set([]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ConstructionContractPushService,
        { provide: ConstructionOutputService, useValue: outputsServiceStub },
      ],
    });
  });

  it('marks new outputs as pushed when the endpoint accepts the contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const service = TestBed.inject(ConstructionContractPushService);
    outputsSignal.set([buildOutput('layout-push-ok')]);

    await vi.waitFor(() => {
      expect(service.statusFor('layout-push-ok')).toBe('pushed');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks outputs as failed when the endpoint call throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('bridge offline'));
    vi.stubGlobal('fetch', fetchMock);

    const service = TestBed.inject(ConstructionContractPushService);
    outputsSignal.set([buildOutput('layout-push-fail')]);

    await vi.waitFor(() => {
      expect(service.statusFor('layout-push-fail')).toBe('failed');
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

function buildOutput(layoutId: string): ConstructionOutput {
  return {
    entry: {
      artifact: {
        layoutId,
        sourceCaptureRecordId: 'capture-001',
        generatedAtIso: '2026-07-01T00:00:00.000Z',
        accepted: true,
        cullReasons: [],
        deficiencyCheck: { passed: true, failures: [] },
        aspectRatioCheck: { passed: true, failures: [] },
        accessCheck: { passed: true, failures: [] },
        adjacencyCheck: { passed: true, failures: [] },
        garageFrontageCheck: { passed: true, failures: [] },
        sliverCheck: { passed: true, failures: [] },
        overlapCheck: { passed: true, failures: [] },
        cells: [
          {
            id: 'room-1',
            typeId: 'living',
            label: 'Living',
            color: '#d8c89a',
            tags: [],
            pkg: false,
            hallway: false,
            worldPoints: [
              { x: 0, y: 0 },
              { x: 4, y: 0 },
              { x: 4, y: 3 },
              { x: 0, y: 3 },
            ],
            areaSquareMeters: 12,
            targetSquareMeters: 12,
            areaDelta: 0,
            mass: 1,
          },
        ],
      },
      promotedAtIso: '2026-07-01T00:00:00.000Z',
      score: 0.82,
      scoreBreakdown: {
        sourceScore: 0.8,
        areaFit: 0.8,
        hallwayEfficiency: 0.8,
        externalWallPerimeterEfficiency: 0.8,
        externalWallPerimeterMeters: 14,
        wallLoopClosure: 1,
        roomShapeRegularity: 0.8,
        roomProportionScore: 0.8,
        finalAdjacencyScore: 1,
        adjacencyProximity: 0.8,
        areaPerimeterRatio: 1,
        verificationCleanliness: 1,
      },
    },
    analysis: {
      segments: [
        {
          id: 'EW-001',
          fromKey: '0,0',
          toKey: '4000,0',
          from: { x: 0, y: 0 },
          to: { x: 4, y: 0 },
          lengthMeters: 4,
          ownerTypeId: 'living',
          ownerLabel: 'Living',
          ownerKind: 'room',
          exteriorLabel: 'outside',
          exteriorKind: 'outside',
        },
      ],
      loops: [],
      constructedAreaSquareMeters: 12,
      externalWallPerimeterMeters: 14,
      areaPerimeterRatio: 0.8571,
    },
    doorPlacements: [],
    windowPlacements: [],
  };
}
