// Source intake contract for app-next.
// Input: parsed source JSON loaded from the local source artifact.
// Output: typed source objects consumed by validation and read-only source presentation.
// This block owns source typing only. It does not perform generation, projection, or reporting.

export type RoomTag = 'open_access' | 'sleeping' | 'plumbing' | 'front_facing' | 'vista';

export interface DesignSourceMeta {
  id: string;
  version: string;
  title: string;
  summary: string;
  authoringMode: 'ai_editable_source';
}

export interface DesignSourceComment {
  scope: string;
  comment: string;
}

export interface DesignSourceIntent {
  projectKind: string;
  primaryGoal: string;
  narrative: string;
  priorities: string[];
  downstreamTargets: string[];
}

export type DesignSourceValidationLevel = 'pass' | 'warn' | 'fail';

export interface DesignSourceValidationMessage {
  level: DesignSourceValidationLevel;
  scope: string;
  message: string;
}

export interface DesignSourceValidationCounts {
  roomTypes: number;
  activeRoomTypes: number;
  activeRoomInstances: number;
  adjacencyPairs: number;
  specialRules: number;
  blockers: number;
  frontageSegments: number;
}

export interface DesignSourceValidationResult {
  status: DesignSourceValidationLevel;
  messages: DesignSourceValidationMessage[];
  counts: DesignSourceValidationCounts;
}

export interface RoomPrototype {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  radius: number;
  tags: RoomTag[];
}

export interface ProjectLotSegment {
  point: string;
  bearing: string;
  distance: number;
  setback: number;
  isRrow?: boolean;
}

export interface ProjectResetCondition {
  id: string;
  label: string;
  enabled: boolean;
  type: 'score_below' | 'hard_interval_ms';
  threshold: number;
}

export interface ProjectSettings {
  lot: {
    segments: ProjectLotSegment[];
  };
  rooms: {
    program: Record<string, number>;
  };
  generated: {
    filler: {
      color: string;
      strength: number;
    };
    hallway: {
      color: string;
      strength: number;
    };
  };
  adjacency: {
    defaultScore: number;
    sameTypeDefault: number;
    generatedTypeDefaults: Record<string, number>;
    exceptions: Record<string, Record<string, number>>;
  };
  rules: {
    special: Array<{ label: string; rooms: string[]; note?: string }>;
    blockers: Array<{ label: string; rooms: string[]; note?: string }>;
  };
  features: {
    simulation: {
      autoShake: boolean;
      hardResetLoop: boolean;
      scoreReset: boolean;
    };
    schematic: {
      constrainedVoronoi: boolean;
      massBalance: boolean;
      edgeStep: boolean;
      gapAbsorption: boolean;
      fringeExchange: boolean;
      simplification: boolean;
    };
  };
  simulation: {
    captureThresholds: {
      start: number;
      min: number;
      step: number;
    };
    resetConditions: ProjectResetCondition[];
    forces: {
      simSubsteps: number;
      damping: number;
      maxSpeed: number;
      resetRandomVelocity: number;
      shakeRoomMagnitude: number;
      shakePkgMagnitude: number;
      shakeMagnitudeRandom: number;
      shakeEveryFifthSideKick: number;
      shakeLoopDurationMs: number;
      shakeLoopIntervalMs: number;
      autoShakeIntervalMs: number;
      satResetThreshold: number;
      satResetCooldownMs: number;
      roomInertiaReferenceArea: number;
      roomInertiaMinArea: number;
      roomInertiaMinScale: number;
      roomInertiaMaxScale: number;
      globalCollisionClearance: number;
      globalCollisionPush: number;
      baseAttractionForce: number;
      baseRepulsionForce: number;
      frontEdgeAttractionModifier: number;
      fillerEdgeAttractionForce: number;
      vistaEdgeAttractionForce: number;
      fillerEdgeCollisionRatioCap: number;
      attractionCollisionRatioCap: number;
      pullLinkGap: number;
      repelLinkComfort: number;
      hallwayAreaShare: number;
      fillerAreaShare: number;
      fillerSquarePromoteEvery: number;
      hallwaySquarePromoteEvery: number;
      maxSquareFillerSide: number;
      initialRoomClearance: number;
      boundaryFallbackStep: number;
      boundaryAxisBounceDamping: number;
      boundaryBounceDamping: number;
      frontEdgeTouchTolerance: number;
    };
  };
  schematic: {
    massBalance: {
      maxIterations: number;
      stableDeviation: number;
      stableRuns: number;
    };
    edgeStep: {
      epsilon: number;
      boundaryMatchEpsilon: number;
      maxStepsPerExteriorEdge: number;
      postStepRenegotiation: {
        enabled: boolean;
        maxIterations: number;
        stableDeviation: number;
        stableRuns: number;
      };
    };
    gapAbsorption: {
      deficiencyWeight: number;
      adjacencyWeight: number;
      sharedEdgeWeight: number;
      neckPenaltyWeight: number;
      distancePenaltyWeight: number;
      minSharedEdgeMeters: number;
    };
    fringeExchange: {
      fringeDepthMeters: number;
      roomTileMeters: number;
      maxPieceAreaSquareMeters: number;
      maxPieceAreaRatio: number;
      minSharedEdgeMeters: number;
      maxTransfers: number;
      compactnessWeight: number;
      areaBalanceWeight: number;
      sharedEdgeWeight: number;
      minScoreImprovement: number;
      maxFaces: number;
      maxRenderedPieces: number;
    };
    simplification: {
      maxMoves: number;
      maxFaces: number;
      maxCandidates: number;
      maxRenderedPieces: number;
      minWallGainMeters: number;
      wallGainWeight: number;
      compactnessWeight: number;
      areaBalanceWeight: number;
      minScoreImprovement: number;
    };
  };
  legacyPanelLayout: {
    lotWidthMeters: number;
    lotDepthMeters: number;
    frontSetbackMeters: number;
    sideSetbackMeters: number;
    rearSetbackMeters: number;
    panel4GridMeters: number;
  };
}

export interface PromptDesignSource {
  meta: DesignSourceMeta;
  intent: DesignSourceIntent;
  aiComments: DesignSourceComment[];
  roomCatalog: RoomPrototype[];
  settings: ProjectSettings;
}
