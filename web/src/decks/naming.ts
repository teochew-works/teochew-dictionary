/**
 * First of `desired`, `${desired} 2`, `${desired} 3`, ... not already present
 * in `existingNames` — used when installing a starter deck (issue #199) so a
 * name collision with an existing deck gets a numbered suffix instead of a
 * silent duplicate or a blocked install.
 */
export function uniqueDeckName(existingNames: readonly string[], desired: string): string {
  if (!existingNames.includes(desired)) return desired
  let n = 2
  while (existingNames.includes(`${desired} ${n}`)) n++
  return `${desired} ${n}`
}
