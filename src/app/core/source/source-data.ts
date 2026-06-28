import rawDesignSource from './data/design-source.json';
import type { PromptDesignSource } from './models/design-source.model';
import { validateDesignSource } from './source-validation';

// Source intake registry.
// Input: the local design-source.json artifact for app-next.
// Output: typed source constants and validation results consumed by the source-intake slice.
// This block is intentionally read-only and does not perform stage mutation.
export const DESIGN_SOURCE = rawDesignSource as PromptDesignSource;
export const DESIGN_SOURCE_VALIDATION = validateDesignSource(DESIGN_SOURCE);
