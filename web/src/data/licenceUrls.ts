// An entry's licence is always CC-BY-4.0 or CC-BY-SA-4.0 (see src/data/licence.ts).
// A clip's can also be CC0 — some Lingua Libre imports report that instead of
// the category's CC-BY-SA-4.0 default (data/sources.yaml's lingualibre-cc0,
// data/phonology/REVIEW.md § 16) — link each to its LICENSE-DATA-* file at
// the repo root.
export const LICENCE_URLS: Record<string, string> = {
  'CC-BY-4.0': 'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC-BY-4.0',
  'CC-BY-SA-4.0': 'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC-BY-SA-4.0',
  CC0: 'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC0',
  'Unicode-DFS-2016':
    'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-UNICODE-DFS-2016',
}
