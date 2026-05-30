/**
 * Iron & Steel Scope 1 — engine test suite.
 *
 * Worked examples are derived from the IPCC 2006 Vol 3 Ch 4 Tier 1 defaults,
 * the 2019 Refinement Tier 2 carbon balances, and the worldsteel CO2 Data
 * Collection v11 methodology. Every numeric expectation cites the source.
 * Never weaken a test to make a change pass — fix the math.
 */

import { describe, expect, it } from 'vitest'

import { calculateIronSteel } from '../calculate'
import type {
  BfBofEntry,
  CokeOvenEntry,
  DriEntry,
  EafEntry,
  FlaringEntry,
  FuelEntry,
  LimeKilnEntry,
  MobileEntry,
  OtherFugitiveEntry,
  RefrigerantEntry,
  Sf6Entry,
  SinterEntry,
} from '../types'
import type { ReportedEntry } from '../../oilgas/types'
import { baseIronSteelPayload } from './fixture'

const codes = (msgs: { code: string }[]) => msgs.map((m) => m.code)

/* --------------------------- baseline / sector --------------------------- */

describe('baseline', () => {
  it('empty payload calculates to zero with no errors', () => {
    const r = calculateIronSteel(baseIronSteelPayload())
    expect(r.errors).toHaveLength(0)
    expect(r.scope1.grossScope1CO2eTonnes).toBe(0)
    expect(r.status).toBe('SUCCESS')
    expect(r.sectorCode).toBe('IRON_STEEL')
    expect(r.methodologyPack).toBe('WORLDSTEEL_ISO14404_IPCC2006_2024')
  })

  it('rejects a non iron-and-steel sector code', () => {
    const p = baseIronSteelPayload()
    // @ts-expect-error testing wrong sector at runtime
    p.sector.sectorCode = 'CEMENT'
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('unsupported_sector')
  })

  it('requires a process route', () => {
    const p = baseIronSteelPayload()
    // @ts-expect-error missing route
    p.facility.processRoute = undefined
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('missing_process_route')
  })
})

/* ----------------- §11.1 — Stationary NG boiler (IPCC default) ----------- */

describe('§11.1 NG boiler (stationary)', () => {
  it('reproduces 56,100 t CO2 from 1,000,000 GJ × 56.1 kg/GJ', () => {
    const p = baseIronSteelPayload()
    const ng: FuelEntry = {
      id: 'ng', label: 'NG boiler', fuelCode: 'natural_gas', technology: 'BOILER',
      quantity: 1_000_000, quantityUnit: 'GJ',
      ncvGjPerUnit: 1, co2EfKgPerGj: 56.1,
      ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.001,
      overrideReason: 'Worked-example calibration',
    }
    p.activityData.stationaryCombustion = [ng]
    const r = calculateIronSteel(p)
    expect(r.errors).toHaveLength(0)
    const c = r.scope1.byCategory.stationaryCombustion
    expect(c.co2Tonnes).toBeCloseTo(56_100, 0)
    expect(c.ch4Tonnes).toBeCloseTo(1.0, 3)
    expect(c.n2oTonnes).toBeCloseTo(1.0, 3)
    // CO2e = 56,100 + 1.0 × 29.8 + 1.0 × 273 = 56,402.8
    expect(c.co2eTonnes).toBeCloseTo(56_402.8, 0)
  })
})

/* ----------- §11.2 — Coking coal with India NATCOM CEF override --------- */

describe('§11.2 coking coal — India NATCOM CEF', () => {
  it('uses CEF 93.61 (not IPCC 94.6) when useIndiaNatcom = true', () => {
    const p = baseIronSteelPayload()
    p.organization.country = 'IN'
    const coal: FuelEntry = {
      id: 'cc', label: 'Coking coal — power boiler', fuelCode: 'coking_coal', technology: 'BOILER',
      quantity: 100_000, quantityUnit: 'tonne',
      ncvGjPerUnit: 28.2, useIndiaNatcom: true,
      ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.0015,
      overrideReason: 'India NATCOM CEF applied',
    }
    p.activityData.stationaryCombustion = [coal]
    const r = calculateIronSteel(p)
    // Energy = 100,000 × 28.2 = 2,820,000 GJ. CO2 = 2,820,000 × 93.61 / 1000 = 263,980.2 t
    expect(r.scope1.byCategory.stationaryCombustion.co2Tonnes).toBeCloseTo(263_980.2, 0)
  })
})

