import { NgFor, NgIf } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ConstructionContractPushService } from '../../../core/construction/construction-contract-push.service';
import { ConstructionOutputService } from '../../../core/construction/construction-output.service';
import { GenerationStageService } from '../../../core/generation/generation.exports';
import { LotGeometryService } from '../../../core/geometry/geometry.exports';
import { WorkflowVisualStateService } from '../../../core/processing/workflow-visual-state.service';
import { SimulationStageService } from '../../../core/simulation/simulation.exports';
import { SourceReadService } from '../../../core/source/source.exports';
import { SimulationControlBarComponent } from '../../simulation-foundation/components/simulation-control-bar.component';

interface HealthRow { readonly label: string; readonly status: string; readonly detail: string; readonly tone: 'ready' | 'review' | 'attention'; }

@Component({
  selector: 'app-run-health',
  standalone: true,
  imports: [NgFor, NgIf, SimulationControlBarComponent],
  templateUrl: './run-health.component.html',
  styleUrl: './run-health.component.scss',
})
export class RunHealthComponent {
  private readonly simulation = inject(SimulationStageService);
  private readonly source = inject(SourceReadService);
  private readonly lot = inject(LotGeometryService);
  private readonly generation = inject(GenerationStageService);
  private readonly workflow = inject(WorkflowVisualStateService);
  private readonly construction = inject(ConstructionOutputService);
  private readonly pushes = inject(ConstructionContractPushService);
  protected readonly expanded = signal(false);
  protected readonly instanceIds = this.simulation.instanceIds;
  protected readonly running = computed(() => this.instanceIds().some((id) => this.simulation.readInstanceSnapshot(id).isRunning));
  protected readonly loopRunning = computed(() => this.instanceIds().some((id) => this.simulation.readInstanceSnapshot(id).captureLoopRunning));
  protected readonly metrics = computed(() => [
    { label: 'Project source', value: this.source.activeSourceSnapshot().origin === 'default' ? 'default loaded' : 'custom loaded' },
    { label: 'Parallel simulations', value: `${this.instanceIds().length} / ${this.simulation.autoSpawnTargetCount}` },
    { label: 'Simulation state', value: this.running() ? 'running' : 'paused' },
    { label: 'Auto evaluation', value: this.loopRunning() ? 'active' : 'idle' },
  ]);
  protected readonly processors = computed(() => this.instanceIds().map((id) => {
    const snapshot = this.simulation.readInstanceSnapshot(id);
    const job = snapshot.jobs[snapshot.activeJobIndex];
    return { id, status: snapshot.isRunning ? 'running' : 'paused', captures: `${job?.capturedCount ?? 0} captures`, result: job?.lastCaptureOutcome ? `${job.lastCaptureOutcome.status} at ${job.lastCaptureOutcome.score.toFixed(3)}` : 'no completed check' };
  }));
  protected readonly stages = computed<readonly HealthRow[]>(() => {
    const source = this.source.activeSourceSnapshot();
    const lot = this.lot.getActiveLotGeometry();
    const seeds = this.generation.getGenerationSnapshot();
    const accepted = this.workflow.latestAcceptedSnapshot();
    const pipeline = this.workflow.latestPipelineSnapshot();
    const outputs = this.construction.outputs();
    return [
      { label: 'Program brief', status: source.validation.status === 'pass' ? 'ready' : 'review', detail: `${source.validation.counts.activeRoomInstances} rooms configured.`, tone: source.validation.status === 'pass' ? 'ready' : 'review' },
      { label: 'Site and lot', status: lot.isBuildable ? (lot.closureErrorMeters < .01 ? 'ready' : 'review') : 'fail', detail: `${lot.buildableAreaSquareMeters.toFixed(1)} sq m buildable; ${lot.closureErrorMeters.toFixed(3)} m closure.`, tone: !lot.isBuildable ? 'attention' : lot.closureErrorMeters < .01 ? 'ready' : 'review' },
      { label: 'Generation', status: seeds.roomInstances.length ? 'prepared' : 'waiting', detail: `${seeds.roomInstances.length} room seeds prepared.`, tone: seeds.roomInstances.length ? 'ready' : 'attention' },
      { label: 'Simulation', status: this.running() ? 'running' : 'paused', detail: `${this.simulation.captureArtifacts().length} layouts captured.`, tone: this.running() ? 'ready' : 'review' },
      { label: 'Verification', status: accepted ? 'accepted' : pipeline ? 'review' : 'waiting', detail: accepted ? `${accepted.verificationResult.artifact.layoutId} passed.` : 'No accepted layout yet.', tone: accepted ? 'ready' : pipeline ? 'review' : 'attention' },
      { label: 'Handoff', status: outputs.length ? 'staged' : 'waiting', detail: `${outputs.length} construction candidate${outputs.length === 1 ? '' : 's'} staged.`, tone: outputs.length ? 'ready' : 'attention' },
    ];
  });
  protected readonly memory = computed(() => {
    const outputs = this.construction.outputs();
    const statuses = outputs.map((output) => this.pushes.statusFor(output.entry.artifact.layoutId));
    return [
      { label: 'Latest processed', value: this.workflow.latestPipelineSnapshot()?.verificationResult.artifact.layoutId ?? 'none yet' },
      { label: 'Latest accepted', value: this.workflow.latestAcceptedSnapshot()?.verificationResult.artifact.layoutId ?? 'none yet' },
      { label: 'Latest rejected', value: this.workflow.latestRejectedSnapshot()?.verificationResult.artifact.layoutId ?? 'none yet' },
      { label: 'Last error', value: this.workflow.latestFailure()?.message ?? 'none' },
      { label: 'Contracts pushed', value: `${statuses.filter((value) => value === 'pushed').length} pushed / ${statuses.filter((value) => value === 'failed').length} failed` },
    ];
  });
  protected start(): void { this.simulation.startSimulationSystem(); }
  protected stop(): void { this.simulation.stopSimulationSystem(); }
  protected clear(): void { this.simulation.clearSimulationSystem(); }
}
