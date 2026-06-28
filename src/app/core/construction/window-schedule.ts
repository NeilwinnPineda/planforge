export type WindowSizeCode = 'XS' | 'S' | 'M' | 'L' | 'XL';

export interface WindowTypeRule {
  readonly sizeCode: WindowSizeCode;
  readonly widthMeters: number;
  readonly maxPerWall: number;
  readonly minWallMeters: number;
}

const SCHEDULE: Readonly<Record<string, WindowTypeRule | null>> = {
  // Wet rooms — XS, single window only
  master_bath:    { sizeCode: 'XS', widthMeters: 0.45, maxPerWall: 1, minWallMeters: 1.2 },
  shared_bath:    { sizeCode: 'XS', widthMeters: 0.45, maxPerWall: 1, minWallMeters: 1.2 },
  powder_room:    { sizeCode: 'XS', widthMeters: 0.45, maxPerWall: 1, minWallMeters: 1.2 },
  laundry:        { sizeCode: 'XS', widthMeters: 0.45, maxPerWall: 1, minWallMeters: 1.2 },
  dirty_kitchen:  { sizeCode: 'S',  widthMeters: 0.60, maxPerWall: 1, minWallMeters: 1.4 },
  mudroom:        { sizeCode: 'S',  widthMeters: 0.60, maxPerWall: 1, minWallMeters: 1.4 },
  foyer:          { sizeCode: 'S',  widthMeters: 0.60, maxPerWall: 1, minWallMeters: 1.4 },
  // Bedrooms / work — M
  master_bed:     { sizeCode: 'M',  widthMeters: 0.90, maxPerWall: 2, minWallMeters: 1.8 },
  kids_bed:       { sizeCode: 'M',  widthMeters: 0.90, maxPerWall: 2, minWallMeters: 1.8 },
  guest_bed:      { sizeCode: 'M',  widthMeters: 0.90, maxPerWall: 2, minWallMeters: 1.8 },
  office:         { sizeCode: 'M',  widthMeters: 0.90, maxPerWall: 2, minWallMeters: 1.8 },
  study:          { sizeCode: 'M',  widthMeters: 0.90, maxPerWall: 2, minWallMeters: 1.8 },
  gym:            { sizeCode: 'M',  widthMeters: 0.90, maxPerWall: 2, minWallMeters: 1.8 },
  playroom:       { sizeCode: 'M',  widthMeters: 0.90, maxPerWall: 2, minWallMeters: 1.8 },
  kitchen:        { sizeCode: 'M',  widthMeters: 0.90, maxPerWall: 1, minWallMeters: 1.8 },
  breakfast_nook: { sizeCode: 'M',  widthMeters: 0.90, maxPerWall: 1, minWallMeters: 1.8 },
  // Open living — L
  living:         { sizeCode: 'L',  widthMeters: 1.20, maxPerWall: 3, minWallMeters: 2.4 },
  family_room:    { sizeCode: 'L',  widthMeters: 1.20, maxPerWall: 3, minWallMeters: 2.4 },
  dining:         { sizeCode: 'L',  widthMeters: 1.20, maxPerWall: 2, minWallMeters: 2.4 },
  // No windows
  pantry:         null,
  storage:        null,
  master_closet:  null,
  utility:        null,
  media_room:     null,
  garage:         null,
  stairs:         null,
  patio:          null,
  balcony:        null,
  hallway:        null,
};

const DEFAULT_RULE: WindowTypeRule = { sizeCode: 'M', widthMeters: 0.90, maxPerWall: 1, minWallMeters: 1.8 };

export function windowRuleForTypeId(typeId: string): WindowTypeRule | null {
  return Object.prototype.hasOwnProperty.call(SCHEDULE, typeId) ? SCHEDULE[typeId] : DEFAULT_RULE;
}
