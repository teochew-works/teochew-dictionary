/** Prefixed so a deck id and a group id can never collide even if both wrapped the same UUID. */
export function generateDeckId(): string {
  return `deck-${crypto.randomUUID()}`
}

export function generateGroupId(): string {
  return `group-${crypto.randomUUID()}`
}
