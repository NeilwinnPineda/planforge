export type ConstructionDoorKind = 'entry' | 'garage' | 'service' | 'interior';

export interface ExteriorDoorRule {
  readonly kind: Exclude<ConstructionDoorKind, 'interior'>;
  readonly widthMeters: number;
  readonly preferFront: boolean;
}

export const EXTERIOR_DOOR_RULES: Readonly<Record<string, ExteriorDoorRule>> = {
  foyer:         { kind: 'entry',   widthMeters: 1.00, preferFront: true  },
  garage:        { kind: 'garage',  widthMeters: 2.40, preferFront: true  },
  dirty_kitchen: { kind: 'service', widthMeters: 0.90, preferFront: false },
  laundry:       { kind: 'service', widthMeters: 0.90, preferFront: false },
  mudroom:       { kind: 'service', widthMeters: 0.90, preferFront: false },
};

const NARROW_INTERIOR: ReadonlySet<string> = new Set([
  'master_closet', 'pantry', 'storage', 'powder_room', 'utility',
]);

export function interiorDoorWidthForTypeId(typeId: string): number {
  return NARROW_INTERIOR.has(typeId) ? 0.80 : 0.90;
}
