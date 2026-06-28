import type { ProjectLotSegment } from '../../source/source.exports';

// Canonical lot-geometry stage output.
// Input: validated lot segments from the active design source.
// Output: world-space lot polygon geometry, buildable polygon geometry, and derived metrics.
// This block defines canonical geometry data only. It does not own screen projection or rendering.

export interface GeometryPoint {
  x: number;
  y: number;
}

export interface NamedGeometryPoint extends GeometryPoint {
  label: string;
}

export interface GeometryBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface LotGeometryResult {
  lotSegments: ProjectLotSegment[];
  lotPoints: NamedGeometryPoint[];
  buildablePoints: NamedGeometryPoint[];
  lotAreaSquareMeters: number;
  buildableAreaSquareMeters: number;
  lotBounds: GeometryBounds;
  buildableBounds: GeometryBounds;
  frontageSegments: number;
  closureErrorMeters: number;
}
