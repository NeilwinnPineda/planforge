import { computed, Injectable, signal } from '@angular/core';
import type { LayoutExplorationCaptureArtifact } from '../simulation/models/simulation-runner.model';
import type { ProcessingPipelineSnapshot } from './processing-pipeline.service';

export interface WorkflowPipelineFailure {
  readonly capture: LayoutExplorationCaptureArtifact;
  readonly message: string;
}

@Injectable({ providedIn: 'root' })
export class WorkflowVisualStateService {
  private readonly latestPipelineSnapshotSignal = signal<ProcessingPipelineSnapshot | null>(null);
  private readonly latestAcceptedSnapshotSignal = signal<ProcessingPipelineSnapshot | null>(null);
  private readonly latestRejectedSnapshotSignal = signal<ProcessingPipelineSnapshot | null>(null);
  private readonly latestFailureSignal = signal<WorkflowPipelineFailure | null>(null);

  readonly latestPipelineSnapshot = this.latestPipelineSnapshotSignal.asReadonly();
  readonly latestAcceptedSnapshot = this.latestAcceptedSnapshotSignal.asReadonly();
  readonly latestRejectedSnapshot = this.latestRejectedSnapshotSignal.asReadonly();
  readonly latestFailure = this.latestFailureSignal.asReadonly();
  readonly latestRenderableSnapshot = computed(() =>
    this.latestPipelineSnapshot()
    ?? this.latestAcceptedSnapshot()
    ?? this.latestRejectedSnapshot(),
  );

  recordSnapshot(snapshot: ProcessingPipelineSnapshot): void {
    this.latestPipelineSnapshotSignal.set(snapshot);
    this.latestFailureSignal.set(null);

    if (snapshot.verificationResult.artifact.accepted) {
      this.latestAcceptedSnapshotSignal.set(snapshot);
      return;
    }

    this.latestRejectedSnapshotSignal.set(snapshot);
  }

  recordFailure(capture: LayoutExplorationCaptureArtifact, message: string): void {
    this.latestFailureSignal.set({ capture, message });
  }
}
