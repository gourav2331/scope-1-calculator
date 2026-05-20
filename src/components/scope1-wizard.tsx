'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Download,
  Factory,
  FileJson,
  FileSpreadsheet,
  FileText,
  Flame,
  Moon,
  Plus,
  Sun,
  Trash2,
  Truck,
  Wind,
} from 'lucide-react'

import type {
  CalculationResult,
  FactorSnapshot,
  FuelEntry,
  FugitiveEntry,
  InputPayload,
  MobileEntry,
  TraceEntry,
} from '@/lib/engine/types'

type Num = number | null
type Cat = 'process' | 'stationary' | 'mobile' | 'fugitive'

const STEPS = ['Sector', 'Organisation', 'Facility & methods', 'Activity data', 'Review & report']

const FUEL_CODES = [
  'coal_bituminous',
  'petcoke',
  'lignite',
  'natural_gas',
  'diesel',
  'heavy_fuel_oil',
  'waste_oil',
  'tyres',
  'waste_plastics',
  'mixed_industrial_waste',
  'solid_biomass',
]

const GAS_CODES = ['r22', 'r32', 'r134a', 'r404a', 'r407c', 'r410a', 'r507a', 'r23', 'sf6']

/** Quantity units offered for mobile fuel entries (fuel-based method). */
const MOBILE_UNITS = ['L', 'gallon', 'kg', 'tonne', 'Sm3']

const CATEGORIES: { key: Cat; label: string; icon: typeof Flame }[] = [
  { key: 'process', label: 'Process', icon: Factory },
  { key: 'stationary', label: 'Stationary combustion', icon: Flame },
  { key: 'mobile', label: 'Mobile combustion', icon: Truck },
  { key: 'fugitive', label: 'Fugitive', icon: Wind },
]

const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const fmt4 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

function emptyPayload(): InputPayload {
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
      inventoryVersion: 'DRAFT_V1',
      gwpSet: 'AR6',
    },
    organization: { name: '', country: 'IN' },
    facility: { name: '', facilityType: 'INTEGRATED_CEMENT', state: '' },
    organizationBoundary: {
      boundaryMethod: 'OPERATIONAL_CONTROL',
      ownershipSharePercent: 100,
      consolidationPercent: 100,
    },
    sector: { sectorCode: 'CEMENT' },
    methodSelections: {
      processEmissionMethod: 'CSI_CLINKER_BASED',
      clinkerEmissionFactorMethod: 'CSI_DEFAULT_525',
      dustMethod: 'NOT_APPLICABLE',
      tocMethod: 'CSI_DEFAULT_TOC',
      fuelCombustionMethod: 'ENERGY_BASED',
      mobileCombustionMethod: 'FUEL_BASED',
      electricityMethod: 'LOCATION_BASED_SUPPORTING',
      boughtClinkerMethod: 'NONE',
      netReportingMethod: 'NONE',
    },
    sourceApplicability: {
      clinkerCalcination: true,
      bypassDust: true,
      ckd: true,
      rawMealToc: true,
      kilnFuels: true,
      nonKilnFuels: true,
      mobile: true,
      fugitive: true,
      purchasedElectricity: false,
      boughtClinker: false,
      exclusionReasons: {
        purchasedElectricity: 'Out of Scope 1 (Scope 2) - not collected in this calculator',
        boughtClinker: 'Out of Scope 1 (Scope 3) - not collected in this calculator',
      },
    },
    activityData: {
      production: { clinkerProducedTonnes: null, cementProducedTonnes: null, cementitiousProductTonnes: null },
      clinkerChemistry: { caoPercent: null, caoNonCarbonatePercent: null, mgoPercent: null, mgoNonCarbonatePercent: null },
      dust: { ckdLeavingKilnTonnes: null, ckdCalcinationRate: null, bypassDustLeavingKilnTonnes: null, bypassDustCalcinationRate: null },
      rawMeal: { rawMealToClinkerRatio: null, tocFraction: null },
      kilnFuels: [],
      nonKilnFuels: [],
      mobile: [],
      fugitive: [],
      purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null },
      boughtClinker: { externalClinkerBoughtTonnes: null, externalClinkerSoldTonnes: null },
      emissionRights: { acquiredTonnes: null },
      usEpaFallback: { cementProducedTonnes: null, clinkerToCementRatio: null, clinkerEfTco2PerTonne: null },
    },
    factorOverrides: {},
  }
}

function toNum(v: string): Num {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function NumField({
  label,
  value,
  onChange,
  unit,
  step = 'any',
  hint,
}: {
  label: string
  value: Num
  onChange: (v: Num) => void
  unit?: string
  step?: string
  hint?: string
}) {
  return (
    <label className="field">
      {label}
      <div className="input-with-unit">
        <input
          type="number"
          step={step}
          value={value === null ? '' : value}
          placeholder="— (blank = missing)"
          onChange={(e) => onChange(toNum(e.target.value))}
        />
        {unit && <span>{unit}</span>}
      </div>
      <small className="form-sub">
        {value === null ? 'Missing / unknown (null)' : value === 0 ? 'Confirmed actual zero' : hint ?? ''}
      </small>
    </label>
  )
}

/* ----------------------- Scope badges & live previews --------------------- */

const BADGE_BASE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 12,
  letterSpacing: 0.2,
  display: 'inline-block',
}
const BADGE_S1: React.CSSProperties = { ...BADGE_BASE, background: '#dff5e9', color: '#0b6b3a' }
const BADGE_MEMO: React.CSSProperties = { ...BADGE_BASE, background: '#fff3cd', color: '#7a5a00' }
const BADGE_EXCL: React.CSSProperties = { ...BADGE_BASE, background: '#f1f3f5', color: '#5a6678' }
const BADGE_MIXED: React.CSSProperties = { ...BADGE_BASE, background: '#e6f0ff', color: '#0b3d6b' }

function fuelBadge(category: FuelEntry['category']) {
  if (category === 'BIOMASS') return <span style={BADGE_MEMO}>Biomass memo (excluded)</span>
  if (category === 'MIXED') return <span style={BADGE_MIXED}>Gross Scope 1 + biomass memo</span>
  if (category === 'ALTERNATIVE_FOSSIL') return <span style={BADGE_S1}>Gross Scope 1 (alt fossil)</span>
  return <span style={BADGE_S1}>Gross Scope 1</span>
}
function mobileBadge(ownership: MobileEntry['ownership']) {
  return ownership === 'OWNED_CONTROLLED' ? (
    <span style={BADGE_S1}>Gross Scope 1</span>
  ) : (
    <span style={BADGE_EXCL}>Excluded (third-party)</span>
  )
}
const FUGITIVE_BADGE = <span style={BADGE_S1}>Gross Scope 1 (CO2e)</span>

