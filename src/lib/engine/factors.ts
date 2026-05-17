/**
 * Factor resolution.
 *
 * Resolution order honours the spec priority list: a user override (rank 6,
 * "user estimate", but explicitly chosen so it wins) takes precedence over the
 * seed library default. Every resolved factor is recorded as an immutable
 * snapshot so the calculation can be re-audited even if the library changes
 * later (spec: FACTOR_SNAPSHOT_ON_CALCULATION).
 */

import { CONSTANT_FACTORS } from './constants'
import type { FactorOverride, FactorSnapshot } from './types'

export class FactorResolver {
  private overrides: Record<string, FactorOverride>
  private snapshots: Map<string, FactorSnapshot> = new Map()

  constructor(overrides: Record<string, FactorOverride> = {}) {
    this.overrides = overrides
  }

  /** Resolve a named constant factor, recording a snapshot. */
  constant(code: string): number {
    const base = CONSTANT_FACTORS[code]
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
