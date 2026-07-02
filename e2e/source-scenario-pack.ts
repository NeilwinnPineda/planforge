type JsonMap = Record<string, unknown>;

export interface SourceScenarioDefinition {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly mutate: (source: JsonMap) => void;
}

function setMeta(source: JsonMap, id: string, title: string, summary: string): void {
  const meta = source.meta as JsonMap;
  meta.id = id;
  meta.title = title;
  meta.summary = summary;
}

function setProgram(source: JsonMap, program: Record<string, number>): void {
  const settings = source.settings as JsonMap;
  const rooms = settings.rooms as JsonMap;
  rooms.program = program;
}

function setLotSegments(source: JsonMap, segments: Array<Record<string, unknown>>): void {
  const settings = source.settings as JsonMap;
  const lot = settings.lot as JsonMap;
  lot.segments = segments;
}

export const SOURCE_SCENARIO_PACK: readonly SourceScenarioDefinition[] = [
  {
    id: 'compact-urban-infill',
    name: 'Compact Urban Infill',
    purpose: 'Tight but still feasible single-storey urban brief on a narrow frontage lot.',
    mutate: (source) => {
      setMeta(
        source,
        'compact-urban-infill',
        'Compact Urban Infill',
        'Narrow urban frontage with a compact residential brief that should still remain feasible.',
      );
      setProgram(source, {
        foyer: 1,
        living: 1,
        dining: 1,
        kitchen: 1,
        master_bed: 1,
        master_bath: 1,
        shared_bath: 1,
        laundry: 1,
        garage: 1,
        office: 1,
      });
      setLotSegments(source, [
        { point: 'P1', bearing: 'N 89 59 E', distance: 10.5, setback: 3, isRrow: true },
        { point: 'P2', bearing: 'N 2 00 W', distance: 22, setback: 1.6 },
        { point: 'P3', bearing: 'S 89 59 W', distance: 10.4, setback: 1.8 },
        { point: 'P4', bearing: 'S 2 00 E', distance: 22, setback: 1.8 },
      ]);
    },
  },
  {
    id: 'wide-family-lot',
    name: 'Wide Family Lot',
    purpose: 'Broader family program on a generous lot with more public and secondary rooms.',
    mutate: (source) => {
      setMeta(
        source,
        'wide-family-lot',
        'Wide Family Lot',
        'Wider frontage and larger family program intended to test richer room distribution.',
      );
      setProgram(source, {
        foyer: 1,
        living: 1,
        family_room: 1,
        dining: 1,
        kitchen: 1,
        breakfast_nook: 1,
        master_bed: 1,
        master_bath: 1,
        kids_bed: 2,
        shared_bath: 1,
        laundry: 1,
        powder_room: 1,
        garage: 1,
        office: 1,
      });
      setLotSegments(source, [
        { point: 'P1', bearing: 'N 89 59 E', distance: 20, setback: 4, isRrow: true },
        { point: 'P2', bearing: 'N 3 00 W', distance: 24, setback: 2 },
        { point: 'P3', bearing: 'S 89 59 W', distance: 20.2, setback: 2.4 },
        { point: 'P4', bearing: 'S 3 00 E', distance: 24, setback: 2.4 },
      ]);
    },
  },
  {
    id: 'deep-narrow-lot',
    name: 'Deep Narrow Lot',
    purpose: 'Very constrained width with depth, useful for circulation and sequencing stress.',
    mutate: (source) => {
      setMeta(
        source,
        'deep-narrow-lot',
        'Deep Narrow Lot',
        'Long and narrow lot shape intended to stress access, sequencing, and corridor behavior.',
      );
      setProgram(source, {
        foyer: 1,
        living: 1,
        dining: 1,
        kitchen: 1,
        master_bed: 1,
        master_bath: 1,
        kids_bed: 1,
        shared_bath: 1,
        laundry: 1,
        garage: 1,
        study: 1,
      });
      setLotSegments(source, [
        { point: 'P1', bearing: 'N 89 59 E', distance: 8.2, setback: 3, isRrow: true },
        { point: 'P2', bearing: 'N 1 30 W', distance: 30, setback: 1.5 },
        { point: 'P3', bearing: 'S 89 59 W', distance: 8.1, setback: 1.8 },
        { point: 'P4', bearing: 'S 1 30 E', distance: 30, setback: 1.8 },
      ]);
    },
  },
  {
    id: 'irregular-corner-lot',
    name: 'Irregular Corner Lot',
    purpose: 'Non-rectangular five-point lot to stress geometry handling and skewed buildable space.',
    mutate: (source) => {
      setMeta(
        source,
        'irregular-corner-lot',
        'Irregular Corner Lot',
        'Five-edge irregular lot intended to stress buildable polygon interpretation and geometry review.',
      );
      setProgram(source, {
        foyer: 1,
        living: 1,
        dining: 1,
        kitchen: 1,
        master_bed: 1,
        master_bath: 1,
        guest_bed: 1,
        shared_bath: 1,
        laundry: 1,
        garage: 1,
        office: 1,
      });
      setLotSegments(source, [
        { point: 'P1', bearing: 'N 72 00 E', distance: 11, setback: 3, isRrow: true },
        { point: 'P2', bearing: 'N 18 00 W', distance: 8, setback: 2 },
        { point: 'P3', bearing: 'N 62 00 W', distance: 7.5, setback: 2.2 },
        { point: 'P4', bearing: 'S 40 00 W', distance: 11, setback: 2.4 },
        { point: 'P5', bearing: 'S 8 00 E', distance: 17, setback: 2 },
      ]);
    },
  },
  {
    id: 'impossible-overcapacity-brief',
    name: 'Impossible Overcapacity Brief',
    purpose: 'Program area should exceed realistic available space so the test pack includes a known failure case.',
    mutate: (source) => {
      setMeta(
        source,
        'impossible-overcapacity-brief',
        'Impossible Overcapacity Brief',
        'Deliberately overloaded brief where room demand should exceed the lot capacity and force visible failure handling.',
      );
      setProgram(source, {
        foyer: 1,
        living: 1,
        family_room: 1,
        dining: 1,
        kitchen: 1,
        dirty_kitchen: 1,
        pantry: 1,
        breakfast_nook: 1,
        master_bed: 1,
        master_closet: 1,
        master_bath: 1,
        kids_bed: 2,
        guest_bed: 1,
        shared_bath: 2,
        laundry: 1,
        utility: 1,
        storage: 1,
        mudroom: 1,
        garage: 1,
        office: 1,
        study: 1,
        playroom: 1,
        media_room: 1,
        gym: 1,
      });
      setLotSegments(source, [
        { point: 'P1', bearing: 'N 89 59 E', distance: 9, setback: 3, isRrow: true },
        { point: 'P2', bearing: 'N 0 00 W', distance: 16, setback: 2.2 },
        { point: 'P3', bearing: 'S 89 59 W', distance: 9, setback: 2.2 },
        { point: 'P4', bearing: 'S 0 00 E', distance: 16, setback: 2.2 },
      ]);
    },
  },
  {
    id: 'super-hard',
    name: 'Super Hard',
    purpose:
      'Aggressively constrained irregular lot plus overloaded mixed program to stress geometry, circulation, and failure handling all at once.',
    mutate: (source) => {
      setMeta(
        source,
        'super-hard',
        'Super Hard',
        'Deliberately brutal scenario combining an irregular narrow-front lot, skewed geometry, and a dense overcapacity brief that should strongly pressure every stage of the pipeline.',
      );
      setProgram(source, {
        foyer: 1,
        living: 1,
        family_room: 1,
        dining: 1,
        kitchen: 1,
        dirty_kitchen: 1,
        pantry: 1,
        breakfast_nook: 1,
        master_bed: 1,
        master_closet: 1,
        master_bath: 1,
        kids_bed: 2,
        guest_bed: 1,
        office: 1,
        study: 1,
        playroom: 1,
        media_room: 1,
        gym: 1,
        utility: 1,
        storage: 1,
        laundry: 1,
        mudroom: 1,
        shared_bath: 2,
        powder_room: 1,
        garage: 1,
      });
      setLotSegments(source, [
        { point: 'P1', bearing: 'N 68 00 E', distance: 8.6, setback: 3.2, isRrow: true },
        { point: 'P2', bearing: 'N 15 00 W', distance: 7.2, setback: 2.1 },
        { point: 'P3', bearing: 'N 58 00 W', distance: 4.8, setback: 2.3 },
        { point: 'P4', bearing: 'N 8 00 W', distance: 8.4, setback: 2.4 },
        { point: 'P5', bearing: 'S 78 00 W', distance: 8.1, setback: 2.2 },
        { point: 'P6', bearing: 'S 6 00 E', distance: 19.8, setback: 2.1 },
      ]);
    },
  },
] as const;
