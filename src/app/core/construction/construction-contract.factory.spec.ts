import { buildConstructionContract } from './construction-contract.factory';
import type { ConstructionOutput } from './construction-output.service';
import type { VerifiedLayoutArtifact } from '../processing/models/layout-processing-artifact.model';

function buildArtifact(): VerifiedLayoutArtifact {
  return {
    layoutId: 'LAYOUT-001',
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
        areaSquareMeters: 12.34567,
        targetSquareMeters: 12,
        areaDelta: 0.34567,
        mass: 1,
      },
      {
        id: 'hall-1',
        typeId: 'generated_hallway',
        label: 'Hallway',
        color: '#cccccc',
        tags: [],
        pkg: false,
        hallway: true,
        worldPoints: [
          { x: 4, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 1 },
          { x: 4, y: 1 },
        ],
        areaSquareMeters: 2,
        targetSquareMeters: 2,
        areaDelta: 0,
        mass: 1,
      },
      {
        id: 'fill-1',
        typeId: 'generated_filler',
        label: 'Filler',
        color: '#eeeeee',
        tags: [],
        pkg: true,
        hallway: false,
        worldPoints: [
          { x: 6, y: 0 },
          { x: 7, y: 0 },
          { x: 7, y: 1 },
          { x: 6, y: 1 },
        ],
        areaSquareMeters: 1,
        targetSquareMeters: 1,
        areaDelta: 0,
        mass: 1,
      },
    ],
  };
}

describe('buildConstructionContract', () => {
  it('builds a typed handoff contract with rounded metrics and room counting', () => {
    const artifact = buildArtifact();
    const output: ConstructionOutput = {
      entry: {
        artifact,
        promotedAtIso: '2026-07-01T00:00:00.000Z',
        score: 0.81234,
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
        constructedAreaSquareMeters: 14.34567,
        externalWallPerimeterMeters: 14.98765,
        areaPerimeterRatio: 0.95,
      },
      doorPlacements: [
        {
          id: 'door-1',
          wallId: 'EW-001',
          kind: 'entry',
          ownerTypeId: 'living',
          ownerLabel: 'Living',
          widthMeters: 0.9,
          tNormalized: 0.5,
          tMeters: 2,
          wallLengthMeters: 4,
          positionWorld: { x: 2, y: 0 },
          wallFromWorld: { x: 0, y: 0 },
          wallToWorld: { x: 4, y: 0 },
          adjacentTypeId: null,
          adjacentLabel: null,
        },
      ],
      windowPlacements: [
        {
          id: 'window-1',
          wallId: 'EW-001',
          ownerTypeId: 'living',
          ownerLabel: 'Living',
          sizeCode: 'L',
          widthMeters: 1.2,
          tNormalized: 0.25,
          tMeters: 1,
          positionWorld: { x: 1, y: 0 },
          wallLengthMeters: 4,
        },
      ],
    };

    const contract = buildConstructionContract(output);

    expect(contract.schemaVersion).toBe('1.0');
    expect(contract.layoutId).toBe('LAYOUT-001');
    expect(contract.cells).toHaveLength(3);
    expect(contract.cells[0].areaSquareMeters).toBe(12.3457);
    expect(contract.metrics.totalAreaSqm).toBe(15.3457);
    expect(contract.metrics.roomCount).toBe(1);
    expect(contract.metrics.windowCount).toBe(1);
    expect(contract.metrics.doorCount).toBe(1);
    expect(contract.metrics.externalWallPerimeterMeters).toBe(14.9877);
    expect(contract.windows[0].wallFromWorld).toEqual({ x: 0, y: 0 });
    expect(contract.windows[0].wallToWorld).toEqual({ x: 4, y: 0 });
  });

  it('falls back to the window position when the source wall cannot be found', () => {
    const artifact = buildArtifact();
    const output: ConstructionOutput = {
      entry: {
        artifact,
        promotedAtIso: '2026-07-01T00:00:00.000Z',
        score: 0.9,
        scoreBreakdown: {
          sourceScore: 0.9,
          areaFit: 0.9,
          hallwayEfficiency: 0.9,
          externalWallPerimeterEfficiency: 0.9,
          externalWallPerimeterMeters: 14,
          wallLoopClosure: 1,
          roomShapeRegularity: 0.9,
          roomProportionScore: 0.9,
          finalAdjacencyScore: 1,
          adjacencyProximity: 0.9,
          areaPerimeterRatio: 1,
          verificationCleanliness: 1,
        },
      },
      analysis: {
        segments: [],
        loops: [],
        constructedAreaSquareMeters: 12,
        externalWallPerimeterMeters: 12,
        areaPerimeterRatio: 1,
      },
      doorPlacements: [],
      windowPlacements: [
        {
          id: 'window-2',
          wallId: 'missing-wall',
          ownerTypeId: 'living',
          ownerLabel: 'Living',
          sizeCode: 'M',
          widthMeters: 1,
          tNormalized: 0.4,
          tMeters: 1.5,
          positionWorld: { x: 3, y: 2 },
          wallLengthMeters: 3,
        },
      ],
    };

    const contract = buildConstructionContract(output);

    expect(contract.windows[0].wallFromWorld).toEqual({ x: 3, y: 2 });
    expect(contract.windows[0].wallToWorld).toEqual({ x: 3, y: 2 });
  });
});
