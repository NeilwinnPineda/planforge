import { Component, computed, inject } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import {
  SourceReadService,
  type RoomPrototype,
} from '../../../core/source/source.exports';

interface SourceMetricRow {
  readonly label: string;
  readonly value: string;
}

interface ProgramRoomRow {
  readonly roomId: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly count: number;
  readonly tags: readonly string[];
  readonly color: string;
}

interface AdjacencyMatrixRow {
  readonly roomId: string;
  readonly label: string;
  readonly shortLabel: string;
}

interface SourceStageHighlightRow {
  readonly label: string;
  readonly value: string;
}

interface SourceValidationSummaryRow {
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'app-source-intake-page',
  standalone: true,
  imports: [NgFor, NgClass, NgIf],
  templateUrl: './source-intake-page.component.html',
  styleUrl: './source-intake-page.component.scss',
})
export class SourceIntakePageComponent {
  private readonly sourceReadService = inject(SourceReadService);
  private readonly defaultSourceSnapshot = this.sourceReadService.getDefaultSourceSnapshot();
  protected selectedRoomToAdd = '';
  protected readonly sourceSnapshot = this.sourceReadService.activeSourceSnapshot;
  protected readonly sourceMetrics = computed<readonly SourceMetricRow[]>(() => [
    {
      label: 'Room types',
      value: String(this.sourceSnapshot().validation.counts.roomTypes),
    },
    {
      label: 'Active room types',
      value: String(this.sourceSnapshot().validation.counts.activeRoomTypes),
    },
    {
      label: 'Active room instances',
      value: String(this.sourceSnapshot().validation.counts.activeRoomInstances),
    },
    {
      label: 'Adjacency pairs',
      value: String(this.sourceSnapshot().validation.counts.adjacencyPairs),
    },
    {
      label: 'Frontage segments',
      value: String(this.sourceSnapshot().validation.counts.frontageSegments),
    },
  ]);
  protected readonly activeProgramRows = computed<readonly ProgramRoomRow[]>(() =>
    this.sourceSnapshot().source.roomCatalog
      .map((room) => this.toProgramRoomRow(room))
      .filter((row): row is ProgramRoomRow => row !== null)
      .sort((left, right) => left.label.localeCompare(right.label)),
  );
  protected readonly availableRoomOptions = computed<readonly RoomPrototype[]>(() => {
    const activeRoomIds = new Set(this.activeProgramRows().map((row) => row.roomId));

    return this.sourceSnapshot().source.roomCatalog
      .filter((room) => !activeRoomIds.has(room.id))
      .sort((left, right) => left.label.localeCompare(right.label));
  });
  protected readonly adjacencyRooms = computed<readonly AdjacencyMatrixRow[]>(() =>
    this.activeProgramRows().map((room) => ({
      roomId: room.roomId,
      label: room.label,
      shortLabel: room.shortLabel,
    })),
  );
  protected readonly priorityRows = computed(() => this.sourceSnapshot().source.intent.priorities);
  protected readonly validationMessages = computed(() => this.sourceSnapshot().validation.messages);
  protected readonly sourceComments = computed(() => this.sourceSnapshot().source.aiComments);
  protected readonly stageStatusLabel = computed(() => {
    const status = this.sourceSnapshot().validation.status;

    if (status === 'pass') {
      return 'Brief looks ready for lot and generation setup';
    }

    if (status === 'warn') {
      return 'Brief is usable but still needs review';
    }

    return 'Brief needs cleanup before downstream work';
  });
  protected readonly stageStatusTone = computed<'ready' | 'review' | 'attention'>(() => {
    const status = this.sourceSnapshot().validation.status;
    if (status === 'pass') return 'ready';
    if (status === 'warn') return 'review';
    return 'attention';
  });
  protected readonly stageSummary = computed(() => {
    const roomCount = this.sourceSnapshot().validation.counts.activeRoomInstances;
    const roomTypes = this.sourceSnapshot().validation.counts.activeRoomTypes;

    return `Set the house brief here: choose the rooms, set how many you need, and define which spaces should prefer to stay close or far apart. The current brief has ${roomCount} room instances across ${roomTypes} active room categories.`;
  });
  protected readonly stageNextAction = computed(() => {
    const status = this.sourceSnapshot().validation.status;

    if (status === 'pass') {
      return 'When the room list and relationships feel right, move to Site And Lot so the brief can be tested against a real buildable area.';
    }

    if (status === 'warn') {
      return 'Review the warning notes, tighten the room list or adjacency intent, then continue once the brief looks stable enough to test on the lot.';
    }

    return 'Fix the failing brief notes first so downstream generation does not start from a broken program.';
  });
  protected readonly highlightRows = computed<readonly SourceStageHighlightRow[]>(() => [
    { label: 'Current status', value: this.stageStatusLabel() },
    { label: 'Active room types', value: String(this.sourceSnapshot().validation.counts.activeRoomTypes) },
    { label: 'Room instances', value: String(this.sourceSnapshot().validation.counts.activeRoomInstances) },
    { label: 'Adjacency pairs', value: String(this.sourceSnapshot().validation.counts.adjacencyPairs) },
  ]);
  protected readonly validationSummaryRows = computed<readonly SourceValidationSummaryRow[]>(() => {
    const messages = this.validationMessages();
    const passCount = messages.filter((message) => message.level === 'pass').length;
    const warnCount = messages.filter((message) => message.level === 'warn').length;
    const failCount = messages.filter((message) => message.level === 'fail').length;

    return [
      { label: 'Passing notes', value: String(passCount) },
      { label: 'Warnings', value: String(warnCount) },
      { label: 'Failures', value: String(failCount) },
    ];
  });
  protected readonly scoreLegend = [
    { score: 5, meaning: 'Must touch' },
    { score: 4, meaning: 'Prefer close / strong attraction' },
    { score: 3, meaning: 'Neutral default' },
    { score: 2, meaning: 'Keep some separation' },
    { score: 1, meaning: 'Avoid adjacency' },
  ] as const;