/* ---------------- §11.3 — Sinter Tier 1 default ----------------------- */

describe('§11.3 sinter Tier 1', () => {
  it('reproduces 20,000 t CO2 from 100,000 t × 0.20 + CH4/N2O', () => {
    const p = baseIronSteelPayload()
    const s: SinterEntry = { id: 's', label: 'Sinter strand', method: 'TIER1_DEFAULT', sinterProducedTonnes: 100_000 }
    p.activityData.sinter = [s]
    const r = calculateIronSteel(p)
    const c = r.scope1.byCategory.sinter
    expect(c.co2Tonnes).toBeCloseTo(20_000, 0)
    // 2019 Refinement defaults: 0.07 kg CH4/t = 7 t; 0.025 kg N2O/t = 2.5 t
    expect(c.ch4Tonnes).toBeCloseTo(7, 1)
    expect(c.n2oTonnes).toBeCloseTo(2.5, 1)
    // CO2e = 20,000 + 7 × 29.8 + 2.5 × 273 = 20,000 + 208.6 + 682.5 = 20,891.1
    expect(c.co2eTonnes).toBeCloseTo(20_891.1, 0)
  })
})

/* ---------------- §11.4 — Coke oven Tier 1 default --------------------- */

describe('§11.4 coke oven Tier 1', () => {
  it('reproduces 28,000 t CO2 from 50,000 t coke × 0.56', () => {
    const p = baseIronSteelPayload()
    const c: CokeOvenEntry = { id: 'c', label: 'Coke battery', method: 'TIER1_DEFAULT', cokeProducedTonnes: 50_000 }
    p.activityData.cokeOven = [c]
    const r = calculateIronSteel(p)
    expect(r.scope1.byCategory.cokeOven.co2Tonnes).toBeCloseTo(28_000, 0)
  })

  it('Tier 2 carbon balance: 100k t coal × 0.79 − 80k t coke × 0.875 − 0 = 79,000 − 70,000 = 9,000 tC → 33,000 tCO2', () => {
    const p = baseIronSteelPayload()
    const c: CokeOvenEntry = {
      id: 'c', label: 'Coke battery carbon balance', method: 'TIER2_CARBON_BALANCE',
      cokingCoalChargedTonnes: 100_000, cokeOutTonnes: 80_000,
    }
    p.activityData.cokeOven = [c]
    const r = calculateIronSteel(p)
    // C_in − C_out = 79,000 − 70,000 = 9,000 tC. ×44/12 = 33,000 tCO2.
    expect(r.scope1.byCategory.cokeOven.co2Tonnes).toBeCloseTo(33_000, 0)
  })
})

/* ----------- §11.5 — BF-BOF integrated Tier 1 (the big one) ------------ */

describe('§11.5 BF-BOF integrated Tier 1', () => {
  it('reproduces 1,460,000 t CO2 from 1,000,000 t crude steel × 1.46', () => {
    const p = baseIronSteelPayload()
    const e: BfBofEntry = { id: 'bf', label: 'Integrated BF + BOF', method: 'TIER1_INTEGRATED', crudeSteelProducedTonnes: 1_000_000 }
    p.activityData.bfBof = [e]
    const r = calculateIronSteel(p)
    expect(r.scope1.byCategory.bfBof.co2Tonnes).toBeCloseTo(1_460_000, 0)
    expect(r.scope1.grossScope1CO2eTonnes).toBeCloseTo(1_460_000, 0)
  })
})

/* --------------- §11.6 — EAF Tier 1 electrodes-only -------------------- */

