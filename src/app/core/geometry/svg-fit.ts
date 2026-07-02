import type { GeometryBounds, GeometryPoint } from './models/lot-geometry.model';

export interface SvgViewportFitOptions {
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly padding: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
}

export interface ProjectedSvgPoint {
  readonly x: number;
  readonly y: number;
}

export interface SvgViewportFit {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly viewBox: string;
  projectPoint(point: GeometryPoint): ProjectedSvgPoint;
  projectPoints(points: GeometryPoint[]): ProjectedSvgPoint[];
  polygon(points: GeometryPoint[]): string;
}

export function createSvgViewportFit(
  bounds: GeometryBounds,
  options: SvgViewportFitOptions,
): SvgViewportFit {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const innerMaxWidth = Math.max(1, options.maxWidth - options.padding * 2);
  const innerMaxHeight = Math.max(1, options.maxHeight - options.padding * 2);
  const scale = Math.min(innerMaxWidth / spanX, innerMaxHeight / spanY);
  const fittedWidth = spanX * scale + options.padding * 2;
  const fittedHeight = spanY * scale + options.padding * 2;
  const width = Number(Math.max(options.minWidth ?? 0, fittedWidth).toFixed(2));
  const height = Number(Math.max(options.minHeight ?? 0, fittedHeight).toFixed(2));
  const offsetX = Number(((width - spanX * scale) / 2).toFixed(2));
  const offsetY = Number(((height - spanY * scale) / 2).toFixed(2));

  const projectPoint = (point: GeometryPoint): ProjectedSvgPoint => ({
    x: Number((offsetX + (point.x - bounds.minX) * scale).toFixed(2)),
    y: Number((height - (offsetY + (point.y - bounds.minY) * scale)).toFixed(2)),
  });

  const projectPoints = (points: GeometryPoint[]): ProjectedSvgPoint[] => points.map(projectPoint);

  const polygon = (points: GeometryPoint[]): string =>
    projectPoints(points)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');

  return {
    width,
    height,
    padding: options.padding,
    scale,
    offsetX,
    offsetY,
    viewBox: `0 0 ${width} ${height}`,
    projectPoint,
    projectPoints,
    polygon,
  };
}
