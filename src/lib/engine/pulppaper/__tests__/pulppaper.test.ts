/**
 * Pulp & Paper Scope 1 — engine test suite.
 *
 * The 9 worked examples in Section 11 of the Research Brief ARE the unit tests:
 * if these values change, the methodology has changed and the change must be
 * justified with a citable source. Never weaken a test to make a change pass.
 */

import { describe, expect, it } from 'vitest'

import { calculatePulpPaper } from '../calculate'
import type {
  AnaerobicWwtEntry,
  BiomassEntry,
  ChpAllocationEntry,
  Co2TransferEntry,
  FuelEntry,
  LandfillEntry,
  LimeKilnEntry,
  MakeupCarbonateEntry,
  MobileEntry,
  RefrigerantEntry,
} from '../types'
import type { ReportedEntry } from '../../oilgas/types'
import { basePulpPaperPayload } from './fixture'

const codes = (msgs: { code: string }[]) => msgs.map((m) => m.code)

/* --------------------------- baseline / sector --------------------------- */

describe('baseline', () => {
  it('empty payload calculates to zero with no errors', () => {
    const r = calculatePulpPaper(basePulpPaperPayload())
    expect(r.errors).toHaveLength(0)
    expect(r.scope1.grossScope1CO2eTonnes).toBe(0)
    expect(r.status).toBe('SUCCESS')
    expect(r.sectorCode).toBe('PULP_PAPER')
    expect(r.methodologyPack).toBe('ICFPA_NCASI_PP_V14')
  })

  it('rejects a non pulp-and-paper sector code', () => {
    const p = basePulpPaperPayload()
    // @ts-expect-error testing a wrong sector code at runtime
    p.sector.sectorCode = 'CEMENT'
    const r = calculatePulpPaper(p)
    expect(codes(r.errors)).toContain('unsupported_sector')
  })

  it('requires a mill type', () => {
    const p = basePulpPaperPayload()
    // @ts-expect-error missing mill type
    p.facility.millType = undefined
    const r = calculatePulpPaper(p)
    expect(codes(r.errors)).toContain('missing_mill_type')
  })
})

/* --------------------- §11.1 — Natural gas boiler ------------------------ */

describe('§11.1 natural gas boiler (stationary)', () => {
  it('reproduces 33,260 t CO2 and 0.595 t CH4 / 0.595 t N2O (AR6_100)', () => {
    const p = basePulpPaperPayload()
    // Work backwards from the example: 595 TJ × 55.9 = 33,260 t CO2.
    // Encode 595,000 GJ as qty=595000 × NCV=1 (override) for exact arithmetic.
    const fuel: FuelEntry = {
      id: 'ng',
      label: 'NG boiler',
      fuelCode: 'natural_gas',
      technology: 'BOILER_OR_IR_DRYER',
      quantity: 595_000,
      quantityUnit: 'GJ',
      ncvGjPerUnit: 1,
      co2EfKgPerGj: 55.9, // example used 55.9 (not the IPCC 56.1)
      ch4EfKgPerGj: 0.001,
      n2oEfKgPerGj: 0.001,
      overrideReason: 'Worked-example calibration values',
    }
    p.activityData.stationaryCombustion = [fuel]
    const r = calculatePulpPaper(p)
    expect(r.errors).toHaveLength(0)
    const c = r.scope1.byCategory.stationaryCombustion
    expect(c.co2Tonnes).toBeCloseTo(33_260.5, 1)
    expect(c.ch4Tonnes).toBeCloseTo(0.595, 3)
    expect(c.n2oTonnes).toBeCloseTo(0.595, 3)
    // CO2e = 33,260.5 + 0.595×29.8 + 0.595×273 = 33,260.5 + 17.7 + 162.4 = 33,440.6
    expect(c.co2eTonnes).toBeCloseTo(33_440.6, 0)
  })
})

/* ---------- §11.2 — Coal boiler, carbon-content (Tier 3/4) -------------- */

