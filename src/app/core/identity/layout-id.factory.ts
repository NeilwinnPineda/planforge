let layoutSequence = 0;

export function createLayoutId(): string {
  layoutSequence = (layoutSequence + 1) % 1_000_000;
  const timePart = Date.now().toString(36).toUpperCase();
  const sequencePart = layoutSequence.toString(36).toUpperCase().padStart(4, '0');
  const randomPart = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0');

  return `L${timePart}${sequencePart}${randomPart}`;
}
