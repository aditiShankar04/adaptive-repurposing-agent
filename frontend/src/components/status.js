export const STATUS_LABELS = {
  supported: 'supported',
  uncertain: 'uncertain',
  contradicted: 'contradicted',
  unexplored: 'unexplored',
}

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status
}