describe('§11.6 EAF Tier 1 electrodes-only', () => {
  it('reproduces 40,000 t CO2 from 500,000 t crude steel × 0.08', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'EAF'
    const e: EafEntry = { id: 'eaf', label: 'EAF #1', method: 'TIER1_ELECTRODES_ONLY', crudeSteelProducedTonnes: 500_000 }
    p.activityData.eaf = [e]
    const r = calculateIronSteel(p)
    expect(r.scope1.byCategory.eaf.co2Tonnes).toBeCloseTo(40_000, 0)
  })

  it('Tier 2 full balance: 4kt electrodes × 0.99 + 10kt charge C × 0.83 − 500kt CS × 0.005 = 9,710 tC → 35,603 tCO2', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'EAF'
    const e: EafEntry = {
      id: 'eaf', label: 'EAF #1 Tier 2', method: 'TIER2_FULL_BALANCE',
      crudeSteelProducedTonnes: 500_000,
      electrodeConsumedTonnes: 4_000,
      chargeCarbonTonnes: 10_000,
      scrapChargedTonnes: 0,
    }
    p.activityData.eaf = [e]
    const r = calculateIronSteel(p)
    // C_in = 4000 × 0.99 + 10000 × 0.83 = 3,960 + 8,300 = 12,260
    // C_out = 500,000 × 0.005 = 2,500
    // Net = 9,760 tC; ×44/12 = 35,786.67 tCO2
    expect(r.scope1.byCategory.eaf.co2Tonnes).toBeCloseTo(35_786.67, 0)
  })
})

/* ----------- §11.7 — DRI by route (Tier 1 defaults) -------------------- */

describe('§11.7 DRI Tier 1', () => {
  it('NG DRI: 200,000 t × 0.70 = 140,000 t CO2', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'DRI_EAF_GAS'
    const d: DriEntry = { id: 'd', label: 'NG DRI shaft', driType: 'NATURAL_GAS', method: 'TIER1_DEFAULT', driProducedTonnes: 200_000 }
    p.activityData.dri = [d]
    const r = calculateIronSteel(p)
    expect(r.scope1.byCategory.dri.co2Tonnes).toBeCloseTo(140_000, 0)
  })

  it('Coal DRI (India typical): 100,000 t × 2.50 = 250,000 t CO2', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'DRI_EAF_COAL'
    const d: DriEntry = { id: 'd', label: 'Rotary kiln coal DRI', driType: 'COAL_BASED', method: 'TIER1_DEFAULT', driProducedTonnes: 100_000 }
    p.activityData.dri = [d]
    const r = calculateIronSteel(p)
    expect(r.scope1.byCategory.dri.co2Tonnes).toBeCloseTo(250_000, 0)
  })

  it('H2 DRI: 50,000 t × 0.15 = 7,500 t CO2 (auxiliary NG only)', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'DRI_EAF_H2'
    const d: DriEntry = { id: 'd', label: 'Green H2 DRI', driType: 'GREEN_HYDROGEN', method: 'TIER1_DEFAULT', driProducedTonnes: 50_000 }
    p.activityData.dri = [d]
    const r = calculateIronSteel(p)
    expect(r.scope1.byCategory.dri.co2Tonnes).toBeCloseTo(7_500, 0)
  })
})

/* ---------------- §11.8 — Lime kiln (combustion + calcination) --------- */

describe('§11.8 lime kiln', () => {
  it('100,000 t CaCO3 charged → 44,000 t calcination CO2; plus NG combustion', () => {
    const p = baseIronSteelPayload()
    const e: LimeKilnEntry = {
      id: 'lk', label: 'Rotary lime kiln', kilnType: 'ROTARY',
      fuelCode: 'natural_gas', fuelQuantity: 1_000_000, fuelQuantityUnit: 'GJ',
      ncvGjPerUnit: 1,
      limestoneChargedTonnes: 100_000,
      calcinationFraction: 1.0,
      overrideReason: 'Worked-example NCV normalised',
    }
    p.activityData.limeKiln = [e]
    const r = calculateIronSteel(p)
    // Calcination CO2 = 100,000 × 0.440 = 44,000
    // Combustion CO2 = 1,000,000 × 56.1 / 1000 = 56,100
    // Total CO2 = 100,100
    expect(r.scope1.byCategory.limeKiln.co2Tonnes).toBeCloseTo(100_100, 0)
  })
})

/* ----------------- §11.9 — Flaring of COG ------------------------------ */

