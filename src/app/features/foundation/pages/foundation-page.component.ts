import { Component } from '@angular/core';
import { NgFor } from '@angular/common';
import { RunHealthComponent } from '../components/run-health.component';

interface FoundationStageRow {
  readonly stage: string;
  readonly purpose: string;
}

@Component({
  selector: 'app-foundation-page',
  standalone: true,
  imports: [NgFor, RunHealthComponent],
  templateUrl: './foundation-page.component.html',
  styleUrl: './foundation-page.component.scss',
})
export class FoundationPageComponent {
  protected readonly stageRows: readonly FoundationStageRow[] = [
    {
      stage: '01 · Program Setup',
      purpose: 'Define rooms, target areas, tags, adjacency scores, and blocker rules that will shape every candidate.',
    },
    {
      stage: '02 · Site And Lot',
      purpose: 'Set lot segments, setbacks, and RROW lines. Review the buildable envelope and frontage constraint.',
    },
    {
      stage: '03 · Generation',
      purpose: 'Review the seed positions and bias profiles that initialize each simulation run.',
    },
    {
      stage: '04 · Simulation',
      purpose: 'Run physics bubble engines with heatmap feedback until passing layout captures are collected.',
    },
    {
      stage: '05 · Processing',
      purpose: 'Transform captures through Voronoi clipping, hallway injection, UV edge negotiation, and residual absorption.',
    },
    {
      stage: '06 · Verification',
      purpose: 'Check all nine layout rules: deficiency, aspect ratio, access, critical touch, frontage, slivers, and overlaps.',
    },
    {
      stage: '07 · Candidate Gallery',
      purpose: 'Compare verified layouts across the run and shortlist the strongest candidates for handoff.',
    },
    {
      stage: '08 · Construction Output',
      purpose: 'Review the extracted wall segments, door placements, and window placements ready for export.',
    },
    {
      stage: '09 · Output Viewer',
      purpose: 'Inspect the full layout contract and confirm it is ready to push to the Revit endpoint.',
    },
    {
      stage: '10 · Reporting',
      purpose: 'Track pipeline reports and monitor push history to the reporting endpoint.',
    },
  ];
}
