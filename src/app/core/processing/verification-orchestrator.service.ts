import { Injectable, effect, inject, untracked } from '@angular/core';
import { SimulationStageService } from '../simulation/simulation.exports';
import type { LayoutExplorationCaptureArtifact } from '../simulation/models/simulation-runner.model';
import { LayoutGalleryService } from './layout-gallery.service';
import { ProcessingPipelineService } from './processing-pipeline.service';
import { WorkflowVisualStateService } from './workflow-visual-state.service';

@Injectable({ providedIn: 'root' })
export class VerificationOrchestratorService {
  private readonly simulationStageService = inject(SimulationStageService);
  private readonly galleryService = inject(LayoutGalleryService);
  private readonly processingPipelineService = inject(ProcessingPipelineService);
  private readonly workflowVisualStateService = inject(WorkflowVisualStateService);

  private readonly processedIds = new Set<string>();

  constructor() {
    effect(() => {
      const captures = this.simulationStageService.captureArtifacts();
      untracked(() => {
        for (const capture of captures) {
          if (this.processedIds.has(capture.recordId)) continue;
          this.processedIds.add(capture.recordId);
          this.runPipeline(capture);
        }
      });
    }, { allowSignalWrites: true });
  }

  private runPipeline(capture: LayoutExplorationCaptureArtifact): void {
    try {
      const snapshot = this.processingPipelineService.runFromCapture(capture, 'orchestrator checkpoint');
      this.workflowVisualStateService.recordSnapshot(snapshot);

      if (snapshot.verificationResult.artifact.accepted) {
        this.galleryService.promote(snapshot.verificationResult.artifact, capture.sourceScore);
      } else {
        this.simulationStageService.cullLayout(capture.layoutId);
      }
    } catch (err) {
      this.simulationStageService.cullLayout(capture.layoutId);
      this.workflowVisualStateService.recordFailure(capture, err instanceof Error ? err.message : String(err));
      console.warn(`[VerificationOrchestrator] Pipeline failed for ${capture.layoutId}:`, err);
    }
  }
}
