'use client'

import { useEffect, useState } from 'react'
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
  FuelEntry,
  FugitiveEntry,
  InputPayload,
  MobileEntry,
  ValidationMessage,
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

const CATEGORIES: { key: Cat; label: string; icon: typeof Flame }[] = [
  { key: 'process', label: 'Process', icon: Factory },
  { key: 'stationary', label: 'Stationary combustion', icon: Flame },
  { key: 'mobile', label: 'Mobile combustion', icon: Truck },
  { key: 'fugitive', label: 'Fugitive', icon: Wind },
]

const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

function emptyPayload(): InputPayload {
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
      inventoryVersion: 'DRAFT_V1',
      gwpSet: 'AR6',
    },
    organization: { name: '', country: 'IN' },
    facility: { name: '', facilityType: 'INTEGRATED_CEMENT' },
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
        purchasedElectricity: 'Out of Scope 1 (Scope 2) — not collected in this calculator',
        boughtClinker: 'Out of Scope 1 (Scope 3) — not collected in this calculator',
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

export function Scope1Wizard() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [step, setStep] = useState(1)
  const [cat, setCat] = useState<Cat>('process')
  const [p, setP] = useState<InputPayload>(emptyPayload())
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [live, setLive] = useState<{ errors: ValidationMessage[]; warnings: ValidationMessage[]; status: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [factors, setFactors] = useState<{
    constants: { factorCode: string; factorName: string; value: number; unit: string; source: string }[]
  } | null>(null)

  useEffect(() => {
    fetch('/api/v1/factors')
      .then((r) => r.json())
      .then(setFactors)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (step < 4) return
    const t = setTimeout(() => {
      fetch('/api/v1/calculations/cement/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
        .then((r) => r.json())
        .then(setLive)
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
              Cement is the first active methodology pack (CSI Cement CO₂ Protocol). The engine is sector-extensible.
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
              the next-best method and records a warning — it never silently fails.
            </p>
            <div className="form-card">
              <h2>Facility &amp; reporting period</h2>
              <div className="field-row">
                <label className="field">
                  Facility name
                  <input
                    value={p.facility.name}
                    placeholder="Plant 1 — Maharashtra"
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
                  <FuelTable title="Kiln fuels" entries={ad.kilnFuels} onChange={(rows) => patch((d) => (d.activityData.kilnFuels = rows))} />
                  <FuelTable title="Non-kiln fossil fuels" entries={ad.nonKilnFuels} onChange={(rows) => patch((d) => (d.activityData.nonKilnFuels = rows))} />
                </>
              )}

              {cat === 'mobile' && (
                <MobileTable entries={ad.mobile} onChange={(rows) => patch((d) => (d.activityData.mobile = rows))} />
              )}

              {cat === 'fugitive' && (
                <FugitiveTable entries={ad.fugitive} onChange={(rows) => patch((d) => (d.activityData.fugitive = rows))} />
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
                <small> tCO₂e</small>
              </strong>
              <p>Process + stationary + mobile + fugitive. Biomass CO₂ and combustion CH₄/N₂O are shown separately.</p>
            </div>

            <div className="summary-cats">
              {Object.entries(result.scope1.components).map(([k, v]) => (
                <div className="summary-card" key={k}>
                  <span>{k.replace(/CO2e?Tonnes$/, '').replace(/([A-Z])/g, ' $1')}</span>
                  <strong>{fmt.format(v)}</strong>
                  <small>{k === 'fugitiveCO2eTonnes' ? 'tCO₂e' : 'tCO₂'}</small>
                </div>
              ))}
            </div>

            <div className="form-card">
              <h2>Shown separately (not in gross Scope 1)</h2>
              <div className="result-table">
                <div className="result-row">
                  <div>
                    <strong>Biomass CO₂ (memo item)</strong>
                    <span>Excluded from gross Scope 1 per GHG Protocol</span>
                  </div>
                  <strong>{fmt.format(result.memoItems.biomassCO2Tonnes)} t</strong>
                </div>
                <div className="result-row">
                  <div>
                    <strong>Combustion CH₄/N₂O</strong>
                    <span>CSI process method is CO₂-only; shown separately, not merged</span>
                  </div>
                  <strong>{fmt.format(result.nonCsiCombustionGhg.ch4N2oCO2eTonnes)} tCO₂e</strong>
                </div>
              </div>
            </div>

            <div className="summary-cats">
              <div className="summary-card">
                <span>Intensity / t clinker</span>
                <strong>{result.intensityMetrics.grossCO2PerTonneClinker ?? 'n/a'}</strong>
                <small>kgCO₂e/t</small>
              </div>
              <div className="summary-card">
                <span>Intensity / t cementitious</span>
                <strong>{result.intensityMetrics.grossCO2PerTonneCementitious ?? 'n/a'}</strong>
                <small>kgCO₂e/t</small>
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

            <div className="form-card">
              <h2>Download report</h2>
              <p className="form-sub">
                PDF inventory report, Excel audit workbook (factor snapshots + full calculation trace), or the raw JSON
                result model.
              </p>
              <div className="wizard-actions">
                <button className="btn primary" onClick={() => download('pdf')}>
                  <FileText size={15} /> PDF report
                </button>
                <button className="btn secondary" onClick={() => download('xlsx')}>
                  <FileSpreadsheet size={15} /> Excel + trace
                </button>
                <button className="btn secondary" onClick={() => download('json')}>
                  <FileJson size={15} /> JSON
                </button>
                <button className="btn ghost" disabled={busy} onClick={() => runCalculate(true)}>
                  <Download size={15} /> Save draft to database
                </button>
              </div>
            </div>

            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(4)}>
                Back to inputs
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setResult(null)
                  setP(emptyPayload())
                  setStep(1)
                }}
              >
                Start over
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

function FuelTable({
  title,
  entries,
  onChange,
}: {
  title: string
  entries: FuelEntry[]
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
      {entries.map((e) => (
        <div className="field-row" key={e.id} style={{ alignItems: 'flex-end' }}>
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
          <NumField label="LHV override" unit="GJ/unit" step="0.0001" value={e.lhvGjPerUnit ?? null} onChange={(v) => upd(e.id, (f) => (f.lhvGjPerUnit = v))} />
          <NumField label="CO₂ EF override" unit="kg/GJ" step="0.01" value={e.co2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.co2EfKgPerGj = v))} />
          <NumField label="Biomass frac" step="0.01" value={e.biomassFraction ?? null} onChange={(v) => upd(e.id, (f) => (f.biomassFraction = v))} />
          <button className="icon-button" onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button className="btn ghost" onClick={add}>
        <Plus size={15} /> Add fuel
      </button>
    </div>
  )
}

function MobileTable({ entries, onChange }: { entries: MobileEntry[]; onChange: (rows: MobileEntry[]) => void }) {
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
      {entries.map((e) => (
        <div className="field-row" key={e.id} style={{ alignItems: 'flex-end' }}>
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
              {['diesel', 'petcoke', 'natural_gas', 'heavy_fuel_oil'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <NumField label="Fuel quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (m) => (m.quantity = v))} />
          <button className="icon-button" onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button className="btn ghost" onClick={add}>
        <Plus size={15} /> Add mobile equipment
      </button>
    </div>
  )
}

function FugitiveTable({
  entries,
  onChange,
}: {
  entries: FugitiveEntry[]
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
      <p className="form-sub">Direct Scope 1 release of high-GWP gases. Reported as CO₂e using the selected GWP set.</p>
      {entries.length === 0 && <p className="form-sub">No fugitive sources yet.</p>}
      {entries.map((e) => (
        <div className="field-row" key={e.id} style={{ alignItems: 'flex-end' }}>
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
          </label>
          <NumField label="Quantity leaked / topped-up" unit="kg" value={e.leakedKg} onChange={(v) => upd(e.id, (g) => (g.leakedKg = v))} />
          <NumField label="GWP override" step="1" value={e.gwpOverride ?? null} onChange={(v) => upd(e.id, (g) => (g.gwpOverride = v))} hint="Blank = library GWP" />
          <button className="icon-button" onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button className="btn ghost" onClick={add}>
        <Plus size={15} /> Add fugitive source
      </button>
    </div>
  )
}

function OverridePanel({
  factors,
  overrides,
  onChange,
}: {
  factors: { factorCode: string; factorName: string; value: number; unit: string; source: string }[]
  overrides: InputPayload['factorOverrides']
  onChange: (o: InputPayload['factorOverrides']) => void
}) {
  return (
    <div className="form-card">
      <h2>Customise factors (consultant override)</h2>
      <p className="form-sub">
        Every default carries its source. Override any value with a reason — the override and its reason are recorded
        in the factor snapshot of the report.
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
              onChange={(v) => {
                const next = { ...overrides }
                if (v === null) delete next[f.factorCode]
                else next[f.factorCode] = { value: v, reason: ov?.reason ?? '' }
                onChange(next)
              }}
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
