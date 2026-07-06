import { Component, input } from '@angular/core';

export type StatusPillRole = 'pass' | 'review' | 'fail' | 'active' | 'idle';

@Component({
  selector: 'app-status-pill',
  standalone: true,
  template: `<span class="status-pill" [class]="'status-pill status-pill--' + role()"><ng-content /></span>`,
  styleUrl: './status-pill.component.scss',
})
export class StatusPillComponent {
  readonly role = input<StatusPillRole>('idle');
}
