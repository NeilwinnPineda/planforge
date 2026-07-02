import { deriveLotGeometry } from './lot-geometry.factory';
import type { ProjectLotSegment } from '../source/source.exports';

describe('deriveLotGeometry', () => {
  it('reports a closure segment when the survey chain does not fully close', () => {
    const lotSegments: ProjectLotSegment[] = [
      { point: 'P1', bearing: 'N 90 00 E', distance: 10, setback: 1, isRrow: true },
      { point: 'P2', bearing: 'N 0 00 W', distance: 10, setback: 1 },
      { point: 'P3', bearing: 'S 90 00 W', distance: 10, setback: 1 },
      { point: 'P4', bearing: 'S 0 00 E', distance: 9, setback: 1 },
    ];

    const geometry = deriveLotGeometry(lotSegments);

    expect(geometry.closureErrorMeters).toBeGreaterThan(0.9);
    expect(geometry.closureSegment).not.toBeNull();
    expect(geometry.closureSegment?.to.x).toBeCloseTo(0, 6);
    expect(geometry.closureSegment?.to.y).toBeCloseTo(0, 6);
  });

  it('flags the lot as unbuildable when setbacks collapse the interior polygon', () => {
    const lotSegments: ProjectLotSegment[] = [
      { point: 'P1', bearing: 'N 90 00 E', distance: 4, setback: 3, isRrow: true },
      { point: 'P2', bearing: 'N 0 00 W', distance: 4, setback: 3 },
      { point: 'P3', bearing: 'S 90 00 W', distance: 4, setback: 3 },
      { point: 'P4', bearing: 'S 0 00 E', distance: 4, setback: 3 },
    ];

    const geometry = deriveLotGeometry(lotSegments);

    expect(geometry.isBuildable).toBeFalsy();
    expect(geometry.issues.length).toBeGreaterThan(0);
    expect(geometry.issues).toContain('Buildable polygon falls outside one or more setback limits.');
  });
});