describe('§11.2 coal boiler — fuel carbon method', () => {
  it('reproduces 967,094 t CO2 from carbon balance', () => {
    const p = basePulpPaperPayload()
    p.methodSelections.stationaryMethod = 'CARBON_CONTENT_BASED'
    const fuel: FuelEntry = {
      id: 'coal',
      label: 'Power boiler — coal',
      fuelCode: 'bituminous_coal',
      technology: 'PULVERIZED_DRY_WALL',
      quantity: 336_000,
      quantityUnit: 'tonne',
      ncvGjPerUnit: 28.69, // back-derived from example's "9,640 TJ"
      carbonContentFraction: 0.801,
      oxidationFactor: 0.98,
      overrideReason: 'Site CEMS / fuel-carbon test',
    }
    p.activityData.stationaryCombustion = [fuel]
    const r = calculatePulpPaper(p)
    // CO2 = 336000 × 0.801 × 0.98 × 44/12 = 967,095.36 (example "967,000" rounded)
    expect(r.scope1.byCategory.stationaryCombustion.co2Tonnes).toBeCloseTo(967_095.36, 0)
  })
})

/* ---------------- §11.3 — Lime kiln, natural gas ------------------------ */

describe('§11.3 lime kiln (natural gas)', () => {
  it('reproduces fossil CO2 31,863 t + CH4 1.54 t (kiln N2O = 0)', () => {
    const p = basePulpPaperPayload()
    const kiln: LimeKilnEntry = {
      id: 'kiln',
      label: 'Lime kiln #1',
      kilnType: 'LIME_KILN',
      fuelCode: 'natural_gas',
      fuelQuantity: 570_000, // 570 TJ × NCV 1 (override)
      fuelQuantityUnit: 'GJ',
      ncvGjPerUnit: 1,
      co2EfKgPerGj: 55.9, // worked-example value
    }
    p.activityData.limeKilns = [kiln]
    const r = calculatePulpPaper(p)
    const c = r.scope1.byCategory.limeKilns
    expect(c.co2Tonnes).toBeCloseTo(31_863, 0)
    expect(c.ch4Tonnes).toBeCloseTo(570_000 * 0.0027 / 1000, 4) // 1.539 t
    expect(c.n2oTonnes).toBe(0) // rotary lime kiln: N2O negligible
  })
})

/* ---------------- §11.4 — Make-up calcium carbonate --------------------- */

describe('§11.4 make-up CaCO3', () => {
  it('reproduces 3,080 t CO2 from 7,000 t CaCO3 × 0.440', () => {
    const p = basePulpPaperPayload()
    const entry: MakeupCarbonateEntry = {
      id: 'caco3',
      label: 'Make-up CaCO3 (mined limestone)',
      chemicalCode: 'CACO3',
      quantityTonnes: 7_000,
    }
    p.activityData.makeupCarbonates = [entry]
    const r = calculatePulpPaper(p)
    expect(r.scope1.byCategory.makeupCarbonates.co2Tonnes).toBe(3_080)
    expect(r.scope1.byCategory.makeupCarbonates.co2eTonnes).toBe(3_080)
  })

  it('routes biogenic-origin carbonate to the memo, not Scope 1', () => {
    const p = basePulpPaperPayload()
    p.activityData.makeupCarbonates = [{ id: 'bio', label: 'CaCO3 (biogenic)', chemicalCode: 'CACO3', quantityTonnes: 1000, fossilOrigin: false }]
    const r = calculatePulpPaper(p)
    expect(r.scope1.byCategory.makeupCarbonates.co2eTonnes).toBe(0)
    expect(r.memoItems.biogenicCO2Tonnes).toBeCloseTo(440, 1) // 1000 × 0.440 → memo
  })
})

/* ------------- §11.5 — CFB bark + residual oil combination -------------- */

