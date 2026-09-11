import { symlinkSync } from 'node:fs'

import { checkCacheSymlink, findMainWorktreeCacheTarget, type CacheSymlinkStatus } from '../importers/wiktionary-cache.js'
import { CACHE_DIR } from '../paths.js'
import { dim, red } from './colour.js'

/**
 * The CLI-level half of the `.cache` policy (ADR-0013): `.cache` is meant to
 * be a symlink out to wherever the operator keeps it, shared across worktrees,
 * and a command that would write there refuses to run rather than let
 * `mkdirSync` silently create a real directory in its place. Shared by every
 * cache-writing CLI (`cache:wiktionary`, `audio:grade`, …) so they all refuse
 * with the same wording and all mirror a fresh worktree the same way.
 *
 * `checkCacheSymlink`/`findMainWorktreeCacheTarget` themselves stay in
 * ../importers/wiktionary-cache.js, where they are unit-tested against tmp
 * directories; this file only adds the exit-on-failure and console output a
 * CLI wants, which is why it lives under src/cli/.
 */

function describeCacheIssue(status: Extract<CacheSymlinkStatus, { valid: false }>): string {
  switch (status.reason) {
    case 'missing':
      return `${CACHE_DIR} does not exist`
    case 'not-a-symlink':
      return `${CACHE_DIR} exists but is not a symlink`
    case 'broken':
      return `${CACHE_DIR} is a symlink, but its target does not exist`
    case 'not-a-directory':
      return `${CACHE_DIR} is a symlink, but its target is not a directory`
  }
}

/**
 * Exits the process unless `.cache` is a valid symlink. `verb` names what is
 * being refused, e.g. `'sync'` → "refusing to sync: …".
 *
 * A brand-new worktree of this repo starts with no `.cache` of its own, even
 * though the main checkout usually already has one — mirror that instead of
 * making every worktree an operator has to link by hand. Only for the
 * `missing` case: a `.cache` that exists but is broken or the wrong kind of
 * thing is left for the refusal, not silently relinked.
 */
export function ensureCacheSymlinkOrExit(verb: string): void {
  let status = checkCacheSymlink()

  if (!status.valid && status.reason === 'missing') {
    const mainTarget = findMainWorktreeCacheTarget()
    if (mainTarget) {
      symlinkSync(mainTarget, CACHE_DIR)
      console.log(dim(`linked .cache → ${mainTarget} (matching the main checkout)`))
      status = checkCacheSymlink()
    }
  }

  if (!status.valid) {
    console.error(red(`refusing to ${verb}: ${describeCacheIssue(status)}`))
    console.error(`expected .cache to be a symlink to an external cache directory, e.g.:`)
    console.error(`  ln -s /path/to/your/cache ${CACHE_DIR}`)
    process.exit(1)
  }
}