describe('§11.9 flaring (COG)', () => {
  it('1,000,000 Nm3 COG flared at DRE 0.98 → ~833 tCO2', () => {
    const p = baseIronSteelPayload()
    const f: FlaringEntry = {
      id: 'fl', label: 'COG flare', gasType: 'COG',
      flaredVolumeNm3: 1_000_000,
      combustionEfficiency: 0.98,
    }
    p.activityData.flaring = [f]
    const r = calculateIronSteel(p)
    // CO2 = 1,000,000 × 0.85 × 0.98 / 1000 = 833 tCO2
    expect(r.scope1.byCategory.flaring.co2Tonnes).toBeCloseTo(833, 0)
  })

  it('unlit flare DRE=0 raises warning + zero CO2 (all gas vents)', () => {
    const p = baseIronSteelPayload()
    p.activityData.flaring = [{ id: 'u', label: 'Unlit', gasType: 'BFG', flaredVolumeNm3: 100_000, combustionEfficiency: 0 }]
    const r = calculateIronSteel(p)
    expect(codes(r.warnings)).toContain('flare_unlit_treated_as_full_release')
    expect(r.scope1.byCategory.flaring.co2Tonnes).toBe(0)
  })
})

/* ---------------- §11.10 — Refrigerant R-410A -------------------------- */

describe('§11.10 refrigerant R-410A mass balance', () => {
  it('20 kg leaked × 2,256 GWP / 1000 = 45.12 tCO2e', () => {
    const p = baseIronSteelPayload()
    const r1: RefrigerantEntry = {
      id: 'h', label: 'Plant chiller R-410A', gasCode: 'r410a', method: 'MASS_BALANCE',
      inventoryStartKg: 200, purchasedKg: 20, soldKg: 0, inventoryEndKg: 200, recoveredForRecycleKg: 0,
    }
    p.activityData.fugitiveHFC = [r1]
    const r = calculateIronSteel(p)
    expect(r.scope1.byCategory.fugitiveHFC.co2eTonnes).toBeCloseTo(45.12, 2)
  })
})

/* ---------------- §11.11 — SF6 switchgear ------------------------------ */

describe('§11.11 SF6 switchgear', () => {
  it('1,000 kg nameplate × 0.5% leak (default sealed-pressure) × 25,200 GWP / 1000 = 126 tCO2e', () => {
    const p = baseIronSteelPayload()
    const sf6: Sf6Entry = { id: 's6', label: 'HV substation', nameplateInventoryKg: 1_000 }
    p.activityData.fugitiveSF6 = [sf6]
    const r = calculateIronSteel(p)
    // 1000 × 0.005 = 5 kg leaked. ×25,200/1000 = 126 tCO2e
    expect(r.scope1.byCategory.fugitiveSF6.co2eTonnes).toBeCloseTo(126, 0)
    expect(codes(r.warnings)).toContain('sf6_default_leak_rate_used')
  })

  it('direct leaked mass override: 8 kg × 25,200 / 1000 = 201.6 tCO2e', () => {
    const p = baseIronSteelPayload()
    p.activityData.fugitiveSF6 = [{ id: 's6', label: 'HV substation', nameplateInventoryKg: 1_000, leakedMassKg: 8 }]
    const r = calculateIronSteel(p)
    expect(r.scope1.byCategory.fugitiveSF6.co2eTonnes).toBeCloseTo(201.6, 1)
  })
})

/* ------- §11.12 — Other CH4 fugitive (coal stockpile via EF) ------- */

describe('§11.12 coal stockpile CH4', () => {
  it('500,000 t coal × 0.13 kg CH4/t = 65,000 kg CH4 → ~1,937 tCO2e (AR6)', () => {
    const p = baseIronSteelPayload()
    const o: OtherFugitiveEntry = { id: 'o', label: 'Coal stockpile', source: 'COAL_STOCKPILE', activityTonnes: 500_000 }
    p.activityData.fugitiveOther = [o]
    const r = calculateIronSteel(p)
    // 65,000 kg = 65 t CH4 × 29.8 = 1,937 tCO2e
    expect(r.scope1.byCategory.fugitiveOther.ch4Tonnes).toBeCloseTo(65, 1)
    expect(r.scope1.byCategory.fugitiveOther.co2eTonnes).toBeCloseTo(1_937, 0)
  })
})

