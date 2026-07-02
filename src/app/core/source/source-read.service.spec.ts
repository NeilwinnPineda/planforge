import { SourceReadService } from './source-read.service';
import { DESIGN_SOURCE } from './source-data';
import { deriveLotGeometry } from '../geometry/lot-geometry.factory';

describe('SourceReadService', () => {
  it('starts from the default source snapshot', () => {
    const service = new SourceReadService();
    const snapshot = service.getActiveSourceSnapshot();

    expect(snapshot.origin).toBe('default');
    expect(snapshot.source.meta.id).toBe('super-hard');
    expect(snapshot.validation.status).toBe('pass');
  });

  it('updates room counts and removes program entries when count reaches zero', () => {
    const service = new SourceReadService();

    service.updateProgramRoomCount('living', 2);
    expect(service.getActiveSourceSnapshot().source.settings.rooms.program['living']).toBe(2);

    service.updateProgramRoomCount('living', 0);
    expect(service.getActiveSourceSnapshot().source.settings.rooms.program['living']).toBeUndefined();
  });

  it('writes adjacency updates symmetrically and clears explicit links when reset to default', () => {
    const service = new SourceReadService();

    service.addRoomToProgram('office');
    service.updateAdjacencyScore('living', 'office', 4);

    let snapshot = service.getActiveSourceSnapshot();
    expect(snapshot.source.settings.adjacency.exceptions['living']?.['office']).toBe(4);
    expect(snapshot.source.settings.adjacency.exceptions['office']?.['living']).toBe(4);

    service.updateAdjacencyScore('living', 'office', 3);

    snapshot = service.getActiveSourceSnapshot();
    expect(snapshot.source.settings.adjacency.exceptions['living']?.['office']).toBeUndefined();
    expect(snapshot.source.settings.adjacency.exceptions['office']?.['living']).toBeUndefined();
  });

  it('removes adjacency references when a room is removed from the active program', () => {
    const service = new SourceReadService();

    service.addRoomToProgram('office');
    service.updateAdjacencyScore('living', 'office', 4);
    service.removeRoomFromProgram('office');

    const snapshot = service.getActiveSourceSnapshot();

    expect(snapshot.source.settings.rooms.program['office']).toBeUndefined();
    expect(snapshot.source.settings.adjacency.exceptions['office']).toBeUndefined();
    expect(snapshot.source.settings.adjacency.exceptions['living']?.['office']).toBeUndefined();
  });

  it('imports source json and marks the snapshot as imported', () => {
    const service = new SourceReadService();
    const importedSource = {
      ...DESIGN_SOURCE,
      meta: {
        ...DESIGN_SOURCE.meta,
        id: 'imported-test-source',
        title: 'Imported Test Source',
      },
    };

    const snapshot = service.importSourceJson(JSON.stringify(importedSource));

    expect(snapshot.origin).toBe('imported');
    expect(snapshot.source.meta.id).toBe('imported-test-source');
    expect(service.getActiveSourceSnapshot().source.meta.title).toBe('Imported Test Source');
  });

  it('exports the currently active source json', () => {
    const service = new SourceReadService();

    service.updateProgramRoomCount('living', 2);
    const exported = JSON.parse(service.exportActiveSourceJson()) as typeof DESIGN_SOURCE;

    expect(exported.settings.rooms.program['living']).toBe(2);
    expect(exported.meta.id).toBe(DESIGN_SOURCE.meta.id);
  });

  it('rewrites lot survey segments when an editable point is moved', () => {
    const service = new SourceReadService();
    const before = service.getActiveSourceSnapshot();
    const beforeDistance0 = before.source.settings.lot.segments[0].distance;
    const beforeDistance1 = before.source.settings.lot.segments[1].distance;

    service.updateLotPoint(1, 'x', 12);

    const snapshot = service.getActiveSourceSnapshot();
    const geometry = deriveLotGeometry(snapshot.source.settings.lot.segments);

    expect(geometry.lotPoints[1].x).toBeCloseTo(12, 3);
    expect(snapshot.source.settings.lot.segments[0].distance).not.toBeCloseTo(beforeDistance0, 3);
    expect(snapshot.source.settings.lot.segments[1].distance).not.toBeCloseTo(beforeDistance1, 3);
  });

  it('updates lot segment bearing and distance directly', () => {
    const service = new SourceReadService();

    service.updateLotSegmentBearing(0, 'N 45° 00\' E');
    service.updateLotSegmentDistance(0, 10);

    const snapshot = service.getActiveSourceSnapshot();

    expect(snapshot.source.settings.lot.segments[0].bearing).toBe('N 45° 00\' E');
    expect(snapshot.source.settings.lot.segments[0].distance).toBe(10);
  });

  it('updates lot segment setback directly', () => {
    const service = new SourceReadService();

    service.updateLotSegmentSetback(2, 4.25);

    const snapshot = service.getActiveSourceSnapshot();

    expect(snapshot.source.settings.lot.segments[2].setback).toBe(4.25);
  });

  it('toggles rrow on a lot segment', () => {
    const service = new SourceReadService();

    service.updateLotSegmentRrow(1, true);
    let snapshot = service.getActiveSourceSnapshot();
    expect(snapshot.source.settings.lot.segments[1].isRrow).toBe(true);

    service.updateLotSegmentRrow(0, false);
    snapshot = service.getActiveSourceSnapshot();
    expect(snapshot.source.settings.lot.segments[0].isRrow).toBeUndefined();
  });

  it('adds a lot point by splitting the selected edge', () => {
    const service = new SourceReadService();
    const before = service.getActiveSourceSnapshot();
    const beforeGeometry = deriveLotGeometry(before.source.settings.lot.segments);
    const midpointX = (beforeGeometry.lotPoints[0].x + beforeGeometry.lotPoints[1].x) / 2;
    const midpointY = (beforeGeometry.lotPoints[0].y + beforeGeometry.lotPoints[1].y) / 2;

    service.addLotPoint(0);

    const snapshot = service.getActiveSourceSnapshot();
    const geometry = deriveLotGeometry(snapshot.source.settings.lot.segments);

    expect(snapshot.source.settings.lot.segments.length).toBe(before.source.settings.lot.segments.length + 1);
    expect(geometry.lotPoints.length).toBe(beforeGeometry.lotPoints.length + 1);
    expect(geometry.lotPoints[1].x).toBeCloseTo(midpointX, 3);
    expect(geometry.lotPoints[1].y).toBeCloseTo(midpointY, 3);
  });

  it('removes a lot point by merging its adjacent edges', () => {
    const service = new SourceReadService();
    const before = service.getActiveSourceSnapshot();
    const beforeGeometry = deriveLotGeometry(before.source.settings.lot.segments);

    service.addLotPoint(0);
    service.removeLotPoint(1);

    const snapshot = service.getActiveSourceSnapshot();
    const geometry = deriveLotGeometry(snapshot.source.settings.lot.segments);

    expect(snapshot.source.settings.lot.segments.length).toBe(before.source.settings.lot.segments.length);
    expect(geometry.lotPoints.length).toBe(beforeGeometry.lotPoints.length);
    expect(geometry.lotPoints[1].x).toBeCloseTo(beforeGeometry.lotPoints[1].x, 3);
    expect(geometry.lotPoints[1].y).toBeCloseTo(beforeGeometry.lotPoints[1].y, 3);
    expect(snapshot.source.settings.lot.segments[0].point).toBe('P1');
    expect(snapshot.source.settings.lot.segments[1].point).toBe('P2');
  });

  it('resets an imported source back to the default source', () => {
    const service = new SourceReadService();
    const importedSource = {
      ...DESIGN_SOURCE,
      meta: {
        ...DESIGN_SOURCE.meta,
        id: 'imported-reset-test',
        title: 'Imported Reset Test',
      },
    };

    service.importSourceJson(JSON.stringify(importedSource));
    service.resetToDefaultSource();

    const snapshot = service.getActiveSourceSnapshot();
    expect(snapshot.origin).toBe('default');
    expect(snapshot.source.meta.id).toBe(DESIGN_SOURCE.meta.id);
    expect(snapshot.source.meta.title).toBe(DESIGN_SOURCE.meta.title);
  });
});
