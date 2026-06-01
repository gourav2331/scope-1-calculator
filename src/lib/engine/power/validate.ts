/**
 * Power Sector structural validation — runs before calculation. Category
 * modules raise their own per-row numeric errors; this file enforces top-
 * level required fields, applicability-vs-data consistency, override
 * justification gate, biogenic-not-in-gross checks, CCS-permanence warning,
 * and disclosure-boundary requirements.
 */

import type { EngineContext } from '../context'
import { isPresent } from '../util'
import { POWER_FUEL_DEFAULTS } from './constants'
import type {
  FuelEntry,
  PowerInputPayload,
} from './types'

function nonNeg(ctx: EngineContext, value: number | null | undefined, label: string, field: string) {
  if (typeof value === 'number' && value < 0) {
    ctx.error('negative_input_value', `${label} cannot be negative (${value}).`, field)
  }
}

function checkOverride(
  ctx: EngineContext,
  category: string,
  id: string,
  rowLabel: string,
  factorValues: Array<number | null | undefined | boolean>,
  reason: string | undefined,
) {
  const overridden = factorValues.some((v) => typeof v === 'number' || v === true)
  if (overridden && (!reason || !reason.trim())) {
    ctx.error(
      'override_without_reason',
      `"${rowLabel}" overrides a factor (NCV / EF / NATCOM / CEMS / oxidation) without an Evidence note. Add a reason before submitting.`,
      `${category}.${id}.overrideReason`,
    )
  }
}

const ELECTRICITY_HINTS = ['grid power', 'purchased power', 'purchased electricity', 'imported power']
const RENEWABLE_HINTS = ['solar', 'wind', 'hydro pv', 'photovoltaic']