/* ----------- mobile combustion: owned vs third-party split ------------- */

describe('mobile combustion: owned → Scope 1, third-party → supporting Scope 3', () => {
  it('routes third-party to supportingScope3 only', () => {
    const p = baseIronSteelPayload()
    const tp: MobileEntry = {
      id: 'tp', label: 'Contractor haul truck',
      ownership: 'THIRD_PARTY', vehicleCode: 'DIESEL_HAUL',
      quantity: 100_000, quantityUnit: 'L',
    }
    p.activityData.mobile = [tp]
    const r = calculateIronSteel(p)
    expect(r.scope1.byCategory.mobile.co2eTonnes).toBe(0)
    expect(r.supportingScope3.thirdPartyMobileCO2eTonnes).toBeGreaterThan(0)
  })
})

/* ---------------- intensity metrics (kgCO2e/t crude steel) -------------- */

describe('intensity metrics', () => {
  it('1.46M tCO2e gross + 1M t crude steel → 1,460 kgCO2e/t (BF-BOF benchmark)', () => {
    const p = baseIronSteelPayload()
    p.activityData.production = { crudeSteelTonnes: 1_000_000 }
    p.activityData.bfBof = [{ id: 'b', label: 'Integrated', method: 'TIER1_INTEGRATED', crudeSteelProducedTonnes: 1_000_000 }]
    const r = calculateIronSteel(p)
    expect(r.intensityMetrics.co2ePerTonneCrudeSteel).toBeCloseTo(1_460, 0)
  })
})

/* ---------------- scope separation (biomass) --------------------------- */

describe('scope separation — biomass CO2 routed to memo only', () => {
  it('bio-coke combustion: CO2 in biogenic memo, CH4/N2O in Scope 1', () => {
    const p = baseIronSteelPayload()
    const bio: FuelEntry = {
      id: 'bio', label: 'Bio-coke', fuelCode: 'bio_coke', origin: 'BIOMASS', technology: 'BOILER',
      quantity: 10_000, quantityUnit: 'tonne',
      ncvGjPerUnit: 28, ch4EfKgPerGj: 0.012, n2oEfKgPerGj: 0.004,
      overrideReason: 'Worked-example biomass calibration',
    }
    p.activityData.stationaryCombustion = [bio]
    const r = calculateIronSteel(p)
    // 10,000 × 28 = 280,000 GJ. Biogenic CO2 = 280,000 × 112 / 1000 = 31,360 t → memo
    expect(r.memoItems.biogenicCO2Tonnes).toBeCloseTo(31_360, 0)
    // Scope 1 CO2 from this row = 0 (biomass routed to memo)
    expect(r.scope1.byCategory.stationaryCombustion.co2Tonnes).toBe(0)
    // CH4 and N2O DO count (biogenic GWPs)
    // CH4 = 280,000 × 0.012 / 1000 = 3.36 t; × 27 = 90.72
    // N2O = 280,000 × 0.004 / 1000 = 1.12 t; × 273 = 305.76
    expect(r.scope1.byCategory.stationaryCombustion.co2eTonnes).toBeCloseTo(396.48, 0)
  })
})

/* ---------------- validation guardrails -------------------------------- */

