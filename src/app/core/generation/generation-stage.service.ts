import { Injectable, inject } from '@angular/core';
import { LotGeometryService } from '../geometry/geometry.exports';
import { SourceReadService } from '../source/source.exports';
import { buildDeterministicCandidateLayout } from './candidate-layout.factory';
import { deriveActiveRoomInstances } from './room-instance.factory';
import type { DeterministicCandidateLayout } from './models/candidate-layout.model';
import type { ActiveRoomInstance } from './models/room-instance.model';

export interface GenerationStageSnapshot {
  roomInstances: ActiveRoomInstance[];
  candidateLayout: DeterministicCandidateLayout;
}

@Injectable({ providedIn: 'root' })
export class GenerationStageService {
  private readonly sourceReadService = inject(SourceReadService);
  private readonly lotGeometryService = inject(LotGeometryService);

  // Generation snapshot step.
  // Input: no runtime arguments; the service reads active source and lot geometry stages.
  // Output: active room instances and the first deterministic candidate layout.
  // This block owns stage orchestration only. Core generation rules live in the factories.
  getGenerationSnapshot(): GenerationStageSnapshot {
    const sourceSnapshot = this.sourceReadService.getActiveSourceSnapshot();
    const lotGeometry = this.lotGeometryService.getActiveLotGeometry();
    const roomInstances = deriveActiveRoomInstances(sourceSnapshot.source);
    const candidateLayout = buildDeterministicCandidateLayout(roomInstances, lotGeometry);

    return {
      roomInstances,
      candidateLayout,
    };
  }
}
