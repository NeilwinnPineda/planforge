import { Component, inject } from '@angular/core';
import { NgClass, NgFor } from '@angular/common';
import { SourceReadService } from '../../../core/source/source.exports';

interface SourceMetricRow {
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'app-source-intake-page',
  standalone: true,
  imports: [NgFor, NgClass],
  templateUrl: './source-intake-page.component.html',
  styleUrl: './source-intake-page.component.scss',
})
export class SourceIntakePageComponent {
  private readonly sourceReadService = inject(SourceReadService);
  protected readonly sourceSnapshot = this.sourceReadService.getActiveSourceSnapshot();
  protected readonly sourceMetrics: readonly SourceMetricRow[] = [
    {
      label: 'Room types',
      value: String(this.sourceSnapshot.validation.counts.roomTypes),
    },
    {
      label: 'Active room types',
      value: String(this.sourceSnapshot.validation.counts.activeRoomTypes),
    },
    {
      label: 'Active room instances',
      value: String(this.sourceSnapshot.validation.counts.activeRoomInstances),
    },
    {
      label: 'Adjacency pairs',
      value: String(this.sourceSnapshot.validation.counts.adjacencyPairs),
    },
    {
      label: 'Frontage segments',
      value: String(this.sourceSnapshot.validation.counts.frontageSegments),
    },
  ];
  protected readonly activeProgramRows = Object.entries(this.sourceSnapshot.source.settings.rooms.program)
    .filter(([, count]) => count > 0)
    .map(([roomId, count]) => ({ roomId, count }));
  protected readonly priorityRows = this.sourceSnapshot.source.intent.priorities;
  protected readonly validationMessages = this.sourceSnapshot.validation.messages;
  protected readonly sourceComments = this.sourceSnapshot.source.aiComments;

  protected validationClass(level: 'pass' | 'warn' | 'fail'): string {
    return `source-validation--${level}`;
  }
}
