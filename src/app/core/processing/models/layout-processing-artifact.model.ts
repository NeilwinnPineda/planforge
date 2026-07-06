import type { GeometryPoint } from '../../geometry/geometry.exports';
import type { RoomTag } from '../../source/source.exports';

export interface ProvisionalLayoutCell {
  readonly id: string;
  readonly typeId: string;
  readonly label: string;
  readonly color: string;
  readonly tags: readonly RoomTag[];
  readonly pkg: boolean;
  readonly hallway: boolean;
  readonly worldPoints: readonly GeometryPoint[];
  readonly areaSquareMeters: number;
  readonly targetSquareMeters: number;
  readonly areaDelta: number;
  readonly mass: number;
}

export interface ProvisionalCellLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface HallwayInjectedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface MassBalancedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface EdgeSteppedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface WarpedDiagnosticLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface WarpedUvSite {
  readonly id: string;
  readonly typeId: string;
  readonly label: string;
  readonly color: string;
  readonly tags: readonly RoomTag[];
  readonly pkg: boolean;
  readonly hallway: boolean;
  readonly u: number;
  readonly v: number;
  readonly radiusMeters: number;
  readonly targetSquareMeters: number;
  readonly weight: number;
}

export interface WarpedSiteArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly sites: readonly WarpedUvSite[];
  readonly quadPoints: readonly { readonly x: number; readonly y: number }[];
}

export interface WarpedRebalancedSiteArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly sites: readonly WarpedUvSite[];
  readonly quadPoints: readonly { readonly x: number; readonly y: number }[];
}

export interface GapAbsorbedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface FringeExchangedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface SimplifiedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface UvBoxedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
  readonly quadPoints: readonly { readonly x: number; readonly y: number }[];
}

export interface UvNegotiatedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
  readonly quadPoints: readonly { readonly x: number; readonly y: number }[];
  readonly uvGrid: {
    readonly uValues: readonly number[];
    readonly vValues: readonly number[];
    readonly majorUValues: readonly number[];
    readonly majorVValues: readonly number[];
  };
}

export interface ResidualAbsorbedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface HallwayMergedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface FinalStagedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
}

export interface VerificationFailure {
  readonly cellId: string;
  readonly label: string;
  readonly typeId: string;
  readonly detail: string;
}

export interface VerificationCheckResult {
  readonly passed: boolean;
  readonly failures: readonly VerificationFailure[];
}

export interface VerifiedLayoutArtifact {
  readonly layoutId: string;
  readonly sourceCaptureRecordId: string;
  readonly generatedAtIso: string;
  readonly cells: readonly ProvisionalLayoutCell[];
  readonly accepted: boolean;
  readonly deficiencyCheck: VerificationCheckResult;
  readonly aspectRatioCheck: VerificationCheckResult;
  readonly accessCheck: VerificationCheckResult;
  readonly adjacencyCheck: VerificationCheckResult;
  readonly garageFrontageCheck: VerificationCheckResult;
  readonly foyerFrontageCheck: VerificationCheckResult;
  readonly sliverCheck: VerificationCheckResult;
  readonly overlapCheck: VerificationCheckResult;
  readonly cullReasons: readonly string[];
}
