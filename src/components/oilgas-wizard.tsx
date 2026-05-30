'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Factory,
  FileJson,
  FileSpreadsheet,
  FileText,
  Flame,
  Fuel,
  Gauge,
  Hexagon,
  Moon,
  Plus,
  Snowflake,
  Sun,
  Trash2,
  Truck,
  Wind,
} from 'lucide-react'

import type {
  FuelCombustionMethod,
  FuelEntry,
  MobileCombustionMethod,
  MobileEntry,
  TraceEntry,
} from '@/lib/engine/types'
import type {
  FlareEntry,
  FugitiveComponentEntry,
  GasComposition,
  OilGasCalculationResult,
  OilGasGwpSet,
  OilGasInputPayload,
  ProcessEntry,
  RefrigerantEntry,
  ReportedEntry,
  VentEntry,
} from '@/lib/engine/oilgas'

type Num = number | null
type OgCat =
  | 'stationary'
  | 'mobile'
  | 'flaring'
  | 'venting'
  | 'fugitive'
  | 'refrigerants'
  | 'process'
  | 'reported'

const STEPS = ['Sector', 'Organisation', 'Facility & methods', 'Activity data', 'Review & report']

const FUEL_CODES = [
  'natural_gas',
  'refinery_fuel_gas',
  'diesel',
  'heavy_fuel_oil',
  'lpg',
  'petcoke',
  'coal_bituminous',
  'crude_oil',
  'motor_gasoline',
  'jet_kerosene',
  'biodiesel',
]
const MOBILE_FUEL_CODES = ['diesel', 'motor_gasoline', 'jet_kerosene', 'natural_gas', 'heavy_fuel_oil', 'lpg']
const GAS_CODES = ['r22', 'r32', 'r134a', 'r404a', 'r407c', 'r410a', 'r507a', 'r23']
const COMPONENT_CODES = [
  'valve_gas',
  'valve_light_liquid',
  'flange_connector',
  'pump_seal',
  'open_ended_line',
  'pressure_relief_valve',
  'compressor_seal',
]
const FLARE_TYPES = [
  'steam_assisted_lit',
  'air_assisted_lit',
  'enclosed_ground',
  'unassisted_lit',
  'smoking',
  'unstable',
  'unlit',
  'acid_gas',
  'emergency_relief',
]
const PROCESS_TYPES = ['SMR_HYDROGEN', 'FCC_REGEN', 'AMINE_ACID_GAS', 'GENERIC_EF', 'DIRECT_CO2'] as const

const CATEGORIES: { key: OgCat; label: string; icon: typeof Flame }[] = [
  { key: 'stationary', label: 'Stationary', icon: Gauge },
  { key: 'mobile', label: 'Mobile', icon: Truck },
  { key: 'flaring', label: 'Flaring', icon: Flame },
  { key: 'venting', label: 'Venting', icon: Wind },
  { key: 'fugitive', label: 'Fugitive', icon: Activity },
  { key: 'refrigerants', label: 'Refrigerants', icon: Snowflake },
  { key: 'process', label: 'Process', icon: Factory },
  { key: 'reported', label: 'Reported', icon: FileText },
]

const GWP_SETS: { key: OilGasGwpSet; label: string }[] = [
  { key: 'AR5_100', label: 'AR5·100' },
  { key: 'AR6_100', label: 'AR6·100' },
  { key: 'AR6_20', label: 'AR6·20' },
]

const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const fmt4 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

/** Shared column template for the by-category result table (label + 4 gases). */
const COL_GRID = '1.6fr 1fr 1fr 1fr 1fr'
const RECON_GRID = '1.4fr 1fr 1fr 0.8fr 0.9fr'

/**
 * Segment intensity benchmarks (research Appendix B — OGCI / IPIECA / IEA 2023
 * ranges). `p25` = P25-leader threshold; at-or-below it is "leader", up to
 * `typicalMax` is "typical", above is "high".
 */
const INTENSITY_BENCHMARKS: Record<string, { p25: number; typicalMax: number; rangeText: string }> = {
  co2ePerBoe: { p25: 12, typicalMax: 35, rangeText: 'industry 8–35 · leaders <12' },
  methaneIntensityPercent: { p25: 0.2, typicalMax: 1.5, rangeText: 'industry 0.05–1.5% · leaders <0.20%' },
  co2ePerBblCrude: { p25: 30, typicalMax: 65, rangeText: 'industry 25–65 · leaders <30' },
  co2ePerTonneLng: { p25: 0.25, typicalMax: 0.5, rangeText: 'industry 0.20–0.50 · leaders <0.25' },
  co2ePerMMscfThroughput: { p25: 1.0, typicalMax: 4.0, rangeText: 'industry 0.5–4.0 · leaders <1.0' },
}

