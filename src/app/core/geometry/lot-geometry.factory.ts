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
// testing/app/src/app/app.ts. The new version isolates canonical lot/buildable geometry so later
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

  return {
    lotSegments: lotSegments.map((segment) => ({ ...segment })),
    lotPoints,
    buildablePoints,
    lotAreaSquareMeters: polygonArea(lotPoints),
    buildableAreaSquareMeters: polygonArea(buildablePoints),
    lotBounds: getGeometryBounds(lotPoints),
    buildableBounds: getGeometryBounds(buildablePoints),
    frontageSegments: lotSegments.filter((segment) => segment.isRrow).length,
    closureErrorMeters: getClosureErrorMeters(plottedLotChain),
  };
}

function parseBearingToRadians(bearing: string): number {
  const match = bearing
    .trim()
    .match(/^([NS])\s*(\d+)(?:Â°|°|\s)\s*(\d+)(?:'|\s)?\s*([EW])$/i);

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
