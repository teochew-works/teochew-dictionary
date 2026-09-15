import type { AxisFilters, AxisReferenceClip } from '@teochew/core'
import type { PengimScheme, Syllable } from '@teochew/core'

/**
 * Builds `computeAxisCandidates`'s per-axis filters for a known target
 * syllable (issue #280's follow-up) — training-data QC ("does this
 * recording actually sound like the syllable it's labelled?") or verifying
 * synthesised output against its intended target (#260). Restricts the
 * tone axis to references sharing the target tone's checkedness (入聲: tones
 * 4/8 require a stop coda, the other six forbid one — `PengimScheme`'s own
 * `tones[].checked`) and the rime axis to references sharing the target
 * rime's nasalisation and coda-type class, both derivable from spelling
 * alone once the target is known.
 *
 * Never use this for a blind query (a live mic search) — the target's own
 * checkedness/nasalisation is exactly what's unknown there, so gating by it
 * would be circular.
 */
export function targetAxisFilters(target: Syllable, scheme: PengimScheme): AxisFilters {
  const checkedTones = new Set(scheme.tones.filter((t) => t.checked).map((t) => t.number))
  const targetChecked = checkedTones.has(target.tone)
  const targetNasalised = target.nasalised
  const targetCoda = target.coda

  return {
    tone: (ref: AxisReferenceClip) => checkedTones.has(ref.tone) === targetChecked,
    rime: (ref: AxisReferenceClip) => ref.nasalised === targetNasalised && ref.coda === targetCoda,
  }
}