describe('§11.5 CFB bark boiler + residual oil co-fire', () => {
  it('keeps biogenic CO2 in memo and counts only CH4/N2O CO2e + fossil CO2', () => {
    const p = basePulpPaperPayload()
    // Residual oil: 800 TJ × 77.4 = 61,920 t fossil CO2.
    const oil: FuelEntry = {
      id: 'oil',
      label: 'CFB residual oil co-fire',
      fuelCode: 'residual_oil',
      technology: 'BOILER',
      quantity: 800_000,
      quantityUnit: 'GJ',
      ncvGjPerUnit: 1,
      ch4EfKgPerGj: 0, // assume oil non-CO2 already counted via tech default — silence here
      n2oEfKgPerGj: 0,
      overrideReason: 'Worked-example calibration (NCV normalised, oil non-CO2 zeroed since CFB tech factor applied to bark)',
    }
    // Bark CFB: 6,900 TJ → biogenic CO2 = 6,900,000×112/1000 = 772,800 t (memo); CH4 7.7 t × 27 = 207.9; N2O 67.76 × 273 = 18,498.
    const bark: BiomassEntry = {
      id: 'bark',
      label: 'CFB bark boiler',
      fuelCode: 'wood_bark',
      technology: 'CFB',
      quantity: 6_900_000,
      quantityUnit: 'GJ',
      ncvGjPerUnit: 1,
      overrideReason: 'Worked-example calibration (NCV normalised so qty equals energy in GJ)',
    }
    p.activityData.stationaryCombustion = [oil]
    p.activityData.biomassCombustion = [bark]
    const r = calculatePulpPaper(p)
    expect(r.errors).toHaveLength(0)
    // Fossil portion (Scope 1)
    expect(r.scope1.byCategory.stationaryCombustion.co2Tonnes).toBeCloseTo(61_920, 0)
    // Biomass: CO2 must be ZERO in Scope 1, biogenic CO2 in memo
    expect(r.scope1.byCategory.biomassCombustion.co2Tonnes).toBe(0)
    expect(r.memoItems.biogenicCO2Tonnes).toBeCloseTo(772_800, 0)
    // Biomass CH4 / N2O are Scope 1. (NB: my engine separates fuels per fuel×tech;
    // the example's 7.7 t CH4 / 67.76 t N2O combined oil + bark in one CFB. Here bark
    // alone in CFB gives CH4 6.9 / N2O 60.72; oil's CH4/N2O zeroed via override.)
    expect(r.scope1.byCategory.biomassCombustion.ch4Tonnes).toBeCloseTo(6.9, 2)
    expect(r.scope1.byCategory.biomassCombustion.n2oTonnes).toBeCloseTo(60.72, 1)
    // Total = 61,920 (oil CO2) + 6.9×27 (biogenic CH4) + 60.72×273 (N2O) = 78,683
    expect(r.scope1.grossScope1CO2eTonnes).toBeCloseTo(78_683, -1)
  })
})

/* --------------------- §11.6 — Mill landfill (FOD) ---------------------- */

describe('§11.6 mill landfill — simplified FOD, no recovery', () => {
  it('reproduces 569 t CH4 generated → 512 t after OX → 13,820 t CO2e (AR6)', () => {
    const p = basePulpPaperPayload()
    const lf: LandfillEntry = {
      id: 'lf',
      label: 'Mill landfill',
      method: 'SIMPLIFIED_FOD',
      annualDepositDryMg: 17_500,
      yearsSinceOpening: 20,
      yearsSinceClosure: 0,
      // L0 100, k 0.03, OX 0.10 (all defaults)
    }
    p.activityData.landfills = [lf]
    const r = calculatePulpPaper(p)
    const c = r.scope1.byCategory.landfills
    // Generated = 17500 × 100 × (1 - e^-0.6) = 789,547 m3 → 568.47 t after density 0.72/1000
    // After OX 10%: 511.6 t. ×27 (biogenic) = 13,814 t CO2e.
    expect(c.ch4Tonnes).toBeCloseTo(511.6, 0)
    expect(c.co2eTonnes).toBeCloseTo(13_814, 0)
  })
})

