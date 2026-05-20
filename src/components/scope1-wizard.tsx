'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Download,
  Factory,
  FileJson,
  FileSpreadsheet,
  FileText,
  Flame,
  Info,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
  Truck,
  Wind,
  X,
} from 'lucide-react'

import type {
  CalculationResult,
  FactorSnapshot,
  FuelCombustionMethod,
  FuelEntry,
  FugitiveEntry,
  InputPayload,
  MobileCombustionMethod,
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
  // Heidelberg / Cemex / Holcim style alternative fuels
  'meat_bone_meal',
  'dried_sewage_sludge',
  'solvents',
  'agricultural_residue',
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

function sampleBharatCement(): InputPayload {
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
      inventoryVersion: 'SAMPLE_V1',
      gwpSet: 'AR6',
    },
    organization: {
      name: 'Bharat Cement Ltd (sample)',
      country: 'IN',
      contactName: 'Anita Sharma',
      contactEmail: 'anita.sharma@bharatcement.example',
      contactPhone: '+91 98000 00000',
      contactRole: 'Head of Sustainability',
    },
    facility: { name: 'Plant 1 — Rajasthan', facilityType: 'INTEGRATED_CEMENT', state: 'Rajasthan' },
    organizationBoundary: {
      boundaryMethod: 'OPERATIONAL_CONTROL',
      ownershipSharePercent: 100,
      consolidationPercent: 100,
    },
    sector: { sectorCode: 'CEMENT' },
    methodSelections: {
      processEmissionMethod: 'CSI_CLINKER_BASED',
      clinkerEmissionFactorMethod: 'CSI_DEFAULT_525',
      dustMethod: 'IPCC_2_PERCENT_FALLBACK',
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
      production: {
        clinkerProducedTonnes: 1_200_000,
        cementProducedTonnes: 1_800_000,
        cementitiousProductTonnes: 1_900_000,
      },
      clinkerChemistry: { caoPercent: null, caoNonCarbonatePercent: null, mgoPercent: null, mgoNonCarbonatePercent: null },
      dust: { ckdLeavingKilnTonnes: null, ckdCalcinationRate: null, bypassDustLeavingKilnTonnes: null, bypassDustCalcinationRate: null },
      rawMeal: { rawMealToClinkerRatio: null, tocFraction: null },
      kilnFuels: [
        { id: 'k1', label: 'Kiln petcoke', fuelCode: 'petcoke', category: 'CONVENTIONAL_FOSSIL', quantity: 110_000, quantityUnit: 'tonne' },
        { id: 'k2', label: 'Kiln coal', fuelCode: 'coal_bituminous', category: 'CONVENTIONAL_FOSSIL', quantity: 95_000, quantityUnit: 'tonne' },
        { id: 'k3', label: 'Kiln tyres (alt fuel)', fuelCode: 'tyres', category: 'MIXED', quantity: 8_000, quantityUnit: 'tonne' },
      ],
      nonKilnFuels: [
        { id: 'n1', label: 'DG set diesel', fuelCode: 'diesel', category: 'CONVENTIONAL_FOSSIL', quantity: 250_000, quantityUnit: 'L' },
      ],
      mobile: [
        { id: 'm1', label: 'Haul trucks & loaders', ownership: 'OWNED_CONTROLLED', fuelCode: 'diesel', quantity: 480_000, quantityUnit: 'L' },
      ],
      fugitive: [
        { id: 'g1', label: 'Plant AC / chillers', gasCode: 'r410a', leakedKg: 350 },
        { id: 'g2', label: 'HV switchgear', gasCode: 'sf6', leakedKg: 12 },
      ],
      purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null },
      boughtClinker: { externalClinkerBoughtTonnes: null, externalClinkerSoldTonnes: null },
      emissionRights: { acquiredTonnes: null },
      usEpaFallback: { cementProducedTonnes: null, clinkerToCementRatio: null, clinkerEfTco2PerTonne: null },
    },
    factorOverrides: {},
  }
}

function emptyPayload(): InputPayload {
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
      inventoryVersion: 'DRAFT_V1',
      gwpSet: 'AR6',
    },
    organization: { name: '', country: 'IN', contactName: '', contactEmail: '', contactPhone: '', contactRole: '' },
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

