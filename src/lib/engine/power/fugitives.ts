/**
 * Fugitive emissions at power plants:
 *
 *   - SF6 from gas-insulated switchgear (GIS), circuit breakers, GILs.
 *     Mass-balance preferred (EPA Subpart DD / EU ETS Annex IV):
 *       leaked = (purchased + inventory_start) - (sold + inventory_end + recovered)
 *                + (gas_in_new - gas_in_retired)
 *     Default leak rate fallback: nameplate × manufacturer-class leak rate.
 *
 *   - HFC refrigerants (mass-balance or equipment-based).
 *
 *   - Other CH4 from coal storage, coal handling, on-site NG pipework.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import {
  FUGITIVE_CH4_DEFAULTS,
  HFC_GWP_AR6,
  SF6_LEAK_RATES,
} from './constants'
import { ch4ToCO2e, sf6ToCO2e, type PowerGwp } from './gwp'
import { emptyGas } from './helpers'
import type {
  GasAmounts,
  HfcEntry,
  OtherFugitiveCh4Entry,
  Sf6Entry,
} from './types'

/* ----------------------- SF6 ---------------------------------------------- */

export function calculateSF6(
  ctx: EngineContext,
  entries: Sf6Entry[],
  gwp: PowerGwp,
): GasAmounts {
  const total = emptyGas()

  for (const e of entries) {
    let leakedKg = 0

    if (e.method === 'MASS_BALANCE') {
      const start = orDefault(e.inventoryStartKg, 0)
      const end = orDefault(e.inventoryEndKg, 0)
      const purchased = orDefault(e.purchasedKg, 0)
      const sold = orDefault(e.soldKg, 0)
      const recovered = orDefault(e.recoveredKg, 0)
      const inNew = orDefault(e.inNewEquipmentKg, 0)
      const inRetired = orDefault(e.inRetiredEquipmentKg, 0)
      const negs = { start, end, purchased, sold, recovered, inNew, inRetired }
      for (const [k, v] of Object.entries(negs)) {
        if (v < 0) {
          ctx.error('negative_input_value', `SF6 "${e.label}" ${k} cannot be negative.`)
          continue
        }
      }
      // EPA Subpart DD Eq DD-1 (simplified):
      // leaked = (purchases + I_start + in_new) - (I_end + sales + recovered + in_retired)
      leakedKg = purchased + start + inNew - (end + sold + recovered + inRetired)
      if (leakedKg < 0) {
        ctx.warn(
          'sf6_mass_balance_negative',
          `SF6 "${e.label}" mass balance produced a negative leak (${leakedKg.toFixed(3)} kg). Likely accounting error — set to 0 for the period.`,
        )
        leakedKg = 0
      }
    } else {
      // DEFAULT_LEAK_RATE
      if (isMissing(e.nameplateInventoryKg)) {
        ctx.error('missing_sf6_nameplate', `SF6 "${e.label}" needs nameplateInventoryKg.`)
        continue
      }
      if ((e.nameplateInventoryKg as number) < 0) {
        ctx.error('negative_input_value', `SF6 "${e.label}" nameplateInventoryKg cannot be negative.`)
        continue
      }
      const leakRate = isPresent(e.leakRateOverride)
        ? (e.leakRateOverride as number)
        : SF6_LEAK_RATES[e.equipmentClass]
      if (leakRate == null) {
        ctx.error('unknown_sf6_class', `SF6 "${e.label}" unknown equipment class "${e.equipmentClass}".`)
        continue
      }
      if (isMissing(e.leakRateOverride)) {
        ctx.defaultsUsed.add('sf6_default_leak_rate_used')
        ctx.warn(
          'sf6_default_leak_rate_used',
          `SF6 "${e.label}" used default leak rate ${(leakRate * 100).toFixed(2)}%/yr (${e.equipmentClass}). Mass-balance preferred.`,
        )
      }
      leakedKg = (e.nameplateInventoryKg as number) * leakRate
    }

    const sf6T = leakedKg / 1000
    const co2e = sf6ToCO2e(sf6T, gwp)
    total.sf6Tonnes += sf6T
    total.co2eTonnes += co2e

    ctx.resolver.record({
      factorCode: `SF6_GWP_${e.label}`,
      factorName: `SF6 GWP (${gwp})`,
      value: gwp === 'AR5_100' ? 22800 : 25200,
      unit: 'kgCO2e/kg',
      source: 'IPCC AR5/AR6 100-yr GWP',
      sourceVersion: gwp,
      factorYear: null,
      priorityRank: 5,
      isDefault: true,
      overridden: false,
    })

    ctx.addTrace({
      step: `SF6 - ${e.label}`,
      category: 'FUGITIVE_SF6',
      method: e.method,
      formula:
        e.method === 'MASS_BALANCE'
          ? '(purchases + I_start + in_new) − (I_end + sales + recovered + in_retired)'
          : 'nameplate × leak rate',
      inputs: { equipmentClass: e.equipmentClass, leakedKg: round(leakedKg, 3) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2e, 4),
    })
  }

  return total
}