describe('validation guardrails', () => {
  it('blocks negative fuel quantity', () => {
    const p = baseIronSteelPayload()
    p.activityData.stationaryCombustion = [{ id: 'x', label: 'bad', fuelCode: 'natural_gas', quantity: -1, quantityUnit: 'Sm3' }]
    const r = calculateIronSteel(p)
    expect(r.status).toBe('BLOCKED')
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('blocks electricity-as-stationary-fuel', () => {
    const p = baseIronSteelPayload()
    p.activityData.stationaryCombustion = [{ id: 'el', label: 'Purchased electricity', fuelCode: 'natural_gas', quantity: 100, quantityUnit: 'MWh' }]
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('electricity_as_combustion')
  })

  it('blocks EF override without reason', () => {
    const p = baseIronSteelPayload()
    p.activityData.stationaryCombustion = [{
      id: 'x', label: 'Override no reason', fuelCode: 'natural_gas',
      quantity: 1000, quantityUnit: 'Sm3', co2EfKgPerGj: 50, // override without overrideReason
    }]
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('override_without_reason')
  })

  it('blocks consolidation share out of range', () => {
    const p = baseIronSteelPayload()
    p.organizationBoundary.consolidationPercent = 150
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('consolidation_out_of_range')
  })

  it('blocks negative reported CO2e', () => {
    const p = baseIronSteelPayload()
    p.activityData.reported = [{ id: 'r', label: 'bad', basis: 'REPORTED', co2eTonnes: -100 }]
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('negative_input_value')
  })
})

/* ---------------- reconciliation --------------------------------------- */

describe('disclosed-vs-modelled reconciliation', () => {
  it('matches → 0% variance, no warning', () => {
    const p = baseIronSteelPayload()
    p.activityData.bfBof = [{ id: 'b', label: 'Integrated', method: 'TIER1_INTEGRATED', crudeSteelProducedTonnes: 1_000_000 }]
    p.activityData.disclosedGrossScope1CO2eTonnes = 1_460_000
    const r = calculateIronSteel(p)
    expect(r.reconciliation.checked).toBe(true)
    expect(r.reconciliation.variancePercent).toBe(0)
    expect(codes(r.warnings)).not.toContain('reconciliation_variance_exceeds_5pct')
  })

  it('big variance → warning', () => {
    const p = baseIronSteelPayload()
    p.activityData.bfBof = [{ id: 'b', label: 'Integrated', method: 'TIER1_INTEGRATED', crudeSteelProducedTonnes: 1_000_000 }]
    p.activityData.disclosedGrossScope1CO2eTonnes = 1_700_000
    const r = calculateIronSteel(p)
    expect(codes(r.warnings)).toContain('reconciliation_variance_exceeds_5pct')
  })
})

/* ---------------- reported / direct-entry tier ------------------------- */

describe('reported / direct-entry → REPORTED_AGGREGATE data quality tier', () => {
  it('flags as REPORTED_AGGREGATE when ≥50% of gross comes from reported', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'MIXED'
    const rep: ReportedEntry = { id: 'r1', label: 'Disclosed total', basis: 'REPORTED', co2eTonnes: 5_000_000 }
    p.activityData.reported = [rep]
    const r = calculateIronSteel(p)
    expect(r.scope1.grossScope1CO2eTonnes).toBe(5_000_000)
    expect(r.dataQuality.overall).toBe('REPORTED_AGGREGATE')
  })

  it('by-gas reported entry uses chosen GWP set', () => {
    const p = baseIronSteelPayload()
    p.activityData.reported = [{ id: 'r', label: 'By-gas total', basis: 'ESTIMATED', co2Tonnes: 1_000_000, ch4Tonnes: 1_000 }]
    const r = calculateIronSteel(p)
    // AR6 fossil CH4 29.8 → 1,000,000 + 1,000 × 29.8 = 1,029,800
    expect(r.scope1.grossScope1CO2eTonnes).toBeCloseTo(1_029_800, 0)
  })
})

/* ---------------- GWP horizon switch ----------------------------------- */

describe('GWP horizon switch', () => {
  it('AR6_20 makes methane ~2.8× heavier (82.5 vs 29.8 fossil)', () => {
    const p1 = baseIronSteelPayload()
    p1.activityData.reported = [{ id: 'r', label: 'CH4 only', basis: 'ESTIMATED', ch4Tonnes: 100 }]
    const r1 = calculateIronSteel(p1)
    expect(r1.scope1.grossScope1CO2eTonnes).toBeCloseTo(2_980, 0)

    const p2 = baseIronSteelPayload()
    p2.calculationContext.gwpSet = 'AR6_20'
    p2.activityData.reported = [{ id: 'r', label: 'CH4 only', basis: 'ESTIMATED', ch4Tonnes: 100 }]
    const r2 = calculateIronSteel(p2)
    expect(r2.scope1.grossScope1CO2eTonnes).toBeCloseTo(8_250, 0)
  })

  it('AR6 SF6 is 25,200 (vs AR5 22,800)', () => {
    const p = baseIronSteelPayload()
    p.activityData.fugitiveSF6 = [{ id: 's', label: 'Substation', nameplateInventoryKg: 100, leakedMassKg: 1 }]
    const r = calculateIronSteel(p)
    // 1 kg × 25,200 / 1000 = 25.2 tCO2e
    expect(r.scope1.byCategory.fugitiveSF6.co2eTonnes).toBeCloseTo(25.2, 1)
  })
})

/* ----------------------------------------------------------------- */
/*  QA Tier A — consultant-flagged assurance gates                   */
/* ----------------------------------------------------------------- */

describe('QA #3 — BF/BOF Tier 1 + coke + sinter double-counting BLOCKED', () => {
  it('blocks when BF/BOF Tier 1 integrated + separate Tier 1 coke + sinter are mixed', () => {
    const p = baseIronSteelPayload()
    p.activityData.bfBof = [{ id: 'b', label: 'Integrated', method: 'TIER1_INTEGRATED', crudeSteelProducedTonnes: 1_000_000 }]
    p.activityData.cokeOven = [{ id: 'c', label: 'Coke', method: 'TIER1_DEFAULT', cokeProducedTonnes: 500_000 }]
    p.activityData.sinter = [{ id: 's', label: 'Sinter', method: 'TIER1_DEFAULT', sinterProducedTonnes: 1_200_000 }]
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('double_counting_bfbof_tier1_includes_coke_sinter')
    expect(r.status).toBe('BLOCKED')
  })

  it('allows BF/BOF Tier 2 carbon balance alongside separate coke and sinter (no double-count)', () => {
    const p = baseIronSteelPayload()
    p.activityData.bfBof = [{ id: 'b', label: 'BF + BOF Tier 2', method: 'TIER2_CARBON_BALANCE', crudeSteelProducedTonnes: 1_000_000 }]
    p.activityData.cokeOven = [{ id: 'c', label: 'Coke', method: 'TIER1_DEFAULT', cokeProducedTonnes: 500_000 }]
    p.activityData.sinter = [{ id: 's', label: 'Sinter', method: 'TIER1_DEFAULT', sinterProducedTonnes: 1_200_000 }]
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).not.toContain('double_counting_bfbof_tier1_includes_coke_sinter')
  })
})

