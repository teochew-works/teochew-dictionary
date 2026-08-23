/**
 * Types for locally-recorded clip proposals (issue #128,
 * `data/phonology/REVIEW.md` § 17) — distinct from `AudioClipProposal`
 * (./audio-types.js), which is shaped around a clip fetched from an outside
 * source (a Commons page title/URL, a reported licence). A clip recorded
 * straight from the Sounds tab's "record" control was never fetched from
 * anywhere: its bytes already live on disk, and its provenance is always the
 * `teochew-dictionary-audio` source, not something recovered from metadata.
 */

export interface LocalRecordingProposal {
  /** Recovered Peng'im syllable this clip is an isolated example of, e.g. `dio5`. */
  pengim: string
  /** Always 1: the Sounds tab's record control only ever captures a single syllable. */
  syllableCount: 1
  /** Path to the raw clip bytes, relative to the repo root — see data/staging/recordings/. */
  localPath: string
  /** Pseudonymous speaker id per AUDIO-CONSENT.md, entered by whoever ran the recording session. */
  speaker: string
  /** YYYY-MM-DD the clip was recorded. */
  recordedDate: string
  /**
   * Present and `true` only — the record flow refuses to stage a proposal
   * without this acknowledged, so there is no `false` state to represent.
   * See AUDIO-CONSENT.md: this is a guardrail against clicking past the
   * requirement unnoticed, not proof consent was actually obtained.
   */
  consentAcknowledged: true
  /** Phonology variety this clip is Chaozhou/etc audio for, e.g. `chaozhou`. */
  variety: string
  /** Free text a reviewer should see — e.g. background noise, an uncertain transcription. */
  notes?: string
}
