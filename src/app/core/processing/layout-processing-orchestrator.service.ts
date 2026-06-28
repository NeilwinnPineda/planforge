import { Injectable } from '@angular/core';
import type {
  LayoutProcessingStepDefinition,
  LayoutProcessingStepRequest,
  LayoutProcessingStepResult,
} from './models/layout-processing-step.model';

@Injectable({ providedIn: 'root' })
export class LayoutProcessingOrchestratorService {
  // Active processing rebuild boundary.
  // Slice number: current downstream scaffold through Slice 8C.
  // Stage category: downstream refinement / validation orchestration.
  // Input contract: one typed processing artifact plus one ordered list of self-contained processing step services.
  // Output contract: ordered per-step results history while step ownership remains outside the feature page.
  // Allowed dependencies: typed processing step definitions only.
  // Forbidden responsibilities: step-internal geometry math, page-local display shaping, and hidden shared-state mutation.
  runOrderedSteps<TArtifact>(
    initialRequest: LayoutProcessingStepRequest<TArtifact>,
    orderedSteps: readonly LayoutProcessingStepDefinition<TArtifact>[],
  ): readonly LayoutProcessingStepResult<TArtifact>[] {
    const results: LayoutProcessingStepResult<TArtifact>[] = [];
    let currentRequest = initialRequest;

    orderedSteps.forEach((step) => {
      const result = step.execute(currentRequest);
      results.push(result);
      currentRequest = {
        ...currentRequest,
        artifact: result.artifact,
      };
    });

    return results;
  }
}