function benchmarkTier(metric: string, value: number): { color: string; label: string; rangeText: string } | null {
  const b = INTENSITY_BENCHMARKS[metric]
  if (!b) return null
  if (value <= b.p25) return { color: '#2f6b4f', label: 'P25 leader', rangeText: b.rangeText }
  if (value <= b.typicalMax) return { color: '#9a6700', label: 'typical range', rangeText: b.rangeText }
  return { color: '#b3261e', label: 'above typical', rangeText: b.rangeText }
}

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id_${Math.random().toString(36).slice(2)}`)

function toNum(v: string): Num {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* ------------------------------- helpers --------------------------------- */

function NumField({
  label,
  value,
  onChange,
  unit,
  step = 'any',
  hint,
  span,
}: {
  label: string
  value: Num
  onChange: (v: Num) => void
  unit?: string
  step?: string
  hint?: string
  span?: number
}) {
  return (
    <label className="field" style={span ? { gridColumn: `span ${span}` } : undefined}>
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

const S1_BADGE = <span className="entry-badge entry-badge-s1">Gross Scope 1 (CO2e)</span>
function fuelBadge(category: FuelEntry['category']) {
  if (category === 'BIOMASS') return <span className="entry-badge entry-badge-memo">Biogenic memo (CO2 excluded)</span>
  if (category === 'MIXED') return <span className="entry-badge entry-badge-mixed">Scope 1 + biogenic memo</span>
  return <span className="entry-badge entry-badge-s1">Gross Scope 1</span>
}
function mobileBadge(ownership: MobileEntry['ownership']) {
  return ownership === 'OWNED_CONTROLLED' ? (
    <span className="entry-badge entry-badge-s1">Gross Scope 1</span>
  ) : (
    <span className="entry-badge entry-badge-excl">Excluded (third-party · Scope 3)</span>
  )
}

function traceOut(trace: TraceEntry[] | undefined, step: string): number | null {
  if (!trace) return null
  const t = trace.find((e) => e.step === step)
  return t ? t.outputTonnesCO2 : null
}

function RowPreview({ co2 }: { co2: number | null }) {
  return (
    <span className="row-co2-chip" title="Live row CO2e (recalculated as you type)">
      {co2 === null ? '—' : fmt4.format(co2)} <small>tCO2e live</small>
    </span>
  )
}

function compositionSum(c: GasComposition): number {
  return [c.ch4Percent, c.co2Percent, c.c2h6Percent, c.c3h8Percent, c.c4PlusPercent, c.n2Percent, c.h2sPercent].reduce<number>(
    (a, p) => a + (typeof p === 'number' ? p : 0),
    0,
  )
}

/* ------------------------------- payloads -------------------------------- */

function emptyOilGasPayload(): OilGasInputPayload {
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
      inventoryVersion: 'DRAFT_V1',
      gwpSet: 'AR6_100',
    },
    organization: { name: '', country: 'IN', contactName: '', contactEmail: '', contactPhone: '', contactRole: '' },
    facility: { name: '', segment: 'UPSTREAM', facilityType: 'UPSTREAM_ONSHORE', state: '' },
    organizationBoundary: { boundaryMethod: 'OPERATIONAL_CONTROL', ownershipSharePercent: 100, consolidationPercent: 100 },
    sector: { sectorCode: 'OIL_GAS' },
    methodSelections: {
      stationaryCombustionMethod: 'ENERGY_BASED',
      mobileCombustionMethod: 'FUEL_BASED',
      electricityMethod: 'LOCATION_BASED_SUPPORTING',
    },
    sourceApplicability: {
      stationaryCombustion: true,
      mobileCombustion: true,
      flaring: true,
      venting: true,
      fugitiveComponents: true,
      refrigerants: true,
      process: true,
      reported: true,
      // Purchased electricity is Scope 2 — out of scope for this Scope 1 calculator.
      purchasedElectricity: false,
      exclusionReasons: {
        purchasedElectricity: 'Scope 2 (purchased electricity) — not collected in this Scope 1 calculator',
      },
    },
    activityData: {
      production: {},
      stationaryCombustion: [],
      mobileCombustion: [],
      flaring: [],
      venting: [],
      fugitiveComponents: [],
      refrigerants: [],
      process: [],
      reported: [],
      purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null },
    },
    factorOverrides: {},
  }
}

function sampleUpstreamAsset(): OilGasInputPayload {
  const p = emptyOilGasPayload()
  p.calculationContext.inventoryVersion = 'SAMPLE_V1'
  p.organization = {
    name: 'Bharat E&P Ltd (sample)',
    country: 'IN',
    contactName: 'Rao Venkatesh',
    contactEmail: 'rao.v@bharatep.example',
    contactPhone: '+91 98000 00000',
    contactRole: 'Head of Carbon & Sustainability',
  }
  p.facility = { name: 'Mumbai High satellite block (sample)', segment: 'UPSTREAM', facilityType: 'UPSTREAM_OFFSHORE', state: 'Offshore — West Coast' }
  p.activityData.production = { boeProduced: 10_000_000, gasProductionMassTonnes: 900_000 }
  p.activityData.stationaryCombustion = [
    { id: uid(), label: 'Platform gas turbine', fuelCode: 'natural_gas', category: 'CONVENTIONAL_FOSSIL', quantity: 40_000_000, quantityUnit: 'Sm3' },
  ]
  p.activityData.mobileCombustion = [
    { id: uid(), label: 'Supply vessel diesel', ownership: 'OWNED_CONTROLLED', fuelCode: 'diesel', quantity: 1_200_000, quantityUnit: 'L' },
  ]
  p.activityData.flaring = [
    {
      id: uid(),
      label: 'Associated gas flare',
      flareType: 'steam_assisted_lit',
      operatingStatus: 'lit',
      flareVolumeSm3: 5_110_000,
      volumeBasis: 'METERED',
      composition: { ch4Percent: 78, co2Percent: 3, c2h6Percent: 12, c3h8Percent: 5, n2Percent: 2 },
      dreBasis: 'DEFAULT',
    },
  ]
  p.activityData.venting = [
    {
      id: uid(),
      label: 'High-bleed pneumatic controllers',
      eventType: 'DESIGNED',
      ventVolumeSm3: 6_825_500,
      composition: { ch4Percent: 95, co2Percent: 0, c2h6Percent: 3, c3h8Percent: 1, n2Percent: 1 },
    },
  ]
  p.activityData.fugitiveComponents = [
    { id: uid(), label: 'Valves (gas service)', componentCode: 'valve_gas', count: 4200, ldarMethod: 'TIER1_COUNT' },
    { id: uid(), label: 'Compressor seals', componentCode: 'compressor_seal', count: 28, ldarMethod: 'TIER1_COUNT' },
  ]
  p.activityData.refrigerants = [
    { id: uid(), label: 'Accommodation HVAC', gasCode: 'r134a', tier: 'TIER1_CAPACITY', chargeCapacityKg: 500, leakRatePercentYr: 10 },
  ]
  p.activityData.massBalance = {
    gasInSm3: 152_000_000,
    salesGasSm3: 138_000_000,
    fuelGasSm3: 6_200_000,
    flaredSm3: 5_110_000,
    ventedSm3: 6_825_500,
    fugitiveSm3: 950_000,
    inventoryChangeSm3: 0,
  }
  return p
}

/* ------------------------------ draft autosave --------------------------- */

const OG_DRAFT_KEY = 'sustally-oilgas-draft-v1'

function saveOilGasDraft(p: OilGasInputPayload) {
  try {
    localStorage.setItem(OG_DRAFT_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable — ignore */
  }
}

function loadOilGasDraft(): OilGasInputPayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(OG_DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (d?.sector?.sectorCode === 'OIL_GAS') return d as OilGasInputPayload
  } catch {
    /* corrupt draft — ignore */
  }
  return null
}

/** A draft is worth restoring only if the user actually entered something. */
function draftIsMeaningful(p: OilGasInputPayload): boolean {
  const a = p?.activityData
  return Boolean(
    p?.organization?.name?.trim() ||
      a?.stationaryCombustion?.length ||
      a?.mobileCombustion?.length ||
      a?.flaring?.length ||
      a?.venting?.length ||
      a?.fugitiveComponents?.length ||
      a?.refrigerants?.length ||
      a?.process?.length,
  )
}

/* ------------------------------ entry tables ----------------------------- */

function EntryShell({
  index,
  title,
  badge,
  co2,
  onRemove,
  children,
  formula,
  evidenceReference,
  notes,
  onEvidenceChange,
}: {
  index: number
  title: string
  badge: React.ReactNode
  co2: number | null
  onRemove: () => void
  children: React.ReactNode
  formula?: React.ReactNode
  evidenceReference?: string
  notes?: string
  onEvidenceChange?: (patch: { evidenceReference?: string; overrideReason?: string }) => void
}) {
  return (
    <div className="entry-card">
      <div className="entry-card-head">
        <div className="entry-card-head-left">
          <span className="entry-num">#{index + 1}</span>
          <span className="entry-title">{title}</span>
          {badge}
          <RowPreview co2={co2} />
        </div>
        <button className="entry-delete" onClick={onRemove}>
          <Trash2 size={13} /> Remove
        </button>
      </div>
      {children}
      {onEvidenceChange && (
        <details className="entry-evidence">
          <summary>Evidence &amp; notes</summary>
          <div className="field-row">
            <label className="field">
              Evidence reference
              <input
                value={evidenceReference ?? ''}
                placeholder="meter log · fuel invoice · lab gas assay · LDAR report"
                onChange={(e) => onEvidenceChange({ evidenceReference: e.target.value })}
              />
            </label>
            <label className="field">
              Notes / assumptions
              <input
                value={notes ?? ''}
                placeholder="assumptions, exclusions, or reason for any factor override"
                onChange={(e) => onEvidenceChange({ overrideReason: e.target.value })}
              />
            </label>
          </div>
        </details>
      )}
      {formula && <div className="entry-formula">{formula}</div>}
    </div>
  )
}

function StationaryTable({
  entries,
  trace,
  method,
  onChange,
}: {
  entries: FuelEntry[]
  trace: TraceEntry[] | undefined
  method: FuelCombustionMethod
  onChange: (rows: FuelEntry[]) => void
}) {
  const upd = (id: string, mut: (f: FuelEntry) => void) =>
    onChange(entries.map((e) => (e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e)))
  const add = () =>
    onChange([...entries, { id: uid(), label: 'Fired heater / turbine', fuelCode: 'natural_gas', category: 'CONVENTIONAL_FOSSIL', quantity: null, quantityUnit: 'Sm3' }])
  return (
    <div className="form-card">
      <h2>Stationary combustion</h2>
      <p className="form-sub">Boilers, fired heaters, gas turbines, engines. Fossil CO2 + CH4 + N2O are gross Scope 1; biogenic CO2 is a memo.</p>
      {entries.length === 0 && <p className="form-sub">No fuel rows yet — click <b>Add fuel</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell
          key={e.id}
          index={i}
          title={e.label || '(unnamed fuel)'}
          badge={fuelBadge(e.category)}
          co2={traceOut(trace, `Combustion CO2 - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference}
          notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>quantity × LHV ÷ 1000 × CO2 EF = tCO2 · fossil → Scope 1, biogenic → memo · CH4/N2O → Scope 1 via GWP</>}
        >
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Fuel
                <select value={e.fuelCode} onChange={(ev) => upd(e.id, (f) => (f.fuelCode = ev.target.value))}>
                  {FUEL_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field">Category
                <select value={e.category} onChange={(ev) => upd(e.id, (f) => (f.category = ev.target.value as FuelEntry['category']))}>
                  <option value="CONVENTIONAL_FOSSIL">Conventional fossil</option>
                  <option value="ALTERNATIVE_FOSSIL">Alternative fossil</option>
                  <option value="MIXED">Mixed (fossil + biomass)</option>
                  <option value="BIOMASS">Biomass</option>
                </select>
              </label>
              <label className="field">Unit
                <select value={e.quantityUnit} onChange={(ev) => upd(e.id, (f) => (f.quantityUnit = ev.target.value))}>
                  {['Sm3', 'tonne', 'L', 'kg'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            </div>
            <div className="field-row">
              <NumField label="Quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (f) => (f.quantity = v))} />
              {method === 'ENERGY_BASED' && (
                <>
                  <NumField label="LHV override" unit="GJ/unit" step="0.0001" value={e.lhvGjPerUnit ?? null} onChange={(v) => upd(e.id, (f) => (f.lhvGjPerUnit = v))} hint="blank = library default" />
                  <NumField label="CO2 EF override" unit="kg/GJ" step="0.01" value={e.co2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.co2EfKgPerGj = v))} hint="blank = library default" />
                </>
              )}
              {method === 'CARBON_CONTENT_BASED' && (
                <NumField label="Carbon content fraction" step="0.0001" value={e.carbonContentFraction ?? null} onChange={(v) => upd(e.id, (f) => (f.carbonContentFraction = v))} hint="0–1" />
              )}
              {method === 'DIRECT_MEASUREMENT' && (
                <NumField label="Direct measured CO2" unit="tCO2" value={e.directCo2Tonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.directCo2Tonnes = v))} hint="from CEMS" />
              )}
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add fuel</button>
    </div>
  )
}

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
  const upd = (id: string, mut: (m: MobileEntry) => void) =>
    onChange(entries.map((e) => (e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e)))
  const add = () =>
    onChange([...entries, { id: uid(), label: 'Vehicle / vessel', ownership: 'OWNED_CONTROLLED', fuelCode: 'diesel', quantity: null, quantityUnit: 'L' }])
  return (
    <div className="form-card">
      <h2>Mobile combustion</h2>
      <p className="form-sub">Fleet, supply vessels, helicopters, rig gensets. Owned/controlled = Scope 1; third-party = supporting Scope 3.</p>
      {entries.length === 0 && <p className="form-sub">No mobile rows yet — click <b>Add mobile</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell
          key={e.id}
          index={i}
          title={e.label || '(unnamed mobile)'}
          badge={mobileBadge(e.ownership)}
          co2={traceOut(trace, `Combustion CO2 - Mobile: ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference}
          notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
        >
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (m) => (m.label = ev.target.value))} /></label>
              <label className="field">Ownership
                <select value={e.ownership} onChange={(ev) => upd(e.id, (m) => (m.ownership = ev.target.value as MobileEntry['ownership']))}>
                  <option value="OWNED_CONTROLLED">Owned / controlled (Scope 1)</option>
                  <option value="THIRD_PARTY">Third-party (excluded)</option>
                </select>
              </label>
              <label className="field">Fuel
                <select value={e.fuelCode} onChange={(ev) => upd(e.id, (m) => (m.fuelCode = ev.target.value))}>
                  {MOBILE_FUEL_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div className="field-row">
              {method === 'FUEL_BASED' && (
                <>
                  <NumField label="Fuel quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (m) => (m.quantity = v))} />
                  <label className="field">Unit
                    <select value={e.quantityUnit} onChange={(ev) => upd(e.id, (m) => (m.quantityUnit = ev.target.value))}>
                      {['L', 'kg', 'tonne', 'Sm3'].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                </>
              )}
              {method === 'DISTANCE_BASED' && (
                <>
                  <NumField label="Distance" unit="km" value={e.distanceKm ?? null} onChange={(v) => upd(e.id, (m) => (m.distanceKm = v))} />
                  <NumField label="Fuel per km" unit={`${e.quantityUnit}/km`} step="0.0001" value={e.fuelPerKm ?? null} onChange={(v) => upd(e.id, (m) => (m.fuelPerKm = v))} />
                </>
              )}
              {method === 'EQUIPMENT_HOURS_BASED' && (
                <>
                  <NumField label="Operating hours" unit="h" value={e.operatingHours ?? null} onChange={(v) => upd(e.id, (m) => (m.operatingHours = v))} />
                  <NumField label="Consumption rate" unit={`${e.quantityUnit}/h`} step="0.001" value={e.consumptionRatePerHour ?? null} onChange={(v) => upd(e.id, (m) => (m.consumptionRatePerHour = v))} />
                </>
              )}
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add mobile</button>
    </div>
  )
}

function CompositionFields({ c, onChange }: { c: GasComposition; onChange: (mut: (g: GasComposition) => void) => void }) {
  const sum = compositionSum(c)
  const ok = Math.abs(sum - 100) <= 0.5
  const upd = (k: keyof GasComposition) => (v: Num) => onChange((g) => ((g[k] as Num) = v))
  return (
    <div className="entry-card-section">
      <div className="entry-card-section-label">Gas composition (mol %) — must sum to 100 ± 0.5</div>
      <div className="field-row three">
        <NumField label="CH4 %" step="0.01" value={c.ch4Percent} onChange={upd('ch4Percent')} />
        <NumField label="CO2 %" step="0.01" value={c.co2Percent} onChange={upd('co2Percent')} />
        <NumField label="C2H6 %" step="0.01" value={c.c2h6Percent ?? null} onChange={upd('c2h6Percent')} />
        <NumField label="C3H8 %" step="0.01" value={c.c3h8Percent ?? null} onChange={upd('c3h8Percent')} />
        <NumField label="C4+ %" step="0.01" value={c.c4PlusPercent ?? null} onChange={upd('c4PlusPercent')} />
        <NumField label="N2 %" step="0.01" value={c.n2Percent ?? null} onChange={upd('n2Percent')} />
      </div>
      <div className={ok ? 'form-sub' : 'field-error'} style={{ marginTop: 4 }}>
        Composition sum: {fmt.format(sum)}% {ok ? '✓' : '— adjust to 100 ± 0.5 (add N2/balance)'}
      </div>
    </div>
  )
}

function FlareTable({ entries, trace, onChange }: { entries: FlareEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: FlareEntry[]) => void }) {
  const upd = (id: string, mut: (f: FlareEntry) => void) =>
    onChange(entries.map((e) => (e.id === id ? (() => { const c = { ...e, composition: { ...e.composition } }; mut(c); return c })() : e)))
  const add = () =>
    onChange([...entries, { id: uid(), label: 'Flare', flareType: 'steam_assisted_lit', operatingStatus: 'lit', flareVolumeSm3: null, volumeBasis: 'METERED', composition: { ch4Percent: null, co2Percent: null }, dreBasis: 'DEFAULT' }])
  return (
    <div className="form-card">
      <h2>Flaring</h2>
      <p className="form-sub">Combustion CO2 + methane slip via DRE (default 98%, 0% if unlit → treated as venting). Inert CO2 in the gas passes through.</p>
      {entries.length === 0 && <p className="form-sub">No flares yet — click <b>Add flare</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed flare)'} badge={S1_BADGE} co2={traceOut(trace, `Flaring - ${e.label}`)} onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference}
          notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>CO2 = Σ(molfrac×nC)·molPerSm3·V·DRE·M_CO2 + inert CO2 · CH4 slip = CH4·V·(1−DRE)·ρ_CH4</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Flare type
                <select value={e.flareType} onChange={(ev) => upd(e.id, (f) => (f.flareType = ev.target.value as FlareEntry['flareType']))}>
                  {FLARE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <label className="field">Operating status
                <select value={e.operatingStatus} onChange={(ev) => upd(e.id, (f) => (f.operatingStatus = ev.target.value as FlareEntry['operatingStatus']))}>
                  {['lit', 'partially_lit', 'unlit', 'unknown'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
            </div>
            <div className="field-row">
              <NumField label="Flared volume" unit="Sm3" value={e.flareVolumeSm3} onChange={(v) => upd(e.id, (f) => (f.flareVolumeSm3 = v))} />
              <label className="field">Volume basis
                <select value={e.volumeBasis} onChange={(ev) => upd(e.id, (f) => (f.volumeBasis = ev.target.value as FlareEntry['volumeBasis']))}>
                  {['METERED', 'MATERIAL_BALANCE', 'ENGINEERING_ESTIMATE'].map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <label className="field">DRE basis
                <select value={e.dreBasis} onChange={(ev) => upd(e.id, (f) => (f.dreBasis = ev.target.value as FlareEntry['dreBasis']))}>
                  {['DEFAULT', 'MEASURED', 'ENGINEERING_ESTIMATE'].map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <NumField label="DRE override" step="0.01" value={e.dreValue ?? null} onChange={(v) => upd(e.id, (f) => (f.dreValue = v))} hint="0–1; blank = default by type" />
            </div>
          </div>
          <CompositionFields c={e.composition} onChange={(m) => upd(e.id, (f) => m(f.composition))} />
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add flare</button>
    </div>
  )
}

function VentTable({ entries, trace, onChange }: { entries: VentEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: VentEntry[]) => void }) {
  const upd = (id: string, mut: (v: VentEntry) => void) =>
    onChange(entries.map((e) => (e.id === id ? (() => { const c = { ...e, composition: { ...e.composition } }; mut(c); return c })() : e)))
  const add = () =>
    onChange([...entries, { id: uid(), label: 'Vent source', eventType: 'DESIGNED', ventVolumeSm3: null, composition: { ch4Percent: null, co2Percent: null } }])
  return (
    <div className="form-card">
      <h2>Venting</h2>
      <p className="form-sub">Blowdowns, dehydrator vents, pneumatic bleeds, tank flash. Methane-dominated; VRU capture reduces the released quantity.</p>
      {entries.length === 0 && <p className="form-sub">No vents yet — click <b>Add vent</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed vent)'} badge={S1_BADGE} co2={traceOut(trace, `Venting - ${e.label}`)} onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference}
          notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>released = ventVolume × molfrac × density × (1 − capture)</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (v) => (v.label = ev.target.value))} /></label>
              <label className="field">Event type
                <select value={e.eventType} onChange={(ev) => upd(e.id, (v) => (v.eventType = ev.target.value as VentEntry['eventType']))}>
                  <option value="DESIGNED">Designed (routine)</option>
                  <option value="ABNORMAL">Abnormal event</option>
                </select>
              </label>
              <NumField label="Vented volume" unit="Sm3" value={e.ventVolumeSm3} onChange={(v) => upd(e.id, (x) => (x.ventVolumeSm3 = v))} />
              <NumField label="VRU capture" step="0.01" value={e.captureFraction ?? null} onChange={(v) => upd(e.id, (x) => (x.captureFraction = v))} hint="0–1; blank = none" />
            </div>
          </div>
          <CompositionFields c={e.composition} onChange={(m) => upd(e.id, (v) => m(v.composition))} />
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add vent</button>
    </div>
  )
}

function FugitiveTable({ entries, trace, onChange }: { entries: FugitiveComponentEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: FugitiveComponentEntry[]) => void }) {
  const upd = (id: string, mut: (f: FugitiveComponentEntry) => void) =>
    onChange(entries.map((e) => (e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e)))
  const add = () =>
    onChange([...entries, { id: uid(), label: 'Valves (gas service)', componentCode: 'valve_gas', count: null, ldarMethod: 'TIER1_COUNT' }])
  return (
    <div className="form-card">
      <h2>Fugitive emissions (component count)</h2>
      <p className="form-sub">Tier 1 = count × EPA Subpart W leak factor × hours. Tier 1 often under-counts real methane 2–5× (super-emitters).</p>
      {entries.length === 0 && <p className="form-sub">No components yet — click <b>Add component set</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed component)'} badge={S1_BADGE} co2={traceOut(trace, `Fugitive (component-count) - ${e.label}`)} onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference}
          notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>count × leakFactor(kgCH4/hr) × hours → CH4 → CO2e</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Component
                <select value={e.componentCode} onChange={(ev) => upd(e.id, (f) => (f.componentCode = ev.target.value))}>
                  {COMPONENT_CODES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <label className="field">Method
                <select value={e.ldarMethod} onChange={(ev) => upd(e.id, (f) => (f.ldarMethod = ev.target.value as FugitiveComponentEntry['ldarMethod']))}>
                  <option value="TIER1_COUNT">Tier 1 — count × default EF</option>
                  <option value="TIER2_LDAR">Tier 2 — LDAR factor</option>
                  <option value="TIER3_MEASURED">Tier 3 — measured CH4</option>
                </select>
              </label>
            </div>
            <div className="field-row">
              {e.ldarMethod === 'TIER3_MEASURED' ? (
                <NumField label="Measured CH4" unit="kg" value={e.measuredCh4Kg ?? null} onChange={(v) => upd(e.id, (f) => (f.measuredCh4Kg = v))} span={2} />
              ) : (
                <>
                  <NumField label="Component count" value={e.count} onChange={(v) => upd(e.id, (f) => (f.count = v))} />
                  <NumField label="Operating hours/yr" value={e.operatingHoursYr ?? null} onChange={(v) => upd(e.id, (f) => (f.operatingHoursYr = v))} hint="blank = 8760" />
                  {e.ldarMethod === 'TIER2_LDAR' && (
                    <NumField label="Leak factor override" unit="kgCH4/hr" step="0.0001" value={e.efKgCh4PerHrOverride ?? null} onChange={(v) => upd(e.id, (f) => (f.efKgCh4PerHrOverride = v))} />
                  )}
                </>
              )}
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add component set</button>
    </div>
  )
}

function RefrigerantTable({ entries, trace, onChange }: { entries: RefrigerantEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: RefrigerantEntry[]) => void }) {
  const upd = (id: string, mut: (r: RefrigerantEntry) => void) =>
    onChange(entries.map((e) => (e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e)))
  const add = () =>
    onChange([...entries, { id: uid(), label: 'Chiller / HVAC', gasCode: 'r134a', tier: 'TIER1_CAPACITY', chargeCapacityKg: null, leakRatePercentYr: null }])
  return (
    <div className="form-card">
      <h2>Refrigerants</h2>
      <p className="form-sub">HFC leakage from chillers, LNG cold-boxes, HVAC. Scope 1 (not combustion). HFC GWPs use the 100-year basis.</p>
      {entries.length === 0 && <p className="form-sub">No refrigerants yet — click <b>Add refrigerant</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed refrigerant)'} badge={S1_BADGE} co2={traceOut(trace, `Refrigerant - ${e.label}`)} onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference}
          notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={e.tier === 'TIER1_CAPACITY' ? <>capacity × leakRate% × GWP / 1000</> : <>(purchases − disposals − Δinventory) × GWP / 1000</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
              <label className="field">Gas
                <select value={e.gasCode} onChange={(ev) => upd(e.id, (r) => (r.gasCode = ev.target.value))}>
                  {GAS_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field">Tier
                <select value={e.tier} onChange={(ev) => upd(e.id, (r) => (r.tier = ev.target.value as RefrigerantEntry['tier']))}>
                  <option value="TIER1_CAPACITY">Tier 1 — capacity × leak rate</option>
                  <option value="TIER2_MASS_BALANCE">Tier 2 — mass balance</option>
                </select>
              </label>
            </div>
            {e.tier === 'TIER1_CAPACITY' ? (
              <div className="field-row">
                <NumField label="Charge capacity" unit="kg" value={e.chargeCapacityKg ?? null} onChange={(v) => upd(e.id, (r) => (r.chargeCapacityKg = v))} />
                <NumField label="Leak rate" unit="%/yr" step="0.1" value={e.leakRatePercentYr ?? null} onChange={(v) => upd(e.id, (r) => (r.leakRatePercentYr = v))} />
                <NumField label="GWP override" value={e.gwpOverride ?? null} onChange={(v) => upd(e.id, (r) => (r.gwpOverride = v))} hint="blank = library" />
              </div>
            ) : (
              <div className="field-row">
                <NumField label="Purchases" unit="kg" value={e.purchasesKg ?? null} onChange={(v) => upd(e.id, (r) => (r.purchasesKg = v))} />
                <NumField label="Disposals" unit="kg" value={e.disposalsKg ?? null} onChange={(v) => upd(e.id, (r) => (r.disposalsKg = v))} />
                <NumField label="Δ inventory" unit="kg" value={e.inventoryChangeKg ?? null} onChange={(v) => upd(e.id, (r) => (r.inventoryChangeKg = v))} hint="closing − opening" />
                <NumField label="GWP override" value={e.gwpOverride ?? null} onChange={(v) => upd(e.id, (r) => (r.gwpOverride = v))} />
              </div>
            )}
            {e.gwpOverride != null && (
              <div className="field-row">
                <label className="field" style={{ gridColumn: 'span 2' }}>Override reason
                  <input value={e.overrideReason ?? ''} placeholder="Required when GWP is overridden (e.g. blend GWP)" onChange={(ev) => upd(e.id, (r) => (r.overrideReason = ev.target.value))} />
                </label>
              </div>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add refrigerant</button>
    </div>
  )
}

function ProcessTable({ entries, trace, onChange }: { entries: ProcessEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: ProcessEntry[]) => void }) {
  const upd = (id: string, mut: (p: ProcessEntry) => void) =>
    onChange(entries.map((e) => (e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e)))
  const add = () =>
    onChange([...entries, { id: uid(), label: 'Process unit', processType: 'SMR_HYDROGEN' }])
  return (
    <div className="form-card">
      <h2>Process emissions</h2>
      <p className="form-sub">Non-combustion CO2: SMR hydrogen, FCC catalyst regeneration, amine acid-gas vent, or a direct/generic factor.</p>
      {entries.length === 0 && <p className="form-sub">No process units yet — click <b>Add process unit</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed process)'} badge={S1_BADGE} co2={traceOut(trace, `Process - ${e.label}`)} onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference}
          notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (p) => (p.label = ev.target.value))} /></label>
              <label className="field">Process type
                <select value={e.processType} onChange={(ev) => upd(e.id, (p) => (p.processType = ev.target.value as ProcessEntry['processType']))}>
                  {PROCESS_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
            </div>
            {e.processType === 'SMR_HYDROGEN' && (
              <div className="field-row">
                <NumField label="Hydrogen produced" unit="t" value={e.hydrogenProducedTonnes ?? null} onChange={(v) => upd(e.id, (p) => (p.hydrogenProducedTonnes = v))} hint="benchmark route" />
                <NumField label="EF override" unit="tCO2/tH2" step="0.01" value={e.smrEfTco2PerTonneH2 ?? null} onChange={(v) => upd(e.id, (p) => (p.smrEfTco2PerTonneH2 = v))} hint="blank = 7.69 grey" />
                <NumField label="…or feedstock gas" unit="Sm3" value={e.feedstockGasSm3 ?? null} onChange={(v) => upd(e.id, (p) => (p.feedstockGasSm3 = v))} hint="stoichiometric route" />
                <NumField label="Feedstock CH4 frac" step="0.01" value={e.feedstockCh4Fraction ?? null} onChange={(v) => upd(e.id, (p) => (p.feedstockCh4Fraction = v))} hint="0–1" />
              </div>
            )}
            {e.processType === 'FCC_REGEN' && (
              <div className="field-row">
                <NumField label="Coke burned" unit="t" value={e.cokeBurnedTonnes ?? null} onChange={(v) => upd(e.id, (p) => (p.cokeBurnedTonnes = v))} />
                <NumField label="Coke carbon fraction" step="0.01" value={e.cokeCarbonFraction ?? null} onChange={(v) => upd(e.id, (p) => (p.cokeCarbonFraction = v))} hint="blank = 0.94" />
              </div>
            )}
            {e.processType === 'AMINE_ACID_GAS' && (
              <div className="field-row">
                <NumField label="Acid gas volume" unit="Sm3" value={e.acidGasVolumeSm3 ?? null} onChange={(v) => upd(e.id, (p) => (p.acidGasVolumeSm3 = v))} />
                <NumField label="CO2 fraction" step="0.01" value={e.acidGasCo2Fraction ?? null} onChange={(v) => upd(e.id, (p) => (p.acidGasCo2Fraction = v))} hint="0–1" />
                <NumField label="Capture fraction" step="0.01" value={e.co2CaptureFraction ?? null} onChange={(v) => upd(e.id, (p) => (p.co2CaptureFraction = v))} hint="0–1; CCS permanence not modelled" />
              </div>
            )}
            {e.processType === 'GENERIC_EF' && (
              <div className="field-row">
                <NumField label="Throughput" value={e.throughput ?? null} onChange={(v) => upd(e.id, (p) => (p.throughput = v))} />
                <NumField label="EF" unit="tCO2/unit" step="0.0001" value={e.efTco2PerUnit ?? null} onChange={(v) => upd(e.id, (p) => (p.efTco2PerUnit = v))} />
              </div>
            )}
            {e.processType === 'DIRECT_CO2' && (
              <div className="field-row">
                <NumField label="Direct CO2" unit="tCO2" value={e.directCo2Tonnes ?? null} onChange={(v) => upd(e.id, (p) => (p.directCo2Tonnes = v))} />
              </div>
            )}
            <div className="field-row">
              <NumField label="Process CH4 (optional)" unit="t" value={e.ch4Tonnes ?? null} onChange={(v) => upd(e.id, (p) => (p.ch4Tonnes = v))} />
              <NumField label="Process N2O (optional)" unit="t" value={e.n2oTonnes ?? null} onChange={(v) => upd(e.id, (p) => (p.n2oTonnes = v))} />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add process unit</button>
    </div>
  )
}

function ReportedTable({ entries, trace, onChange }: { entries: ReportedEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: ReportedEntry[]) => void }) {
  const upd = (id: string, mut: (r: ReportedEntry) => void) =>
    onChange(entries.map((e) => (e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e)))
  const add = () => onChange([...entries, { id: uid(), label: 'Disclosed source', basis: 'REPORTED' }])
  return (
    <div className="form-card">
      <h2>Reported / direct emissions</h2>
      <p className="form-sub">
        For public-disclosure or head-office data: enter a disclosed <b>total CO2e</b> (or by-gas masses) directly,
        tagged by source and basis. Use this when activity inputs (fuel volumes, composition, DRE, gas split…) aren&apos;t
        available. These sit in their own &quot;reported&quot; bucket, never mixed with modelled bottom-up sources.
      </p>
      {entries.length === 0 && <p className="form-sub">No reported figures yet — click <b>Add reported figure</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Reported / direct - ${e.label}`)} onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          formula={<>direct disclosed CO2e, or CO2 + CH4·GWP + N2O·GWP from reported gas masses</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
              <label className="field">Source / category tag<input value={e.categoryTag ?? ''} placeholder="e.g. flaring · venting+process" onChange={(ev) => upd(e.id, (r) => (r.categoryTag = ev.target.value))} /></label>
              <label className="field">Basis
                <select value={e.basis} onChange={(ev) => upd(e.id, (r) => (r.basis = ev.target.value as ReportedEntry['basis']))}>
                  {(['MEASURED', 'ESTIMATED', 'INFERRED', 'REPORTED', 'RESIDUAL'] as const).map((b) => <option key={b} value={b}>{b.toLowerCase()}</option>)}
                </select>
              </label>
            </div>
            <div className="field-row">
              <NumField label="Total CO2e" unit="tCO2e" value={e.co2eTonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.co2eTonnes = v))} hint="authoritative if set" />
              <NumField label="…or CO2" unit="t" value={e.co2Tonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.co2Tonnes = v))} />
              <NumField label="CH4" unit="t" value={e.ch4Tonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.ch4Tonnes = v))} />
              <NumField label="N2O" unit="t" value={e.n2oTonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.n2oTonnes = v))} />
            </div>
            <div className="field-row">
              <label className="field" style={{ gridColumn: 'span 2' }}>Source / disclosure reference<input value={e.source ?? ''} placeholder="e.g. Shell Sustainability Report 2025, p.42 / URL" onChange={(ev) => upd(e.id, (r) => (r.source = ev.target.value))} /></label>
              <label className="field" style={{ gridColumn: 'span 2' }}>Note / assumption<input value={e.note ?? ''} placeholder="mapping assumption, exclusions, etc." onChange={(ev) => upd(e.id, (r) => (r.note = ev.target.value))} /></label>
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add reported figure</button>
    </div>
  )
}

