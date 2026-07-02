import { NgClass, NgFor, NgIf } from '@angular/common';
import { computed, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ConstructionContractPushService } from '../core/construction/construction-contract-push.service';
import { ConstructionOutputService } from '../core/construction/construction-output.service';
import { GenerationStageService } from '../core/generation/generation.exports';
import { LotGeometryService } from '../core/geometry/geometry.exports';
import { WorkflowVisualStateService } from '../core/processing/workflow-visual-state.service';
import { SimulationStageService } from '../core/simulation/simulation.exports';
import { SimulationControlBarComponent } from '../features/simulation-foundation/components/simulation-control-bar.component';
import { SourceReadService } from '../core/source/source.exports';

interface WorkflowNavItem {
  readonly path: string;
  readonly title: string;
  readonly summary: string;
  readonly stage: string;
  readonly exact?: boolean;
}

interface ShellDiagnosticRow {
  readonly label: string;
  readonly status: string;
  readonly detail: string;
  readonly tone: 'ready' | 'review' | 'attention';
}

interface ShellSnapshotRow {
  readonly label: string;
  readonly value: string;
}

interface ShellCoreRow {
  readonly coreId: string;
  readonly status: string;
  readonly evaluation: string;
  readonly captures: string;
  readonly latestResult: string;
}

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [NgClass, NgFor, NgIf, RouterLink, RouterLinkActive, SimulationControlBarComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly router = inject(Router);
  private readonly simulationStageService = inject(SimulationStageService);
  private readonly sourceReadService = inject(SourceReadService);
  private readonly lotGeometryService = inject(LotGeometryService);
  private readonly generationStageService = inject(GenerationStageService);
  private readonly workflowVisualStateService = inject(WorkflowVisualStateService);
  private readonly constructionOutputService = inject(ConstructionOutputService);
  private readonly constructionContractPushService = inject(ConstructionContractPushService);
  protected readonly sourceFileInput = viewChild<ElementRef<HTMLInputElement>>('sourceFileInput');
  protected readonly diagnosticsCollapsed = signal(false);
  protected readonly simulationSnapshot = this.simulationStageService.snapshot;
  protected readonly simulationInstanceIds = this.simulationStageService.instanceIds;
  protected readonly sourceSnapshot = this.sourceReadService.activeSourceSnapshot;
  protected readonly lotGeometry = computed(() => this.lotGeometryService.getActiveLotGeometry());
  protected readonly generationSnapshot = computed(() => this.generationStageService.getGenerationSnapshot());
  protected readonly latestPipelineSnapshot = this.workflowVisualStateService.latestPipelineSnapshot;
  protected readonly latestAcceptedSnapshot = this.workflowVisualStateService.latestAcceptedSnapshot;
  protected readonly latestRejectedSnapshot = this.workflowVisualStateService.latestRejectedSnapshot;
  protected readonly latestFailure = this.workflowVisualStateService.latestFailure;
  protected readonly constructionOutputs = this.constructionOutputService.outputs;
  protected readonly workflowNav: readonly WorkflowNavItem[] = [
    { path: '/', title: 'Overview', summary: 'Mission, rebuild posture, and app status.', stage: '00', exact: true },
    { path: '/source', title: 'Program Setup', summary: 'Edit source rooms, priorities, and adjacency rules.', stage: '01' },
    { path: '/geometry', title: 'Site And Lot', summary: 'Review frontage, setbacks, and buildable envelope.', stage: '02' },
    { path: '/generation', title: 'Generation', summary: 'Inspect deterministic seed layout generation.', stage: '03' },
    { path: '/simulation', title: 'Simulation', summary: 'Run bubble engines and capture candidate layouts.', stage: '04' },
    { path: '/processing', title: 'Processing', summary: 'Transform captures through downstream geometry stages.', stage: '05' },
    { path: '/verification', title: 'Verification', summary: 'Check layout failures, passes, and diagnostics.', stage: '06' },
    { path: '/construction', title: 'Construction Output', summary: 'Review wall, door, and window handoff outputs.', stage: '07' },
    { path: '/gallery', title: 'Candidate Gallery', summary: 'Compare accepted layouts and shortlist winners.', stage: '08' },
    { path: '/output-viewer', title: 'Output Viewer', summary: 'Load exported contract JSON and inspect the final layout directly.', stage: '09' },
    { path: '/reporting', title: 'Reporting', summary: 'Inspect reporting contracts and endpoint history.', stage: '10' },
  ];
  private readonly activeUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly activeWorkflowItem = computed(() =>
    this.workflowNav.find((item) => item.path === this.activeUrl())
    ?? this.workflowNav.find((item) => item.path === '/')
    ?? this.workflowNav[0],
  );
  protected readonly activeWorkflowIndex = computed(() =>
    this.workflowNav.findIndex((item) => item.path === this.activeWorkflowItem().path),
  );
  protected readonly previousWorkflowItem = computed(() => {
    const index = this.activeWorkflowIndex();
    return index > 0 ? this.workflowNav[index - 1] : null;
  });
  protected readonly nextWorkflowItem = computed(() => {
    const index = this.activeWorkflowIndex();
    return index >= 0 && index < this.workflowNav.length - 1 ? this.workflowNav[index + 1] : null;
  });
  protected readonly systemRunning = computed(() =>
    this.simulationInstanceIds().some((instanceId) => this.simulationStageService.readInstanceSnapshot(instanceId).isRunning),
  );
  protected readonly systemLoopRunning = computed(() =>
    this.simulationInstanceIds().some((instanceId) => this.simulationStageService.readInstanceSnapshot(instanceId).captureLoopRunning),
  );
  protected readonly shellMetrics = computed(() => [
    {
      label: 'Project source',
      value: this.sourceSnapshot().origin === 'default' ? 'default loaded' : 'custom loaded',
    },
    {
      label: 'Parallel simulations',
      value: `${this.simulationInstanceIds().length} / ${this.simulationStageService.autoSpawnTargetCount}`,
    },
    {
      label: 'Simulation state',
      value: this.systemRunning() ? 'running' : 'paused',
    },
    {
      label: 'Auto evaluation',
      value: this.systemLoopRunning() ? 'active' : 'idle',
    },
  ]);
  protected readonly coreRows = computed<readonly ShellCoreRow[]>(() =>
    this.simulationInstanceIds().map((instanceId) => {
      const instanceSnapshot = this.simulationStageService.readInstanceSnapshot(instanceId);
      const activeJob = instanceSnapshot.jobs[instanceSnapshot.activeJobIndex];
      const lastOutcome = activeJob?.lastCaptureOutcome;

      return {
        coreId: instanceId,
        status: instanceSnapshot.isRunning ? 'running' : 'paused',
        evaluation: instanceSnapshot.captureLoopRunning ? 'checking layouts automatically' : 'waiting for manual run',
        captures: `${activeJob?.capturedCount ?? 0} captures / ${activeJob?.failedCount ?? 0} failed checks`,
        latestResult: lastOutcome ? `${lastOutcome.status} at score ${lastOutcome.score.toFixed(3)}` : 'no completed check yet',
      };
    }),
  );
  protected readonly diagnosticRows = computed<readonly ShellDiagnosticRow[]>(() => {
    const source = this.sourceSnapshot();
    const lot = this.lotGeometry();
    const generation = this.generationSnapshot();
    const captures = this.simulationStageService.captureArtifacts();
    const latestPipeline = this.latestPipelineSnapshot();
    const latestAccepted = this.latestAcceptedSnapshot();
    const latestRejected = this.latestRejectedSnapshot();
    const outputs = this.constructionOutputs();

    return [
      {
        label: 'Program brief',
        status: source.validation.status === 'pass' ? 'ready' : source.validation.status === 'warn' ? 'review' : 'needs cleanup',
        detail: `${source.validation.counts.activeRoomInstances} room instances are currently configured across ${source.validation.counts.activeRoomTypes} brief categories.`,
        tone: source.validation.status === 'pass' ? 'ready' : source.validation.status === 'warn' ? 'review' : 'attention',
      },
      {
        label: 'Site and lot',
        status: !lot.isBuildable ? 'fail' : lot.closureErrorMeters < 0.01 && lot.frontageSegments === 1 ? 'ready' : 'review',
        detail: `${lot.buildableAreaSquareMeters.toFixed(2)} sq m inside the setback footprint, closure ${lot.closureErrorMeters.toFixed(3)} m.`,
        tone: !lot.isBuildable ? 'attention' : lot.closureErrorMeters < 0.01 && lot.frontageSegments === 1 ? 'ready' : 'review',
      },
      {
        label: 'Generation seed',
        status: generation.roomInstances.length > 0 ? 'prepared' : 'waiting',
        detail: `${generation.roomInstances.length} room seeds prepared for deterministic layout placement.`,
        tone: generation.roomInstances.length > 0 ? 'ready' : 'attention',
      },
      {
        label: 'Simulation',
        status: this.systemRunning() ? 'running' : captures.length > 0 ? 'paused with captures' : 'idle',
        detail: `${captures.length} captured layouts across ${this.simulationInstanceIds().length} parallel simulations.`,
        tone: this.systemRunning() ? 'ready' : captures.length > 0 ? 'review' : 'attention',
      },
      {
        label: 'Processing and verification',
        status: latestAccepted ? 'accepted snapshot available' : latestRejected ? 'rejected snapshot available' : latestPipeline ? 'recent pipeline snapshot available' : 'waiting',
        detail: latestAccepted
          ? `${latestAccepted.verificationResult.artifact.layoutId} most recently passed verification.`
          : latestRejected
            ? `${latestRejected.verificationResult.artifact.layoutId} most recently failed verification.`
            : latestPipeline
              ? `${latestPipeline.verificationResult.artifact.layoutId} is the latest remembered pipeline snapshot.`
              : 'No pipeline snapshot has been orchestrated yet.',
        tone: latestAccepted ? 'ready' : latestRejected || latestPipeline ? 'review' : 'attention',
      },
      {
        label: 'Gallery and handoff',
        status: outputs.length > 0 ? 'candidates staged' : 'waiting',
        detail: `${outputs.length} construction-facing candidate${outputs.length === 1 ? '' : 's'} are currently staged downstream.`,
        tone: outputs.length > 0 ? 'ready' : 'attention',
      },
    ];
  });
  protected readonly orchestrationSnapshotRows = computed<readonly ShellSnapshotRow[]>(() => {
    const latestPipeline = this.latestPipelineSnapshot();
    const latestAccepted = this.latestAcceptedSnapshot();
    const latestRejected = this.latestRejectedSnapshot();
    const latestFailure = this.latestFailure();
    const outputs = this.constructionOutputs();
    const pushStatuses = outputs.map((output) =>
      this.constructionContractPushService.statusFor(output.entry.artifact.layoutId),
    );
    const pushedCount = pushStatuses.filter((status) => status === 'pushed').length;
    const failedPushCount = pushStatuses.filter((status) => status === 'failed').length;

    return [
      {
        label: 'Latest processed layout',
        value: latestPipeline?.verificationResult.artifact.layoutId ?? 'none yet',
      },
      {
        label: 'Latest accepted layout',
        value: latestAccepted?.verificationResult.artifact.layoutId ?? 'none yet',
      },
      {
        label: 'Latest rejected layout',
        value: latestRejected?.verificationResult.artifact.layoutId ?? 'none yet',
      },
      {
        label: 'Last orchestration error',
        value: latestFailure?.message ?? 'none',
      },
      {
        label: 'Contracts pushed',
        value: `${pushedCount} pushed / ${failedPushCount} failed`,
      },
    ];
  });

  constructor() {
    this.simulationStageService.ensureAutoRun();
  }

  protected diagnosticToneClass(tone: ShellDiagnosticRow['tone']): string {
    return `app-shell__diagnostic-card--${tone}`;
  }

  protected startSimulation(): void {
    this.simulationStageService.startSimulationSystem();
  }

  protected stopSimulation(): void {
    this.simulationStageService.stopSimulationSystem();
  }

  protected clearSimulation(): void {
    this.simulationStageService.clearSimulationSystem();
  }

  protected toggleDiagnostics(): void {
    this.diagnosticsCollapsed.update((collapsed) => !collapsed);
  }

  protected openSourceImport(): void {
    this.sourceFileInput()?.nativeElement.click();
  }

  protected async onSourceFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    const text = await file.text();
    this.sourceReadService.importSourceJson(text);
    if (input) {
      input.value = '';
    }
  }

  protected exportSourceJson(): void {
    const json = this.sourceReadService.exportActiveSourceJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.sourceSnapshot().source.meta.id || 'planforge-source'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  protected resetSourceToDefault(): void {
    this.sourceReadService.resetToDefaultSource();
  }
}
