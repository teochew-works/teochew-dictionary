import type { Level } from '@teochew/core'

export function LevelBadge({ level }: { level: Level }) {
  return <span className="level-badge">{level}</span>
}
