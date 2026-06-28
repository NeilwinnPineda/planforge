export interface SpawnHeatmap {
  readonly minX: number;
  readonly minY: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly weights: readonly number[];
}

const CELL_SIZE = 0.5;
const KERNEL_RADIUS = 3.0;
const KERNEL_CELLS = Math.ceil(KERNEL_RADIUS / CELL_SIZE);

export function buildSpawnHeatmap(
  centroids: readonly { readonly x: number; readonly y: number }[],
): SpawnHeatmap | null {
  if (!centroids.length) return null;

  const margin = 1;
  const minX = Math.min(...centroids.map((c) => c.x)) - margin;
  const minY = Math.min(...centroids.map((c) => c.y)) - margin;
  const maxX = Math.max(...centroids.map((c) => c.x)) + margin;
  const maxY = Math.max(...centroids.map((c) => c.y)) + margin;
  const cols = Math.max(1, Math.ceil((maxX - minX) / CELL_SIZE) + 1);
  const rows = Math.max(1, Math.ceil((maxY - minY) / CELL_SIZE) + 1);
  const weights = new Array<number>(cols * rows).fill(0);

  for (const centroid of centroids) {
    const centerCol = (centroid.x - minX) / CELL_SIZE;
    const centerRow = (centroid.y - minY) / CELL_SIZE;

    for (
      let row = Math.max(0, Math.floor(centerRow - KERNEL_CELLS));
      row <= Math.min(rows - 1, Math.ceil(centerRow + KERNEL_CELLS));
      row += 1
    ) {
      for (
        let col = Math.max(0, Math.floor(centerCol - KERNEL_CELLS));
        col <= Math.min(cols - 1, Math.ceil(centerCol + KERNEL_CELLS));
        col += 1
      ) {
        const dist = Math.hypot((col - centerCol) * CELL_SIZE, (row - centerRow) * CELL_SIZE);
        const weight = Math.max(0, 1 - dist / KERNEL_RADIUS);
        weights[row * cols + col] += weight;
      }
    }
  }

  const maxWeight = Math.max(...weights, 1e-9);
  const normalizedWeights = weights.map((w) => w / maxWeight);

  return { minX, minY, cellSize: CELL_SIZE, cols, rows, weights: normalizedWeights };
}

export function sampleSpawnHeatmap(heatmap: SpawnHeatmap, x: number, y: number): number {
  const col = Math.round((x - heatmap.minX) / heatmap.cellSize);
  const row = Math.round((y - heatmap.minY) / heatmap.cellSize);
  if (col < 0 || col >= heatmap.cols || row < 0 || row >= heatmap.rows) return 0;
  return heatmap.weights[row * heatmap.cols + col] ?? 0;
}