/* ----------------------- HFC refrigerants ---------------------------------- */

export function calculateHFC(
  ctx: EngineContext,
  entries: HfcEntry[],
): GasAmounts {
  const total = emptyGas()
  for (const e of entries) {
    const gwp = isPresent(e.gwpOverride) ? (e.gwpOverride as number) : HFC_GWP_AR6[e.gasCode]
    if (gwp == null) {
      ctx.error('unknown_hfc_gas', `HFC "${e.label}" unknown gas code "${e.gasCode}".`)
      continue
    }

    let leakedKg = 0
    if (e.method === 'MASS_BALANCE') {
      const start = orDefault(e.inventoryStartKg, 0)
      const end = orDefault(e.inventoryEndKg, 0)
      const purchased = orDefault(e.purchasedKg, 0)
      const sold = orDefault(e.soldKg, 0)
      const recovered = orDefault(e.recoveredKg, 0)
      leakedKg = purchased + start - end - sold - recovered
      if (leakedKg < 0) {
        ctx.warn(
          'hfc_mass_balance_negative',
          `HFC "${e.label}" mass balance produced a negative leak (${leakedKg.toFixed(3)} kg). Set to 0.`,
        )
        leakedKg = 0
      }
    } else {
      // EQUIPMENT_BASED
      if (isMissing(e.chargeKg) || isMissing(e.annualLeakRate)) {
        ctx.error(
          'missing_hfc_equipment_inputs',
          `HFC "${e.label}" equipment method needs charge + leak rate.`,
        )
        continue
      }
      leakedKg = (e.chargeKg as number) * (e.annualLeakRate as number)
    }

    const co2e = (leakedKg * gwp) / 1000
    total.hfcCO2eTonnes += co2e
    total.co2eTonnes += co2e

    ctx.addTrace({
      step: `HFC - ${e.label}`,
      category: 'FUGITIVE_HFC',
      method: e.method,
      formula: 'leaked_kg × GWP / 1000',
      inputs: { gasCode: e.gasCode, gwp, leakedKg: round(leakedKg, 3) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2e, 4),
    })
  }
  return total
}

/* ----------------------- Other CH4 fugitives ------------------------------ */

const FUGITIVE_CH4_DEFAULTS_BY_SOURCE: Record<string, number> = {
  COAL_STORAGE:        FUGITIVE_CH4_DEFAULTS.COAL_STORAGE_PILE_KG_PER_T,
  COAL_HANDLING:       FUGITIVE_CH4_DEFAULTS.COAL_HANDLING_KG_PER_T,
  NATURAL_GAS_PIPEWORK: FUGITIVE_CH4_DEFAULTS.NATURAL_GAS_FUGITIVE_KG_PER_GJ,
  OTHER:               0,
}

export function calculateOtherCH4(
  ctx: EngineContext,
  entries: OtherFugitiveCh4Entry[],
  gwp: PowerGwp,
): GasAmounts {
  const total = emptyGas()
  for (const e of entries) {
    if (isMissing(e.activityQuantity)) {
      ctx.error('missing_ch4_activity', `Other CH4 "${e.label}" needs activityQuantity.`)
      continue
    }
    if ((e.activityQuantity as number) < 0) {
      ctx.error('negative_input_value', `Other CH4 "${e.label}" activityQuantity cannot be negative.`)
      continue
    }
    const ef = isPresent(e.efKgCh4PerUnit)
      ? (e.efKgCh4PerUnit as number)
      : FUGITIVE_CH4_DEFAULTS_BY_SOURCE[e.source]
    if (isMissing(e.efKgCh4PerUnit)) {
      ctx.defaultsUsed.add('fugitive_default_ef_used')
      ctx.warn(
        'fugitive_default_ef_used',
        `Other CH4 "${e.label}" used default CH4 EF ${ef} kg/t for source ${e.source}.`,
      )
    }
    if (ef < 0) {
      ctx.error('negative_input_value', `Other CH4 "${e.label}" EF cannot be negative.`)
      continue
    }
    const ch4Kg = (e.activityQuantity as number) * ef
    const ch4T = ch4Kg / 1000
    const co2e = ch4ToCO2e(ch4T, gwp, false)
    total.ch4Tonnes += ch4T
    total.co2eTonnes += co2e

    ctx.addTrace({
      step: `Other CH4 - ${e.label}`,
      category: 'FUGITIVE_OTHER_CH4',
      method: 'EF_PROXY',
      formula: 'activity × EF (kg CH4 / unit)',
      inputs: { source: e.source, activity: e.activityQuantity, ef, ch4Kg: round(ch4Kg, 2) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2e, 4),
    })
  }
  return total
}
