import type { EnrichedEntry } from '../types/dict'

// Entry-level licence is only ever CC-BY-4.0 or CC-BY-SA-4.0 in practice (see
// src/data/licence.ts) — link each to its LICENSE-DATA-* file at the repo root.
const LICENCE_URLS: Record<string, string> = {
  'CC-BY-4.0': 'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC-BY-4.0',
  'CC-BY-SA-4.0': 'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC-BY-SA-4.0',
}

/**
 * Mirrors src/cli/lookup.ts's display conventions: sandhi shown only when it
 * differs from the citation form, each ipa_caveat prefixed with ⚠, and a
 * "flagged for review" indicator when needs_review is set. Per-syllable audio
 * (reading.audio) is present in the data but out of scope for the v1 UI.
 */
export function EntryDetail({ entry, showLicence }: { entry: EnrichedEntry; showLicence: boolean }) {
  return (
    <article className="entry-detail">
      <header className="entry-detail__header">
        <h2>{entry.headword}</h2>
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
            Licence:{' '}
            {LICENCE_URLS[entry.licence] ? (
              <a href={LICENCE_URLS[entry.licence]} target="_blank" rel="noreferrer">
                {entry.licence}
              </a>
            ) : (
              entry.licence
            )}
          </p>
          {entry.attributions.length > 0 && (
            <ul className="entry-detail__attributions">
              {entry.attributions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </article>
  )
}
