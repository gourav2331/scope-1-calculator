import type { Quantity } from './types'

type MaybeQuantity = Quantity | undefined

/** null/undefined means "missing/unknown". This is the ONLY missing test the engine uses. */
export function isMissing(q: MaybeQuantity): q is null | undefined {
  return q === null || q === undefined || Number.isNaN(q as number)
}

/** A value is "present" if it is a real number, including a confirmed 0. */
export function isPresent(q: MaybeQuantity): q is number {
  return !isMissing(q)
}

/** Resolve a quantity with an explicit fallback only when missing (never coerces 0). */
export function orDefault(q: MaybeQuantity, fallback: number): number {
  return isPresent(q) ? q : fallback
}

/** Round for presentation without losing audit precision (default 6 dp). */
export function round(n: number, dp = 6): number {
  if (!Number.isFinite(n)) return 0
  const f = 10 ** dp
  return Math.round((n + Number.EPSILON) * f) / f
}
