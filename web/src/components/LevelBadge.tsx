import type { Level } from '../types/dict'

export function LevelBadge({ level }: { level: Level }) {
  return <span className="level-badge">{level}</span>
}
