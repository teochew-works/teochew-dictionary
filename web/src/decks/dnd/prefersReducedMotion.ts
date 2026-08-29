/**
 * Every other reduced-motion check in this codebase is CSS-only
 * (`@media (prefers-reduced-motion: no-preference)`), which is enough to
 * suppress a transition. The drag-ghost/FLIP work (issue #189) is the first
 * place that needs to skip actual *work* — an rAF loop, extra pointer
 * listeners — not just a CSS transition, so it needs a JS-side check.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
