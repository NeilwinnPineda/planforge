import { NgFor } from '@angular/common';
import { Component, input, output } from '@angular/core';

interface SimulationBarMetric {
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'app-simulation-control-bar',
  standalone: true,
  imports: [NgFor],
  templateUrl: './simulation-control-bar.component.html',
  styleUrl: './simulation-control-bar.component.scss',
})
export class SimulationControlBarComponent {
  readonly metrics = input.required<readonly SimulationBarMetric[]>();
  readonly isRunning = input.required<boolean>();
  readonly startRequested = output<void>();
  readonly stopRequested = output<void>();
  readonly clearRequested = output<void>();

  protected onPrimaryAction(): void {
    if (this.isRunning()) {
      this.stopRequested.emit();
      return;
    }

    this.startRequested.emit();
  }

  protected onClear(): void {
    this.clearRequested.emit();
  }
}
