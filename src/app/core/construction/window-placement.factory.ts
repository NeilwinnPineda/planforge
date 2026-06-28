import type { ConstructionExternalWallSegment } from './external-wall.factory';
import { type WindowSizeCode, windowRuleForTypeId } from './window-schedule';

export interface ConstructionWindowPlacement {
  readonly id: string;
  readonly wallId: string;
  readonly ownerTypeId: string;
  readonly ownerLabel: string;
  readonly sizeCode: WindowSizeCode;
  readonly widthMeters: number;
  readonly tNormalized: number;
  readonly tMeters: number;
  readonly positionWorld: { readonly x: number; readonly y: number };
  readonly wallLengthMeters: number;
}

export function buildWindowPlacements(
  segments: readonly ConstructionExternalWallSegment[],
  doorWallIds: ReadonlySet<string> = new Set(),
): readonly ConstructionWindowPlacement[] {
  const placements: ConstructionWindowPlacement[] = [];

  for (const wall of segments) {
    if (wall.ownerKind !== 'room') continue;
    if (doorWallIds.has(wall.id)) continue;

    const rule = windowRuleForTypeId(wall.ownerTypeId);
    if (!rule) continue;
    if (wall.lengthMeters < rule.minWallMeters) continue;

    const spacingTarget = rule.widthMeters * 2.0;
    const count = Math.min(rule.maxPerWall, Math.max(1, Math.floor(wall.lengthMeters / spacingTarget)));

    for (let i = 0; i < count; i++) {
      const tNormalized = (i + 1) / (count + 1);
      const tMeters = Number((tNormalized * wall.lengthMeters).toFixed(3));
      const x = Number((wall.from.x + (wall.to.x - wall.from.x) * tNormalized).toFixed(4));
      const y = Number((wall.from.y + (wall.to.y - wall.from.y) * tNormalized).toFixed(4));

      placements.push({
        id: `WIN-${wall.id}-${i + 1}`,
        wallId: wall.id,
        ownerTypeId: wall.ownerTypeId,
        ownerLabel: wall.ownerLabel,
        sizeCode: rule.sizeCode,
        widthMeters: rule.widthMeters,
        tNormalized,
        tMeters,
        positionWorld: { x, y },
        wallLengthMeters: wall.lengthMeters,
      });
    }
  }

  return placements;
}