function findTraceOutput(trace: TraceEntry[] | undefined, predicate: (s: string) => boolean): number | null {
  if (!trace) return null
  const t = trace.find((e) => predicate(e.step))
  return t ? t.outputTonnesCO2 : null
}
function fuelRowCO2(trace: TraceEntry[] | undefined, label: string) {
  return findTraceOutput(trace, (s) => s === `Combustion CO2 - ${label}`)
}
function mobileRowCO2(trace: TraceEntry[] | undefined, label: string) {
  return findTraceOutput(trace, (s) => s === `Combustion CO2 - Mobile: ${label}`)
}
function fugitiveRowCO2(trace: TraceEntry[] | undefined, label: string) {
  return findTraceOutput(trace, (s) => s === `Fugitive - ${label}`)
}

/* --------------------------------- Wizard --------------------------------- */

export function Scope1Wizard() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [step, setStep] = useState(1)
  const [cat, setCat] = useState<Cat>('process')
  const [p, setP] = useState<InputPayload>(emptyPayload())
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [live, setLive] = useState<CalculationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [factors, setFactors] = useState<{
    constants: { factorCode: string; factorName: string; value: number; unit: string; source: string }[]
    gases: { gasCode: string; name: string; gwpAR5: number; gwpAR6: number }[]
  } | null>(null)

  useEffect(() => {
    fetch('/api/v1/factors')
      .then((r) => r.json())
      .then(setFactors)
      .catch(() => {})
  }, [])

  // Debounced live calculation - replaces /validate so we have the full result for
  // both validation messages AND live per-row / per-tab CO2 previews.
  useEffect(() => {
    if (step < 4) return
    const t = setTimeout(() => {
      fetch('/api/v1/calculations/cement/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
        .then((r) => r.json())
        .then((d) => setLive(d.result as CalculationResult))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [p, step])

  function patch(mut: (draft: InputPayload) => void) {
    setP((prev) => {
      const next: InputPayload = structuredClone(prev)
      mut(next)
      return next
    })
  }

  async function runCalculate(save: boolean) {
    setBusy(true)
    try {
      const r = await fetch(`/api/v1/calculations/cement/calculate${save ? '?save=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      const data = await r.json()
      setResult(data.result)
      setStep(5)
    } finally {
      setBusy(false)
    }
  }

  async function download(format: 'json' | 'xlsx' | 'pdf') {
    const r = await fetch('/api/v1/calculations/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: p, format }),
    })
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scope1-${p.facility.name || 'facility'}-FY${p.calculationContext.reportingPeriod.year}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const ms = p.methodSelections
  const ad = p.activityData
  const trace = live?.calculationTrace

  const gwpByGas = useMemo(() => {
    const map: Record<string, number> = {}
    if (factors) for (const g of factors.gases) map[g.gasCode] = p.calculationContext.gwpSet === 'AR6' ? g.gwpAR6 : g.gwpAR5
    return map
  }, [factors, p.calculationContext.gwpSet])

  return (
    <main className={theme === 'dark' ? 'wizard-app dark' : 'wizard-app'}>
      <header className="wizard-header">
        <div className="wizard-header-inner">
          <div className="wizard-brand">
            <img src="/brand/logomark-white.svg" alt="Sustally" />
            <span>
              Scope <em>1</em> Cement Calculator
            </span>
          </div>
          <div className="wizard-actions">
            <div className="gwp-switch">
              <span>GWP</span>
              {(['AR5', 'AR6'] as const).map((g) => (
                <button
                  key={g}
                  className={p.calculationContext.gwpSet === g ? 'active' : ''}
                  onClick={() => patch((d) => (d.calculationContext.gwpSet = g))}
                >
                  {g}
                </button>
              ))}
            </div>
            <button className="theme-switch" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </header>

      <nav className="wizard-progress">
        {STEPS.map((label, i) => (
          <button
            key={label}
            className={step === i + 1 ? 'active' : step > i + 1 ? 'complete' : ''}
            onClick={() => setStep(i + 1)}
          >
            <span>{i + 1}</span>
            <b>{label}</b>
          </button>
        ))}
      </nav>

      <section className="wizard-main">
        {step === 1 && (
          <section className="step-page active">
            <h1 className="step-title">
              What <em>sector</em> are you in?
            </h1>
            <p className="step-sub">
              Cement is the first active methodology pack (CSI Cement CO2 Protocol). The engine is sector-extensible.
            </p>
            <div className="sector-grid">
              <button className="sector-card selected">
                <span className="icon">◭</span>
                <strong>Cement</strong>
                <small>Integrated, clinker, grinding units</small>
                <span className="tags">CSI Protocol · active</span>
              </button>
              {['Iron & Steel', 'Power', 'Chemicals', 'Oil & Gas', 'Textile', 'Pharma', 'General Mfg'].map((x) => (
                <button className="sector-card muted" key={x} disabled>
                  <span className="icon">◇</span>
                  <strong>{x}</strong>
                  <small>Future sector pack</small>
                  <span className="tags">Planned</span>
                </button>
              ))}
            </div>
            <div className="step-footer">
              <div />
              <button className="btn primary" onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="step-page active">
            <h1 className="step-title">
              Organisation &amp; <em>boundary</em>
            </h1>
            <p className="step-sub">The consolidation boundary determines which sources fall inside Scope 1.</p>
            <div className="form-card">
              <h2>Company</h2>
              <label className="field">
                Company name
                <input
                  value={p.organization.name}
                  placeholder="e.g. Surya Cement Pvt Ltd"
                  onChange={(e) => patch((d) => (d.organization.name = e.target.value))}
                />
              </label>
              <div className="field-row">
                <label className="field">
                  Operating country
                  <select
                    value={p.organization.country}
                    onChange={(e) => patch((d) => (d.organization.country = e.target.value))}
                  >
                    <option value="IN">India</option>
                    <option value="GLOBAL">Other</option>
                  </select>
                </label>
                <label className="field">
                  Consolidation / boundary method
                  <select
                    value={p.organizationBoundary.boundaryMethod}
                    onChange={(e) =>
                      patch((d) => (d.organizationBoundary.boundaryMethod = e.target.value as InputPayload['organizationBoundary']['boundaryMethod']))
                    }
                  >
                    <option value="OPERATIONAL_CONTROL">Operational control</option>
                    <option value="FINANCIAL_CONTROL">Financial control</option>
                    <option value="EQUITY_SHARE">Equity share</option>
                  </select>
                </label>
              </div>
              <div className="field-row">
                <NumField
                  label="Ownership share %"
                  step="0.01"
                  value={p.organizationBoundary.ownershipSharePercent}
                  onChange={(v) => patch((d) => (d.organizationBoundary.ownershipSharePercent = v ?? 100))}
                  hint="Default 100"
                />
                <NumField
                  label="Consolidation %"
                  step="0.01"
                  value={p.organizationBoundary.consolidationPercent}
                  onChange={(v) => patch((d) => (d.organizationBoundary.consolidationPercent = v ?? 100))}
                  hint="Default 100"
                />
              </div>
            </div>
            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn primary" onClick={() => setStep(3)}>
                Continue
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="step-page active">
            <h1 className="step-title">
              Facility, period &amp; <em>methods</em>
            </h1>
            <p className="step-sub">
              Pick the methodology tier. If the data a tier needs is missing, the engine automatically falls back to
              the next-best method and records a warning - it never silently fails.
            </p>
            <div className="form-card">
              <h2>Facility &amp; reporting period</h2>
              <div className="field-row">
                <label className="field">
                  Facility name
                  <input
                    value={p.facility.name}
                    placeholder="Plant 1 - Maharashtra"
                    onChange={(e) => patch((d) => (d.facility.name = e.target.value))}
                  />
                </label>
                <label className="field">
                  Facility type
                  <select
                    value={p.facility.facilityType}
                    onChange={(e) =>
                      patch((d) => (d.facility.facilityType = e.target.value as InputPayload['facility']['facilityType']))
                    }
                  >
                    <option value="INTEGRATED_CEMENT">Integrated cement plant</option>
                    <option value="CLINKER_UNIT">Clinker unit</option>
                    <option value="GRINDING_UNIT">Grinding unit</option>
                  </select>
                </label>
                <label className="field">
                  Facility state / region
                  <input
                    value={p.facility.state ?? ''}
                    placeholder="e.g. Rajasthan"
                    onChange={(e) => patch((d) => (d.facility.state = e.target.value))}
                  />
                </label>
                <NumField
                  label="Reporting year"
                  value={p.calculationContext.reportingPeriod.year}
                  step="1"
                  onChange={(v) =>
                    patch((d) => {
                      const y = v ?? 2026
                      d.calculationContext.reportingPeriod = {
                        year: y,
                        startDate: `${y}-01-01`,
                        endDate: `${y}-12-31`,
                      }
                    })
                  }
                />
              </div>
            </div>
            <div className="form-card">
              <h2>Methodology selections (Scope 1)</h2>
              <div className="field-row">
                <label className="field">
                  Process method
                  <select
                    value={ms.processEmissionMethod}
                    onChange={(e) =>
                      patch((d) => (d.methodSelections.processEmissionMethod = e.target.value as typeof ms.processEmissionMethod))
                    }
                  >
                    <option value="CSI_CLINKER_BASED">CSI clinker-based</option>
                    <option value="US_EPA_CEMENT_BASED_FALLBACK">US EPA cement-based fallback</option>
                  </select>
                </label>
                <label className="field">
                  Clinker EF method
                  <select
                    value={ms.clinkerEmissionFactorMethod}
                    onChange={(e) =>
                      patch((d) => (d.methodSelections.clinkerEmissionFactorMethod = e.target.value as typeof ms.clinkerEmissionFactorMethod))
                    }
                  >
                    <option value="PLANT_SPECIFIC_CAO_MGO">Plant-specific CaO/MgO</option>
                    <option value="CSI_DEFAULT_525">CSI default 0.525</option>
                    <option value="IPCC_DEFAULT_510">IPCC default 0.510</option>
                  </select>
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  Dust method
                  <select
                    value={ms.dustMethod}
                    onChange={(e) => patch((d) => (d.methodSelections.dustMethod = e.target.value as typeof ms.dustMethod))}
                  >
                    <option value="ACTUAL_DUST_DATA">Actual dust data</option>
                    <option value="IPCC_2_PERCENT_FALLBACK">IPCC 2% fallback</option>
                    <option value="NOT_APPLICABLE">Not applicable</option>
                  </select>
                </label>
                <label className="field">
                  Raw meal TOC method
                  <select
                    value={ms.tocMethod}
                    onChange={(e) => patch((d) => (d.methodSelections.tocMethod = e.target.value as typeof ms.tocMethod))}
                  >
                    <option value="CSI_DEFAULT_TOC">CSI default TOC</option>
                    <option value="PLANT_SPECIFIC_TOC">Plant-specific TOC</option>
                    <option value="NOT_APPLICABLE">Not applicable</option>
                  </select>
                </label>
                <label className="field">
                  Fuel combustion method
                  <select
                    value={ms.fuelCombustionMethod}
                    onChange={(e) =>
                      patch((d) => (d.methodSelections.fuelCombustionMethod = e.target.value as typeof ms.fuelCombustionMethod))
                    }
                  >
                    <option value="ENERGY_BASED">Energy-based (qty × LHV × EF)</option>
                    <option value="CARBON_CONTENT_BASED">Carbon-content-based</option>
                    <option value="DIRECT_MEASUREMENT">Direct measurement</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(2)}>
                Back
              </button>
              <button className="btn primary" onClick={() => setStep(4)}>
                Continue to activity data
              </button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="step-page active">
            <h1 className="step-title">
              Activity <em>data</em>
            </h1>
            <p className="step-sub">
              The four Scope 1 categories. Leave a field blank for <b>missing/unknown</b>; type <b>0</b> only for a
              confirmed actual zero (the two are treated differently).
            </p>

            <LiveTotals live={live} />

            <div className="category-tabs">
              {CATEGORIES.map(({ key, label, icon: Icon }) => {
                const count =
                  key === 'process'
                    ? (ad.production.clinkerProducedTonnes !== null ? 1 : 0)
                    : key === 'stationary'
                      ? ad.kilnFuels.length + ad.nonKilnFuels.length
                      : key === 'mobile'
                        ? ad.mobile.length
                        : ad.fugitive.length
                return (
                  <button key={key} className={cat === key ? 'active' : ''} onClick={() => setCat(key)}>
                    <Icon size={17} />
                    {label}
                    <span>{count}</span>
                  </button>
                )
              })}
            </div>

            <div className="category-panel active">
              {cat === 'process' && (
                <>
                  <div className="form-card">
                    <h2>Production</h2>
                    <div className="field-row">
                      <NumField label="Clinker produced" unit="t" value={ad.production.clinkerProducedTonnes} onChange={(v) => patch((d) => (d.activityData.production.clinkerProducedTonnes = v))} />
                      <NumField label="Cement produced" unit="t" value={ad.production.cementProducedTonnes} onChange={(v) => patch((d) => (d.activityData.production.cementProducedTonnes = v))} />
                      <NumField label="Cementitious product" unit="t" value={ad.production.cementitiousProductTonnes} onChange={(v) => patch((d) => (d.activityData.production.cementitiousProductTonnes = v))} />
                    </div>
                  </div>

                  {ms.clinkerEmissionFactorMethod === 'PLANT_SPECIFIC_CAO_MGO' && (
                    <div className="form-card">
                      <h2>Clinker chemistry (plant-specific EF)</h2>
                      <div className="field-row">
                        <NumField label="CaO %" value={ad.clinkerChemistry.caoPercent} onChange={(v) => patch((d) => (d.activityData.clinkerChemistry.caoPercent = v))} />
                        <NumField label="Non-carbonate CaO %" value={ad.clinkerChemistry.caoNonCarbonatePercent} onChange={(v) => patch((d) => (d.activityData.clinkerChemistry.caoNonCarbonatePercent = v))} />
                        <NumField label="MgO %" value={ad.clinkerChemistry.mgoPercent} onChange={(v) => patch((d) => (d.activityData.clinkerChemistry.mgoPercent = v))} />
                        <NumField label="Non-carbonate MgO %" value={ad.clinkerChemistry.mgoNonCarbonatePercent} onChange={(v) => patch((d) => (d.activityData.clinkerChemistry.mgoNonCarbonatePercent = v))} />
                      </div>
                    </div>
                  )}

                  {ms.dustMethod === 'ACTUAL_DUST_DATA' && (
                    <div className="form-card">
                      <h2>Dust (CKD &amp; bypass)</h2>
                      <div className="field-row">
                        <NumField label="CKD leaving kiln" unit="t" value={ad.dust.ckdLeavingKilnTonnes} onChange={(v) => patch((d) => (d.activityData.dust.ckdLeavingKilnTonnes = v))} />
                        <NumField label="CKD calcination rate (0–1)" step="0.01" value={ad.dust.ckdCalcinationRate} onChange={(v) => patch((d) => (d.activityData.dust.ckdCalcinationRate = v))} hint="Default 1" />
                        <NumField label="Bypass dust leaving kiln" unit="t" value={ad.dust.bypassDustLeavingKilnTonnes} onChange={(v) => patch((d) => (d.activityData.dust.bypassDustLeavingKilnTonnes = v))} />
                        <NumField label="Bypass calcination rate (0–1)" step="0.01" value={ad.dust.bypassDustCalcinationRate} onChange={(v) => patch((d) => (d.activityData.dust.bypassDustCalcinationRate = v))} hint="Default 1" />
                      </div>
                    </div>
                  )}

                  {ms.tocMethod === 'PLANT_SPECIFIC_TOC' && (
                    <div className="form-card">
                      <h2>Raw meal TOC (plant-specific)</h2>
                      <div className="field-row">
                        <NumField label="Raw meal / clinker ratio" step="0.01" value={ad.rawMeal.rawMealToClinkerRatio} onChange={(v) => patch((d) => (d.activityData.rawMeal.rawMealToClinkerRatio = v))} hint="Default 1.55" />
                        <NumField label="TOC fraction" step="0.0001" value={ad.rawMeal.tocFraction} onChange={(v) => patch((d) => (d.activityData.rawMeal.tocFraction = v))} hint="Default 0.002" />
                      </div>
                    </div>
                  )}

                  {ms.processEmissionMethod === 'US_EPA_CEMENT_BASED_FALLBACK' && (
                    <div className="form-card">
                      <h2>US EPA cement-based fallback inputs</h2>
                      <div className="field-row">
                        <NumField label="Cement produced" unit="t" value={ad.usEpaFallback.cementProducedTonnes} onChange={(v) => patch((d) => (d.activityData.usEpaFallback.cementProducedTonnes = v))} />
                        <NumField label="Clinker / cement ratio" step="0.01" value={ad.usEpaFallback.clinkerToCementRatio} onChange={(v) => patch((d) => (d.activityData.usEpaFallback.clinkerToCementRatio = v))} />
                        <NumField label="Clinker EF override" unit="tCO2/t" step="0.001" value={ad.usEpaFallback.clinkerEfTco2PerTonne} onChange={(v) => patch((d) => (d.activityData.usEpaFallback.clinkerEfTco2PerTonne = v))} hint="Default CSI 0.525" />
                      </div>
                    </div>
                  )}
                </>
              )}

              {cat === 'stationary' && (
                <>
                  <FuelTable title="Kiln fuels" entries={ad.kilnFuels} trace={trace} onChange={(rows) => patch((d) => (d.activityData.kilnFuels = rows))} />
                  <FuelTable title="Non-kiln fossil fuels" entries={ad.nonKilnFuels} trace={trace} onChange={(rows) => patch((d) => (d.activityData.nonKilnFuels = rows))} />
                </>
              )}

              {cat === 'mobile' && (
                <MobileTable entries={ad.mobile} trace={trace} onChange={(rows) => patch((d) => (d.activityData.mobile = rows))} />
              )}

              {cat === 'fugitive' && (
                <FugitiveTable
                  entries={ad.fugitive}
                  trace={trace}
                  gwpByGas={gwpByGas}
                  gwpSet={p.calculationContext.gwpSet}
                  onChange={(rows) => patch((d) => (d.activityData.fugitive = rows))}
                />
              )}
            </div>

            <OverridePanel
              factors={factors?.constants ?? []}
              overrides={p.factorOverrides}
              onChange={(o) => patch((d) => (d.factorOverrides = o))}
            />

            {live && (live.errors.length > 0 || live.warnings.length > 0) && (
              <div className="form-card">
                <h2>Live validation</h2>
                {live.errors.map((e, i) => (
                  <p key={`e${i}`} className="form-sub" style={{ color: '#b3261e' }}>
                    ⛔ {e.code} — {e.message}
                  </p>
                ))}
                {live.warnings.map((w, i) => (
                  <p key={`w${i}`} className="form-sub" style={{ color: '#9a6700' }}>
                    ⚠ {w.code} — {w.message}
                  </p>
                ))}
              </div>
            )}

            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(3)}>
                Back
              </button>
              <button className="btn primary" disabled={busy} onClick={() => runCalculate(false)}>
                {busy ? 'Calculating…' : 'Calculate Scope 1'}
              </button>
            </div>
          </section>
        )}

        {step === 5 && result && (
          <ResultsPage
            result={result}
            payload={p}
            busy={busy}
            onBack={() => setStep(4)}
            onReset={() => {
              setResult(null)
              setP(emptyPayload())
              setStep(1)
            }}
            onSave={() => runCalculate(true)}
            onDownload={download}
          />
        )}
      </section>
    </main>
  )
}

/* ---------------------------- Live totals strip --------------------------- */

function LiveTotals({ live }: { live: CalculationResult | null }) {
  if (!live) return null
  const c = live.scope1.components
  const items: { k: string; v: number; unit?: string }[] = [
    { k: 'Gross Scope 1', v: live.scope1.grossScope1CO2Tonnes, unit: 'tCO2e' },
    { k: 'Process - clinker calcination', v: c.clinkerCalcinationCO2Tonnes },
    { k: 'Process - bypass dust', v: c.bypassDustCO2Tonnes },
    { k: 'Process - CKD', v: c.ckdCO2Tonnes },
    { k: 'Process - raw meal TOC', v: c.rawMealTocCO2Tonnes },
    { k: 'Conventional kiln fuel', v: c.conventionalKilnFuelCO2Tonnes },
    { k: 'Alt. fossil kiln fuel', v: c.alternativeFossilKilnFuelCO2Tonnes },
    { k: 'Non-kiln fossil', v: c.nonKilnFossilCO2Tonnes },
    { k: 'Mobile combustion', v: c.mobileCombustionCO2Tonnes },
    { k: 'Fugitive', v: c.fugitiveCO2eTonnes },
    { k: 'Biomass CO2 memo (excluded)', v: live.memoItems.biomassCO2Tonnes },
    { k: 'CH4/N2O addendum (separate)', v: live.nonCsiCombustionGhg.ch4N2oCO2eTonnes },
  ]
  return (
    <div className="form-card" style={{ background: '#f6f9f7', borderColor: '#d7e6dd' }}>
      <h2 style={{ marginTop: 0 }}>Live results (updates as you type)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        {items.map(({ k, v, unit }) => (
          <div key={k} style={{ padding: '6px 10px', background: '#fff', border: '1px solid #e6ebef', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: '#5a6678', textTransform: 'uppercase', letterSpacing: 0.3 }}>{k}</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {fmt.format(v)} <span style={{ fontSize: 10, color: '#5a6678' }}>{unit ?? 'tCO2'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------- Row preview & badge ---------------------------- */

function RowPreview({ co2, label }: { co2: number | null; label: string }) {
  return (
    <div style={{ fontSize: 11, color: '#5a6678', marginTop: 4 }}>
      {label}: <b style={{ color: '#0b6b3a' }}>{co2 === null ? '—' : fmt4.format(co2) + ' tCO2e'}</b>
    </div>
  )
}

/* ---------------------------------- Fuel ---------------------------------- */

function FuelTable({
  title,
  entries,
  trace,
  onChange,
}: {
  title: string
  entries: FuelEntry[]
  trace: TraceEntry[] | undefined
  onChange: (rows: FuelEntry[]) => void
}) {
  function add() {
    onChange([
      ...entries,
      {
        id: crypto.randomUUID(),
        label: title === 'Kiln fuels' ? 'Kiln fuel' : 'Non-kiln fuel',
        fuelCode: 'petcoke',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: null,
        quantityUnit: 'tonne',
      },
    ])
  }
  function upd(id: string, mut: (f: FuelEntry) => void) {
    onChange(
      entries.map((e) => {
        if (e.id !== id) return e
        const c = { ...e }
        mut(c)
        return c
      }),
    )
  }
  return (
    <div className="form-card">
      <h2>{title}</h2>
      {entries.length === 0 && <p className="form-sub">No fuel rows yet.</p>}
      {entries.map((e) => {
        const rowCO2 = fuelRowCO2(trace, e.label)
        return (
          <div key={e.id} style={{ borderTop: '1px solid #eef2f5', paddingTop: 10, marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 12 }}>{e.label || '(unnamed)'}</strong>
                {fuelBadge(e.category)}
              </div>
              <button className="icon-button" onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
                <Trash2 size={15} />
              </button>
            </div>
            <div className="field-row" style={{ alignItems: 'flex-end' }}>
              <label className="field">
                Label
                <input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} />
              </label>
              <label className="field">
                Fuel
                <select value={e.fuelCode} onChange={(ev) => upd(e.id, (f) => (f.fuelCode = ev.target.value))}>
                  {FUEL_CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Category
                <select
                  value={e.category}
                  onChange={(ev) => upd(e.id, (f) => (f.category = ev.target.value as FuelEntry['category']))}
                >
                  <option value="CONVENTIONAL_FOSSIL">Conventional fossil</option>
                  <option value="ALTERNATIVE_FOSSIL">Alternative fossil</option>
                  <option value="MIXED">Mixed (fossil + biomass)</option>
                  <option value="BIOMASS">Biomass</option>
                </select>
              </label>
              <NumField label="Quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (f) => (f.quantity = v))} />
            </div>
            <div className="field-row" style={{ alignItems: 'flex-end' }}>
              <NumField label="LHV override" unit="GJ/unit" step="0.0001" value={e.lhvGjPerUnit ?? null} onChange={(v) => upd(e.id, (f) => (f.lhvGjPerUnit = v))} />
              <NumField label="CO2 EF override" unit="kg/GJ" step="0.01" value={e.co2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.co2EfKgPerGj = v))} />
              <NumField label="CH4 EF override" unit="kg/GJ" step="0.0001" value={e.ch4EfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.ch4EfKgPerGj = v))} />
              <NumField label="N2O EF override" unit="kg/GJ" step="0.0001" value={e.n2oEfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.n2oEfKgPerGj = v))} />
              <NumField label="Biomass frac" step="0.01" value={e.biomassFraction ?? null} onChange={(v) => upd(e.id, (f) => (f.biomassFraction = v))} />
            </div>
            <div className="field-row" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 2 }}>
                Override reason
                <input
                  value={e.overrideReason ?? ''}
                  placeholder="Required when any factor on this row is overridden"
                  onChange={(ev) => upd(e.id, (f) => (f.overrideReason = ev.target.value))}
                />
              </label>
              <label className="field" style={{ flex: 2 }}>
                Evidence reference
                <input
                  value={e.evidenceReference ?? ''}
                  placeholder="e.g. ERP fuel report 2026 / lab cert no."
                  onChange={(ev) => upd(e.id, (f) => (f.evidenceReference = ev.target.value))}
                />
              </label>
            </div>
            <small className="form-sub">Formula: quantity × LHV ÷ 1000 × CO2 EF = tCO2 (fossil part counts in Scope 1; biomass fraction goes to the memo).</small>
            <RowPreview co2={rowCO2} label="Live row CO2" />
          </div>
        )
      })}
      <div style={{ marginTop: 8 }}>
        <button className="btn ghost" onClick={add}>
          <Plus size={15} /> Add fuel
        </button>
      </div>
    </div>
  )
}

/* --------------------------------- Mobile -------------------------------- */

function MobileTable({
  entries,
  trace,
  onChange,
}: {
  entries: MobileEntry[]
  trace: TraceEntry[] | undefined
  onChange: (rows: MobileEntry[]) => void
}) {
  function add() {
    onChange([
      ...entries,
      {
        id: crypto.randomUUID(),
        label: 'Mobile equipment',
        ownership: 'OWNED_CONTROLLED',
        fuelCode: 'diesel',
        quantity: null,
        quantityUnit: 'L',
      },
    ])
  }
  function upd(id: string, mut: (m: MobileEntry) => void) {
    onChange(
      entries.map((e) => {
        if (e.id !== id) return e
        const c = { ...e }
        mut(c)
        return c
      }),
    )
  }
  return (
    <div className="form-card">
      <h2>Mobile combustion (owned / controlled = Scope 1)</h2>
      {entries.length === 0 && <p className="form-sub">No mobile equipment yet.</p>}
      {entries.map((e) => {
        const rowCO2 = mobileRowCO2(trace, e.label)
        const isNonCanonical = e.fuelCode === 'diesel' && e.quantityUnit !== 'L'
        return (
          <div key={e.id} style={{ borderTop: '1px solid #eef2f5', paddingTop: 10, marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 12 }}>{e.label || '(unnamed)'}</strong>
                {mobileBadge(e.ownership)}
              </div>
              <button className="icon-button" onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
                <Trash2 size={15} />
              </button>
            </div>
            <div className="field-row" style={{ alignItems: 'flex-end' }}>
              <label className="field">
                Label
                <input value={e.label} onChange={(ev) => upd(e.id, (m) => (m.label = ev.target.value))} />
              </label>
              <label className="field">
                Ownership
                <select
                  value={e.ownership}
                  onChange={(ev) => upd(e.id, (m) => (m.ownership = ev.target.value as MobileEntry['ownership']))}
                >
                  <option value="OWNED_CONTROLLED">Owned / controlled (Scope 1)</option>
                  <option value="THIRD_PARTY">Third-party (excluded)</option>
                </select>
              </label>
              <label className="field">
                Fuel
                <select value={e.fuelCode} onChange={(ev) => upd(e.id, (m) => (m.fuelCode = ev.target.value))}>
                  {['diesel', 'natural_gas', 'heavy_fuel_oil'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Unit
                <select
                  value={e.quantityUnit}
                  onChange={(ev) => upd(e.id, (m) => (m.quantityUnit = ev.target.value))}
                >
                  {MOBILE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <NumField label="Fuel quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (m) => (m.quantity = v))} />
            </div>
            <div className="field-row" style={{ alignItems: 'flex-end' }}>
              <NumField label="LHV override" unit={`GJ/${e.quantityUnit}`} step="0.0001" value={e.lhvGjPerUnit ?? null} onChange={(v) => upd(e.id, (m) => (m.lhvGjPerUnit = v))} hint={isNonCanonical ? 'Required: library LHV is per L' : ''} />
              <NumField label="CO2 EF override" unit="kg/GJ" step="0.01" value={e.co2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (m) => (m.co2EfKgPerGj = v))} />
              <NumField label="CH4 EF override" unit="kg/GJ" step="0.0001" value={e.ch4EfKgPerGj ?? null} onChange={(v) => upd(e.id, (m) => (m.ch4EfKgPerGj = v))} />
              <NumField label="N2O EF override" unit="kg/GJ" step="0.0001" value={e.n2oEfKgPerGj ?? null} onChange={(v) => upd(e.id, (m) => (m.n2oEfKgPerGj = v))} />
            </div>
            <div className="field-row" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 2 }}>
                Override reason
                <input
                  value={e.overrideReason ?? ''}
                  placeholder="Required when LHV/EF differs from library default"
                  onChange={(ev) => upd(e.id, (m) => (m.overrideReason = ev.target.value))}
                />
              </label>
              <label className="field" style={{ flex: 2 }}>
                Evidence reference
                <input
                  value={e.evidenceReference ?? ''}
                  placeholder="e.g. fleet fuel card statement / supplier invoice"
                  onChange={(ev) => upd(e.id, (m) => (m.evidenceReference = ev.target.value))}
                />
              </label>
            </div>
            <small className="form-sub">
              Formula: Fuel quantity ({e.quantityUnit}) × LHV (GJ/{e.quantityUnit}) ÷ 1000 × CO2 EF (kg/GJ) = tCO2.
              {isNonCanonical ? ' Library LHV is per L — supply an LHV in GJ/' + e.quantityUnit + ' when using a different unit.' : ''}
            </small>
            <RowPreview co2={rowCO2} label="Live row CO2" />
          </div>
        )
      })}
      <div style={{ marginTop: 8 }}>
        <button className="btn ghost" onClick={add}>
          <Plus size={15} /> Add mobile equipment
        </button>
      </div>
    </div>
  )
}

/* -------------------------------- Fugitive ------------------------------- */

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
function inlineLabelMismatch(label: string, selected: string): string | null {
  const n = (label || '').toLowerCase()
  for (const [code, hints] of Object.entries(LABEL_HINTS)) {
    if (code === selected) continue
    if (hints.some((h) => n.includes(h))) return code
  }
  return null
}

function FugitiveTable({
  entries,
  trace,
  gwpByGas,
  gwpSet,
  onChange,
}: {
  entries: FugitiveEntry[]
  trace: TraceEntry[] | undefined
  gwpByGas: Record<string, number>
  gwpSet: 'AR5' | 'AR6'
  onChange: (rows: FugitiveEntry[]) => void
}) {
  function add() {
    onChange([
      ...entries,
      { id: crypto.randomUUID(), label: 'Refrigerant / SF6', gasCode: 'r410a', leakedKg: null },
    ])
  }
  function upd(id: string, mut: (g: FugitiveEntry) => void) {
    onChange(
      entries.map((e) => {
        if (e.id !== id) return e
        const c = { ...e }
        mut(c)
        return c
      }),
    )
  }
  return (
    <div className="form-card">
      <h2>Fugitive emissions (refrigerant leakage, SF6 switchgear)</h2>
      <p className="form-sub">Direct Scope 1 release of high-GWP gases. Reported as CO2e using GWP ({gwpSet}).</p>
      {entries.length === 0 && <p className="form-sub">No fugitive sources yet.</p>}
      {entries.map((e) => {
        const rowCO2 = fugitiveRowCO2(trace, e.label)
        const libGwp = gwpByGas[e.gasCode]
        const mismatch = inlineLabelMismatch(e.label, e.gasCode)
        return (
          <div key={e.id} style={{ borderTop: '1px solid #eef2f5', paddingTop: 10, marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 12 }}>{e.label || '(unnamed)'}</strong>
                {FUGITIVE_BADGE}
              </div>
              <button className="icon-button" onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
                <Trash2 size={15} />
              </button>
            </div>
            <div className="field-row" style={{ alignItems: 'flex-end' }}>
              <label className="field">
                Label
                <input value={e.label} onChange={(ev) => upd(e.id, (g) => (g.label = ev.target.value))} />
              </label>
              <label className="field">
                Gas
                <select value={e.gasCode} onChange={(ev) => upd(e.id, (g) => (g.gasCode = ev.target.value))}>
                  {GAS_CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <small className="form-sub">
                  Library GWP ({gwpSet}): <b>{libGwp ? fmt.format(libGwp) : '—'}</b>
                </small>
              </label>
              <NumField label="Quantity leaked / top-up" unit="kg" value={e.leakedKg} onChange={(v) => upd(e.id, (g) => (g.leakedKg = v))} />
              <NumField label="GWP override" step="1" value={e.gwpOverride ?? null} onChange={(v) => upd(e.id, (g) => (g.gwpOverride = v))} hint="Blank = library GWP" />
            </div>
            <label className="field">
              Evidence reference
              <input
                value={e.evidenceReference ?? ''}
                placeholder="e.g. AMC service report / refrigerant top-up log"
                onChange={(ev) => upd(e.id, (g) => (g.evidenceReference = ev.target.value))}
              />
            </label>
            {mismatch && (
              <p className="form-sub" style={{ color: '#9a6700' }}>
                ⚠ Label mentions <b>{mismatch.toUpperCase()}</b> but the selected gas is <b>{e.gasCode.toUpperCase()}</b>. This can cause a major GWP error — please confirm.
              </p>
            )}
            <small className="form-sub">Formula: leaked kg × GWP ÷ 1000 = tCO2e.</small>
            <RowPreview co2={rowCO2} label="Live row CO2e" />
          </div>
        )
      })}
      <div style={{ marginTop: 8 }}>
        <button className="btn ghost" onClick={add}>
          <Plus size={15} /> Add fugitive source
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ Override panel --------------------------- */

function OverridePanel({
  factors,
  overrides,
  onChange,
}: {
  factors: { factorCode: string; factorName: string; value: number; unit: string; source: string }[]
  overrides: InputPayload['factorOverrides']
  onChange: (o: InputPayload['factorOverrides']) => void
}) {
  function setOverride(code: string, value: Num, existingReason: string) {
    const next = { ...overrides }
    if (value === null) {
      delete next[code]
    } else {
      // Zero is treated as an explicit zero override - require an extra confirmation
      // because it's a high-impact, easy-to-mistype value.
      if (value === 0) {
        const ok =
          typeof window !== 'undefined' &&
          window.confirm('You are replacing the default factor with zero. Is this intentional?')
        if (!ok) return
      }
      next[code] = { value, reason: existingReason }
    }
    onChange(next)
  }
  return (
    <div className="form-card">
      <h2>Customise factors (consultant override)</h2>
      <p className="form-sub">
        Every default carries its source. Override any value with a reason - the override and its reason are recorded
        in the factor snapshot of the report. <b>Setting an override to 0 is treated as a confirmed zero</b> and will
        ask you to confirm.
      </p>
      {factors.map((f) => {
        const ov = overrides[f.factorCode]
        return (
          <div className="field-row" key={f.factorCode} style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 2 }}>
              {f.factorName}
              <small className="form-sub">
                Default {f.value} {f.unit} · {f.source}
              </small>
            </label>
            <NumField
              label="Override value"
              step="0.0001"
              value={ov ? ov.value : null}
              onChange={(v) => setOverride(f.factorCode, v, ov?.reason ?? '')}
            />
            <label className="field" style={{ flex: 2 }}>
              Reason
              <input
                value={ov?.reason ?? ''}
                placeholder="Why is the default being replaced?"
                disabled={!ov}
                onChange={(e) => {
                  const next = { ...overrides }
                  if (next[f.factorCode]) next[f.factorCode] = { ...next[f.factorCode], reason: e.target.value }
                  onChange(next)
                }}
              />
            </label>
          </div>
        )
      })}
    </div>
  )
}

/* --------------------------------- Step 5 -------------------------------- */

function ResultsPage({
  result,
  payload,
  busy,
  onBack,
  onReset,
  onSave,
  onDownload,
}: {
  result: CalculationResult
  payload: InputPayload
  busy: boolean
  onBack: () => void
  onReset: () => void
  onSave: () => void
  onDownload: (format: 'json' | 'xlsx' | 'pdf') => void
}) {
  return (
    <section className="step-page active">
      <h1 className="step-title">
        Your <em>Scope 1</em> inventory
      </h1>
      <p className="step-sub">
        {result.methodologyPack} · status {result.status} · data quality {result.dataQuality.overall}
      </p>

      <div className="summary-hero">
        <span>Gross Scope 1 direct emissions — FY {result.reportingPeriod.year}</span>
        <strong>
          {fmt.format(result.scope1.grossScope1CO2Tonnes)}
          <small> tCO2e</small>
        </strong>
        <p>Process + stationary + mobile + fugitive. Biomass CO2 and combustion CH4/N2O are shown separately.</p>
      </div>

      <div className="summary-cats">
        {Object.entries(result.scope1.components).map(([k, v]) => (
          <div className="summary-card" key={k}>
            <span>{k.replace(/CO2e?Tonnes$/, '').replace(/([A-Z])/g, ' $1')}</span>
            <strong>{fmt.format(v)}</strong>
            <small>{k === 'fugitiveCO2eTonnes' ? 'tCO2e' : 'tCO2'}</small>
          </div>
        ))}
      </div>

      <div className="form-card">
        <h2>Shown separately (not in gross Scope 1)</h2>
        <div className="result-table">
          <div className="result-row">
            <div>
              <strong>Biomass CO2 (memo item)</strong>
              <span>Excluded from gross Scope 1 per GHG Protocol</span>
            </div>
            <strong>{fmt.format(result.memoItems.biomassCO2Tonnes)} t</strong>
          </div>
          <div className="result-row">
            <div>
              <strong>Combustion CH4/N2O</strong>
              <span>CSI process method is CO2-only; shown separately, not merged</span>
            </div>
            <strong>{fmt.format(result.nonCsiCombustionGhg.ch4N2oCO2eTonnes)} tCO2e</strong>
          </div>
        </div>
      </div>

      <div className="summary-cats">
        <div className="summary-card">
          <span>Intensity / t clinker</span>
          <strong>{result.intensityMetrics.grossCO2PerTonneClinker ?? 'n/a'}</strong>
          <small>kgCO2e/t</small>
        </div>
        <div className="summary-card">
          <span>Intensity / t cementitious</span>
          <strong>{result.intensityMetrics.grossCO2PerTonneCementitious ?? 'n/a'}</strong>
          <small>kgCO2e/t</small>
        </div>
      </div>

      {(result.errors.length > 0 || result.warnings.length > 0) && (
        <div className="form-card">
          <h2>
            Validation ({result.errors.length} errors · {result.warnings.length} warnings)
          </h2>
          {result.errors.map((e, i) => (
            <p key={`e${i}`} className="form-sub" style={{ color: '#b3261e' }}>
              ⛔ {e.code} — {e.message}
            </p>
          ))}
          {result.warnings.map((w, i) => (
            <p key={`w${i}`} className="form-sub" style={{ color: '#9a6700' }}>
              ⚠ {w.code} — {w.message}
            </p>
          ))}
        </div>
      )}

      <FactorSnapshotsCard snapshots={result.factorSnapshots} />
      <TraceCard trace={result.calculationTrace} />

      <div className="form-card">
        <h2>Download report</h2>
        <p className="form-sub">
          PDF inventory report, Excel audit workbook (factor snapshots + full calculation trace), or the raw JSON
          result model.
        </p>
        <div className="wizard-actions">
          <button className="btn primary" onClick={() => onDownload('pdf')}>
            <FileText size={15} /> PDF report
          </button>
          <button className="btn secondary" onClick={() => onDownload('xlsx')}>
            <FileSpreadsheet size={15} /> Excel + trace
          </button>
          <button className="btn secondary" onClick={() => onDownload('json')}>
            <FileJson size={15} /> JSON
          </button>
          <button className="btn ghost" disabled={busy} onClick={onSave}>
            <Download size={15} /> Save draft to database
          </button>
        </div>
      </div>

      <div className="step-footer">
        <button className="btn ghost" onClick={onBack}>
          Back to inputs
        </button>
        <button className="btn primary" onClick={onReset}>
          Start over
        </button>
      </div>
      {/* payload is reserved for future "edit and re-run" actions in this view */}
      <input type="hidden" data-org={payload.organization.name} />
    </section>
  )
}

function FactorSnapshotsCard({ snapshots }: { snapshots: FactorSnapshot[] }) {
  if (!snapshots || snapshots.length === 0) return null
  return (
    <div className="form-card">
      <h2>Factor snapshots used</h2>
      <p className="form-sub">
        Every factor recorded with its source, version and priority rank. Overridden rows are marked.
      </p>
      <div className="result-table">
        {snapshots.map((s, i) => (
          <div className="result-row" key={i}>
            <div>
              <strong>
                {s.factorName}
                {s.overridden ? ' (OVERRIDDEN)' : ''}
              </strong>
              <span>
                {s.source} · {s.sourceVersion}
                {s.factorYear ? ` · ${s.factorYear}` : ''} · priority {s.priorityRank}
                {s.overrideReason ? ` · reason: ${s.overrideReason}` : ''}
              </span>
            </div>
            <strong>
              {fmt4.format(s.value)} {s.unit}
            </strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function TraceCard({ trace }: { trace: TraceEntry[] }) {
  if (!trace || trace.length === 0) return null
  return (
    <div className="form-card">
      <h2>Calculation trace</h2>
      <p className="form-sub">Every step the engine performed, in order.</p>
      <div className="result-table">
        {trace.map((t, i) => (
          <div className="result-row" key={i}>
            <div>
              <strong>{t.step}</strong>
              <span>
                {t.category}
                {t.method ? ` · ${t.method}` : ''} · {t.formula}
                {t.fallbackApplied ? ` · fallback: ${t.fallbackApplied}` : ''}
              </span>
            </div>
            <strong>{fmt4.format(t.outputTonnesCO2)} tCO2e</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
