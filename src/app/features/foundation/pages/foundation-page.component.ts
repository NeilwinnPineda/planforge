import { Component } from '@angular/core';
import { NgFor } from '@angular/common';

interface FoundationStageRow {
  readonly stage: string;
  readonly purpose: string;
}

@Component({
  selector: 'app-foundation-page',
  standalone: true,
  imports: [NgFor],
  templateUrl: './foundation-page.component.html',
  styleUrl: './foundation-page.component.scss',
})
export class FoundationPageComponent {
  protected readonly stageRows: readonly FoundationStageRow[] = [
    {
      stage: 'Source intake',
      purpose: 'Load typed design-source data and establish the canonical brief for the run.',
    },
    {
      stage: 'Constraint derivation',
      purpose: 'Turn source facts into generation constraints and stage-ready contracts.',
    },
    {
      stage: 'Generation',
      purpose: 'Produce candidate layouts that can later become canonical polygon outputs.',
    },
    {
      stage: 'Validation and reporting',
      purpose: 'Inspect candidate quality and emit endpoint-visible records for historical review.',
    },
  ];
}
