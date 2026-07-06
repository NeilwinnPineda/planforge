import rawDesignSource from './data/test-cases/vanilla-3bed.json';
import type { PromptDesignSource } from './models/design-source.model';
import { validateDesignSource } from './source-validation';

export const DESIGN_SOURCE = rawDesignSource as PromptDesignSource;
export const DESIGN_SOURCE_VALIDATION = validateDesignSource(DESIGN_SOURCE);
