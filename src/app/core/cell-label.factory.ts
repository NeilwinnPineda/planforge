const CELL_TYPE_LABELS: Record<string, string> = {
  filler: 'Filler',
  hallway: 'Hallway',
};

export function resolveCellLabel(typeId: string): string {
  return CELL_TYPE_LABELS[typeId] ?? typeId;
}
