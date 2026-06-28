import { Injectable, inject } from '@angular/core';
import { SourceReadService } from '../source/source.exports';
import { deriveLotGeometry } from './lot-geometry.factory';
import type { LotGeometryResult } from './models/lot-geometry.model';

@Injectable({ providedIn: 'root' })
export class LotGeometryService {
  private readonly sourceReadService = inject(SourceReadService);

  // Geometry read step.
  // Input: no runtime arguments; this service reads the active source snapshot from source intake.
  // Output: canonical lot geometry derived from the current source's lot segments.
  // This block owns stage access only. The geometry algorithm lives in the factory.
  getActiveLotGeometry(): LotGeometryResult {
    const sourceSnapshot = this.sourceReadService.getActiveSourceSnapshot();
    return deriveLotGeometry(sourceSnapshot.source.settings.lot.segments);
  }
}
