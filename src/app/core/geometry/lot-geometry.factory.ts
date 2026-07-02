import type { ProjectLotSegment } from '../source/source.exports';
import type {
  GeometryBounds,
  GeometryPoint,
  LotGeometryResult,
  NamedGeometryPoint,
} from './models/lot-geometry.model';

interface OffsetLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Migration note:
// This block replaces the legacy lot-polygon derivation responsibility currently embedded inside
// testing/legacy-reference/app/src/app/app.ts. The new version isolates canonical lot/buildable geometry so later
// stages can consume it without inheriting legacy orchestration structure.

// Lot geometry stage.
// Input: validated survey-style lot segments from the source intake stage.
// Output: canonical world-space lot points, buildable points, and derived area/bounds metrics.
// Stage role: geometry derivation.
// The block is deterministic and does not mutate upstream source data.
export function deriveLotGeometry(lotSegments: ProjectLotSegment[]): LotGeometryResult {
  const plottedLotChain = plotLotChain(lotSegments);
  const lotPoints = plottedLotChain.slice(0, -1);
  const buildablePoints = buildBuildablePolygon(lotPoints, lotSegments);
  const closureSegment = getClosureSegment(plottedLotChain);
  const lotAreaSquareMeters = polygonArea(lotPoints);
  const buildableAreaSquareMeters = polygonArea(buildablePoints);
  const issues = buildGeometryIssues(
    lotPoints,
    lotSegments,
    buildablePoints,
    lotAreaSquareMeters,
    buildableAreaSquareMeters,
  );

  return {
    lotSegments: lotSegments.map((segment) => ({ ...segment })),
    lotPoints,
    buildablePoints,
    lotAreaSquareMeters,
    buildableAreaSquareMeters,
    lotBounds: getGeometryBounds(lotPoints),
    buildableBounds: getGeometryBounds(buildablePoints),
    frontageSegments: lotSegments.filter((segment) => segment.isRrow).length,
    closureErrorMeters: getClosureErrorMeters(plottedLotChain),
    closureSegment,
    isBuildable: issues.length === 0,
    issues,
  };
}