function fuelBadge(category: FuelEntry['category']) {
  if (category === 'BIOMASS')
    return <span className="entry-badge entry-badge-memo">Biomass memo (excluded)</span>
  if (category === 'MIXED')
    return <span className="entry-badge entry-badge-mixed">Gross Scope 1 + biomass memo</span>
  if (category === 'ALTERNATIVE_FOSSIL')
    return <span className="entry-badge entry-badge-s1">Gross Scope 1 (alt fossil)</span>
  return <span className="entry-badge entry-badge-s1">Gross Scope 1</span>
}
function mobileBadge(ownership: MobileEntry['ownership']) {
  return ownership === 'OWNED_CONTROLLED' ? (
    <span className="entry-badge entry-badge-s1">Gross Scope 1</span>
  ) : (
    <span className="entry-badge entry-badge-excl">Excluded (third-party)</span>
  )
}
const FUGITIVE_BADGE = <span className="entry-badge entry-badge-s1">Gross Scope 1 (CO2e)</span>

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
  const [step2Tried, setStep2Tried] = useState(false)
  const [step3Tried, setStep3Tried] = useState(false)
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

  async function loadSample() {
    const sample = sampleBharatCement()
    setP(sample)
    setBusy(true)
    try {
      const r = await fetch('/api/v1/calculations/cement/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sample),
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

  // ---- step-level validation (gates both Continue buttons AND the top stepper)
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const orgValid =
    !!p.organization.name.trim() &&
    !!(p.organization.contactName ?? '').trim() &&
    emailRe.test((p.organization.contactEmail ?? '').trim())
  const facilityValid = !!p.facility.name.trim()
  const canReach = (target: number): boolean => {
    if (target <= 2) return true
    if (target === 3) return orgValid
    if (target === 4) return orgValid && facilityValid
    if (target === 5) return orgValid && facilityValid && !!result
    return false
  }
  function tryGoTo(target: number) {
    if (target === step) return
    if (target < step) {
      setStep(target)
      return
    }
    // forward jump - bounce to the first unsatisfied step
    if (target > 2 && !orgValid) {
      setStep2Tried(true)
      setStep(2)
      return
    }
    if (target > 3 && !facilityValid) {
      setStep3Tried(true)
      setStep(3)
      return
    }
    if (target === 5 && !result) {
      // can't view results without calculating first
      setStep(4)
      return
    }
    setStep(target)
  }

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
        {STEPS.map((label, i) => {
          const target = i + 1
          const reachable = canReach(target)
          const lockedTitle = !reachable
            ? target === 3
              ? 'Complete the required organisation fields first.'
              : target === 4
                ? 'Add a facility name first.'
                : target === 5
                  ? 'Click Calculate Scope 1 first to see the report.'
                  : ''
            : undefined
          return (
            <button
              key={label}
              className={step === target ? 'active' : step > target ? 'complete' : ''}
              onClick={() => tryGoTo(target)}
              disabled={!reachable && target !== step}
              title={lockedTitle}
              aria-disabled={!reachable && target !== step}
            >
              <span>{target}</span>
              <b>{label}</b>
            </button>
          )
        })}
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
            <div
              style={{
                alignItems: 'center',
                background: 'color-mix(in srgb, var(--purple) 6%, transparent)',
                border: '1px dashed color-mix(in srgb, var(--purple) 40%, transparent)',
                borderRadius: 12,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                justifyContent: 'space-between',
                margin: '14px 0 18px',
                padding: '12px 16px',
              }}
            >
              <div style={{ color: 'var(--ink)' }}>
                <b>First time here?</b>{' '}
                <span style={{ color: 'var(--muted)' }}>
                  Skip the data entry and see the calculator end‑to‑end with a sample cement plant.
                </span>
              </div>
              <button className="add-entry-btn" onClick={loadSample} disabled={busy}>
                {busy ? 'Loading…' : 'Try with sample data →'}
              </button>
            </div>
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

        {step === 2 && (() => {
          const o = p.organization
          const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((o.contactEmail ?? '').trim())
          const err = {
            name: !o.name.trim(),
            contactName: !(o.contactName ?? '').trim(),
            contactEmail: !(o.contactEmail ?? '').trim() || !emailOk,
          }
          const invalid = err.name || err.contactName || err.contactEmail
          const show = step2Tried
          return (
            <section className="step-page active">
              <h1 className="step-title">
                Organisation &amp; <em>boundary</em>
              </h1>
              <p className="step-sub">The consolidation boundary determines which sources fall inside Scope 1.</p>

              <div className="form-card">
                <h2>Company</h2>
                <label className="field">
                  Company name<span className="required-mark">*</span>
                  <input
                    value={o.name}
                    placeholder="e.g. Surya Cement Pvt Ltd"
                    onChange={(e) => patch((d) => (d.organization.name = e.target.value))}
                  />
                  {show && err.name && <div className="field-error">Company name is required.</div>}
                </label>
                <div className="field-row">
                  <label className="field">
                    Operating country
                    <select
                      value={o.country}
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
                {p.organizationBoundary.boundaryMethod === 'EQUITY_SHARE' ? (
                  <div className="field-row">
                    <NumField
                      label="Consolidation / equity share %"
                      step="0.01"
                      value={p.organizationBoundary.consolidationPercent}
                      onChange={(v) =>
                        patch((d) => {
                          const next = v ?? 100
                          d.organizationBoundary.consolidationPercent = next
                          d.organizationBoundary.ownershipSharePercent = next
                        })
                      }
                      hint="Your equity share in this facility — every Scope 1 bucket is scaled by this percentage"
                    />
                  </div>
                ) : (
                  <p className="form-sub" style={{ marginTop: 6 }}>
                    Under <b>{p.organizationBoundary.boundaryMethod.toLowerCase().replace('_', ' ')}</b>, 100% of the
                    facility's Scope 1 is reported. Switch to <b>Equity share</b> if you only consolidate your share.
                  </p>
                )}
              </div>

              <div className="form-card contact-card">
                <h2>Primary contact</h2>
                <p className="form-sub">
                  Who is preparing this inventory? We save these with the report so the right person can be
                  followed up with on queries or assurance.
                </p>
                <div className="field-row">
                  <label className="field">
                    Contact name<span className="required-mark">*</span>
                    <input
                      value={o.contactName ?? ''}
                      placeholder="e.g. Anita Sharma"
                      onChange={(e) => patch((d) => (d.organization.contactName = e.target.value))}
                    />
                    {show && err.contactName && <div className="field-error">Contact name is required.</div>}
                  </label>
                  <label className="field">
                    Work email<span className="required-mark">*</span>
                    <input
                      type="email"
                      value={o.contactEmail ?? ''}
                      placeholder="name@company.com"
                      onChange={(e) => patch((d) => (d.organization.contactEmail = e.target.value))}
                    />
                    {show && err.contactEmail && (
                      <div className="field-error">A valid work email is required.</div>
                    )}
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    Phone (with country code)
                    <input
                      value={o.contactPhone ?? ''}
                      placeholder="+91 98xxxxxxxx"
                      onChange={(e) => patch((d) => (d.organization.contactPhone = e.target.value))}
                    />
                  </label>
                  <label className="field">
                    Role / designation
                    <input
                      value={o.contactRole ?? ''}
                      placeholder="e.g. Head of Sustainability"
                      onChange={(e) => patch((d) => (d.organization.contactRole = e.target.value))}
                    />
                  </label>
                </div>
              </div>

              <div className="step-footer">
                <button className="btn ghost" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    setStep2Tried(true)
                    if (!invalid) setStep(3)
                  }}
                >
                  Continue
                </button>
              </div>
              {show && invalid && (
                <p className="field-error" style={{ marginTop: 6 }}>
                  Please complete the required fields above before continuing.
                </p>
              )}
            </section>
          )
        })()}

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
                  Facility name<span className="required-mark">*</span>
                  <input
                    value={p.facility.name}
                    placeholder="Plant 1 - Maharashtra"
                    onChange={(e) => patch((d) => (d.facility.name = e.target.value))}
                  />
                  {step3Tried && !facilityValid && (
                    <div className="field-error">Facility name is required.</div>
                  )}
                </label>
                <label className="field">
                  Facility type
                  <select
                    value={p.facility.facilityType}
                    onChange={(e) =>
                      patch((d) => {
                        const next = e.target.value as InputPayload['facility']['facilityType']
                        d.facility.facilityType = next
                        const reasons = { ...(d.sourceApplicability.exclusionReasons ?? {}) }
                        const kilnSources: Array<keyof typeof d.sourceApplicability> = [
                          'clinkerCalcination',
                          'bypassDust',
                          'ckd',
                          'rawMealToc',
                        ]
                        if (next === 'GRINDING_UNIT') {
                          for (const s of kilnSources) {
                            d.sourceApplicability[s] = false as never
                            reasons[s as string] = 'Grinding unit has no kiln'
                          }
                        } else {
                          for (const s of kilnSources) {
                            d.sourceApplicability[s] = true as never
                            if (reasons[s as string] === 'Grinding unit has no kiln') {
                              delete reasons[s as string]
                            }
                          }
                        }
                        d.sourceApplicability.exclusionReasons = reasons
                      })
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
              <button
                className="btn primary"
                onClick={() => {
                  setStep3Tried(true)
                  if (facilityValid) setStep(4)
                }}
              >
                Continue to activity data
              </button>
            </div>
            {step3Tried && !facilityValid && (
              <p className="field-error" style={{ marginTop: 6 }}>
                Please complete the required fields above before continuing.
              </p>
            )}
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
                  <FuelTable
                    title="Kiln fuels"
                    entries={ad.kilnFuels}
                    trace={trace}
                    method={ms.fuelCombustionMethod}
                    onChange={(rows) => patch((d) => (d.activityData.kilnFuels = rows))}
                  />
                  <FuelTable
                    title="Non-kiln fossil fuels"
                    entries={ad.nonKilnFuels}
                    trace={trace}
                    method={ms.fuelCombustionMethod}
                    onChange={(rows) => patch((d) => (d.activityData.nonKilnFuels = rows))}
                  />
                </>
              )}

              {cat === 'mobile' && (
                <MobileTable
                  entries={ad.mobile}
                  trace={trace}
                  method={ms.mobileCombustionMethod}
                  onChange={(rows) => patch((d) => (d.activityData.mobile = rows))}
                />
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
                  <p key={`e${i}`} className="form-sub text-error">
                    ⛔ {e.code} — {e.message}
                  </p>
                ))}
                {live.warnings.map((w, i) => (
                  <p key={`w${i}`} className="form-sub text-warn">
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
  const items: { k: string; v: number; unit?: string; headline?: boolean }[] = [
    { k: 'Gross Scope 1', v: live.scope1.grossScope1CO2Tonnes, unit: 'tCO2e', headline: true },
    { k: 'Process — clinker calcination', v: c.clinkerCalcinationCO2Tonnes },
    { k: 'Process — bypass dust', v: c.bypassDustCO2Tonnes },
    { k: 'Process — CKD', v: c.ckdCO2Tonnes },
    { k: 'Process — raw meal TOC', v: c.rawMealTocCO2Tonnes },
    { k: 'Conventional kiln fuel', v: c.conventionalKilnFuelCO2Tonnes },
    { k: 'Alt. fossil kiln fuel', v: c.alternativeFossilKilnFuelCO2Tonnes },
    { k: 'Non-kiln fossil', v: c.nonKilnFossilCO2Tonnes },
    { k: 'Mobile combustion', v: c.mobileCombustionCO2Tonnes },
    { k: 'Fugitive', v: c.fugitiveCO2eTonnes, unit: 'tCO2e' },
    { k: 'Biomass CO2 memo (excluded)', v: live.memoItems.biomassCO2Tonnes },
    { k: 'CH4 / N2O addendum (separate)', v: live.nonCsiCombustionGhg.ch4N2oCO2eTonnes, unit: 'tCO2e' },
  ]
  return (
    <div className="live-totals-strip">
      <h3>Live results — updates as you type</h3>
      <div className="live-totals-grid">
        {items.map(({ k, v, unit, headline }) => (
          <div key={k} className={headline ? 'live-cell live-cell-headline' : 'live-cell'}>
            <div className="live-cell-label">{k}</div>
            <div className="live-cell-value">
              {fmt.format(v)}
              <span className="live-cell-unit">{unit ?? 'tCO2'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------- Row preview & badge ---------------------------- */

function RowPreview({ co2 }: { co2: number | null }) {
  return (
    <span className="row-co2-chip" title="Live row CO2 (recalculated as you type)">
      {co2 === null ? '—' : fmt4.format(co2)} <small>tCO2e live</small>
    </span>
  )
}

/* ---------------------------------- Fuel ---------------------------------- */

function FuelTable({
  title,
  entries,
  trace,
  method,
  onChange,
}: {
  title: string
  entries: FuelEntry[]
  trace: TraceEntry[] | undefined
  method: FuelCombustionMethod
  onChange: (rows: FuelEntry[]) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
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
      {entries.length === 0 && <p className="form-sub">No fuel rows yet — click <b>Add fuel</b> to start.</p>}
      {entries.map((e, i) => {
        const rowCO2 = fuelRowCO2(trace, e.label)
        const hasOverride =
          e.lhvGjPerUnit != null ||
          e.co2EfKgPerGj != null ||
          e.ch4EfKgPerGj != null ||
          e.n2oEfKgPerGj != null ||
          e.biomassFraction != null ||
          !!e.overrideReason ||
          !!e.evidenceReference
        const isOpen = expanded.has(e.id) || hasOverride
        return (
          <div key={e.id} className="entry-card">
            <div className="entry-card-head">
              <div className="entry-card-head-left">
                <span className="entry-num">#{i + 1}</span>
                <span className="entry-title">{e.label || '(unnamed fuel)'}</span>
                {fuelBadge(e.category)}
                <RowPreview co2={rowCO2} />
              </div>
              <button className="entry-delete" onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
                <Trash2 size={13} /> Remove
              </button>
            </div>

            <div className="entry-card-section">
              <div className="entry-card-section-label">Basics</div>
              <div className="field-row">
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
              {method === 'CARBON_CONTENT_BASED' && (
                <div className="field-row">
                  <NumField
                    label="Carbon content fraction"
                    step="0.0001"
                    value={e.carbonContentFraction ?? null}
                    onChange={(v) => upd(e.id, (f) => (f.carbonContentFraction = v))}
                    hint="0–1; e.g. petcoke ≈ 0.85"
                  />
                </div>
              )}
              {method === 'DIRECT_MEASUREMENT' && (
                <div className="field-row">
                  <NumField
                    label="Direct measured CO2"
                    unit="tCO2"
                    value={e.directCo2Tonnes ?? null}
                    onChange={(v) => upd(e.id, (f) => (f.directCo2Tonnes = v))}
                    hint="From CEMS / metered emissions"
                  />
                </div>
              )}
            </div>

            <button className="advanced-toggle" onClick={() => toggle(e.id)}>
              {isOpen ? '▴' : '▾'} Advanced overrides {hasOverride && <span className="entry-badge entry-badge-mixed" style={{ marginLeft: 6 }}>customised</span>}
            </button>

            {isOpen && (
              <>
                <div className="entry-card-section">
                  <div className="entry-card-section-label">Factor overrides (blank = use library default)</div>
                  {method === 'ENERGY_BASED' && (
                    <>
                      <div className="field-row">
                        <NumField label="LHV override" unit="GJ/unit" step="0.0001" value={e.lhvGjPerUnit ?? null} onChange={(v) => upd(e.id, (f) => (f.lhvGjPerUnit = v))} />
                        <NumField label="CO2 EF override" unit="kg/GJ" step="0.01" value={e.co2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.co2EfKgPerGj = v))} />
                        <NumField label="Biomass fraction" step="0.01" value={e.biomassFraction ?? null} onChange={(v) => upd(e.id, (f) => (f.biomassFraction = v))} />
                      </div>
                      <div className="field-row">
                        <NumField label="CH4 EF override" unit="kg/GJ" step="0.0001" value={e.ch4EfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.ch4EfKgPerGj = v))} />
                        <NumField label="N2O EF override" unit="kg/GJ" step="0.0001" value={e.n2oEfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.n2oEfKgPerGj = v))} />
                      </div>
                    </>
                  )}
                  {method !== 'ENERGY_BASED' && (
                    <div className="field-row">
                      <NumField label="Biomass fraction" step="0.01" value={e.biomassFraction ?? null} onChange={(v) => upd(e.id, (f) => (f.biomassFraction = v))} hint="0–1" />
                    </div>
                  )}
                </div>
                <div className="entry-card-section">
                  <div className="entry-card-section-label">Audit</div>
                  <div className="field-row">
                    <label className="field" style={{ gridColumn: 'span 2' }}>
                      Override reason
                      <input
                        value={e.overrideReason ?? ''}
                        placeholder="Required when any factor on this row is overridden"
                        onChange={(ev) => upd(e.id, (f) => (f.overrideReason = ev.target.value))}
                      />
                    </label>
                    <label className="field">
                      Evidence reference
                      <input
                        value={e.evidenceReference ?? ''}
                        placeholder="e.g. ERP fuel report 2026"
                        onChange={(ev) => upd(e.id, (f) => (f.evidenceReference = ev.target.value))}
                      />
                    </label>
                  </div>
                </div>
              </>
            )}

            <div className="entry-formula">
              {method === 'ENERGY_BASED' && (
                <>Formula: quantity × LHV ÷ 1000 × CO2 EF = tCO2 &nbsp;·&nbsp; fossil part → Scope 1, biomass fraction → memo</>
              )}
              {method === 'CARBON_CONTENT_BASED' && (
                <>Formula: quantity (t) × carbon content fraction × (44/12) = tCO2</>
              )}
              {method === 'DIRECT_MEASUREMENT' && (
                <>
                  Formula: directly metered tCO2 (e.g. from CEMS). <b>Note:</b> the CH4/N2O addendum needs
                  a fuel energy basis and is therefore not computed for direct-measurement rows.
                </>
              )}
            </div>
          </div>
        )
      })}
      <button className="add-entry-btn" onClick={add}>
        <Plus size={15} /> Add fuel
      </button>
    </div>
  )
}

/* --------------------------------- Mobile -------------------------------- */

function MobileTable({
  entries,
  trace,
  method,
  onChange,
}: {
  entries: MobileEntry[]
  trace: TraceEntry[] | undefined
  method: MobileCombustionMethod
  onChange: (rows: MobileEntry[]) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
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
      {entries.length === 0 && (
        <p className="form-sub">No mobile equipment yet — click <b>Add mobile equipment</b> to start.</p>
      )}
      {entries.map((e, i) => {
        const rowCO2 = mobileRowCO2(trace, e.label)
        const isNonCanonical = e.fuelCode === 'diesel' && e.quantityUnit !== 'L'
        const hasOverride =
          e.lhvGjPerUnit != null ||
          e.co2EfKgPerGj != null ||
          e.ch4EfKgPerGj != null ||
          e.n2oEfKgPerGj != null ||
          !!e.overrideReason ||
          !!e.evidenceReference
        const isOpen = expanded.has(e.id) || hasOverride || isNonCanonical
        return (
          <div key={e.id} className="entry-card">
            <div className="entry-card-head">
              <div className="entry-card-head-left">
                <span className="entry-num">#{i + 1}</span>
                <span className="entry-title">{e.label || '(unnamed mobile)'}</span>
                {mobileBadge(e.ownership)}
                <RowPreview co2={rowCO2} />
              </div>
              <button className="entry-delete" onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
                <Trash2 size={13} /> Remove
              </button>
            </div>

            <div className="entry-card-section">
              <div className="entry-card-section-label">Basics</div>
              <div className="field-row">
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
              </div>
              <div className="field-row">
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
                {method === 'FUEL_BASED' && (
                  <NumField
                    label="Fuel quantity"
                    unit={e.quantityUnit}
                    value={e.quantity}
                    onChange={(v) => upd(e.id, (m) => (m.quantity = v))}
                  />
                )}
                {method === 'EQUIPMENT_HOURS_BASED' && (
                  <>
                    <NumField
                      label="Operating hours"
                      unit="hrs"
                      value={e.operatingHours ?? null}
                      onChange={(v) => upd(e.id, (m) => (m.operatingHours = v))}
                    />
                    <NumField
                      label="Consumption rate"
                      unit={`${e.quantityUnit}/hr`}
                      step="0.0001"
                      value={e.consumptionRatePerHour ?? null}
                      onChange={(v) => upd(e.id, (m) => (m.consumptionRatePerHour = v))}
                    />
                  </>
                )}
                {method === 'DISTANCE_BASED' && (
                  <>
                    <NumField
                      label="Distance"
                      unit="km"
                      value={e.distanceKm ?? null}
                      onChange={(v) => upd(e.id, (m) => (m.distanceKm = v))}
                    />
                    <NumField
                      label="Fuel per km"
                      unit={`${e.quantityUnit}/km`}
                      step="0.0001"
                      value={e.fuelPerKm ?? null}
                      onChange={(v) => upd(e.id, (m) => (m.fuelPerKm = v))}
                    />
                  </>
                )}
              </div>
              {isNonCanonical && (
                <div className="inline-warn">
                  Library LHV for diesel is per L. You picked <b>{e.quantityUnit}</b> — supply an LHV in GJ/
                  {e.quantityUnit} in <b>Advanced overrides</b> below.
                </div>
              )}
            </div>

            <button className="advanced-toggle" onClick={() => toggle(e.id)}>
              {isOpen ? '▴' : '▾'} Advanced overrides {hasOverride && <span className="entry-badge entry-badge-mixed" style={{ marginLeft: 6 }}>customised</span>}
            </button>

            {isOpen && (
              <>
                <div className="entry-card-section">
                  <div className="entry-card-section-label">Factor overrides (blank = library default)</div>
                  <div className="field-row">
                    <NumField label="LHV override" unit={`GJ/${e.quantityUnit}`} step="0.0001" value={e.lhvGjPerUnit ?? null} onChange={(v) => upd(e.id, (m) => (m.lhvGjPerUnit = v))} />
                    <NumField label="CO2 EF override" unit="kg/GJ" step="0.01" value={e.co2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (m) => (m.co2EfKgPerGj = v))} />
                  </div>
                  <div className="field-row">
                    <NumField label="CH4 EF override" unit="kg/GJ" step="0.0001" value={e.ch4EfKgPerGj ?? null} onChange={(v) => upd(e.id, (m) => (m.ch4EfKgPerGj = v))} />
                    <NumField label="N2O EF override" unit="kg/GJ" step="0.0001" value={e.n2oEfKgPerGj ?? null} onChange={(v) => upd(e.id, (m) => (m.n2oEfKgPerGj = v))} />
                  </div>
                </div>
                <div className="entry-card-section">
                  <div className="entry-card-section-label">Audit</div>
                  <div className="field-row">
                    <label className="field" style={{ gridColumn: 'span 2' }}>
                      Override reason
                      <input
                        value={e.overrideReason ?? ''}
                        placeholder="Required when LHV/EF differs from library default"
                        onChange={(ev) => upd(e.id, (m) => (m.overrideReason = ev.target.value))}
                      />
                    </label>
                    <label className="field">
                      Evidence reference
                      <input
                        value={e.evidenceReference ?? ''}
                        placeholder="e.g. fleet fuel card statement"
                        onChange={(ev) => upd(e.id, (m) => (m.evidenceReference = ev.target.value))}
                      />
                    </label>
                  </div>
                </div>
              </>
            )}

            <div className="entry-formula">
              {method === 'FUEL_BASED' && (
                <>Formula: Fuel qty ({e.quantityUnit}) × LHV (GJ/{e.quantityUnit}) ÷ 1000 × CO2 EF (kg/GJ) = tCO2</>
              )}
              {method === 'EQUIPMENT_HOURS_BASED' && (
                <>Formula: hrs × consumption ({e.quantityUnit}/hr) → fuel qty, then × LHV ÷ 1000 × CO2 EF = tCO2</>
              )}
              {method === 'DISTANCE_BASED' && (
                <>Formula: km × fuel-per-km ({e.quantityUnit}/km) → fuel qty, then × LHV ÷ 1000 × CO2 EF = tCO2</>
              )}
            </div>
          </div>
        )
      })}
      <button className="add-entry-btn" onClick={add}>
        <Plus size={15} /> Add mobile equipment
      </button>
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
      {entries.length === 0 && (
        <p className="form-sub">No fugitive sources yet — click <b>Add fugitive source</b> to start.</p>
      )}
      {entries.map((e, i) => {
        const rowCO2 = fugitiveRowCO2(trace, e.label)
        const libGwp = gwpByGas[e.gasCode]
        const mismatch = inlineLabelMismatch(e.label, e.gasCode)
        return (
          <div key={e.id} className="entry-card">
            <div className="entry-card-head">
              <div className="entry-card-head-left">
                <span className="entry-num">#{i + 1}</span>
                <span className="entry-title">{e.label || '(unnamed fugitive)'}</span>
                {FUGITIVE_BADGE}
                <RowPreview co2={rowCO2} />
              </div>
              <button className="entry-delete" onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
                <Trash2 size={13} /> Remove
              </button>
            </div>

            <div className="entry-card-section">
              <div className="entry-card-section-label">Basics</div>
              <div className="field-row">
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
            </div>

            <div className="entry-card-section">
              <div className="entry-card-section-label">Audit</div>
              <div className="field-row">
                <label className="field" style={{ gridColumn: 'span 2' }}>
                  GWP override reason
                  <input
                    value={e.overrideReason ?? ''}
                    placeholder="Required when a GWP override is supplied (e.g. supplier blend GWP)"
                    onChange={(ev) => upd(e.id, (g) => (g.overrideReason = ev.target.value))}
                  />
                </label>
                <label className="field">
                  Evidence reference
                  <input
                    value={e.evidenceReference ?? ''}
                    placeholder="e.g. AMC service report / refrigerant log"
                    onChange={(ev) => upd(e.id, (g) => (g.evidenceReference = ev.target.value))}
                  />
                </label>
              </div>
            </div>

            {mismatch && (
              <div className="inline-warn">
                ⚠ Label mentions <b>{mismatch.toUpperCase()}</b> but the selected gas is{' '}
                <b>{e.gasCode.toUpperCase()}</b>. This can cause a major GWP error — please confirm.
              </div>
            )}

            <div className="entry-formula">Formula: leaked kg × GWP ÷ 1000 = tCO2e</div>
          </div>
        )
      })}
      <button className="add-entry-btn" onClick={add}>
        <Plus size={15} /> Add fugitive source
      </button>
    </div>
  )
}

/* ------------------------------ Override panel --------------------------- */

/* ------------------------------- Modal ----------------------------------- */

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="modal-ok" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

/* ----------------------- Customise factors (overrides) ------------------- */

function OverridePanel({
  factors,
  overrides,
  onChange,
}: {
  factors: { factorCode: string; factorName: string; value: number; unit: string; source: string }[]
  overrides: InputPayload['factorOverrides']
  onChange: (o: InputPayload['factorOverrides']) => void
}) {
  const [query, setQuery] = useState('')
  const [onlyOver, setOnlyOver] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const overrideCount = Object.keys(overrides).length
  const q = query.trim().toLowerCase()
  const visible = factors.filter((f) => {
    if (onlyOver && !overrides[f.factorCode]) return false
    if (!q) return true
    return (
      f.factorName.toLowerCase().includes(q) ||
      f.factorCode.toLowerCase().includes(q) ||
      f.source.toLowerCase().includes(q)
    )
  })

  function setOverride(code: string, value: Num, existingReason: string) {
    const next = { ...overrides }
    if (value === null) {
      delete next[code]
    } else {
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
  function clearOverride(code: string) {
    const next = { ...overrides }
    delete next[code]
    onChange(next)
  }
  function setReason(code: string, reason: string) {
    const next = { ...overrides }
    if (next[code]) next[code] = { ...next[code], reason }
    onChange(next)
  }

  return (
    <div className="form-card">
      <h2 style={{ display: 'inline-flex', alignItems: 'center' }}>
        Customise factors
        <button
          className="info-btn"
          aria-label="About customising factors"
          title="Why this exists & when to use it"
          onClick={() => setInfoOpen(true)}
        >
          <Info size={12} />
        </button>
      </h2>
      <div className="customise-meta">
        <span className="customise-meta-pill muted">{factors.length} factors in library</span>
        {overrideCount > 0 ? (
          <span className="customise-meta-pill">
            {overrideCount} customised
          </span>
        ) : null}
      </div>
      <p className="form-sub" style={{ marginTop: 8 }}>
        Replace a library default with plant- or supplier-specific data. The override value and reason are recorded in
        the report&apos;s factor snapshot.
      </p>

      <div className="customise-toolbar">
        <div
          style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', minWidth: 200 }}
        >
          <Search size={13} style={{ position: 'absolute', left: 12, color: 'var(--muted)' }} />
          <input
            className="customise-search"
            style={{ paddingLeft: 32 }}
            placeholder="Search factors by name, code, or source…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className={`customise-filter ${onlyOver ? 'active' : ''}`}
          onClick={() => setOnlyOver((v) => !v)}
        >
          {onlyOver ? '● Only customised' : 'Only customised'}
        </button>
      </div>

      <div className="customise-list">
        {visible.length === 0 && (
          <div className="customise-empty">
            {onlyOver
              ? 'No customised factors yet.'
              : 'No factors match your search.'}
          </div>
        )}
        {visible.map((f) => {
          const ov = overrides[f.factorCode]
          const isOver = !!ov
          const isOpen = isOver || expanded.has(f.factorCode)
          return (
            <div key={f.factorCode} className={`customise-row ${isOver ? 'is-overridden' : ''}`}>
              <div className="customise-row-head">
                <div>
                  <div className="customise-row-name">{f.factorName}</div>
                  <div className="customise-row-meta">
                    Default <b>{f.value}</b> {f.unit} · {f.source}
                  </div>
                </div>
                <div className="customise-row-actions">
                  {isOver ? (
                    <>
                      <span className="customise-row-state">CUSTOMISED → {ov.value}</span>
                      <button className="customise-reset" onClick={() => clearOverride(f.factorCode)}>
                        Reset
                      </button>
                    </>
                  ) : (
                    <button
                      className="customise-toggle"
                      onClick={() =>
                        setExpanded((s) => {
                          const n = new Set(s)
                          n.has(f.factorCode) ? n.delete(f.factorCode) : n.add(f.factorCode)
                          return n
                        })
                      }
                    >
                      {isOpen ? 'Cancel' : 'Override'}
                    </button>
                  )}
                </div>
              </div>
              {isOpen && (
                <div className="customise-row-body">
                  <div className="field-row">
                    <NumField
                      label="Override value"
                      unit={f.unit}
                      step="0.0001"
                      value={ov ? ov.value : null}
                      onChange={(v) => setOverride(f.factorCode, v, ov?.reason ?? '')}
                    />
                    <label className="field" style={{ gridColumn: 'span 2' }}>
                      Reason (recorded in the factor snapshot)
                      <input
                        value={ov?.reason ?? ''}
                        placeholder="e.g. Plant lab CaO 64.8%, certificate ref ABC/2026"
                        disabled={!ov}
                        onChange={(e) => setReason(f.factorCode, e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Modal open={infoOpen} title="About customising factors" onClose={() => setInfoOpen(false)}>
        <p>
          The factor library ships with internationally recognised defaults. Override one only when you hold
          higher-quality, plant- or supplier-specific data — and record the reason. Every change is preserved in the
          report&apos;s factor snapshot, so the inventory stays fully audit-traceable.
        </p>
        <h4>Recommended when</h4>
        <ul>
          <li>You have lab-measured plant chemistry, calorific values or carbon content (IPCC Tier 3 data).</li>
          <li>A supplier provides a verified emission factor or fuel composition.</li>
          <li>An updated official factor applies for the reporting year (e.g. a newer national grid EF).</li>
        </ul>
        <h4>Standards followed</h4>
        <ul>
          <li>GHG Protocol Corporate Standard — emission-factor selection and data quality.</li>
          <li>ISO 14064-1:2018 §8.2 — selecting and developing emission factors.</li>
          <li>IPCC 2006 Guidelines — Tier 1 / 2 / 3 data hierarchy.</li>
          <li>CSI Cement CO<sub>2</sub> Protocol v2 — plant-specific clinker chemistry where available.</li>
        </ul>
        <div className="modal-foot-note">
          <b>Avoid otherwise.</b> Library defaults are cited and defensible; replacing them without evidence weakens
          the inventory and may not pass third-party assurance.
        </div>
      </Modal>
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
            <p key={`e${i}`} className="form-sub text-error">
              ⛔ {e.code} — {e.message}
            </p>
          ))}
          {result.warnings.map((w, i) => (
            <p key={`w${i}`} className="form-sub text-warn">
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