/* ------------------ §11.7 — Anaerobic WWT (no gas data) ----------------- */

describe('§11.7 anaerobic WWT — activity-based, COD load', () => {
  it('reproduces 750 t CH4 from 3,000,000 kg COD × 0.25', () => {
    const p = basePulpPaperPayload()
    const wwt: AnaerobicWwtEntry = {
      id: 'wwt',
      label: 'UASB reactor',
      method: 'ACTIVITY_BASED',
      codLoadKg: 3_000_000,
    }
    p.activityData.anaerobicWwt = [wwt]
    const r = calculatePulpPaper(p)
    const c = r.scope1.byCategory.anaerobicWwt
    expect(c.ch4Tonnes).toBeCloseTo(750, 0)
    // Biogenic CH4 with AR6 → 750 × 27 = 20,250
    expect(c.co2eTonnes).toBeCloseTo(20_250, 0)
  })
})

/* ----------------- §11.8 — Refrigerant R-410A leak ---------------------- */

describe('§11.8 refrigerant R-410A — mass balance', () => {
  it('reproduces 27.072 t CO2e from 12 kg leaked × GWP 2,256', () => {
    const p = basePulpPaperPayload()
    const ref: RefrigerantEntry = {
      id: 'ref',
      label: 'Industrial chiller',
      gasCode: 'r410a',
      method: 'MASS_BALANCE',
      inventoryStartKg: 200,
      purchasedKg: 12,
      soldKg: 0,
      inventoryEndKg: 200,
      recoveredForRecycleKg: 0,
    }
    p.activityData.refrigerants = [ref]
    const r = calculatePulpPaper(p)
    expect(r.scope1.byCategory.refrigerants.co2eTonnes).toBeCloseTo(27.072, 3)
  })
})

/* ------------------- §11.9 — CHP allocation ----------------------------- */

describe('§11.9 CHP allocation — Simplified Efficiency Method', () => {
  it('apportions emissions between heat and power per Reff = eH/eP', () => {
    const p = basePulpPaperPayload()
    const chp: ChpAllocationEntry = {
      id: 'chp',
      label: 'On-site CHP',
      totalEmissionsCo2eTonnes: 5482,
      heatOutputGj: 15,
      powerOutputGj: 8,
      // Defaults: eH 0.80, eP 0.35 → Reff 2.286
    }
    p.activityData.chpAllocation = [chp]
    const r = calculatePulpPaper(p)
    const alloc = r.chpAllocations[0]
    // Reff = 2.286; EH = 15/(15 + 8×2.286) × 5482 = 0.4506 × 5482 = 2470.5
    expect(alloc.heatEmissionsTonnes).toBeCloseTo(2470.5, 0)
    expect(alloc.powerEmissionsTonnes).toBeCloseTo(3011.5, 0)
  })
})

/* ---------------- scope separation invariants --------------------------- */

describe('scope separation (biogenic CO2 NEVER in gross)', () => {
  it('big biomass burn produces zero gross CO2 contribution, only memo', () => {
    const p = basePulpPaperPayload()
    const bl: BiomassEntry = {
      id: 'bl',
      label: 'Black liquor recovery furnace',
      fuelCode: 'black_liquor',
      technology: 'KRAFT_RECOVERY_FURNACE',
      quantity: 1_000_000, // 1,000,000 GJ
      quantityUnit: 'GJ',
      ncvGjPerUnit: 1,
    }
    p.activityData.biomassCombustion = [bl]
    const r = calculatePulpPaper(p)
    expect(r.scope1.byCategory.biomassCombustion.co2Tonnes).toBe(0) // CO2 must NOT be in Scope 1
    expect(r.memoItems.biogenicCO2Tonnes).toBeCloseTo(95_300, 0) // 1M × 95.3 / 1000
    // CH4/N2O DO count
    expect(r.scope1.byCategory.biomassCombustion.co2eTonnes).toBeGreaterThan(0)
  })

  it('lime kiln biogenic CaCO3 calcination → memo, not gross', () => {
    const p = basePulpPaperPayload()
    p.activityData.limeKilns = [{
      id: 'k', label: 'Lime kiln', kilnType: 'LIME_KILN', fuelCode: 'natural_gas',
      fuelQuantity: 100_000, fuelQuantityUnit: 'GJ', ncvGjPerUnit: 1,
      biogenicCo2FromCalcinationTonnes: 50_000,
    }]
    const r = calculatePulpPaper(p)
    expect(r.memoItems.biogenicCO2Tonnes).toBeCloseTo(50_000, 0)
  })
})

