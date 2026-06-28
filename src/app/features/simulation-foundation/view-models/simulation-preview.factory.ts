import type { LotGeometryResult } from '../../../core/geometry/geometry.exports';
import type { SimulationBubbleState } from '../../../core/simulation/simulation.exports';

export interface SimulationPreviewBubble {
  label: string;
  color: string;
  cx: number;
  cy: number;
  radiusPixels: number;
  isGenerated: boolean;
}

export interface SimulationPreviewModel {
  lotPolygon: string;
  buildablePolygon: string;
  bubbles: SimulationPreviewBubble[];
}

// Slice 5 / Simulation preview projection.
// Stage category: projection.
// Input: canonical lot geometry and live simulation bubble state.
// Output: SVG-ready polygons and projected bubble circles for inspection.
// Allowed dependencies: canonical geometry and active simulation job state only.
// Forbidden responsibilities: physics updates, lifecycle control, and capture decisions.
export function buildSimulationPreview(
  lotGeometry: LotGeometryResult,
  bubbles: SimulationBubbleState[],
  viewport: { width: number; height: number; padding: number },
): SimulationPreviewModel {
  const minX = lotGeometry.lotBounds.minX;
  const maxX = lotGeometry.lotBounds.maxX;
  const minY = lotGeometry.lotBounds.minY;
  const maxY = lotGeometry.lotBounds.maxY;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min(
    (viewport.width - viewport.padding * 2) / spanX,
    (viewport.height - viewport.padding * 2) / spanY,
  );
  const offsetX = (viewport.width - spanX * scale) / 2;
  const offsetY = (viewport.height - spanY * scale) / 2;
  const projectPoint = (point: { x: number; y: number }) => ({
    x: Number((offsetX + (point.x - minX) * scale).toFixed(2)),
    y: Number((viewport.height - (offsetY + (point.y - minY) * scale)).toFixed(2)),
  });
  const toPolygon = (points: Array<{ x: number; y: number }>) =>
    points
      .map((point) => {
        const projectedPoint = projectPoint(point);
        return `${projectedPoint.x},${projectedPoint.y}`;
      })
      .join(' ');

  const placedBubbles = bubbles.filter((bubble) => bubble.placed);

  return {
    lotPolygon: toPolygon(lotGeometry.lotPoints),
    buildablePolygon: toPolygon(lotGeometry.buildablePoints),
    bubbles: placedBubbles.map((bubble) => {
      const projectedCenter = projectPoint(bubble);
      return {
        label: bubble.pkg || bubble.hallway ? '' : bubble.label,
        color: bubble.color,
        cx: projectedCenter.x,
        cy: projectedCenter.y,
        radiusPixels: Number((bubble.radiusMeters * scale).toFixed(2)),
        isGenerated: bubble.pkg || bubble.hallway,
      };
    }),
  };
}
