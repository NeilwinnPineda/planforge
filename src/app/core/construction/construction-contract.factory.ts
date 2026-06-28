import type { ConstructionOutput } from './construction-output.service';
import type {
  ConstructionContractExport,
  ConstructionContractCell,
  ConstructionContractDoor,
  ConstructionContractWindow,
  ConstructionContractWall,
} from './construction-contract.model';

export function buildConstructionContract(output: ConstructionOutput): ConstructionContractExport {
  const { entry, analysis, doorPlacements, windowPlacements } = output;
  const { artifact } = entry;

  const wallById = new Map(analysis.segments.map((s) => [s.id, s]));

  const cells: ConstructionContractCell[] = artifact.cells.map((cell) => ({
    id: cell.id,
    typeId: cell.typeId,
    label: cell.label || cell.typeId,
    color: cell.color,
    worldPoints: cell.worldPoints,
    areaSquareMeters: Number(cell.areaSquareMeters.toFixed(4)),
    hallway: cell.hallway,
    pkg: cell.pkg,
  }));

  const doors: ConstructionContractDoor[] = doorPlacements.map((door) => ({
    id: door.id,
    kind: door.kind,
    ownerTypeId: door.ownerTypeId,
    ownerLabel: door.ownerLabel,
    widthMeters: door.widthMeters,
    positionWorld: door.positionWorld,
    wallFromWorld: door.wallFromWorld,
    wallToWorld: door.wallToWorld,
    adjacentTypeId: door.adjacentTypeId,
    adjacentLabel: door.adjacentLabel,
  }));

  const windows: ConstructionContractWindow[] = windowPlacements.map((win) => {
    const wall = wallById.get(win.wallId);
    return {
      id: win.id,
      wallId: win.wallId,
      ownerTypeId: win.ownerTypeId,
      ownerLabel: win.ownerLabel,
      sizeCode: win.sizeCode,
      widthMeters: win.widthMeters,
      tMeters: win.tMeters,
      positionWorld: win.positionWorld,
      wallFromWorld: wall ? wall.from : win.positionWorld,
      wallToWorld: wall ? wall.to : win.positionWorld,
      wallLengthMeters: win.wallLengthMeters,
    };
  });

  const externalWalls: ConstructionContractWall[] = analysis.segments.map((seg) => ({
    id: seg.id,
    from: seg.from,
    to: seg.to,
    lengthMeters: seg.lengthMeters,
    ownerTypeId: seg.ownerTypeId,
    ownerKind: seg.ownerKind,
    exteriorKind: seg.exteriorKind,
  }));

  const totalAreaSqm = cells.reduce((s, c) => s + c.areaSquareMeters, 0);
  const roomCount = cells.filter((c) => !c.pkg && !c.hallway).length;

  return {
    schemaVersion: '1.0',
    layoutId: artifact.layoutId,
    exportedAtIso: new Date().toISOString(),
    score: entry.score,
    cells,
    doors,
    windows,
    externalWalls,
    metrics: {
      totalAreaSqm: Number(totalAreaSqm.toFixed(4)),
      roomCount,
      windowCount: windows.length,
      doorCount: doors.length,
      externalWallPerimeterMeters: Number(analysis.externalWallPerimeterMeters.toFixed(4)),
      score: entry.score,
    },
  };
}
