import { computed, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SimulationStageService } from '../core/simulation/simulation.exports';
import { SimulationControlBarComponent } from '../features/simulation-foundation/components/simulation-control-bar.component';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, SimulationControlBarComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly simulationStageService = inject(SimulationStageService);
  protected readonly simulationSnapshot = this.simulationStageService.snapshot;
  protected readonly simulationInstanceIds = this.simulationStageService.instanceIds;
  protected readonly systemRunning = computed(() =>
    this.simulationInstanceIds().some((instanceId) => this.simulationStageService.readInstanceSnapshot(instanceId).isRunning),
  );
  protected readonly systemLoopRunning = computed(() =>
    this.simulationInstanceIds().some((instanceId) => this.simulationStageService.readInstanceSnapshot(instanceId).captureLoopRunning),
  );
  protected readonly shellMetrics = computed(() => [
    {
      label: 'Instances',
      value: `${this.simulationInstanceIds().length} / ${this.simulationStageService.autoSpawnTargetCount}`,
    },
    {
      label: 'Simulation',
      value: this.systemRunning() ? 'running' : 'paused',
    },
    {
      label: 'Loop',
      value: this.systemLoopRunning() ? 'active' : 'idle',
    },
    {
      label: 'Spawn cadence',
      value: `${this.simulationStageService.autoSpawnInterval / 1000}s`,
    },
    {
      label: 'Ticks',
      value: String(
        this.simulationInstanceIds().reduce(
          (total, instanceId) =>
            total
            + (this.simulationStageService.readInstanceSnapshot(instanceId).jobs[
              this.simulationStageService.readInstanceSnapshot(instanceId).activeJobIndex
            ]?.tickCount ?? 0),
          0,
        ),
      ),
    },
  ]);

  constructor() {
    this.simulationStageService.ensureAutoRun();
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
}
