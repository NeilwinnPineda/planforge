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
      stage: 'Start with the project brief',
      purpose: 'Review the project source, room program, and adjacency setup before running layout work.',
    },
    {
      stage: 'Check the site and layout setup',
      purpose: 'Confirm the lot shape, buildable area, and generation inputs that will shape the options.',
    },
    {
      stage: 'Generate and refine candidates',
      purpose: 'Use generation, simulation, and processing views to shape candidates into stronger layouts.',
    },
    {
      stage: 'Verify and prepare the result',
      purpose: 'Compare candidates, check readiness, and move the best layout toward construction output or export.',
    },
  ];
}