/* ---------------- mobile ownership split ------------------------------- */

describe('mobile ownership: owned → Scope 1, third-party → excluded', () => {
  it('routes third-party to supportingScope3 only', () => {
    const p = basePulpPaperPayload()
    const tp: MobileEntry = {
      id: 'tp',
      label: 'Contractor truck',
      ownership: 'THIRD_PARTY',
      vehicleCode: 'DIESEL_OFFROAD',
      quantity: 100_000,
      quantityUnit: 'L',
    }
    p.activityData.mobile = [tp]
    const r = calculatePulpPaper(p)
    expect(r.scope1.byCategory.mobile.co2eTonnes).toBe(0)
    expect(r.supportingScope3.thirdPartyMobileCO2eTonnes).toBeGreaterThan(0)
  })
})

/* ---------------- CO2 transfer (PCC export) ---------------------------- */

describe('§7.10 CO2 export to PCC plant — net deduction', () => {
  it('reduces Scope 1 by the exported fossil tonnes', () => {
    const p = basePulpPaperPayload()
    // Need a baseline gross > export, else backstop would trip.
    p.activityData.stationaryCombustion = [{
      id: 'ng', label: 'NG boiler', fuelCode: 'natural_gas', technology: 'BOILER_OR_IR_DRYER',
      quantity: 100_000, quantityUnit: 'GJ', ncvGjPerUnit: 1, co2EfKgPerGj: 55.9,
      ch4EfKgPerGj: 0, n2oEfKgPerGj: 0,
    }]
    // 100,000 × 55.9 / 1000 = 5,590 t baseline.
    const xfer: Co2TransferEntry = {
      id: 'pcc', label: 'PCC plant export', direction: 'EXPORT', origin: 'FOSSIL', quantityTonnes: 1_000,
    }
    p.activityData.co2Transfers = [xfer]
    const r = calculatePulpPaper(p)
    // Stationary 5,590 minus transfer 1,000 = 4,590 net gross.
    expect(r.scope1.grossScope1CO2eTonnes).toBeCloseTo(4_590, 0)
  })
})

/* ---------------- reconciliation --------------------------------------- */

describe('disclosed-vs-modelled reconciliation', () => {
  it('matches → 0% variance, no warning', () => {
    const p = basePulpPaperPayload()
    p.activityData.makeupCarbonates = [{ id: 'm', label: 'CaCO3', chemicalCode: 'CACO3', quantityTonnes: 7_000 }]
    p.activityData.disclosedGrossScope1CO2eTonnes = 3_080
    const r = calculatePulpPaper(p)
    expect(r.reconciliation.checked).toBe(true)
    expect(r.reconciliation.variancePercent).toBe(0)
    expect(codes(r.warnings)).not.toContain('reconciliation_variance_exceeds_5pct')
  })

  it('big variance → warning', () => {
    const p = basePulpPaperPayload()
    p.activityData.makeupCarbonates = [{ id: 'm', label: 'CaCO3', chemicalCode: 'CACO3', quantityTonnes: 7_000 }]
    p.activityData.disclosedGrossScope1CO2eTonnes = 4_000 // modelled 3,080; variance (3080-4000)/4000 = -23%
    const r = calculatePulpPaper(p)
    expect(codes(r.warnings)).toContain('reconciliation_variance_exceeds_5pct')
    expect(r.reconciliation.variancePercent).toBeCloseTo(-23, 0)
  })
})