function parseBearingToRadians(bearing: string): number {
  const normalizedBearing = bearing.replace(/Â°/g, '\u00B0').trim();
  const match = normalizedBearing.match(/^([NS])\s*(\d+)(?:\u00B0|\s)\s*(\d+)(?:'|\s)?\s*([EW])$/i);

  if (!match) {
    throw new Error(`Invalid bearing format: ${bearing}`);
  }

  const [, northSouth, degreeText, minuteText, eastWest] = match;
  const degrees = Number(degreeText);
  const minutes = Number(minuteText);
  const angle = degrees + minutes / 60;
  const angleRadians = (angle * Math.PI) / 180;

  if (northSouth.toUpperCase() === 'N' && eastWest.toUpperCase() === 'E') {
    return angleRadians;
  }
  if (northSouth.toUpperCase() === 'N' && eastWest.toUpperCase() === 'W') {
    return -angleRadians;
  }
  if (northSouth.toUpperCase() === 'S' && eastWest.toUpperCase() === 'E') {
    return Math.PI - angleRadians;
  }
  return Math.PI + angleRadians;
}

function plotLotChain(lotSegments: ProjectLotSegment[]): NamedGeometryPoint[] {
  const points: NamedGeometryPoint[] = [{ label: lotSegments[0]?.point ?? 'P0', x: 0, y: 0 }];
  let currentX = 0;
  let currentY = 0;

  lotSegments.forEach((segment, index) => {
    const bearingRadians = parseBearingToRadians(segment.bearing);
    currentX += Math.sin(bearingRadians) * segment.distance;
    currentY += Math.cos(bearingRadians) * segment.distance;
    points.push({
      label: lotSegments[index + 1]?.point ?? segment.point,
      x: Number(currentX.toFixed(6)),
      y: Number(currentY.toFixed(6)),
    });
  });

  return points;
}

function buildBuildablePolygon(
  lotPoints: NamedGeometryPoint[],
  lotSegments: ProjectLotSegment[],
): NamedGeometryPoint[] {
  if (lotPoints.length < 3) {
    return [];
  }

  const polygonCenter = getPolygonCenter(lotPoints);
  const offsetLines = lotPoints.map((point, index) => {
    const nextPoint = lotPoints[(index + 1) % lotPoints.length];
    const segment = lotSegments[index];
    const dx = nextPoint.x - point.x;
    const dy = nextPoint.y - point.y;
    const edgeLength = Math.hypot(dx, dy) || 0.000001;
    const normal = { x: -dy / edgeLength, y: dx / edgeLength };
    const midpoint = {
      x: (point.x + nextPoint.x) / 2,
      y: (point.y + nextPoint.y) / 2,
    };
    const inwardNormal =
      (polygonCenter.x - midpoint.x) * normal.x + (polygonCenter.y - midpoint.y) * normal.y >= 0
        ? normal
        : { x: -normal.x, y: -normal.y };
    const offsetX = inwardNormal.x * segment.setback;
    const offsetY = inwardNormal.y * segment.setback;

    return {
      x1: point.x + offsetX,
      y1: point.y + offsetY,
      x2: nextPoint.x + offsetX,
      y2: nextPoint.y + offsetY,
    };
  });

  return offsetLines.map((currentLine, index) => {
    const previousLine = offsetLines[(index - 1 + offsetLines.length) % offsetLines.length];
    const intersection = getLineIntersection(previousLine, currentLine);
    return {
      label: lotPoints[index].label,
      x: Number(intersection.x.toFixed(6)),
      y: Number(intersection.y.toFixed(6)),
    };
  });
}

function buildGeometryIssues(
  lotPoints: NamedGeometryPoint[],
  lotSegments: ProjectLotSegment[],
  buildablePoints: NamedGeometryPoint[],
  lotAreaSquareMeters: number,
  buildableAreaSquareMeters: number,
): string[] {
  const issues: string[] = [];

  if (lotPoints.length < 3 || lotAreaSquareMeters <= 0) {
    issues.push('Lot polygon is invalid or degenerate.');
  }

  if (buildablePoints.length < 3) {
    issues.push('Buildable polygon could not be resolved from the current setbacks.');
  }

  if (buildablePoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    issues.push('Buildable polygon contains invalid coordinates.');
  }

  if (buildableAreaSquareMeters <= 0) {
    issues.push('Buildable area is zero or negative.');
  }

  if (
    buildablePoints.length >= 3
    && buildablePoints.some((point) => !isPointInsideAllSetbackHalfPlanes(point, lotPoints, lotSegments))
  ) {
    issues.push('Buildable polygon falls outside one or more setback limits.');
  }

  return issues;
}

function isPointInsideAllSetbackHalfPlanes(
  point: GeometryPoint,
  lotPoints: NamedGeometryPoint[],
  lotSegments: ProjectLotSegment[],
): boolean {
  const polygonCenter = getPolygonCenter(lotPoints);

  return lotPoints.every((lotPoint, index) => {
    const nextPoint = lotPoints[(index + 1) % lotPoints.length];
    const segment = lotSegments[index];
    const dx = nextPoint.x - lotPoint.x;
    const dy = nextPoint.y - lotPoint.y;
    const edgeLength = Math.hypot(dx, dy);

    if (edgeLength <= 1e-9) {
      return false;
    }

    const normal = { x: -dy / edgeLength, y: dx / edgeLength };
    const midpoint = {
      x: (lotPoint.x + nextPoint.x) / 2,
      y: (lotPoint.y + nextPoint.y) / 2,
    };
    const inwardNormal =
      (polygonCenter.x - midpoint.x) * normal.x + (polygonCenter.y - midpoint.y) * normal.y >= 0
        ? normal
        : { x: -normal.x, y: -normal.y };
    const signedInsetDistance =
      (point.x - lotPoint.x) * inwardNormal.x + (point.y - lotPoint.y) * inwardNormal.y;

    return signedInsetDistance + 1e-6 >= segment.setback;
  });
}

function getLineIntersection(lineA: OffsetLine, lineB: OffsetLine): GeometryPoint {
  const denominator =
    (lineA.x1 - lineA.x2) * (lineB.y1 - lineB.y2)
    - (lineA.y1 - lineA.y2) * (lineB.x1 - lineB.x2);

  if (Math.abs(denominator) <= 1e-9) {
    return {
      x: lineB.x1,
      y: lineB.y1,
    };
  }

  const determinantA = lineA.x1 * lineA.y2 - lineA.y1 * lineA.x2;
  const determinantB = lineB.x1 * lineB.y2 - lineB.y1 * lineB.x2;

  return {
    x: (determinantA * (lineB.x1 - lineB.x2) - (lineA.x1 - lineA.x2) * determinantB) / denominator,
    y: (determinantA * (lineB.y1 - lineB.y2) - (lineA.y1 - lineA.y2) * determinantB) / denominator,
  };
}

function polygonArea(points: Array<GeometryPoint>): number {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const currentPoint = points[index];
    const nextPoint = points[(index + 1) % points.length];
    area += currentPoint.x * nextPoint.y - nextPoint.x * currentPoint.y;
  }

  return Math.abs(area) / 2;
}

function getGeometryBounds(points: Array<GeometryPoint>): GeometryBounds {
  if (!points.length) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function getPolygonCenter(points: Array<GeometryPoint>): GeometryPoint {
  if (!points.length) {
    return { x: 0, y: 0 };
  }

  const sum = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

function getClosureErrorMeters(points: NamedGeometryPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  const lastPoint = points[points.length - 1];
  return Math.hypot(lastPoint.x, lastPoint.y);
}

function getClosureSegment(points: NamedGeometryPoint[]): { from: GeometryPoint; to: GeometryPoint } | null {
  if (points.length < 2) {
    return null;
  }

  const lastPoint = points[points.length - 1];
  if (Math.hypot(lastPoint.x, lastPoint.y) <= 1e-6) {
    return null;
  }

  return {
    from: { x: lastPoint.x, y: lastPoint.y },
    to: { x: points[0].x, y: points[0].y },
  };
}

