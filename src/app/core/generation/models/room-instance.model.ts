import type { RoomTag } from '../../source/source.exports';

// Active room-instance contract.
// Input: source room catalog plus source program counts.
// Output: concrete active room instances for candidate generation.
// This block defines canonical generation-stage data, not visual projection data.

export interface ActiveRoomInstance {
  instanceId: string;
  typeId: string;
  label: string;
  shortLabel: string;
  color: string;
  radiusMeters: number;
  targetAreaSquareMeters: number;
  tags: RoomTag[];
  programIndex: number;
}
