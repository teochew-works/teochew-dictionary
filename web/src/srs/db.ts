import { openDB, type IDBPDatabase } from 'idb'
import type { CardState } from '@teochew/core'

const DB_NAME = 'teochew-flashcards'
const DB_VERSION = 1
const STORE = 'cards'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'entryId' })
    },
  })
  return dbPromise
}

/**
 * Loads the whole store and works with it in memory rather than adding a
 * `dueAt` index. The lexicon itself is 16,000+ entries and growing, but this
 * store only ever holds *reviewed* cards — bounded by how much a person has
 * actually studied, not by dictionary size — so it stays small regardless.
 * See the plan for issue #55.
 */
export async function getAllCards(): Promise<Map<string, CardState>> {
  const db = await getDb()
  const all = (await db.getAll(STORE)) as CardState[]
  return new Map(all.map((c) => [c.entryId, c]))
}

export async function putCard(card: CardState): Promise<void> {
  const db = await getDb()
  await db.put(STORE, card)
}

/** Bulk write for backup restore (backup/backup.ts) — one transaction rather than one round trip per card. */
export async function putAllCards(cards: CardState[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE, 'readwrite')
  await Promise.all([...cards.map((card) => tx.store.put(card)), tx.done])
}

/** Empties the store before a backup restore writes its own cards in — a restore replaces review history, it doesn't merge it. */
export async function clearAllCards(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE)
}
