export interface LayoutProcessingArtifactReference {
  readonly layoutId: string;
  readonly sourceStageId: string;
  readonly sourceScore?: number;
}

export interface LayoutProcessingStepRequest<TArtifact, TArguments = unknown> {
  readonly artifact: TArtifact;
  readonly artifactRef: LayoutProcessingArtifactReference;
  readonly arguments: TArguments;
}

export interface LayoutProcessingStepTrace {
  readonly stepId: string;
  readonly message: string;
  readonly severity: 'info' | 'warn' | 'error';
}

export interface LayoutProcessingStepResult<TArtifact, TMetrics = unknown> {
  readonly artifact: TArtifact;
  readonly metrics: TMetrics;
  readonly traces: readonly LayoutProcessingStepTrace[];
  readonly changed: boolean;
}

export interface LayoutProcessingStepDefinition<TArtifact, TArguments = unknown, TMetrics = unknown> {
  readonly stepId: string;
  readonly stepLabel: string;
  readonly stageCategory: 'generation' | 'refinement' | 'validation' | 'projection' | 'presentation';
  execute(
    request: LayoutProcessingStepRequest<TArtifact, TArguments>,
  ): LayoutProcessingStepResult<TArtifact, TMetrics>;
}
