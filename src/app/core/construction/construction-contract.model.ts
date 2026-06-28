import type { ConstructionDoorKind } from './door-schedule';

export type { ConstructionDoorKind };

export interface ConstructionContractCell {
  readonly id: string;
  readonly typeId: string;
  readonly label: string;
  readonly color: string;
  readonly worldPoints: readonly { readonly x: number; readonly y: number }[];
  readonly areaSquareMeters: number;
  readonly hallway: boolean;
  readonly pkg: boolean;
}

export interface ConstructionContractDoor {
  readonly id: string;
  readonly kind: ConstructionDoorKind;
  readonly ownerTypeId: string;
  readonly ownerLabel: string;
  readonly widthMeters: number;
  readonly positionWorld: { readonly x: number; readonly y: number };
  readonly wallFromWorld: { readonly x: number; readonly y: number };
  readonly wallToWorld: { readonly x: number; readonly y: number };
  readonly adjacentTypeId: string | null;
  readonly adjacentLabel: string | null;
}

export interface ConstructionContractWindow {
  readonly id: string;
  readonly wallId: string;
  readonly ownerTypeId: string;
  readonly ownerLabel: string;
  readonly sizeCode: string;
  readonly widthMeters: number;
  readonly tMeters: number;
  readonly positionWorld: { readonly x: number; readonly y: number };
  readonly wallFromWorld: { readonly x: number; readonly y: number };
  readonly wallToWorld: { readonly x: number; readonly y: number };
  readonly wallLengthMeters: number;
}

export interface ConstructionContractWall {
  readonly id: string;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly lengthMeters: number;
  readonly ownerTypeId: string;
  readonly ownerKind: 'room' | 'hallway';
  readonly exteriorKind: 'outside' | 'filler';
}

export interface ConstructionContractMetrics {
  readonly totalAreaSqm: number;
  readonly roomCount: number;
  readonly windowCount: number;
  readonly doorCount: number;
  readonly externalWallPerimeterMeters: number;
  readonly score: number;
}

export interface ConstructionContractExport {
  readonly schemaVersion: '1.0';
  readonly layoutId: string;
  readonly exportedAtIso: string;
  readonly score: number;
  readonly cells: readonly ConstructionContractCell[];
  readonly doors: readonly ConstructionContractDoor[];
  readonly windows: readonly ConstructionContractWindow[];
  readonly externalWalls: readonly ConstructionContractWall[];
  readonly metrics: ConstructionContractMetrics;
}
