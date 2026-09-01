import { LICENCE_URLS } from '../data/licenceUrls'
import './AboutView.css'

const SOURCES: { name: string; role: string; licence: keyof typeof LICENCE_URLS | null; url: string }[] = [
  {
    name: 'Hand-curated seed set',
    role: 'The original entries this project started from.',
    licence: 'CC-BY-4.0',
    url: 'https://github.com/teochew-works/teochew-dictionary',
  },
  {
    name: 'Wiktionary',
    role: "Teochew pronunciation sections — readings and glosses for the bulk of today's entries.",
    licence: 'CC-BY-SA-4.0',
    url: 'https://en.wiktionary.org/',
  },
  {
    name: 'CC-CEDICT',
    role: 'English glosses for headwords shared with Mandarin.',
    licence: 'CC-BY-SA-4.0',
    url: 'https://www.mdbg.net/chinese/dictionary?page=cedict',
  },
  {
    name: 'Unihan Database',
    role: 'Character-level reference data (e.g. radical, stroke count).',
    licence: 'Unicode-DFS-2016',
    url: 'https://www.unicode.org/charts/unihan.html',
  },
  {
    name: "Lingua Libre / Wikimedia Commons",
    role: 'Crowd-recorded pronunciation clips.',
    licence: null,
    url: 'https://commons.wikimedia.org/wiki/Category:Teochew_pronunciation',
  },
  {
    name: 'Original recordings',
    role: "This project's own recordings, made with each speaker's consent.",
    licence: 'CC-BY-4.0',
    url: 'https://github.com/teochew-works/teochew-dictionary/blob/main/AUDIO-CONSENT.md',
  },
]

export function AboutView() {
  return (
    <div className="about-view">
      <h2>About</h2>

      <section className="about-view__section">
        <p>
          This dictionary is a structured, openly-licensed lexicon of Teochew (潮州話). The data is
          hand-edited and reviewed — nothing here is machine-translated, and the tone assignments
          and phonology tables are still a work in progress.
        </p>
        <p>
          <strong>The dataset has not been checked by a native speaker.</strong> Where something is
          uncertain, it's marked as needing review rather than guessed at confidently.
        </p>
      </section>

      <section className="about-view__section">
        <h3>How entries are compiled</h3>
        <p>
          External sources never go straight into the dictionary. An importer proposes readings or
          glosses into a staging area; a person then reviews each proposal and merges it into an
          entry by hand, or rejects it. That review step exists because merging in a source can
          change what licence the entry is released under — that's a deliberate act, not something
          a script should decide unattended.
        </p>
        <p>
          Peng'im (the romanisation used throughout) is the only pronunciation hand-written for a
          word. IPA and other transcriptions are derived from it automatically using this project's
          own phonology tables, so a correction to how a sound is written applies consistently
          everywhere it occurs.
        </p>
      </section>

      <section className="about-view__section">
        <h3>Sources</h3>
        <ul className="about-view__sources">
          {SOURCES.map((s) => (
            <li key={s.name} className="about-view__source">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="about-view__source-name">
                {s.name}
              </a>
              <p className="about-view__source-role">{s.role}</p>
              {s.licence && (
                <p className="about-view__source-licence">
                  <a href={LICENCE_URLS[s.licence]} target="_blank" rel="noopener noreferrer">
                    {s.licence}
                  </a>
                </p>
              )}
              {!s.licence && (
                <p className="about-view__source-licence">
                  Licence varies by clip — see each clip's credit in the Dictionary tab.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="about-view__section">
        <h3>Licensing</h3>
        <p>
          The tooling and this web app are BSD-3-Clause. The dictionary data is licensed
          separately, under a Creative Commons licence — CC-BY-4.0 by default, or CC-BY-SA-4.0 for
          an entry that draws on a share-alike source such as Wiktionary. An entry's licence and
          required attributions are shown with it — see each result's detail in the Dictionary tab,
          or turn that off in Settings.
        </p>
        <p>
          Full licence texts and the reasoning behind splitting code and data this way are in the{' '}
          <a
            href="https://github.com/teochew-works/teochew-dictionary#licensing"
            target="_blank"
            rel="noopener noreferrer"
          >
            project README
          </a>
          . The full source and history are on{' '}
          <a href="https://github.com/teochew-works/teochew-dictionary" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          .
        </p>
      </section>
    </div>
  )
}