/* ------------------------------ live totals ------------------------------ */

function LiveTotals({ live }: { live: OilGasCalculationResult | null }) {
  if (!live) return null
  const s = live.scope1
  const items: { k: string; v: number; unit?: string; headline?: boolean }[] = [
    { k: 'Gross Scope 1', v: s.grossScope1CO2eTonnes, unit: 'tCO2e', headline: true },
    { k: 'CO2', v: s.byGas.co2Tonnes, unit: 'tCO2' },
    { k: 'CH4 (as CO2e)', v: s.byGas.ch4CO2eTonnes, unit: 'tCO2e' },
    { k: 'N2O (as CO2e)', v: s.byGas.n2oCO2eTonnes, unit: 'tCO2e' },
    { k: 'Refrigerants', v: s.byGas.refrigerantCO2eTonnes, unit: 'tCO2e' },
    { k: 'Biogenic memo', v: live.memoItems.biogenicCO2Tonnes, unit: 'tCO2' },
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
              <span className="live-cell-unit">{unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IntensityCard({ label, metric, value, unit, percent }: { label: string; metric: string; value: number; unit: string; percent?: boolean }) {
  const b = benchmarkTier(metric, value)
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>
        {fmt.format(value)}
        {percent ? '%' : ''}
      </strong>
      <small>{unit}</small>
      {b && (
        <div style={{ marginTop: 8 }}>
          <span
            style={{
              alignItems: 'center',
              background: `color-mix(in srgb, ${b.color} 16%, transparent)`,
              borderRadius: 999,
              color: b.color,
              display: 'inline-flex',
              fontSize: 10.5,
              fontWeight: 800,
              padding: '3px 9px',
            }}
          >
            {b.label}
          </span>
          <div style={{ color: 'var(--ink-mute)', fontSize: 10, marginTop: 4 }}>{b.rangeText}</div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------- wizard -------------------------------- */

export function OilGasWizard({ onSwitchSector }: { onSwitchSector?: (s: 'cement' | 'oil_gas' | 'pulp_paper' | 'iron_steel') => void }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [step, setStep] = useState(1)
  const [cat, setCat] = useState<OgCat>('stationary')
  const [p, setP] = useState<OilGasInputPayload>(emptyOilGasPayload())
  const [result, setResult] = useState<OilGasCalculationResult | null>(null)
  const [live, setLive] = useState<OilGasCalculationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [step2Tried, setStep2Tried] = useState(false)
  const [step3Tried, setStep3Tried] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Restore an autosaved draft after mount (kept out of the initial useState so
  // there's no SSR/hydration mismatch on theme- or GWP-dependent header chrome).
  useEffect(() => {
    try {
      const d = loadOilGasDraft()
      if (d && draftIsMeaningful(d)) {
        setP(d)
        setHasDraft(true)
      }
    } catch {
      /* corrupt/partial draft — ignore rather than crash the app */
    }
  }, [])

  useEffect(() => {
    if (step < 4) return
    const t = setTimeout(() => {
      fetch('/api/v1/calculations/oil-gas/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
        .then((r) => r.json())
        .then((d) => setLive(d.result as OilGasCalculationResult))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [p, step])

  function patch(mut: (draft: OilGasInputPayload) => void) {
    setP((prev) => {
      const next: OilGasInputPayload = structuredClone(prev)
      mut(next)
      saveOilGasDraft(next)
      return next
    })
  }

  function startFresh() {
    try {
      localStorage.removeItem(OG_DRAFT_KEY)
    } catch {
      /* ignore */
    }
    setP(emptyOilGasPayload())
    setHasDraft(false)
    setResult(null)
    setLive(null)
    setStep(1)
  }

  function importJson(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        // Accept a raw payload, or an export wrapper { inputPayload } / { input }.
        const payload = parsed?.inputPayload ?? parsed?.input ?? parsed
        if (payload?.sector?.sectorCode !== 'OIL_GAS') {
          setImportError('That file is not an Oil & Gas payload (expected sector OIL_GAS).')
          return
        }
        if (!payload.activityData || !payload.calculationContext) {
          setImportError('That file does not look like a calculator payload (missing activityData / calculationContext).')
          return
        }
        // Merge onto the empty template so any missing field gets a safe default
        // (a partial payload must never load a half-built, crash-prone state).
        const base = emptyOilGasPayload()
        const merged: OilGasInputPayload = {
          ...base,
          ...payload,
          calculationContext: { ...base.calculationContext, ...payload.calculationContext },
          organization: { ...base.organization, ...payload.organization },
          facility: { ...base.facility, ...payload.facility },
          organizationBoundary: { ...base.organizationBoundary, ...payload.organizationBoundary },
          methodSelections: { ...base.methodSelections, ...payload.methodSelections },
          sourceApplicability: { ...base.sourceApplicability, ...payload.sourceApplicability },
          activityData: { ...base.activityData, ...payload.activityData },
        }
        setImportError(null)
        setP(merged)
        saveOilGasDraft(merged)
        setHasDraft(true)
        setResult(null)
        setLive(null)
        setStep(4)
      } catch {
        setImportError('Could not parse that file as JSON.')
      }
    }
    reader.readAsText(file)
  }

  async function runCalculate(save: boolean) {
    setBusy(true)
    try {
      const r = await fetch(`/api/v1/calculations/oil-gas/calculate${save ? '?save=true' : ''}`, {
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
    const sample = sampleUpstreamAsset()
    setP(sample)
    saveOilGasDraft(sample)
    setHasDraft(true)
    setBusy(true)
    try {
      const r = await fetch('/api/v1/calculations/oil-gas/calculate', {
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
    const r = await fetch('/api/v1/calculations/oil-gas/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: p, format }),
    })
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scope1-oilgas-${p.facility.name || 'facility'}-FY${p.calculationContext.reportingPeriod.year}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const ad = p.activityData
  const trace = live?.calculationTrace
  const counts: Record<OgCat, number> = {
    stationary: ad.stationaryCombustion.length,
    mobile: ad.mobileCombustion.length,
    flaring: ad.flaring.length,
    venting: ad.venting.length,
    fugitive: ad.fugitiveComponents.length,
    refrigerants: ad.refrigerants.length,
    process: ad.process.length,
    reported: ad.reported.length,
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const orgValid =
    !!p.organization.name.trim() &&
    !!(p.organization.contactName ?? '').trim() &&
    emailRe.test((p.organization.contactEmail ?? '').trim())
  const facilityValid = !!p.facility.name.trim() && !!p.facility.segment
  const canReach = (target: number): boolean => {
    if (target <= 2) return true
    if (target === 3) return orgValid
    if (target === 4) return orgValid && facilityValid
    if (target === 5) return orgValid && facilityValid && !!result
    return false
  }
  function tryGoTo(target: number) {
    if (target === step) return
    if (target < step) return setStep(target)
    if (target > 2 && !orgValid) { setStep2Tried(true); return setStep(2) }
    if (target > 3 && !facilityValid) { setStep3Tried(true); return setStep(3) }
    if (target === 5 && !result) return setStep(4)
    setStep(target)
  }

  return (
    <main className={theme === 'dark' ? 'wizard-app dark' : 'wizard-app'}>
      <header className="wizard-header">
        <div className="wizard-header-inner">
          <button className="wizard-brand" onClick={() => setStep(1)} title="Calculator home" aria-label="Back to calculator home">
            <img className="brand-logo" src={theme === 'dark' ? '/brand/typemark-white.svg' : '/brand/typemark-black.svg'} alt="Sustally" />
            <span className="brand-divider" />
            <span className="brand-label">
              <span className="brand-eyebrow">Scope 1 Calculator</span>
              <span className="brand-product">Oil &amp; Gas</span>
            </span>
          </button>
          <div className="wizard-actions">
            <div className="gwp-switch">
              <span>GWP</span>
              {GWP_SETS.map((g) => (
                <button key={g.key} className={p.calculationContext.gwpSet === g.key ? 'active' : ''} onClick={() => patch((d) => (d.calculationContext.gwpSet = g.key))}>
                  {g.label}
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
          return (
            <button
              key={label}
              className={step === target ? 'active' : step > target ? 'complete' : ''}
              onClick={() => tryGoTo(target)}
              disabled={!reachable && target !== step}
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
            <h1 className="step-title">What <em>sector</em> are you in?</h1>
            <p className="step-sub">Oil &amp; Gas uses the IPIECA/API six-category taxonomy plus refrigerants. Gross Scope 1 is full CO2e (CO2 + CH4 + N2O), with methane front and centre.</p>
            {hasDraft && (
              <div
                style={{ alignItems: 'center', background: 'color-mix(in srgb, #2f6b4f 10%, transparent)', border: '1px solid color-mix(in srgb, #2f6b4f 32%, transparent)', borderRadius: 12, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', margin: '14px 0 0', padding: '12px 16px' }}
              >
                <div style={{ color: 'var(--ink)' }}>
                  <b>Draft restored.</b>{' '}
                  <span style={{ color: 'var(--muted)' }}>Your previous entry was autosaved in this browser and reloaded.</span>
                </div>
                <button className="btn ghost" onClick={startFresh}>Start fresh</button>
              </div>
            )}
            <div
              style={{ alignItems: 'center', background: 'color-mix(in srgb, var(--purple) 6%, transparent)', border: '1px dashed color-mix(in srgb, var(--purple) 40%, transparent)', borderRadius: 12, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', margin: '14px 0 18px', padding: '12px 16px' }}
            >
              <div style={{ color: 'var(--ink)' }}>
                <b>First time here?</b> <span style={{ color: 'var(--muted)' }}>See the calculator end-to-end with a sample offshore upstream asset.</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) importJson(f)
                    e.currentTarget.value = ''
                  }}
                />
                <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                  Load JSON
                </button>
                <button className="add-entry-btn" onClick={loadSample} disabled={busy}>{busy ? 'Loading…' : 'Try with sample data →'}</button>
              </div>
            </div>
            {importError && (
              <p className="field-error" style={{ marginTop: -6, marginBottom: 12 }}>{importError}</p>
            )}
            <div className="sector-grid">
              <button className="sector-card" onClick={() => onSwitchSector?.('cement')}>
                <span className="icon"><Factory size={22} strokeWidth={1.75} /></span>
                <strong>Cement</strong>
                <small>Integrated, clinker, grinding units</small>
                <span className="tags">CSI Protocol · active</span>
              </button>
              <button className="sector-card selected">
                <span className="icon"><Fuel size={22} strokeWidth={1.75} /></span>
                <strong>Oil &amp; Gas</strong>
                <small>Upstream · midstream · downstream</small>
                <span className="tags">IPIECA / API · active</span>
              </button>
              <button className="sector-card" onClick={() => onSwitchSector?.('pulp_paper')}>
                <span className="icon"><Hexagon size={22} strokeWidth={1.75} /></span>
                <strong>Pulp &amp; Paper</strong>
                <small>Kraft · recycled · paper · integrated</small>
                <span className="tags">ICFPA / NCASI · active</span>
              </button>
              <button className="sector-card" onClick={() => onSwitchSector?.('iron_steel')}>
                <span className="icon"><Hexagon size={22} strokeWidth={1.75} /></span>
                <strong>Iron &amp; Steel</strong>
                <small>BF-BOF · EAF · DRI-EAF</small>
                <span className="tags">worldsteel / ISO 14404 · active</span>
              </button>
              {['Power', 'Chemicals', 'Textile', 'Pharma', 'General Mfg'].map((x) => (
                <button className="sector-card muted" key={x} disabled>
                  <span className="icon"><Hexagon size={22} strokeWidth={1.75} /></span>
                  <strong>{x}</strong>
                  <small>Future sector pack</small>
                  <span className="tags">Planned</span>
                </button>
              ))}
            </div>
            <div className="step-footer">
              <div />
              <button className="btn primary" onClick={() => setStep(2)}>Continue</button>
            </div>
          </section>
        )}

        {step === 2 && (() => {
          const o = p.organization
          const emailOk = emailRe.test((o.contactEmail ?? '').trim())
          const err = { name: !o.name.trim(), contactName: !(o.contactName ?? '').trim(), contactEmail: !(o.contactEmail ?? '').trim() || !emailOk }
          const invalid = err.name || err.contactName || err.contactEmail
          const show = step2Tried
          return (
            <section className="step-page active">
              <h1 className="step-title">Organisation &amp; <em>boundary</em></h1>
              <p className="step-sub">The consolidation boundary decides which assets count as yours — the single biggest scoping decision in O&amp;G.</p>
              <div className="form-card">
                <h2>Company</h2>
                <label className="field">
                  <span className="field-title">Company name<span className="required-mark">*</span></span>
                  <input value={o.name} placeholder="e.g. Bharat E&P Ltd" onChange={(e) => patch((d) => (d.organization.name = e.target.value))} />
                  {show && err.name && <div className="field-error">Company name is required.</div>}
                </label>
                <div className="field-row">
                  <label className="field">Operating country
                    <select value={o.country} onChange={(e) => patch((d) => (d.organization.country = e.target.value))}>
                      <option value="IN">India</option>
                      <option value="GLOBAL">Other</option>
                    </select>
                  </label>
                  <label className="field">Consolidation / boundary method
                    <select value={p.organizationBoundary.boundaryMethod} onChange={(e) => patch((d) => (d.organizationBoundary.boundaryMethod = e.target.value as OilGasInputPayload['organizationBoundary']['boundaryMethod']))}>
                      <option value="OPERATIONAL_CONTROL">Operational control</option>
                      <option value="FINANCIAL_CONTROL">Financial control</option>
                      <option value="EQUITY_SHARE">Equity share</option>
                    </select>
                  </label>
                </div>
                {p.organizationBoundary.boundaryMethod === 'EQUITY_SHARE' ? (
                  <div className="field-row">
                    <NumField label="Consolidation / equity share %" step="0.01" value={p.organizationBoundary.consolidationPercent}
                      onChange={(v) => patch((d) => { const next = v ?? 100; d.organizationBoundary.consolidationPercent = next; d.organizationBoundary.ownershipSharePercent = next })}
                      hint="Your equity share — every Scope 1 bucket is scaled by this percentage" />
                  </div>
                ) : (
                  <p className="form-sub" style={{ marginTop: 6 }}>
                    Under <b>{p.organizationBoundary.boundaryMethod.toLowerCase().replace('_', ' ')}</b>, 100% of the asset&apos;s Scope 1 is reported. Switch to <b>Equity share</b> for a non-operating stake.
                  </p>
                )}
              </div>
              <div className="form-card contact-card">
                <h2>Primary contact</h2>
                <p className="form-sub">Who is preparing this inventory? Saved with the report for follow-up and assurance.</p>
                <div className="field-row">
                  <label className="field"><span className="field-title">Contact name<span className="required-mark">*</span></span>
                    <input value={o.contactName ?? ''} placeholder="e.g. Rao Venkatesh" onChange={(e) => patch((d) => (d.organization.contactName = e.target.value))} />
                    {show && err.contactName && <div className="field-error">Contact name is required.</div>}
                  </label>
                  <label className="field"><span className="field-title">Work email<span className="required-mark">*</span></span>
                    <input type="email" value={o.contactEmail ?? ''} placeholder="name@company.com" onChange={(e) => patch((d) => (d.organization.contactEmail = e.target.value))} />
                    {show && err.contactEmail && <div className="field-error">A valid work email is required.</div>}
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">Phone<input value={o.contactPhone ?? ''} placeholder="+91 98xxxxxxxx" onChange={(e) => patch((d) => (d.organization.contactPhone = e.target.value))} /></label>
                  <label className="field">Role / designation<input value={o.contactRole ?? ''} placeholder="e.g. Head of Sustainability" onChange={(e) => patch((d) => (d.organization.contactRole = e.target.value))} /></label>
                </div>
              </div>
              <div className="step-footer">
                <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn primary" onClick={() => { setStep2Tried(true); if (!invalid) setStep(3) }}>Continue</button>
              </div>
              {show && invalid && <p className="field-error" style={{ marginTop: 6 }}>Please complete the required fields above before continuing.</p>}
            </section>
          )
        })()}

        {step === 3 && (
          <section className="step-page active">
            <h1 className="step-title">Facility, period &amp; <em>methods</em></h1>
            <p className="step-sub">Pick the value-chain segment and methods. The engine records every factor and step for audit.</p>
            <div className="form-card">
              <h2>Facility &amp; reporting period</h2>
              <div className="field-row">
                <label className="field"><span className="field-title">Facility name<span className="required-mark">*</span></span>
                  <input value={p.facility.name} placeholder="e.g. Mumbai High block" onChange={(e) => patch((d) => (d.facility.name = e.target.value))} />
                  {step3Tried && !facilityValid && <div className="field-error">Facility name is required.</div>}
                </label>
                <label className="field">Segment
                  <select value={p.facility.segment} onChange={(e) => patch((d) => (d.facility.segment = e.target.value as OilGasInputPayload['facility']['segment']))}>
                    <option value="UPSTREAM">Upstream (E&P)</option>
                    <option value="MIDSTREAM">Midstream</option>
                    <option value="DOWNSTREAM">Downstream</option>
                    <option value="MIXED">Mixed / integrated</option>
                  </select>
                </label>
                <label className="field">Facility type
                  <select value={p.facility.facilityType} onChange={(e) => patch((d) => (d.facility.facilityType = e.target.value as OilGasInputPayload['facility']['facilityType']))}>
                    <option value="UPSTREAM_ONSHORE">Upstream — onshore</option>
                    <option value="UPSTREAM_OFFSHORE">Upstream — offshore</option>
                    <option value="GAS_PROCESSING">Gas processing</option>
                    <option value="LNG">LNG</option>
                    <option value="PIPELINE_COMPRESSION">Pipeline / compression</option>
                    <option value="REFINERY">Refinery</option>
                    <option value="PETROCHEMICAL">Petrochemical</option>
                    <option value="TERMINAL_STORAGE">Terminal / storage</option>
                    <option value="CORPORATE_AGGREGATE">Corporate / portfolio aggregate</option>
                  </select>
                </label>
                <NumField label="Reporting year" step="1" value={p.calculationContext.reportingPeriod.year}
                  onChange={(v) => patch((d) => { const y = v ?? 2026; d.calculationContext.reportingPeriod = { year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31` } })} />
              </div>
            </div>
            <div className="form-card">
              <h2>Methodology</h2>
              <div className="field-row">
                <label className="field">Stationary combustion method
                  <select value={p.methodSelections.stationaryCombustionMethod} onChange={(e) => patch((d) => (d.methodSelections.stationaryCombustionMethod = e.target.value as FuelCombustionMethod))}>
                    <option value="ENERGY_BASED">Energy-based (fuel × NCV × EF)</option>
                    <option value="CARBON_CONTENT_BASED">Carbon-content based</option>
                    <option value="DIRECT_MEASUREMENT">Direct measurement (CEMS)</option>
                  </select>
                </label>
                <label className="field">Mobile combustion method
                  <select value={p.methodSelections.mobileCombustionMethod} onChange={(e) => patch((d) => (d.methodSelections.mobileCombustionMethod = e.target.value as MobileCombustionMethod))}>
                    <option value="FUEL_BASED">Fuel-based (preferred)</option>
                    <option value="DISTANCE_BASED">Distance-based</option>
                    <option value="EQUIPMENT_HOURS_BASED">Equipment hours</option>
                  </select>
                </label>
                <label className="field">GWP basis
                  <select value={p.calculationContext.gwpSet} onChange={(e) => patch((d) => (d.calculationContext.gwpSet = e.target.value as OilGasGwpSet))}>
                    <option value="AR5_100">AR5 · 100-year</option>
                    <option value="AR6_100">AR6 · 100-year</option>
                    <option value="AR6_20">AR6 · 20-year (methane-weighted)</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
              <button className="btn primary" onClick={() => { setStep3Tried(true); if (facilityValid) setStep(4) }}>Continue</button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="step-page active">
            <h1 className="step-title">Activity <em>data</em></h1>
            <p className="step-sub">Add sources by category. Every row shows its live CO2e, recalculated as you type. Switch categories with the tabs.</p>
            <LiveTotals live={live} />
            <div className="category-tabs">
              {CATEGORIES.map(({ key, label, icon: Icon }) => (
                <button key={key} className={cat === key ? 'active' : ''} onClick={() => setCat(key)}>
                  <Icon size={15} /> {label} <span>{counts[key]}</span>
                </button>
              ))}
            </div>
            <div className="category-panel">
              {cat === 'stationary' && <StationaryTable entries={ad.stationaryCombustion} trace={trace} method={p.methodSelections.stationaryCombustionMethod} onChange={(rows) => patch((d) => (d.activityData.stationaryCombustion = rows))} />}
              {cat === 'mobile' && <MobileTable entries={ad.mobileCombustion} trace={trace} method={p.methodSelections.mobileCombustionMethod} onChange={(rows) => patch((d) => (d.activityData.mobileCombustion = rows))} />}
              {cat === 'flaring' && <FlareTable entries={ad.flaring} trace={trace} onChange={(rows) => patch((d) => (d.activityData.flaring = rows))} />}
              {cat === 'venting' && <VentTable entries={ad.venting} trace={trace} onChange={(rows) => patch((d) => (d.activityData.venting = rows))} />}
              {cat === 'fugitive' && <FugitiveTable entries={ad.fugitiveComponents} trace={trace} onChange={(rows) => patch((d) => (d.activityData.fugitiveComponents = rows))} />}
              {cat === 'refrigerants' && <RefrigerantTable entries={ad.refrigerants} trace={trace} onChange={(rows) => patch((d) => (d.activityData.refrigerants = rows))} />}
              {cat === 'process' && <ProcessTable entries={ad.process} trace={trace} onChange={(rows) => patch((d) => (d.activityData.process = rows))} />}
              {cat === 'reported' && (
                <>
                  <ReportedTable entries={ad.reported} trace={trace} onChange={(rows) => patch((d) => (d.activityData.reported = rows))} />
                  <div className="form-card">
                    <h2>Reconciliation against disclosed figures</h2>
                    <p className="form-sub">
                      Optional. Enter any published figures (e.g. an annual report or 20-F). We compare each one against the modelled
                      inventory and flag a variance above 5%. This does <b>not</b> change your result — it&apos;s an assurance check.
                      <b> Tip:</b> if the disclosure splits CO2 and methane (most O&G companies do), enter them by gas below and enter
                      your reported figure by gas too — gross can match while the gas mix is wrong.
                    </p>
                    <div className="field-row">
                      <NumField label="Disclosed gross Scope 1" unit="tCO2e" value={ad.disclosedGrossScope1CO2eTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedGrossScope1CO2eTonnes = v))} hint="from public disclosure" />
                      <NumField label="…or disclosed CO2" unit="tCO2" value={ad.disclosedScope1CO2Tonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope1CO2Tonnes = v))} />
                      <NumField label="Disclosed CH4" unit="tCH4" value={ad.disclosedScope1CH4Tonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope1CH4Tonnes = v))} hint="mass, not CO2e" />
                      <NumField label="Disclosed N2O" unit="tN2O" value={ad.disclosedScope1N2OTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope1N2OTonnes = v))} />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(3)}>Back</button>
              <button className="btn primary" onClick={() => runCalculate(false)} disabled={busy}>{busy ? 'Calculating…' : 'Calculate Scope 1 →'}</button>
            </div>
          </section>
        )}

        {step === 5 && result && (
          <section className="step-page active">
            <h1 className="step-title">Scope 1 <em>report</em></h1>
            <p className="step-sub">{result.methodologyPack} · GWP {result.gwpSet.replace('_', ' · ')} · {result.dataQuality.overall.replace(/_/g, ' ').toLowerCase()} data quality</p>

            <div className="summary-hero">
              <span>Gross Scope 1 (CO2 + CH4 + N2O)</span>
              <strong>{fmt.format(result.scope1.grossScope1CO2eTonnes)}</strong>
              <small>tCO2e</small>
              <p style={{ marginTop: 10 }}>
                CO2 {fmt.format(result.scope1.byGas.co2Tonnes)} t · CH4 {fmt.format(result.scope1.byGas.ch4Tonnes)} t ({fmt.format(result.scope1.byGas.ch4CO2eTonnes)} tCO2e) · N2O {fmt.format(result.scope1.byGas.n2oTonnes)} t · refrigerants {fmt.format(result.scope1.byGas.refrigerantCO2eTonnes)} tCO2e
              </p>
            </div>

            <div className="summary-cats">
              {(Object.entries(result.scope1.byCategory) as [keyof typeof result.scope1.byCategory, (typeof result.scope1.byCategory)[keyof typeof result.scope1.byCategory]][]).map(([k, g]) => (
                <div key={k} className="summary-card">
                  <span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</span>
                  <strong>{fmt.format(g.co2eTonnes)}</strong>
                  <small>tCO2e</small>
                </div>
              ))}
            </div>

            <div className="form-card">
              <h2>By category</h2>
              <div className="result-table">
                <div className="result-row" style={{ gridTemplateColumns: COL_GRID, fontWeight: 800, color: 'var(--ink-mute)' }}>
                  <span>Category</span>
                  <span style={{ textAlign: 'right' }}>CO2 (t)</span>
                  <span style={{ textAlign: 'right' }}>CH4 (t)</span>
                  <span style={{ textAlign: 'right' }}>N2O (t)</span>
                  <span style={{ textAlign: 'right' }}>tCO2e</span>
                </div>
                {(Object.entries(result.scope1.byCategory) as [string, { co2Tonnes: number; ch4Tonnes: number; n2oTonnes: number; co2eTonnes: number }][]).map(([k, g]) => (
                  <div key={k} className="result-row" style={{ gridTemplateColumns: COL_GRID }}>
                    <strong>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</strong>
                    <span style={{ textAlign: 'right' }}>{fmt.format(g.co2Tonnes)}</span>
                    <span style={{ textAlign: 'right' }}>{fmt4.format(g.ch4Tonnes)}</span>
                    <span style={{ textAlign: 'right' }}>{fmt4.format(g.n2oTonnes)}</span>
                    <span style={{ textAlign: 'right' }}>{fmt.format(g.co2eTonnes)}</span>
                  </div>
                ))}
                <div className="result-row" style={{ gridTemplateColumns: COL_GRID, fontWeight: 800 }}>
                  <strong>Gross Scope 1</strong>
                  <span style={{ textAlign: 'right' }}>{fmt.format(result.scope1.byGas.co2Tonnes)}</span>
                  <span style={{ textAlign: 'right' }}>{fmt4.format(result.scope1.byGas.ch4Tonnes)}</span>
                  <span style={{ textAlign: 'right' }}>{fmt4.format(result.scope1.byGas.n2oTonnes)}</span>
                  <span style={{ textAlign: 'right' }}>{fmt.format(result.scope1.grossScope1CO2eTonnes)}</span>
                </div>
              </div>
            </div>

            <div className="summary-cats">
              <div className="summary-card"><span>Biogenic CO2 memo</span><strong>{fmt.format(result.memoItems.biogenicCO2Tonnes)}</strong><small>tCO2 (excluded)</small></div>
              <div className="summary-card"><span>Supporting Scope 3</span><strong>{fmt.format(result.supportingScope3.thirdPartyMobileCO2eTonnes)}</strong><small>tCO2e (third-party mobile)</small></div>
              <div className="summary-card"><span>Mass balance</span><strong>{result.massBalance.checked ? `${fmt.format(result.massBalance.imbalancePercent ?? 0)}%` : '—'}</strong><small>{result.massBalance.checked ? 'gas in vs out imbalance' : 'not provided'}</small></div>
            </div>

            {result.reconciliation.checked && (
              <div className="form-card">
                <h2>Reconciliation vs disclosed figures</h2>
                <p className="form-sub">{result.reconciliation.note}</p>
                <div className="result-table">
                  <div className="result-row" style={{ gridTemplateColumns: RECON_GRID, fontWeight: 800, color: 'var(--ink-mute)' }}>
                    <span>Metric</span>
                    <span style={{ textAlign: 'right' }}>Disclosed</span>
                    <span style={{ textAlign: 'right' }}>Modelled</span>
                    <span style={{ textAlign: 'right' }}>Variance</span>
                    <span style={{ textAlign: 'right' }}>Status</span>
                  </div>
                  {result.reconciliation.lines.map((l) => (
                    <div key={l.metric} className="result-row" style={{ gridTemplateColumns: RECON_GRID }}>
                      <strong>{l.label}</strong>
                      <span style={{ textAlign: 'right' }}>{fmt.format(l.disclosed ?? 0)} {l.unit}</span>
                      <span style={{ textAlign: 'right' }}>{fmt.format(l.modelled)} {l.unit}</span>
                      <span style={{ textAlign: 'right' }}>{fmt.format(l.variancePercent ?? 0)}%</span>
                      <span style={{ textAlign: 'right', color: l.withinThreshold ? 'var(--ok, #15803d)' : 'var(--warn, #b45309)', fontWeight: 700 }}>{l.withinThreshold ? '✓ within' : '⚠ review'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(result.intensityMetrics.co2ePerBoe != null || result.intensityMetrics.co2ePerBblCrude != null || result.intensityMetrics.co2ePerTonneLng != null || result.intensityMetrics.methaneIntensityPercent != null) && (
              <div className="form-card">
                <h2>Intensity</h2>
                <div className="summary-cats">
                  {result.intensityMetrics.co2ePerBoe != null && <IntensityCard label="Per BOE" metric="co2ePerBoe" value={result.intensityMetrics.co2ePerBoe} unit="kgCO2e / BOE" />}
                  {result.intensityMetrics.co2ePerBblCrude != null && <IntensityCard label="Per bbl crude" metric="co2ePerBblCrude" value={result.intensityMetrics.co2ePerBblCrude} unit="kgCO2e / bbl" />}
                  {result.intensityMetrics.co2ePerTonneLng != null && <IntensityCard label="Per t LNG" metric="co2ePerTonneLng" value={result.intensityMetrics.co2ePerTonneLng} unit="tCO2e / t LNG" />}
                  {result.intensityMetrics.co2ePerMMscfThroughput != null && <IntensityCard label="Per MMscf" metric="co2ePerMMscfThroughput" value={result.intensityMetrics.co2ePerMMscfThroughput} unit="tCO2e / MMscf" />}
                  {result.intensityMetrics.methaneIntensityPercent != null && <IntensityCard label="Methane intensity" metric="methaneIntensityPercent" value={result.intensityMetrics.methaneIntensityPercent} unit="of gas production" percent />}
                </div>
              </div>
            )}

            {result.assumptions.length > 0 && (
              <div className="form-card">
                <h2>Assumptions &amp; limitations</h2>
                <p className="form-sub">Every default, fallback, override and estimated basis the inventory relied on — the auditable trail for assurance.</p>
                {result.assumptions.map((a, i) => (
                  <p key={i} className="form-sub" style={{ margin: '4px 0' }}>
                    <span className="entry-badge" style={{ marginRight: 8 }}>{a.kind.toLowerCase()}</span>
                    <b>{a.label}</b> — {a.detail}
                  </p>
                ))}
              </div>
            )}

            {(result.errors.length > 0 || result.warnings.length > 0) && (
              <div className="form-card">
                <h2>Validation</h2>
                {result.errors.map((m, i) => <p key={`e${i}`} className="text-error">⛔ {m.message}</p>)}
                {result.warnings.map((m, i) => <p key={`w${i}`} className="text-warn">⚠ {m.message}</p>)}
              </div>
            )}

            <div className="form-card">
              <h2>Audit trail</h2>
              <p className="form-sub">{result.calculationTrace.length} calculation steps · {result.factorSnapshots.length} factor snapshots recorded. Download the full input + result as JSON.</p>
            </div>

            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(4)}>Back to data</button>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn ghost" onClick={() => download('xlsx')}><FileSpreadsheet size={15} /> Excel</button>
                <button className="btn ghost" onClick={() => download('pdf')}><FileText size={15} /> PDF</button>
                <button className="btn ghost" onClick={() => download('json')}><FileJson size={15} /> JSON</button>
                <button className="btn primary" onClick={() => runCalculate(true)} disabled={busy}>{busy ? 'Saving…' : 'Calculate & save'}</button>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
