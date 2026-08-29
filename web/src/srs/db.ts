import { openDB, type IDBPDatabase } from 'idb'
import type { CardState } from './types'

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
