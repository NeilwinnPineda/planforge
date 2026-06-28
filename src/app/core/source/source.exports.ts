export type {
  DesignSourceComment,
  DesignSourceMeta,
  DesignSourceValidationCounts,
  DesignSourceValidationLevel,
  DesignSourceValidationMessage,
  DesignSourceValidationResult,
  ProjectLotSegment,
  ProjectResetCondition,
  ProjectSettings,
  PromptDesignSource,
  RoomPrototype,
  RoomTag,
} from './models/design-source.model';

export { DESIGN_SOURCE, DESIGN_SOURCE_VALIDATION } from './source-data';
export { SourceReadService } from './source-read.service';
export type { SourceReadSnapshot } from './source-read.service';
export { validateDesignSource } from './source-validation';
