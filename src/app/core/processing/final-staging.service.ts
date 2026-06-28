import { Injectable } from '@angular/core';
import type { FinalStagedLayoutArtifact, HallwayMergedLayoutArtifact } from './models/layout-processing-artifact.model';
import type { LayoutProcessingStepRequest, LayoutProcessingStepResult } from './models/layout-processing-step.model';

export interface FinalStagingArguments {
  readonly stageLabel: string;
}

export interface FinalStagingMetrics {
  readonly outputCellCount: number;
  readonly totalAreaSquareMeters: number;
  readonly roomCellCount: number;
  readonly hallwayCellCount: number;
}

@Injectable({ providedIn: 'root' })
export class FinalStagingService {
  readonly stepId = 'processing.final_staging';
  readonly stepLabel = 'Final staged output';
  readonly stageCategory = 'staging' as const;

  // Slice number: final-output checkpoint seam.
  // Stage category: staging within downstream layout processing.
  // Step id: processing.final_staging.
  // Purpose: freeze the latest cleaned downstream geometry into an explicit final-output artifact
  // before later verification, ranking, or promotion stages are migrated.
  // Inputs: residual-absorbed downstream cells (9E output) plus a staging label.
  // Outputs: final staged artifact, summary metrics, and traces.
  // Allowed dependencies: ResidualAbsorbedLayoutArtifact and explicit arguments only.
  // Forbidden responsibilities: verification, culling, ranking, survivor promotion, and page projection.
  run(
    request: LayoutProcessingStepRequest<HallwayMergedLayoutArtifact, FinalStagingArguments>,
  ): LayoutProcessingStepResult<FinalStagedLayoutArtifact, FinalStagingMetrics> {
    const snap = (v: number) => Math.round(v * 1000) / 1000;
    const cells = request.artifact.cells.map((cell) => ({
      ...cell,
      worldPoints: cell.worldPoints.map((point) => ({ x: snap(point.x), y: snap(point.y) })),
      tags: [...cell.tags],
    }));
    const totalAreaSquareMeters = cells.reduce((sum, cell) => sum + cell.areaSquareMeters, 0);
    const roomCellCount = cells.filter((cell) => !cell.pkg && !cell.hallway).length;
    const hallwayCellCount = cells.filter((cell) => cell.hallway).length;

    return {
      artifact: {
        layoutId: request.artifact.layoutId,
        sourceCaptureRecordId: request.artifact.sourceCaptureRecordId,
        generatedAtIso: new Date().toISOString(),
        cells,
      },
      changed: true,
      metrics: {
        outputCellCount: cells.length,
        totalAreaSquareMeters,
        roomCellCount,
        hallwayCellCount,
      },
      traces: [
        {
          stepId: this.stepId,
          severity: 'info',
          message: `Final staged output captured ${cells.length} cells for ${request.artifact.layoutId} under ${request.arguments.stageLabel}.`,
        },
      ],
    };
  }
}