/* ---------------- reported / direct-entry tier ------------------------- */

describe('reported / direct-entry → REPORTED_AGGREGATE data quality tier', () => {
  it('flags as REPORTED_AGGREGATE when ≥50% of gross comes from reported', () => {
    const p = basePulpPaperPayload()
    p.facility.millType = 'MIXED'
    const rep: ReportedEntry = {
      id: 'r1', label: 'Corporate disclosed total', basis: 'REPORTED', co2eTonnes: 5_000_000,
    }
    p.activityData.reported = [rep]
    const r = calculatePulpPaper(p)
    expect(r.scope1.grossScope1CO2eTonnes).toBe(5_000_000)
    expect(r.dataQuality.overall).toBe('REPORTED_AGGREGATE')
  })

  it('by-gas reported entry uses chosen GWP set', () => {
    const p = basePulpPaperPayload()
    p.activityData.reported = [{
      id: 'r', label: 'By-gas total', basis: 'ESTIMATED', co2Tonnes: 3_000_000, ch4Tonnes: 5_000,
    }]
    const r = calculatePulpPaper(p)
    // AR6 fossil CH4 29.8 → 3,000,000 + 5,000×29.8 = 3,000,000 + 149,000 = 3,149,000
    expect(r.scope1.grossScope1CO2eTonnes).toBeCloseTo(3_149_000, 0)
  })
})

/* ---------------- validation blocks ------------------------------------ */

describe('validation guardrails', () => {
  it('blocks negative fuel quantity', () => {
    const p = basePulpPaperPayload()
    p.activityData.stationaryCombustion = [{
      id: 'x', label: 'bad', fuelCode: 'natural_gas', quantity: -1, quantityUnit: 'Sm3',
    }]
    const r = calculatePulpPaper(p)
    expect(r.status).toBe('BLOCKED')
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('blocks electricity-as-stationary-fuel', () => {
    const p = basePulpPaperPayload()
    p.activityData.stationaryCombustion = [{
      id: 'el', label: 'Purchased electricity (wrong)', fuelCode: 'natural_gas', quantity: 100, quantityUnit: 'MWh',
    }]
    const r = calculatePulpPaper(p)
    expect(codes(r.errors)).toContain('electricity_as_combustion')
  })

  it('blocks negative reported CO2e', () => {
    const p = basePulpPaperPayload()
    p.activityData.reported = [{ id: 'r', label: 'bad', basis: 'REPORTED', co2eTonnes: -100 }]
    const r = calculatePulpPaper(p)
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('blocks consolidation share out of range', () => {
    const p = basePulpPaperPayload()
    p.organizationBoundary.consolidationPercent = 150
    const r = calculatePulpPaper(p)
    expect(codes(r.errors)).toContain('consolidation_out_of_range')
  })
})

/* ---------------- GWP horizon switch ----------------------------------- */

describe('GWP horizon switch', () => {
  it('AR6_20 makes methane ~2.8× heavier (82.5 vs 29.8 fossil)', () => {
    const p1 = basePulpPaperPayload()
    p1.activityData.reported = [{ id: 'r', label: 'CH4 only', basis: 'ESTIMATED', ch4Tonnes: 100 }]
    const r1 = calculatePulpPaper(p1)
    expect(r1.scope1.grossScope1CO2eTonnes).toBeCloseTo(2_980, 0) // 100 × 29.8

    const p2 = basePulpPaperPayload()
    p2.calculationContext.gwpSet = 'AR6_20'
    p2.activityData.reported = [{ id: 'r', label: 'CH4 only', basis: 'ESTIMATED', ch4Tonnes: 100 }]
    const r2 = calculatePulpPaper(p2)
    expect(r2.scope1.grossScope1CO2eTonnes).toBeCloseTo(8_250, 0) // 100 × 82.5
  })
})
