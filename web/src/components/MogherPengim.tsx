/**
 * mogher.com is a single-Chinese-character dictionary, not a word/phrase
 * one — a multi-character headword has no entry page there (verified: both
 * traditional and simplified multi-character paths 404). Its per-syllable
 * page (`/dic/czpy/<syllable>`) is addressed by syllable, though, so it works
 * regardless of how many syllables a reading has — link each syllable token
 * in a Peng'im string individually rather than linking the headword.
 */
export function MogherPengim({ pengim }: { pengim: string }) {
  const tokens = pengim.split(/(\s+)/u)
  return (
    <>
      {tokens.map((token, i) =>
        /\s/u.test(token) || token === '' ? (
          token
        ) : (
          <a
            key={i}
            href={`https://mogher.com/dic/czpy/${encodeURIComponent(token)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {token}
          </a>
        ),
      )}
    </>
  )
}
