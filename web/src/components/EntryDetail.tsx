import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { ReadingAudio } from './ReadingAudio'
import type { EnrichedEntry } from '../types/dict'
import { LevelBadge } from './LevelBadge'

// An entry's licence is always CC-BY-4.0 or CC-BY-SA-4.0 (see src/data/licence.ts).
// A clip's can also be CC0 — some Lingua Libre imports report that instead of
// the category's CC-BY-SA-4.0 default (data/sources.yaml's lingualibre-cc0,
// data/phonology/REVIEW.md § 16) — link each to its LICENSE-DATA-* file at
// the repo root.
const LICENCE_URLS: Record<string, string> = {
  'CC-BY-4.0': 'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC-BY-4.0',
  'CC-BY-SA-4.0': 'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC-BY-SA-4.0',
  CC0: 'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC0',
}

interface ClipCredit {
  licence: string
  attributions: string[]
}

/**
 * Every distinct (licence, attributions) pair across the entry's audio clips.
 * A clip's licence is derived from its own sources and can differ from the
 * entry's — a CC-BY-SA-4.0 Lingua Libre import sits on an otherwise CC-BY-4.0
 * entry (data/phonology/REVIEW.md § 16) — so it owes its own notice rather
 * than being covered by the entry-level one. Deduped because a reading's word
 * clip and its syllable clips usually share a source.
 */
function clipCredits(entry: EnrichedEntry): ClipCredit[] {
  const seen = new Map<string, ClipCredit>()
  for (const reading of entry.readings) {
    for (const clip of [reading.wordAudio, ...reading.audio]) {
      if (!clip) continue
      const key = [clip.licence, ...clip.attributions].join(' ')
      if (!seen.has(key)) seen.set(key, { licence: clip.licence, attributions: clip.attributions })
    }
  }
  return [...seen.values()]
}

function LicenceLink({ licence }: { licence: string }) {
  const url = LICENCE_URLS[licence]
  if (!url) return <>{licence}</>
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {licence}
    </a>
  )
}

/**
 * Mirrors src/cli/lookup.ts's display conventions: sandhi shown only when it
 * differs from the citation form, each ipa_caveat prefixed with ⚠, a
 * "flagged for review" indicator when needs_review is set, and each reading's
 * audio clips as play buttons (see ReadingAudio). One player is shared across
 * the whole entry, so starting a clip stops the previous one.
 */
export function EntryDetail({ entry, showLicence }: { entry: EnrichedEntry; showLicence: boolean }) {
  const { playingUrl, play } = useAudioPlayer()
  const credits = clipCredits(entry)

  return (
    <article className="entry-detail">
      <header className="entry-detail__header">
        <div className="entry-detail__title-row">
          <h2>{entry.headword}</h2>
          {entry.level && <LevelBadge level={entry.level} />}
        </div>
        {entry.variants && entry.variants.length > 0 && (
          <p className="entry-detail__variants">also written {entry.variants.join(', ')}</p>
        )}
        {entry.needs_review && <p className="entry-detail__flag">⚠ flagged for review</p>}
      </header>

      <section className="entry-detail__readings">
        {entry.readings.map((r, i) => {
          const tags = [r.variety, r.register].filter(Boolean).join(', ')
          return (
            <div className="reading" key={`${r.pengim}-${i}`}>
              <div className="reading__line">
                <span className="reading__pengim">{r.pengim}</span>
                <span className="reading__ipa">{r.ipa}</span>
                <span className="reading__poj">{r.poj}</span>
                {tags && <span className="reading__tags">[{tags}]</span>}
              </div>
              {r.sandhi !== r.pengim && <div className="reading__sandhi">sandhi: {r.sandhi}</div>}
              {r.ipa_caveats.map((caveat, j) => (
                <div className="reading__caveat" key={j}>
                  ⚠ {caveat}
                </div>
              ))}
              <ReadingAudio reading={r} playingUrl={playingUrl} onPlay={play} />
            </div>
          )
        })}
      </section>

      <section className="entry-detail__senses">
        {entry.senses.map((s, i) => (
          <div className="sense" key={i}>
            <div className="sense__line">
              <span className="sense__pos">{s.pos}</span>
              <span className="sense__gloss">{s.gloss_en.join(', ')}</span>
            </div>
            {s.gloss_zh && <div className="sense__gloss-zh">{s.gloss_zh.join(', ')}</div>}
            {s.examples?.map((ex, j) => (
              <div className="example" key={j}>
                <div className="example__hanzi">
                  {ex.hanzi} <span className="example__pengim">{ex.pengim}</span>
                </div>
                <div className="example__en">{ex.en}</div>
              </div>
            ))}
          </div>
        ))}
      </section>

      {showLicence && (
        <section className="entry-detail__licence">
          <p className="entry-detail__licence-id">
            Licence: <LicenceLink licence={entry.licence} />
          </p>
          {entry.attributions.length > 0 && (
            <ul className="entry-detail__attributions">
              {entry.attributions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          {credits.map((credit, i) => (
            <div className="entry-detail__clip-licence" key={i}>
              <p className="entry-detail__licence-id">
                Audio clips: <LicenceLink licence={credit.licence} />
              </p>
              {credit.attributions.length > 0 && (
                <ul className="entry-detail__attributions">
                  {credit.attributions.map((a, j) => (
                    <li key={j}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </article>
  )
}