  protected validationClass(level: 'pass' | 'warn' | 'fail'): string {
    return `source-validation--${level}`;
  }

  protected stageToneClass(): string {
    return `source-stage-pill--${this.stageStatusTone()}`;
  }

  protected onProgramCountChanged(roomId: string, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const value = Number(input?.value ?? 0);
    this.sourceReadService.updateProgramRoomCount(roomId, value);
  }

  protected onRoomSelectionChanged(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    this.selectedRoomToAdd = select?.value ?? '';
  }

  protected addSelectedRoom(): void {
    if (!this.selectedRoomToAdd) {
      return;
    }

    this.sourceReadService.addRoomToProgram(this.selectedRoomToAdd);
    this.selectedRoomToAdd = '';
  }

  protected removeRoom(roomId: string): void {
    this.sourceReadService.removeRoomFromProgram(roomId);
  }

  protected matrixScore(leftRoomId: string, rightRoomId: string): number {
    const adjacency = this.sourceSnapshot().source.settings.adjacency;

    if (leftRoomId === rightRoomId) {
      return adjacency.sameTypeDefault;
    }

    return adjacency.exceptions[leftRoomId]?.[rightRoomId]
      ?? adjacency.exceptions[rightRoomId]?.[leftRoomId]
      ?? adjacency.defaultScore;
  }

  protected onAdjacencyScoreChanged(leftRoomId: string, rightRoomId: string, event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    const value = Number(select?.value ?? this.sourceSnapshot().source.settings.adjacency.defaultScore);
    this.sourceReadService.updateAdjacencyScore(leftRoomId, rightRoomId, value);
  }

  protected scoreTone(score: number): string {
    if (score >= 5) return 'source-score-chip--strong';
    if (score >= 4) return 'source-score-chip--pull';
    if (score <= 1) return 'source-score-chip--avoid';
    if (score <= 2) return 'source-score-chip--separate';
    return 'source-score-chip--neutral';
  }

  protected defaultMatrixScore(leftRoomId: string, rightRoomId: string): number {
    const adjacency = this.defaultSourceSnapshot.source.settings.adjacency;

    if (leftRoomId === rightRoomId) {
      return adjacency.sameTypeDefault;
    }

    return adjacency.exceptions[leftRoomId]?.[rightRoomId]
      ?? adjacency.exceptions[rightRoomId]?.[leftRoomId]
      ?? adjacency.defaultScore;
  }

  private toProgramRoomRow(room: RoomPrototype): ProgramRoomRow | null {
    const count = this.sourceSnapshot().source.settings.rooms.program[room.id] ?? 0;
    if (count <= 0) {
      return null;
    }

    return {
      roomId: room.id,
      label: room.label,
      shortLabel: room.shortLabel,
      count,
      tags: room.tags,
      color: room.color,
    };
  }
}
