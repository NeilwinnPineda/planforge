import { Component, input } from '@angular/core';
import { NgFor } from '@angular/common';

export interface StatStripItem { readonly label: string; readonly value: string; }

@Component({
  selector: 'app-stat-strip',
  standalone: true,
  imports: [NgFor],
  template: `<div class="stat-strip"><div *ngFor="let item of items()" class="stat-strip__item"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div></div>`,
  styleUrl: './stat-strip.component.scss',
})
export class StatStripComponent { readonly items = input.required<readonly StatStripItem[]>(); }
