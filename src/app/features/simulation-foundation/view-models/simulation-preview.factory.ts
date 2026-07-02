import {
  createSvgViewportFit,
  type LotGeometryResult,
} from '../../../core/geometry/geometry.exports';
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
  viewBox: string;
  width: number;
  height: number;
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
  const fittedViewport = createSvgViewportFit(lotGeometry.lotBounds, {
    maxWidth: viewport.width,
    maxHeight: viewport.height,
    minWidth: Math.min(460, viewport.width),
    minHeight: Math.min(300, viewport.height),
    padding: viewport.padding,
  });
  const projectPoint = (point: { x: number; y: number }) => fittedViewport.projectPoint(point);
  const toPolygon = (points: Array<{ x: number; y: number }>) =>
    points
      .map((point) => {
        const projectedPoint = projectPoint(point);
        return `${projectedPoint.x},${projectedPoint.y}`;
      })
      .join(' ');

  const placedBubbles = bubbles.filter((bubble) => bubble.placed);

  return {
    viewBox: fittedViewport.viewBox,
    width: fittedViewport.width,
    height: fittedViewport.height,
    lotPolygon: toPolygon(lotGeometry.lotPoints),
    buildablePolygon: toPolygon(lotGeometry.buildablePoints),
    bubbles: placedBubbles.map((bubble) => {
      const projectedCenter = projectPoint(bubble);
      return {
        label: bubble.pkg || bubble.hallway ? '' : bubble.label,
        color: bubble.color,
        cx: projectedCenter.x,
        cy: projectedCenter.y,
        radiusPixels: Number((bubble.radiusMeters * fittedViewport.scale).toFixed(2)),
        isGenerated: bubble.pkg || bubble.hallway,
      };
    }),
  };
}