describe('QA #6 — EAF Tier 1 electrodes-only partial-coverage warning', () => {
  it('warns when EAF Tier 1 is material and no supporting categories are filled', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'EAF'
    p.activityData.eaf = [{ id: 'e', label: 'EAF', method: 'TIER1_ELECTRODES_ONLY', crudeSteelProducedTonnes: 500_000 }]
    const r = calculateIronSteel(p)
    expect(codes(r.warnings)).toContain('eaf_tier1_electrodes_only_partial_coverage')
  })

  it('does NOT warn when supporting categories (stationary / DRI / lime) are present', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'EAF'
    p.activityData.eaf = [{ id: 'e', label: 'EAF', method: 'TIER1_ELECTRODES_ONLY', crudeSteelProducedTonnes: 500_000 }]
    p.activityData.stationaryCombustion = [{ id: 'ng', label: 'Reheat NG', fuelCode: 'natural_gas', quantity: 1000, quantityUnit: 'Sm3' }]
    const r = calculateIronSteel(p)
    expect(codes(r.warnings)).not.toContain('eaf_tier1_electrodes_only_partial_coverage')
  })
})

describe('QA #5 — implausible-zero Scope 1 for non-trivial production', () => {
  it('blocks when crude steel > 1000 t and zero activity entries (induction empty-shell)', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'INDUCTION'
    p.activityData.production = { crudeSteelTonnes: 100_000 }
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('implausible_zero_scope1_for_production')
    expect(r.status).toBe('BLOCKED')
  })

  it('does NOT block when any activity row exists', () => {
    const p = baseIronSteelPayload()
    p.facility.processRoute = 'INDUCTION'
    p.activityData.production = { crudeSteelTonnes: 100_000 }
    p.activityData.fugitiveHFC = [{ id: 'h', label: 'Chiller', gasCode: 'r410a', method: 'MASS_BALANCE', inventoryStartKg: 100, purchasedKg: 5, soldKg: 0, inventoryEndKg: 100, recoveredForRecycleKg: 0 }]
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).not.toContain('implausible_zero_scope1_for_production')
  })
})

