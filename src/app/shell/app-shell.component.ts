import { NgFor, NgIf } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { SimulationStageService } from '../core/simulation/simulation.exports';
import { SourceReadService } from '../core/source/source.exports';

interface WorkflowNavItem { readonly path: string; readonly title: string; readonly summary: string; readonly stage: string; readonly exact?: boolean; }
interface WorkflowPhase { readonly title: string; readonly summary: string; readonly items: readonly WorkflowNavItem[]; }

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly router = inject(Router);
  private readonly simulation = inject(SimulationStageService);
  private readonly source = inject(SourceReadService);
  protected readonly sourceFileInput = viewChild<ElementRef<HTMLInputElement>>('sourceFileInput');
  protected readonly expandedPhase = signal<number | null>(0);
  protected readonly sourceSnapshot = this.source.activeSourceSnapshot;
  protected readonly workflowNav: readonly WorkflowNavItem[] = [
    { path: '/', title: 'Overview', summary: 'Mission, workflow, and app status.', stage: '00', exact: true },
    { path: '/source', title: 'Program Setup', summary: 'Edit rooms, priorities, and adjacency rules.', stage: '01' },
    { path: '/geometry', title: 'Site And Lot', summary: 'Review frontage, setbacks, and buildable envelope.', stage: '02' },
    { path: '/generation', title: 'Generation', summary: 'Inspect deterministic seed layout generation.', stage: '03' },
    { path: '/simulation', title: 'Simulation', summary: 'Run bubble engines and capture candidate layouts.', stage: '04' },
    { path: '/processing', title: 'Processing', summary: 'Transform captures through geometry stages.', stage: '05' },
    { path: '/verification', title: 'Verification', summary: 'Check layout failures, passes, and diagnostics.', stage: '06' },
    { path: '/gallery', title: 'Candidate Gallery', summary: 'Compare accepted layouts and shortlist winners.', stage: '07' },
    { path: '/construction', title: 'Construction Output', summary: 'Review wall, door, and window handoff outputs.', stage: '08' },
    { path: '/output-viewer', title: 'Output Viewer', summary: 'Inspect exported layout contracts.', stage: '09' },
    { path: '/reporting', title: 'Reporting', summary: 'Inspect reporting contracts and endpoint history.', stage: '10' },
  ];
  protected readonly workflowPhases = computed<readonly WorkflowPhase[]>(() => [
    { title: 'Set Up', summary: 'Brief and site', items: this.workflowNav.filter((item) => ['/', '/source', '/geometry'].includes(item.path)) },
    { title: 'Generate & Refine', summary: 'Explore and improve', items: this.workflowNav.filter((item) => ['/generation', '/simulation', '/processing'].includes(item.path)) },
    { title: 'Decide & Hand Off', summary: 'Review and export', items: this.workflowNav.filter((item) => ['/verification', '/gallery', '/construction', '/output-viewer', '/reporting'].includes(item.path)) },
  ]);
  private readonly activeUrl = toSignal(this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), map((event) => event.urlAfterRedirects), startWith(this.router.url)), { initialValue: this.router.url });
  protected readonly activeWorkflowItem = computed(() => this.workflowNav.find((item) => item.path === this.activeUrl()) ?? this.workflowNav[0]);
  protected readonly activeWorkflowIndex = computed(() => this.workflowNav.findIndex((item) => item.path === this.activeWorkflowItem().path));
  protected readonly previousWorkflowItem = computed(() => this.activeWorkflowIndex() > 0 ? this.workflowNav[this.activeWorkflowIndex() - 1] : null);
  protected readonly nextWorkflowItem = computed(() => this.activeWorkflowIndex() < this.workflowNav.length - 1 ? this.workflowNav[this.activeWorkflowIndex() + 1] : null);
  protected readonly systemRunning = computed(() => this.simulation.instanceIds().some((id) => this.simulation.readInstanceSnapshot(id).isRunning));

  constructor() { this.simulation.ensureAutoRun(); }
  protected startSimulation(): void { this.simulation.startSimulationSystem(); }
  protected stopSimulation(): void { this.simulation.stopSimulationSystem(); }
  protected togglePhase(index: number): void { this.expandedPhase.update((current) => current === index ? null : index); }
  protected phaseIsActive(phase: WorkflowPhase): boolean { return phase.items.some((item) => item.path === this.activeWorkflowItem().path); }
  protected openSourceImport(): void { this.sourceFileInput()?.nativeElement.click(); }
  protected async onSourceFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this.source.importSourceJson(await file.text());
    if (input) input.value = '';
  }
  protected exportSourceJson(): void {
    const url = URL.createObjectURL(new Blob([this.source.exportActiveSourceJson()], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.sourceSnapshot().source.meta.id || 'planforge-source'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  protected resetSourceToDefault(): void { this.source.resetToDefaultSource(); }
}
