/**
 * Factor resolution.
 *
 * Resolution order honours the spec priority list: a user override (rank 6,
 * "user estimate", but explicitly chosen so it wins) takes precedence over the
 * seed library default. Every resolved factor is recorded as an immutable
 * snapshot so the calculation can be re-audited even if the library changes
 * later (spec: FACTOR_SNAPSHOT_ON_CALCULATION).
 */

import { CONSTANT_FACTORS, type FactorDefault } from './constants'
import type { FactorOverride, FactorSnapshot } from './types'

export class FactorResolver {
  private overrides: Record<string, FactorOverride>
  private constants: Record<string, FactorDefault>
  private snapshots: Map<string, FactorSnapshot> = new Map()

  /**
   * @param overrides  user factor overrides keyed by factorCode
   * @param constants  the sector's constant-factor registry. Defaults to the
   *   cement CONSTANT_FACTORS so existing cement callers are unaffected; the
   *   Oil & Gas pack passes its own registry.
   */
  constructor(
    overrides: Record<string, FactorOverride> = {},
    constants: Record<string, FactorDefault> = CONSTANT_FACTORS,
  ) {
    this.overrides = overrides
    this.constants = constants
  }

  /** Resolve a named constant factor, recording a snapshot. */
  constant(code: string): number {
    const base = this.constants[code]
    if (!base) {
      throw new Error(`Unknown constant factor: ${code}`)
    }
    const override = this.overrides[code]
    if (override) {
      this.record({
        factorCode: base.factorCode,
        factorName: base.factorName,
        value: override.value,
        unit: base.unit,
        source: override.source ?? 'User override',
        sourceVersion: 'user',
        factorYear: null,
        priorityRank: 6,
        isDefault: false,
        overridden: true,
        overrideReason: override.reason,
      })
      return override.value
    }
    this.record({
      factorCode: base.factorCode,
      factorName: base.factorName,
      value: base.value,
      unit: base.unit,
      source: base.source,
      sourceVersion: base.sourceVersion,
      factorYear: base.factorYear,
      priorityRank: base.priorityRank,
      isDefault: base.isDefault,
      overridden: false,
    })
    return base.value
  }

  /**
   * Resolve a factor the user may supply directly for a calculation. If a value
   * is supplied, record IT as a site/override snapshot and return it; otherwise
   * resolve (and record) the library default via `constant()`.
   *
   * This avoids the eager-evaluation audit bug `orDefault(x, constant(code))`,
   * where `constant(code)` always runs and records the DEFAULT into the factor
   * snapshots even when the supplied value `x` was the one actually used.
   */
  resolveOrSupplied(code: string, supplied: number | null | undefined): number {
    if (supplied !== null && supplied !== undefined) {
      const base = this.constants[code]
      this.record({
        factorCode: code,
        factorName: base?.factorName ?? code,
        value: supplied,
        unit: base?.unit ?? '',
        source: 'Site / supplier-supplied',
        sourceVersion: 'site',
        factorYear: null,
        priorityRank: 2,
        isDefault: false,
        overridden: true,
      })
      return supplied
    }
    return this.constant(code)
  }

  /** True if a constant has a user override. */
  isOverridden(code: string): boolean {
    return Boolean(this.overrides[code])
  }

  /**
   * Record an ad-hoc factor snapshot (e.g. a fuel EF that came from the fuel
   * entry / fuel library rather than CONSTANT_FACTORS).
   */
  record(snapshot: FactorSnapshot): void {
    this.snapshots.set(`${snapshot.factorCode}|${snapshot.value}|${snapshot.unit}`, snapshot)
  }

  list(): FactorSnapshot[] {
    return Array.from(this.snapshots.values())
  }
}