describe('QA #4 — process-gas allocation honesty warning', () => {
  it('warns when allocation is non-default (engine emits at point of combustion regardless)', () => {
    const p = baseIronSteelPayload()
    p.methodSelections.processGasAllocation = 'CARBON_ALLOCATION_UPSTREAM'
    const r = calculateIronSteel(p)
    expect(codes(r.warnings)).toContain('process_gas_allocation_advisory_only')
  })

  it('does NOT warn for POINT_OF_EMISSION default', () => {
    const p = baseIronSteelPayload()
    const r = calculateIronSteel(p)
    expect(codes(r.warnings)).not.toContain('process_gas_allocation_advisory_only')
  })
})

describe('QA #1 — disclosure boundary basis required when reported is material', () => {
  it('blocks when reported total is material and no boundaryBasis is set', () => {
    const p = baseIronSteelPayload()
    p.activityData.reported = [{ id: 'r', label: 'Tata-style aggregate', basis: 'REPORTED', co2eTonnes: 50_000_000 }]
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('missing_disclosure_boundary_basis')
  })

  it('passes when boundaryBasis is set to a recognised value', () => {
    const p = baseIronSteelPayload()
    p.disclosure = { boundaryBasis: 'BRSR_BOUNDARY', boundaryNote: 'Indian operations per SEBI BRSR Section A.III.E' }
    p.activityData.reported = [{ id: 'r', label: 'Tata aggregate', basis: 'REPORTED', co2eTonnes: 50_000_000 }]
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).not.toContain('missing_disclosure_boundary_basis')
  })

  it('requires a note when boundaryBasis = OTHER', () => {
    const p = baseIronSteelPayload()
    p.disclosure = { boundaryBasis: 'OTHER' }
    p.activityData.reported = [{ id: 'r', label: 'agg', basis: 'REPORTED', co2eTonnes: 50_000_000 }]
    const r = calculateIronSteel(p)
    expect(codes(r.errors)).toContain('boundary_basis_other_requires_note')
  })
})

describe('QA #2 — reconciliation depth (per-gas + Scope 2 + intensity)', () => {
  it('reconciles disclosed CO2 + CH4 + N2O independently', () => {
    const p = baseIronSteelPayload()
    p.activityData.bfBof = [{ id: 'b', label: 'BF/BOF', method: 'TIER1_INTEGRATED', crudeSteelProducedTonnes: 1_000_000 }]
    p.activityData.disclosedScope1CO2Tonnes = 1_460_000     // matches modelled CO2
    p.activityData.disclosedScope1CH4Tonnes = 100           // disclosed but model = 0 CH4
    p.activityData.disclosedScope1N2OTonnes = 5
    const r = calculateIronSteel(p)
    const lines = r.reconciliation.lines
    expect(lines.find((l) => l.metric === 'CO2')?.variancePercent).toBe(0)
    expect(lines.find((l) => l.metric === 'CH4')).toBeDefined()
    expect(codes(r.warnings)).toContain('reported_gas_split_missing')
  })

  it('reconciles disclosed Scope 2 and intensity per t crude steel', () => {
    const p = baseIronSteelPayload()
    p.activityData.production = { crudeSteelTonnes: 1_000_000 }
    p.activityData.bfBof = [{ id: 'b', label: 'BF/BOF', method: 'TIER1_INTEGRATED', crudeSteelProducedTonnes: 1_000_000 }]
    p.activityData.purchasedElectricity = { mwh: 100_000, gridEfTco2PerMwh: 0.716 }
    p.activityData.disclosedScope2CO2eTonnes = 71_600
    p.activityData.disclosedIntensityKgPerTcrudeSteel = 1460
    const r = calculateIronSteel(p)
    const lines = r.reconciliation.lines
    expect(lines.find((l) => l.metric === 'SCOPE2')?.variancePercent).toBe(0)
    expect(lines.find((l) => l.metric === 'INTENSITY')?.variancePercent).toBe(0)
  })
})
