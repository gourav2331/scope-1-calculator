/**
 * Fugitive emissions — refrigerant leakage and SF6 from switchgear. These are
 * genuine Scope 1 direct emissions of high-GWP gases (HFCs, SF6), reported as
 * CO2e via the selected IPCC GWP set. Gas mass leaked x GWP / 1000 = tCO2e.
 */

import { GAS_DEFAULTS } from './constants'
import type { EngineContext } from './context'
import type { FugitiveEntry } from './types'
import { isMissing, isPresent, round } from './util'

/** Label-text fragments that strongly imply each gas code. */
const LABEL_HINTS: Record<string, string[]> = {
  r22: ['r22', 'r-22', 'hcfc-22', 'hcfc22'],
  r32: ['r32', 'r-32', 'hfc-32', 'hfc32'],
  r134a: ['r134a', 'r-134a', 'hfc-134a', 'hfc134a'],
  r404a: ['r404a', 'r-404a'],
  r407c: ['r407c', 'r-407c'],
  r410a: ['r410a', 'r-410a'],
  r507a: ['r507a', 'r-507a'],
  r23: ['r23', 'r-23', 'hfc-23', 'hfc23'],
  sf6: ['sf6', 'sf-6', 'sulphur hexafluoride', 'sulfur hexafluoride'],
}

function detectLabelGasMismatch(label: string, selectedGasCode: string): string | null {
  if (!label) return null
  const norm = label.toLowerCase()
  for (const [code, hints] of Object.entries(LABEL_HINTS)) {
    if (code === selectedGasCode) continue
    for (const h of hints) {
      if (norm.includes(h)) return code
    }
  }
  return null
}

export function calculateFugitive(ctx: EngineContext, entries: FugitiveEntry[]): number {
  let totalCO2e = 0

  for (const entry of entries) {
    const mismatch = detectLabelGasMismatch(entry.label, entry.gasCode)
    if (mismatch) {
      ctx.warn(
        'gas_label_mismatch',
        `Fugitive label "${entry.label}" mentions ${mismatch.toUpperCase()} but the selected gas is "${entry.gasCode}". This can cause a major GWP error - please confirm.`,
        `fugitive.${entry.id}.gasCode`,
      )
    }
    if (isMissing(entry.leakedKg)) {
      ctx.error(
        'missing_fuel_quantity',
        `Fugitive entry "${entry.label}" has no leaked quantity.`,
        `fugitive.${entry.id}.leakedKg`,
      )
      continue
    }
    if ((entry.leakedKg as number) < 0) {
      ctx.error(
        'negative_input_value',
        `Fugitive entry "${entry.label}" leaked quantity cannot be negative (${entry.leakedKg}).`,
        `fugitive.${entry.id}.leakedKg`,
      )
      continue
    }
    if (isPresent(entry.gwpOverride) && (entry.gwpOverride as number) <= 0) {
      ctx.error(
        'gwp_override_invalid',
        `Fugitive entry "${entry.label}" GWP override must be > 0 (got ${entry.gwpOverride}).`,
        `fugitive.${entry.id}.gwpOverride`,
      )
      continue
    }

    const gas = GAS_DEFAULTS[entry.gasCode]
    const overridden = isPresent(entry.gwpOverride)
    let gwp: number
    if (overridden) {
      gwp = entry.gwpOverride as number
    } else if (gas) {
      gwp = ctx.gwpSet === 'AR6' ? gas.gwpAR6 : gas.gwpAR5
    } else {
      ctx.error(
        'missing_fuel_emission_factor',
        `Fugitive entry "${entry.label}" uses unknown gas "${entry.gasCode}" and no GWP override.`,
        `fugitive.${entry.id}.gasCode`,
      )
      continue
    }

    if (overridden && !((entry.overrideReason ?? '').trim())) {
      ctx.warn(
        'override_missing_reason',
        `Fugitive entry "${entry.label}" has a GWP override but no reason was recorded.`,
        `fugitive.${entry.id}.overrideReason`,
      )
    }

    const co2e = (entry.leakedKg * gwp) / 1000
    totalCO2e += co2e

    ctx.resolver.record({
      factorCode: `GWP_${entry.gasCode}`,
      factorName: `${gas?.name ?? entry.gasCode} GWP (${ctx.gwpSet})`,
      value: gwp,
      unit: 'kgCO2e/kg',
      source: overridden ? 'User override' : gas?.source ?? 'Gas library',
      sourceVersion: overridden ? 'user' : gas?.sourceVersion ?? ctx.gwpSet,
      factorYear: null,
      priorityRank: overridden ? 6 : 5,
      isDefault: !overridden,
      overridden,
      overrideReason: overridden ? entry.overrideReason : undefined,
    })
    const inputs: Record<string, number | string | null> = {
      leakedKg: entry.leakedKg,
      gwp,
      gwpSet: ctx.gwpSet,
      gas: entry.gasCode,
    }
    if (entry.evidenceReference) inputs.evidenceReference = entry.evidenceReference
    ctx.addTrace({
      step: `Fugitive - ${entry.label}`,
      category: 'FUGITIVE',
      method: 'GAS_MASS_X_GWP',
      formula: 'leakedKg x GWP / 1000',
      inputs,
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2e, 4),
    })
  }

  return totalCO2e
}
