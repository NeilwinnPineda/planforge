import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `<div class="empty-state"><span class="empty-state__mark" aria-hidden="true">{{ mark() }}</span><strong>{{ title() }}</strong><p>{{ detail() }}</p><ng-content /></div>`,
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly detail = input.required<string>();
  readonly mark = input('PF');
}