function checkFuel(ctx: EngineContext, e: FuelEntry, base: string) {
  nonNeg(ctx, e.quantity ?? null, `Stationary "${e.label}" quantity`, `${base}.${e.id}.quantity`)
  for (const k of ['ncvGjPerUnit', 'co2EfKgPerGj', 'ch4EfKgPerGj', 'n2oEfKgPerGj', 'oxidationFactor', 'cemsCo2Tonnes'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Stationary "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  const labelLower = e.label.toLowerCase()
  if (ELECTRICITY_HINTS.some((h) => labelLower.includes(h))) {
    ctx.error('electricity_as_combustion', `"${e.label}" looks like purchased electricity — that's Scope 2, not stationary combustion.`, `${base}.${e.id}.fuelCode`)
  }
  if (RENEWABLE_HINTS.some((h) => labelLower.includes(h))) {
    ctx.warn(
      'renewable_in_combustion',
      `"${e.label}" looks like a renewable energy source — solar / wind / hydro have no Scope 1 combustion. Confirm this is a fossil-fuel auxiliary, not the renewable itself.`,
      `${base}.${e.id}.fuelCode`,
    )
  }
  if (!POWER_FUEL_DEFAULTS[e.fuelCode]) {
    ctx.warn(
      'unknown_fuel_code',
      `Stationary "${e.label}" uses fuel code "${e.fuelCode}" not in the library — provide NCV + CO2 EF overrides on this row.`,
      `${base}.${e.id}.fuelCode`,
    )
  }
  checkOverride(
    ctx, base, e.id, e.label,
    [e.ncvGjPerUnit, e.co2EfKgPerGj, e.ch4EfKgPerGj, e.n2oEfKgPerGj, e.oxidationFactor, e.cemsCo2Tonnes, e.biomassFraction, e.carbonContentFraction, e.useIndiaNatcom ?? false],
    e.overrideReason,
  )
}

export function validatePowerInput(ctx: EngineContext, payload: PowerInputPayload): void {
  // --- Required top-level ---
  if (!payload.organization?.name?.trim()) {
    ctx.error('missing_organization_name', 'Organisation name is required.', 'organization.name')
  }
  if (!payload.facility?.name?.trim()) {
    ctx.error('missing_facility_name', 'Plant name is required.', 'facility.name')
  }
  if (!payload.facility?.technology) {
    ctx.error('missing_plant_technology', 'Plant technology is required.', 'facility.technology')
  }

  const activity = payload.activityData
  const applicability = payload.sourceApplicability

  // --- Fuel rows ---
  if (applicability.stationaryMain !== false) {
    for (const e of activity.stationaryMain ?? []) checkFuel(ctx, e, 'stationaryMain')
  }
  if (applicability.stationaryAuxiliary !== false) {
    for (const e of activity.stationaryAuxiliary ?? []) checkFuel(ctx, e, 'stationaryAuxiliary')
  }
  if (applicability.biomassCofiring !== false) {
    for (const e of activity.biomassCofiring ?? []) checkFuel(ctx, e, 'biomassCofiring')
  }

  // --- Production sanity ---
  const grossMwh = activity.production.grossGenerationMwh ?? 0
  const netMwh = activity.production.netGenerationMwh ?? 0
  if (isPresent(grossMwh) && isPresent(netMwh) && (netMwh as number) > (grossMwh as number)) {
    ctx.error(
      'net_exceeds_gross_generation',
      `Net generation (${netMwh} MWh) cannot exceed gross (${grossMwh} MWh). Net = gross − auxiliary load.`,
      'activityData.production',
    )
  }
  if (isPresent(activity.production.auxiliaryPowerPercent)) {
    const apc = activity.production.auxiliaryPowerPercent as number
    if (apc < 0 || apc > 25) {
      ctx.error(
        'auxiliary_power_out_of_range',
        `Auxiliary power consumption ${apc}% is outside the physical range [0, 25].`,
        'activityData.production.auxiliaryPowerPercent',
      )
    }
  }

  // --- Implausible zero: nameplate > 0 but no activity at all ---
  const hasAnyActivity =
    (activity.stationaryMain?.length ?? 0) > 0 ||
    (activity.stationaryAuxiliary?.length ?? 0) > 0 ||
    (activity.biomassCofiring?.length ?? 0) > 0 ||
    (activity.mobile?.length ?? 0) > 0 ||
    (activity.fgd?.length ?? 0) > 0 ||
    (activity.scr?.length ?? 0) > 0 ||
    (activity.fugitiveSF6?.length ?? 0) > 0 ||
    (activity.fugitiveHFC?.length ?? 0) > 0 ||
    (activity.fugitiveOtherCH4?.length ?? 0) > 0 ||
    (activity.reported?.length ?? 0) > 0
  if (!hasAnyActivity && (grossMwh as number) > 1000) {
    ctx.error(
      'implausible_zero_scope1_for_generation',
      `Gross generation ${grossMwh} MWh reported but no Scope 1 activity entered across any category. Either add fuel / process / fugitive rows OR use the Reported / direct-entry card with a verified figure.`,
      'activityData',
    )
  }

  // --- Disclosure boundary basis required when reported is material ---
  const reportedTotal = (activity.reported ?? []).reduce(
    (s, r) => s + (typeof r.totalCO2eTonnes === 'number' ? r.totalCO2eTonnes : 0),
    0,
  )
  const disclosedGross = activity.disclosedGrossScope1CO2eTonnes ?? 0
  const material = reportedTotal > 0 && disclosedGross > 0 && reportedTotal / disclosedGross >= 0.1
  if ((material || (reportedTotal > 0 && disclosedGross === 0)) && !payload.disclosure?.boundaryBasis) {
    ctx.error(
      'missing_disclosure_boundary_basis',
      "Reported / direct entries are material (≥10% of disclosed gross). Pick a boundary basis (operational control / financial control / equity share / EU ETS installation / EPA GHGRP / India CEA / BRSR / corporate aggregate / other) so the verifier knows which boundary the disclosed totals describe.",
      'disclosure.boundaryBasis',
    )
  }
  if (payload.disclosure?.boundaryBasis === 'OTHER' && !payload.disclosure?.boundaryNote?.trim()) {
    ctx.error(
      'boundary_basis_other_requires_note',
      "Boundary basis is set to 'Other' — provide a short note explaining the boundary in `disclosure.boundaryNote`.",
      'disclosure.boundaryNote',
    )
  }

  // --- CCS permanence advisory ---
  if (applicability.ccus !== false && (activity.ccus ?? []).length > 0) {
    ctx.warn(
      'ccs_permanence_advisory_only',
      'CCS deductions applied to gross Scope 1 — permanence / reversal risk is not modelled. The disclosure should reference the MRV protocol (EU ETS Article 49, EPA Subpart RR, ISO 27914) per row.',
      'activityData.ccus',
    )
  }
}
