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
 * Only 244 cards exist at most, so loading the whole store and working with
 * it in memory is simpler than adding a `dueAt` index — see the plan for
 * issue #55.
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
