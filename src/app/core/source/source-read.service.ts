import { Injectable } from '@angular/core';
import { DESIGN_SOURCE, DESIGN_SOURCE_VALIDATION } from './source-data';
import type {
  DesignSourceValidationResult,
  PromptDesignSource,
} from './models/design-source.model';

export interface SourceReadSnapshot {
  readonly source: PromptDesignSource;
  readonly validation: DesignSourceValidationResult;
}

@Injectable({ providedIn: 'root' })
export class SourceReadService {
  // Source read step.
  // Input: no runtime arguments; this service reads the current local source registry.
  // Output: an immutable snapshot containing the active source and its validation result.
  // This block owns source exposure for read-only intake work. It does not generate derived geometry.
  getActiveSourceSnapshot(): SourceReadSnapshot {
    return {
      source: DESIGN_SOURCE,
      validation: DESIGN_SOURCE_VALIDATION,
    };
  }
}
