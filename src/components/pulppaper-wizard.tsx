'use client'

/**
 * Pulp & Paper Scope 1 wizard. 5 steps (Sector → Org/boundary → Mill/methods →
 * Activity data with 11 tabs → Review). Mirrors the O&G wizard's look & feel:
 * EntryShell per row (description + live preview + always-visible evidence/notes
 * + formula footer). Theme-aware Sustally header, sector switcher, JSON import,
 * localStorage autosave, debounced live recalculation.
 *
 * Methodology = ICFPA/NCASI v1.4 + IPCC 2006 + AR5/AR6 GWPs.
 */

import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Droplets,
  Factory,
  FileText,
  Flame,
  Fuel,
  Hexagon,
  Info,
  Leaf,
  Moon,
  PenTool,
  Plus,
  Recycle,
  Snowflake,
  Sun,
  Trash2,
  TreePine,
  Truck,
  Wind,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { calculatePulpPaper } from '@/lib/engine/pulppaper'
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
  PulpPaperCalculationResult,
  PulpPaperGwpSet,
  PulpPaperInputPayload,
  RefrigerantEntry,
} from '@/lib/engine/pulppaper'
import type { ReportedEntry } from '@/lib/engine/oilgas'

const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const fmt4 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

type Num = number | null
function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}
function toNum(v: string): Num {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* --------------------------------- badges --------------------------------- */

const S1_BADGE = <span className="entry-badge entry-badge-s1">Gross Scope 1 (CO2e)</span>
const S3_BADGE = <span className="entry-badge entry-badge-s3">Supporting Scope 3 (excluded)</span>
const MEMO_BADGE = <span className="entry-badge entry-badge-mixed">Biogenic CO2 → memo only</span>

/* ----------------------------- categories tab ----------------------------- */

type Cat =
  | 'production'
  | 'stationary'
  | 'biomass'
  | 'limeKiln'
  | 'makeup'
  | 'mobile'
  | 'landfill'
  | 'wwt'
  | 'refrigerant'
  | 'chp'
  | 'transfer'
  | 'reported'

const CATEGORIES: { key: Cat; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; appKey?: keyof PulpPaperInputPayload['sourceApplicability'] }[] = [
  { key: 'production', label: 'Production', icon: Boxes }, // always shown (intensity denominators)
  { key: 'stationary', label: 'Stationary', icon: Flame, appKey: 'stationaryCombustion' },
  { key: 'biomass', label: 'Biomass', icon: TreePine, appKey: 'biomassCombustion' },
  { key: 'limeKiln', label: 'Lime kilns', icon: Factory, appKey: 'limeKilns' },
  { key: 'makeup', label: 'Make-up carbonates', icon: Hexagon, appKey: 'makeupCarbonates' },
  { key: 'mobile', label: 'Mobile', icon: Truck, appKey: 'mobile' },
  { key: 'landfill', label: 'Landfills', icon: Recycle, appKey: 'landfills' },
  { key: 'wwt', label: 'Anaerobic WWT', icon: Droplets, appKey: 'anaerobicWwt' },
  { key: 'refrigerant', label: 'Refrigerants', icon: Snowflake, appKey: 'refrigerants' },
  { key: 'chp', label: 'CHP allocation', icon: Zap, appKey: 'chpAllocation' },
  { key: 'transfer', label: 'CO2 transfers', icon: Wind, appKey: 'co2Transfers' },
  { key: 'reported', label: 'Reported', icon: FileText, appKey: 'reported' },
]

/**
 * Source-applicability defaults per mill type — derived from FRS §3 decision tree.
 * Paper-only mills do NOT have recovery furnaces, lime kilns, biomass boilers,
 * mill landfills, or anaerobic WWT (typically). Kraft / integrated mills DO.
 * Users can override every flag via the applicability panel on Step 4.
 */
const MILL_APPLICABILITY_DEFAULTS: Record<PulpPaperInputPayload['facility']['millType'], PulpPaperInputPayload['sourceApplicability']> = {
  KRAFT:       { stationaryCombustion: true,  biomassCombustion: true,  limeKilns: true,  makeupCarbonates: true,  mobile: true, landfills: true,  anaerobicWwt: false, refrigerants: true, chpAllocation: true, co2Transfers: true, reported: true, purchasedElectricity: true },
  SULFITE:     { stationaryCombustion: true,  biomassCombustion: true,  limeKilns: false, makeupCarbonates: false, mobile: true, landfills: true,  anaerobicWwt: false, refrigerants: true, chpAllocation: true, co2Transfers: false, reported: true, purchasedElectricity: true },
  RECYCLED:    { stationaryCombustion: true,  biomassCombustion: false, limeKilns: false, makeupCarbonates: false, mobile: true, landfills: true,  anaerobicWwt: true,  refrigerants: true, chpAllocation: true, co2Transfers: false, reported: true, purchasedElectricity: true },
  MECHANICAL:  { stationaryCombustion: true,  biomassCombustion: false, limeKilns: false, makeupCarbonates: false, mobile: true, landfills: false, anaerobicWwt: false, refrigerants: true, chpAllocation: true, co2Transfers: false, reported: true, purchasedElectricity: true },
  PAPER_ONLY:  { stationaryCombustion: true,  biomassCombustion: false, limeKilns: false, makeupCarbonates: false, mobile: true, landfills: false, anaerobicWwt: false, refrigerants: true, chpAllocation: true, co2Transfers: false, reported: true, purchasedElectricity: true },
  INTEGRATED:  { stationaryCombustion: true,  biomassCombustion: true,  limeKilns: true,  makeupCarbonates: true,  mobile: true, landfills: true,  anaerobicWwt: true,  refrigerants: true, chpAllocation: true, co2Transfers: true, reported: true, purchasedElectricity: true },
  MIXED:       { stationaryCombustion: true,  biomassCombustion: true,  limeKilns: true,  makeupCarbonates: true,  mobile: true, landfills: true,  anaerobicWwt: true,  refrigerants: true, chpAllocation: true, co2Transfers: true, reported: true, purchasedElectricity: true },
}

const APPLICABILITY_LABELS: Record<keyof PulpPaperInputPayload['sourceApplicability'], string> = {
  stationaryCombustion: 'Stationary combustion (boilers, IR dryers, RTOs, turbines)',
  biomassCombustion: 'Biomass combustion (bark, hog fuel, black liquor, biogas, NCG)',
  limeKilns: 'Kraft mill lime kilns / calciners',
  makeupCarbonates: 'Make-up CaCO3 / Na2CO3 / dolomite',
  mobile: 'Mobile / on-site equipment (forklifts, yard trucks, forestry)',
  landfills: 'Mill-owned landfill (CH4)',
  anaerobicWwt: 'Anaerobic wastewater treatment / sludge digester',
  refrigerants: 'Refrigerant HFC fugitives (chillers, AC)',
  chpAllocation: 'CHP heat/power allocation (analytical only)',
  co2Transfers: 'Fossil CO2 exports / imports (PCC plant etc.)',
  reported: 'Reported / direct-entry (corporate aggregate disclosure)',
  purchasedElectricity: 'Purchased electricity (supporting Scope 2)',
}

/* ----------------------------- empty payload ----------------------------- */

function emptyPulpPaperPayload(): PulpPaperInputPayload {
  const year = new Date().getFullYear()
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year, startDate: `${year}-01-01`, endDate: `${year}-12-31` },
      inventoryVersion: 'SUSTALLY_PP_V20',
      gwpSet: 'AR6_100',
    },
    organization: { name: '', country: 'IN', contactName: '', contactEmail: '', contactPhone: '', contactRole: '' },
    facility: { name: '', millType: 'KRAFT' },
    organizationBoundary: { boundaryMethod: 'OPERATIONAL_CONTROL', ownershipSharePercent: 100, consolidationPercent: 100 },
    sector: { sectorCode: 'PULP_PAPER' },
    methodSelections: { stationaryMethod: 'ENERGY_BASED', mobileMethod: 'FUEL_BASED', electricityMethod: 'LOCATION_BASED_SUPPORTING' },
    sourceApplicability: {
      stationaryCombustion: true,
      biomassCombustion: true,
      limeKilns: true,
      makeupCarbonates: true,
      mobile: true,
      landfills: true,
      anaerobicWwt: true,
      refrigerants: true,
      chpAllocation: true,
      co2Transfers: true,
      reported: true,
      purchasedElectricity: true,
    },
    activityData: {
      production: {},
      stationaryCombustion: [],
      biomassCombustion: [],
      limeKilns: [],
      makeupCarbonates: [],
      mobile: [],
      landfills: [],
      anaerobicWwt: [],
      refrigerants: [],
      chpAllocation: [],
      co2Transfers: [],
      reported: [],
      purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null },
    },
    factorOverrides: {},
  }
}

/** A worked sample kraft mill — exercises every category at least once. */
function sampleKraftMill(): PulpPaperInputPayload {
  const p = emptyPulpPaperPayload()
  p.organization = { name: 'Sample Pulp & Paper Ltd', country: 'IN', contactName: 'Aditi Sharma', contactEmail: 'aditi.sharma@samplepp.example', contactPhone: '+91 98xxxxxxxx', contactRole: 'Head of Sustainability' }
  p.facility = { name: 'Karnataka Kraft Mill', millType: 'KRAFT', state: 'KA' }
  p.activityData.production = { airDryPulpTonnes: 320_000, paperProducedTonnes: 280_000 }
  p.activityData.stationaryCombustion = [
    { id: uid(), label: 'NG package boiler', fuelCode: 'natural_gas', technology: 'BOILER_OR_IR_DRYER', quantity: 12_000_000, quantityUnit: 'Sm3' },
  ]
  p.activityData.biomassCombustion = [
    { id: uid(), label: 'Black liquor recovery furnace', fuelCode: 'black_liquor', technology: 'KRAFT_RECOVERY_FURNACE', quantity: 280_000, quantityUnit: 'tonne_dry' },
    { id: uid(), label: 'Bark / hog fuel CFB', fuelCode: 'wood_bark', technology: 'CFB', quantity: 90_000, quantityUnit: 'tonne_dry' },
  ]
  p.activityData.limeKilns = [
    { id: uid(), label: 'Lime kiln #1', kilnType: 'LIME_KILN', fuelCode: 'natural_gas', fuelQuantity: 4_500_000, fuelQuantityUnit: 'Sm3' },
  ]
  p.activityData.makeupCarbonates = [
    { id: uid(), label: 'Make-up CaCO3 to causticizing', chemicalCode: 'CACO3', quantityTonnes: 4_000 },
  ]
  p.activityData.mobile = [
    { id: uid(), label: 'Yard truck fleet (diesel)', ownership: 'OWNED_CONTROLLED', vehicleCode: 'DIESEL_OFFROAD', quantity: 250_000, quantityUnit: 'L' },
  ]
  p.activityData.anaerobicWwt = [
    { id: uid(), label: 'UASB reactor', method: 'ACTIVITY_BASED', codLoadKg: 1_200_000 },
  ]
  p.activityData.refrigerants = [
    { id: uid(), label: 'Plant chillers (R-410A)', gasCode: 'r410a', method: 'MASS_BALANCE', inventoryStartKg: 600, purchasedKg: 35, soldKg: 0, inventoryEndKg: 600, recoveredForRecycleKg: 0 },
  ]
  p.activityData.purchasedElectricity = { mwh: 80_000, gridEfTco2PerMwh: null }
  return p
}

/* ----------------------------- draft autosave ----------------------------- */

const DRAFT_KEY = 'sustally:pulppaper:draft:v1'
function saveDraft(p: PulpPaperInputPayload) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}
function loadDraft(): PulpPaperInputPayload | null {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) as PulpPaperInputPayload : null } catch { return null }
}
function draftIsMeaningful(p: PulpPaperInputPayload): boolean {
  const a = p?.activityData
  const hasName = !!p?.organization?.name?.trim() || !!p?.facility?.name?.trim()
  const hasAny =
    (a?.stationaryCombustion?.length ?? 0) > 0 ||
    (a?.biomassCombustion?.length ?? 0) > 0 ||
    (a?.limeKilns?.length ?? 0) > 0 ||
    (a?.makeupCarbonates?.length ?? 0) > 0 ||
    (a?.mobile?.length ?? 0) > 0 ||
    (a?.landfills?.length ?? 0) > 0 ||
    (a?.anaerobicWwt?.length ?? 0) > 0 ||
    (a?.refrigerants?.length ?? 0) > 0 ||
    (a?.chpAllocation?.length ?? 0) > 0 ||
    (a?.co2Transfers?.length ?? 0) > 0 ||
    (a?.reported?.length ?? 0) > 0
  return hasName || hasAny
}

/* --------------------------- shared form atoms --------------------------- */

function NumField({
  label, value, onChange, unit, step = 'any', hint, placeholder,
}: { label: string; value: Num; onChange: (v: Num) => void; unit?: string; step?: string; hint?: string; placeholder?: string }) {
  return (
    <label className="field">
      {label}{unit ? <span style={{ color: 'var(--muted)', marginLeft: 6, fontWeight: 400 }}>{unit}</span> : null}
      <input type="number" step={step} value={value == null ? '' : String(value)} placeholder={placeholder} onChange={(e) => onChange(toNum(e.target.value))} />
      {hint && <small className="form-sub" style={{ marginTop: 4 }}>{hint}</small>}
    </label>
  )
}

function RowPreview({ co2 }: { co2: number | null }) {
  if (co2 == null) return null
  return <span className="entry-preview">{fmt.format(co2)} tCO2e <span style={{ opacity: 0.6 }}>live</span></span>
}

type TraceEntry = { step: string; outputTonnesCO2?: number; [k: string]: unknown }
function traceOut(trace: TraceEntry[] | undefined, stepLabel: string): number | null {
  if (!trace) return null
  const t = [...trace].reverse().find((x) => x.step === stepLabel)
  return t && typeof t.outputTonnesCO2 === 'number' ? t.outputTonnesCO2 : null
}

function EntryShell({
  index, title, badge, co2, onRemove, children, formula, evidenceReference, notes, onEvidenceChange,
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
        <button className="entry-delete" onClick={onRemove}><Trash2 size={13} /> Remove</button>
      </div>
      {children}
      {onEvidenceChange && (
        <details className="entry-evidence" open={!!(evidenceReference || notes)}>
          <summary>Evidence &amp; notes</summary>
          <div className="field-row">
            <label className="field">Evidence reference
              <input value={evidenceReference ?? ''} placeholder="meter log · fuel invoice · lab report · LFG meter" onChange={(e) => onEvidenceChange({ evidenceReference: e.target.value })} />
            </label>
            <label className="field">Notes / override reason
              <input value={notes ?? ''} placeholder="assumptions, exclusions, or reason for any factor override" onChange={(e) => onEvidenceChange({ overrideReason: e.target.value })} />
            </label>
          </div>
        </details>
      )}
      {formula && <div className="entry-formula">{formula}</div>}
    </div>
  )
}

/* ------------------------------- tables ----------------------------------- */

function StationaryTable({ entries, trace, onChange }: { entries: FuelEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: FuelEntry[]) => void }) {
  const upd = (id: string, mut: (f: FuelEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Power boiler', fuelCode: 'natural_gas', technology: 'BOILER_OR_IR_DRYER', quantity: null, quantityUnit: 'Sm3' }])
  const FUELS = ['natural_gas','refinery_fuel_gas','diesel','residual_oil','lpg','bituminous_coal','sub_bituminous_coal','lignite','anthracite','peat','petcoke','coke_oven_gas','gasoline','kerosene','crude_oil']
  const TECHS = ['BOILER_OR_IR_DRYER','TURBINE_OVER_3MW','ENGINE_2STROKE_LEAN','ENGINE_4STROKE_LEAN','ENGINE_4STROKE_RICH','OVERFEED_STOKER','UNDERFEED_STOKER','PULVERIZED_DRY_WALL','PULVERIZED_DRY_TANGENTIAL','PULVERIZED_WET','SPREADER_STOKER','CFB','BOILER']
  return (
    <div className="form-card">
      <h2>Stationary fossil-fuel combustion</h2>
      <p className="form-sub">Boilers, IR dryers, RTOs, gas turbines, engines. Fossil CO2 + CH4 + N2O are gross Scope 1. CFB boilers have N2O ~10× higher than other configurations.</p>
      {entries.length === 0 && <p className="form-sub">No fuel rows yet — click <b>Add fuel</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed fuel)'} badge={S1_BADGE} co2={traceOut(trace, `Stationary - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>quantity × NCV ÷ 1000 × CO2 EF = tCO2 · CH4/N2O = energy × EF_tech / 1000 · fossil → Scope 1</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Fuel
                <select value={e.fuelCode} onChange={(ev) => upd(e.id, (f) => (f.fuelCode = ev.target.value))}>
                  {FUELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field">Combustion tech
                <select value={e.technology ?? 'BOILER_OR_IR_DRYER'} onChange={(ev) => upd(e.id, (f) => (f.technology = ev.target.value))}>
                  {TECHS.map((c) => <option key={c} value={c}>{c.toLowerCase().replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <NumField label="Quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (f) => (f.quantity = v))} />
            </div>
            <div className="field-row">
              <label className="field">Unit
                <select value={e.quantityUnit} onChange={(ev) => upd(e.id, (f) => (f.quantityUnit = ev.target.value))}>
                  {['Sm3','tonne','L','kg','GJ'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              <NumField label="NCV override" unit={`GJ/${e.quantityUnit}`} step="0.0001" value={e.ncvGjPerUnit ?? null} onChange={(v) => upd(e.id, (f) => (f.ncvGjPerUnit = v))} hint="blank = library" />
              <NumField label="CO2 EF override" unit="kg/GJ" step="0.01" value={e.co2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.co2EfKgPerGj = v))} hint="blank = library" />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add fuel</button>
    </div>
  )
}

function BiomassTable({ entries, trace, onChange }: { entries: BiomassEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: BiomassEntry[]) => void }) {
  const upd = (id: string, mut: (f: BiomassEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Bark boiler', fuelCode: 'wood_bark', technology: 'CFB', quantity: null, quantityUnit: 'tonne_dry' }])
  const FUELS = ['wood_bark','black_liquor','spent_sulphite_liquor','biogas','ncg']
  const TECHS = ['STOKER_BOILER','CFB','BFB','KRAFT_RECOVERY_FURNACE','SULFITE_RECOVERY_FURNACE','BOILER','KILN']
  return (
    <div className="form-card">
      <h2>Biomass combustion (CH4 + N2O — biogenic CO2 = memo)</h2>
      <p className="form-sub">Wood, bark, hog fuel, black liquor, sulphite liquor, biogas, NCG. <b>Biogenic CO2 is a separate memo</b> and excluded from gross Scope 1; CH4 and N2O ARE in gross Scope 1.</p>
      {entries.length === 0 && <p className="form-sub">No biomass rows yet — click <b>Add biomass</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed biomass)'} badge={MEMO_BADGE} co2={traceOut(trace, `Biomass - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>biogenic CO2 (memo) = E × EFco2 / 1000 · CH4 + N2O (Scope 1) = E × EF_tech / 1000</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Biomass fuel
                <select value={e.fuelCode} onChange={(ev) => upd(e.id, (f) => (f.fuelCode = ev.target.value))}>
                  {FUELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field">Combustion tech
                <select value={e.technology ?? 'CFB'} onChange={(ev) => upd(e.id, (f) => (f.technology = ev.target.value))}>
                  {TECHS.map((c) => <option key={c} value={c}>{c.toLowerCase().replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <NumField label="Quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (f) => (f.quantity = v))} />
            </div>
            <div className="field-row">
              <NumField label="NCV override" unit={`GJ/${e.quantityUnit}`} step="0.0001" value={e.ncvGjPerUnit ?? null} onChange={(v) => upd(e.id, (f) => (f.ncvGjPerUnit = v))} hint="blank = library" />
              <NumField label="Biogenic CO2 EF" unit="kg/GJ" step="0.1" value={e.biogenicCo2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.biogenicCo2EfKgPerGj = v))} hint="memo only" />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add biomass</button>
    </div>
  )
}

function LimeKilnTable({ entries, trace, onChange }: { entries: LimeKilnEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: LimeKilnEntry[]) => void }) {
  const upd = (id: string, mut: (f: LimeKilnEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Lime kiln', kilnType: 'LIME_KILN', fuelCode: 'natural_gas', fuelQuantity: null, fuelQuantityUnit: 'Sm3' }])
  return (
    <div className="form-card">
      <h2>Lime kilns &amp; calciners</h2>
      <p className="form-sub">Kraft mill recovery. Fossil-fuel CO2/CH4/N2O are gross Scope 1; CaCO3 calcination CO2 is biogenic (recovery-cycle carbon) → memo only.</p>
      {entries.length === 0 && <p className="form-sub">No lime kilns yet — click <b>Add kiln</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed kiln)'} badge={S1_BADGE} co2={traceOut(trace, `Lime kiln - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>fossil CO2 = E × EFco2 / 1000 · CH4 = E × 0.0027 / 1000 · N2O kiln=0 / calciner=0.1–0.3</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Type
                <select value={e.kilnType} onChange={(ev) => upd(e.id, (f) => (f.kilnType = ev.target.value as LimeKilnEntry['kilnType']))}>
                  <option value="LIME_KILN">Lime kiln (rotary)</option>
                  <option value="CALCINER">Calciner (fluidized bed)</option>
                </select>
              </label>
              <label className="field">Fossil fuel
                <select value={e.fuelCode} onChange={(ev) => upd(e.id, (f) => (f.fuelCode = ev.target.value))}>
                  {['natural_gas','residual_oil','diesel','lpg','biogas'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <NumField label="Fuel qty" unit={e.fuelQuantityUnit} value={e.fuelQuantity} onChange={(v) => upd(e.id, (f) => (f.fuelQuantity = v))} />
            </div>
            <div className="field-row">
              <NumField label="Biogenic CaCO3 calcination CO2" unit="tCO2 (memo)" value={e.biogenicCo2FromCalcinationTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.biogenicCo2FromCalcinationTonnes = v))} hint="excluded from gross" />
              <NumField label="NCV override" unit={`GJ/${e.fuelQuantityUnit}`} step="0.0001" value={e.ncvGjPerUnit ?? null} onChange={(v) => upd(e.id, (f) => (f.ncvGjPerUnit = v))} hint="blank = library" />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add kiln</button>
    </div>
  )
}

function MakeupTable({ entries, trace, onChange }: { entries: MakeupCarbonateEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: MakeupCarbonateEntry[]) => void }) {
  const upd = (id: string, mut: (f: MakeupCarbonateEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Make-up CaCO3', chemicalCode: 'CACO3', quantityTonnes: null }])
  return (
    <div className="form-card">
      <h2>Make-up carbonates / FGD sorbents</h2>
      <p className="form-sub">Stoichiometric process CO2 from mined limestone / soda ash. CaCO3 0.440 · Na2CO3 0.415 · Dolomite 0.477 tCO2/t. Fossil origin → Scope 1; biogenic origin → memo.</p>
      {entries.length === 0 && <p className="form-sub">No make-up carbonates yet — click <b>Add carbonate</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Makeup carbonate - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>CO2 = quantity × stoichiometric factor (CaCO3 0.440 · Na2CO3 0.415 · Dolomite 0.477)</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Chemical
                <select value={e.chemicalCode} onChange={(ev) => upd(e.id, (f) => (f.chemicalCode = ev.target.value as MakeupCarbonateEntry['chemicalCode']))}>
                  <option value="CACO3">CaCO3 (calcium carbonate)</option>
                  <option value="NA2CO3">Na2CO3 (soda ash)</option>
                  <option value="DOLOMITE">Dolomite (CaCO3·MgCO3)</option>
                </select>
              </label>
              <NumField label="Quantity" unit="t" value={e.quantityTonnes} onChange={(v) => upd(e.id, (f) => (f.quantityTonnes = v))} />
              <label className="field">Origin
                <select value={e.fossilOrigin === false ? 'BIOGENIC' : 'FOSSIL'} onChange={(ev) => upd(e.id, (f) => (f.fossilOrigin = ev.target.value === 'FOSSIL'))}>
                  <option value="FOSSIL">Fossil (mined / Solvay) → Scope 1</option>
                  <option value="BIOGENIC">Biogenic → memo only</option>
                </select>
              </label>
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add carbonate</button>
    </div>
  )
}

function MobileTable({ entries, trace, onChange }: { entries: MobileEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: MobileEntry[]) => void }) {
  const upd = (id: string, mut: (f: MobileEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Yard truck', ownership: 'OWNED_CONTROLLED', vehicleCode: 'DIESEL_OFFROAD', quantity: null, quantityUnit: 'L' }])
  const VEH = ['DIESEL_OFFROAD','DIESEL_FORESTRY','GASOLINE_4STROKE','GASOLINE_2STROKE_INDUSTRY','GASOLINE_2STROKE_FORESTRY','LPG_MOBILE','NATGAS_MOBILE']
  return (
    <div className="form-card">
      <h2>Mobile / on-site equipment</h2>
      <p className="form-sub">Plant-owned or operationally-controlled fleet (forklifts, log loaders, yard trucks, forestry equipment). Third-party transport is <b>Scope 3</b> and excluded from gross.</p>
      {entries.length === 0 && <p className="form-sub">No mobile rows yet — click <b>Add equipment</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed mobile)'} badge={e.ownership === 'OWNED_CONTROLLED' ? S1_BADGE : S3_BADGE} co2={traceOut(trace, `${e.ownership === 'OWNED_CONTROLLED' ? 'Mobile (owned)' : 'Mobile (third-party, supporting Scope 3, EXCLUDED)'} - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>E = qty × NCV × EF / 1000 (CO2/CH4/N2O). N2O is the dominant non-CO2 GHG for diesel off-road.</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Ownership
                <select value={e.ownership} onChange={(ev) => upd(e.id, (f) => (f.ownership = ev.target.value as MobileEntry['ownership']))}>
                  <option value="OWNED_CONTROLLED">Owned / controlled (Scope 1)</option>
                  <option value="THIRD_PARTY">Third-party (Scope 3, excluded)</option>
                </select>
              </label>
              <label className="field">Vehicle / fuel type
                <select value={e.vehicleCode} onChange={(ev) => upd(e.id, (f) => (f.vehicleCode = ev.target.value))}>
                  {VEH.map((c) => <option key={c} value={c}>{c.toLowerCase().replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <NumField label="Fuel quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (f) => (f.quantity = v))} />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add equipment</button>
    </div>
  )
}

function LandfillTable({ entries, trace, onChange }: { entries: LandfillEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: LandfillEntry[]) => void }) {
  const upd = (id: string, mut: (f: LandfillEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Mill landfill', method: 'SIMPLIFIED_FOD', annualDepositDryMg: null, yearsSinceOpening: null }])
  return (
    <div className="form-card">
      <h2>Mill-owned landfills (CH4)</h2>
      <p className="form-sub">Receives sludge, ash, rejects. CH4 is biogenic but IS Scope 1 (the carbon-neutrality convention only excludes biogenic CO2). Two methods: direct LFG measurement (with collection) or simplified First Order Decay.</p>
      {entries.length === 0 && <p className="form-sub">No landfills yet — click <b>Add landfill</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed landfill)'} badge={S1_BADGE} co2={traceOut(trace, `Landfill - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={e.method === 'DIRECT_GAS_MEASUREMENT'
            ? <>CH4 m3 = (REC/FRCOLL)·(1−FRCOLL)·FRMETH·(1−OX) + REC·FRMETH·(1−FRBURN); ×0.72/1000 → t</>
            : <>CH4 generated = R · L0 · (e^(−kC) − e^(−kT)); released = (gen−recov)(1−OX) + recov(1−FRBURN)</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Method
                <select value={e.method} onChange={(ev) => upd(e.id, (f) => (f.method = ev.target.value as LandfillEntry['method']))}>
                  <option value="SIMPLIFIED_FOD">Simplified FOD (constant deposit)</option>
                  <option value="DIRECT_GAS_MEASUREMENT">Direct LFG measurement</option>
                </select>
              </label>
            </div>
            {e.method === 'SIMPLIFIED_FOD' ? (
              <div className="field-row">
                <NumField label="Annual deposit (R)" unit="dry Mg/yr" value={e.annualDepositDryMg ?? null} onChange={(v) => upd(e.id, (f) => (f.annualDepositDryMg = v))} />
                <NumField label="Years since opening (T)" unit="yr" value={e.yearsSinceOpening ?? null} onChange={(v) => upd(e.id, (f) => (f.yearsSinceOpening = v))} />
                <NumField label="Years since closure (C)" unit="yr" value={e.yearsSinceClosure ?? null} onChange={(v) => upd(e.id, (f) => (f.yearsSinceClosure = v))} hint="0 if active" />
                <NumField label="L0 override" unit="m3/Mg" value={e.methanePotentialM3PerMg ?? null} onChange={(v) => upd(e.id, (f) => (f.methanePotentialM3PerMg = v))} hint="default 100" />
              </div>
            ) : (
              <div className="field-row">
                <NumField label="Collected LFG (REC)" unit="Nm3/yr" value={e.collectedGasNm3 ?? null} onChange={(v) => upd(e.id, (f) => (f.collectedGasNm3 = v))} />
                <NumField label="Collection efficiency (FRCOLL)" step="0.01" value={e.collectionEfficiency ?? null} onChange={(v) => upd(e.id, (f) => (f.collectionEfficiency = v))} hint="default 0.75" />
                <NumField label="CH4 fraction (FRMETH)" step="0.01" value={e.methaneFraction ?? null} onChange={(v) => upd(e.id, (f) => (f.methaneFraction = v))} hint="default 0.5" />
                <NumField label="Fraction burned (FRBURN)" step="0.01" value={e.fractionBurned ?? null} onChange={(v) => upd(e.id, (f) => (f.fractionBurned = v))} hint="0=vented, 1=flared" />
              </div>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add landfill</button>
    </div>
  )
}

function WwtTable({ entries, trace, onChange }: { entries: AnaerobicWwtEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: AnaerobicWwtEntry[]) => void }) {
  const upd = (id: string, mut: (f: AnaerobicWwtEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'UASB reactor', method: 'ACTIVITY_BASED', codLoadKg: null }])
  return (
    <div className="form-card">
      <h2>Anaerobic wastewater treatment / sludge digestion</h2>
      <p className="form-sub">UASB, EGSB, IC reactors, lagoons, and dedicated anaerobic sludge digesters. CH4 is Scope 1. Aerobic systems are assumed negligible.</p>
      {entries.length === 0 && <p className="form-sub">No anaerobic WWT yet — click <b>Add WWT</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed WWT)'} badge={S1_BADGE} co2={traceOut(trace, `Anaerobic WWT - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={e.method === 'GAS_CAPTURE' ? <>CH4 m3 = (Q/FRCOLL)·(1−FRCOLL)·FRMETH + Q·FRMETH·(1−FRBURN); ×0.72/1000 → t</> : <>CH4 kg = OC × EF − B (COD: 0.25; BOD: 0.6)</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Method
                <select value={e.method} onChange={(ev) => upd(e.id, (f) => (f.method = ev.target.value as AnaerobicWwtEntry['method']))}>
                  <option value="ACTIVITY_BASED">Activity-based (no gas data)</option>
                  <option value="GAS_CAPTURE">Gas capture (collected LFG / biogas)</option>
                </select>
              </label>
            </div>
            {e.method === 'ACTIVITY_BASED' ? (
              <div className="field-row">
                <NumField label="COD load" unit="kg/yr" value={e.codLoadKg ?? null} onChange={(v) => upd(e.id, (f) => (f.codLoadKg = v))} hint="preferred basis" />
                <NumField label="…or BOD load" unit="kg/yr" value={e.bodLoadKg ?? null} onChange={(v) => upd(e.id, (f) => (f.bodLoadKg = v))} />
                <NumField label="CH4 captured / burned" unit="kg/yr" value={e.ch4CapturedKg ?? null} onChange={(v) => upd(e.id, (f) => (f.ch4CapturedKg = v))} hint="subtracted from emissions" />
              </div>
            ) : (
              <div className="field-row">
                <NumField label="Collected biogas (Q)" unit="Nm3/yr" value={e.collectedGasNm3 ?? null} onChange={(v) => upd(e.id, (f) => (f.collectedGasNm3 = v))} />
                <NumField label="Collection efficiency (FRCOLL)" step="0.01" value={e.collectionEfficiency ?? null} onChange={(v) => upd(e.id, (f) => (f.collectionEfficiency = v))} hint="1.0 odor-tight; 0.95 engineered; 0.5 open lagoon" />
                <NumField label="Fraction burned (FRBURN)" step="0.01" value={e.fractionBurned ?? null} onChange={(v) => upd(e.id, (f) => (f.fractionBurned = v))} hint="1.0 if flared" />
              </div>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add WWT</button>
    </div>
  )
}

function RefrigerantTable({ entries, trace, onChange }: { entries: RefrigerantEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: RefrigerantEntry[]) => void }) {
  const upd = (id: string, mut: (f: RefrigerantEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Industrial chiller', gasCode: 'r410a', method: 'MASS_BALANCE' }])
  return (
    <div className="form-card">
      <h2>Refrigerant HFC fugitives</h2>
      <p className="form-sub">Chillers, process refrigeration, AC. HFC GWPs use the 100-year basis regardless of the chosen CH4 horizon (industry convention).</p>
      {entries.length === 0 && <p className="form-sub">No refrigerants yet — click <b>Add refrigerant</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed refrigerant)'} badge={S1_BADGE} co2={traceOut(trace, `Refrigerant - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={e.method === 'MASS_BALANCE' ? <>E = inv_start + purchased − sold − inv_end − recovered; CO2e = E × GWP / 1000</> : <>E = charge × annual_leak_rate; CO2e = E × GWP / 1000</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Gas
                <select value={e.gasCode} onChange={(ev) => upd(e.id, (f) => (f.gasCode = ev.target.value))}>
                  {['r134a','r410a','r404a','r407c','r32','r507a','r23','r125','r143a','r449a','r1234yf'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field">Method
                <select value={e.method} onChange={(ev) => upd(e.id, (f) => (f.method = ev.target.value as RefrigerantEntry['method']))}>
                  <option value="MASS_BALANCE">Mass balance (preferred)</option>
                  <option value="SCREENING">Screening (charge × leak rate)</option>
                </select>
              </label>
            </div>
            {e.method === 'MASS_BALANCE' ? (
              <>
                <div className="field-row">
                  <NumField label="Inventory start" unit="kg" value={e.inventoryStartKg ?? null} onChange={(v) => upd(e.id, (f) => (f.inventoryStartKg = v))} />
                  <NumField label="Purchased" unit="kg" value={e.purchasedKg ?? null} onChange={(v) => upd(e.id, (f) => (f.purchasedKg = v))} />
                  <NumField label="Sold" unit="kg" value={e.soldKg ?? null} onChange={(v) => upd(e.id, (f) => (f.soldKg = v))} />
                </div>
                <div className="field-row">
                  <NumField label="Inventory end" unit="kg" value={e.inventoryEndKg ?? null} onChange={(v) => upd(e.id, (f) => (f.inventoryEndKg = v))} />
                  <NumField label="Recovered for recycle" unit="kg" value={e.recoveredForRecycleKg ?? null} onChange={(v) => upd(e.id, (f) => (f.recoveredForRecycleKg = v))} />
                  <NumField label="GWP override" value={e.gwpOverride ?? null} onChange={(v) => upd(e.id, (f) => (f.gwpOverride = v))} hint="blank = AR6 library" />
                </div>
              </>
            ) : (
              <div className="field-row">
                <NumField label="Charge" unit="kg" value={e.chargeKg ?? null} onChange={(v) => upd(e.id, (f) => (f.chargeKg = v))} />
                <NumField label="Annual leak rate" step="0.001" value={e.annualLeakRate ?? null} onChange={(v) => upd(e.id, (f) => (f.annualLeakRate = v))} hint="0–1; chillers ~0.02–0.10" />
                <NumField label="GWP override" value={e.gwpOverride ?? null} onChange={(v) => upd(e.id, (f) => (f.gwpOverride = v))} hint="blank = AR6 library" />
              </div>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add refrigerant</button>
    </div>
  )
}

function ChpTable({ entries, trace, onChange }: { entries: ChpAllocationEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: ChpAllocationEntry[]) => void }) {
  const upd = (id: string, mut: (f: ChpAllocationEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'On-site CHP', totalEmissionsCo2eTonnes: null, heatOutputGj: null, powerOutputGj: null }])
  return (
    <div className="form-card">
      <h2>CHP heat / power allocation (analytical only)</h2>
      <p className="form-sub">Apportions an already-counted CHP total between heat and power outputs per the WRI/WBCSD Simplified Efficiency Method. <b>This does not change gross Scope 1</b> — it derives EF for heat and power separately for sold-energy disclosure.</p>
      {entries.length === 0 && <p className="form-sub">No CHP units yet — click <b>Add CHP</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed CHP)'} badge={<span className="entry-badge entry-badge-mixed">analytical (not added to gross)</span>} co2={traceOut(trace, `CHP allocation - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>Reff = eH / eP; EH = H / (H + P·Reff) × ET; EP = ET − EH</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <NumField label="Total emissions" unit="tCO2e" value={e.totalEmissionsCo2eTonnes} onChange={(v) => upd(e.id, (f) => (f.totalEmissionsCo2eTonnes = v))} />
              <NumField label="Heat output (H)" unit="GJ" value={e.heatOutputGj} onChange={(v) => upd(e.id, (f) => (f.heatOutputGj = v))} />
              <NumField label="Power output (P)" unit="GJ" value={e.powerOutputGj} onChange={(v) => upd(e.id, (f) => (f.powerOutputGj = v))} />
            </div>
            <div className="field-row">
              <NumField label="Heat efficiency (eH)" step="0.01" value={e.heatEfficiency ?? null} onChange={(v) => upd(e.id, (f) => (f.heatEfficiency = v))} hint="default 0.80" />
              <NumField label="Power efficiency (eP)" step="0.01" value={e.powerEfficiency ?? null} onChange={(v) => upd(e.id, (f) => (f.powerEfficiency = v))} hint="default 0.35" />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add CHP</button>
    </div>
  )
}

function TransferTable({ entries, trace, onChange }: { entries: Co2TransferEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: Co2TransferEntry[]) => void }) {
  const upd = (id: string, mut: (f: Co2TransferEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'PCC plant export', direction: 'EXPORT', origin: 'FOSSIL', quantityTonnes: null }])
  return (
    <div className="form-card">
      <h2>CO2 imports / exports (PCC plants, neutralization)</h2>
      <p className="form-sub">Fossil CO2 exported from the lime kiln to an adjacent PCC plant is NOT emitted by the mill and is subtracted from gross. Biogenic transfers adjust the memo line, not gross.</p>
      {entries.length === 0 && <p className="form-sub">No transfers — click <b>Add transfer</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed transfer)'} badge={<span className="entry-badge entry-badge-mixed">{e.direction === 'EXPORT' ? 'deduction' : 'addition'}</span>} co2={traceOut(trace, `CO2 transfer (${e.direction.toLowerCase()}, ${e.origin.toLowerCase()}) - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>Net E_CO2 = combustion − exports + imports (fossil); biogenic transfers adjust memo line.</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Direction
                <select value={e.direction} onChange={(ev) => upd(e.id, (f) => (f.direction = ev.target.value as Co2TransferEntry['direction']))}>
                  <option value="EXPORT">Export (deduction)</option>
                  <option value="IMPORT">Import (addition)</option>
                </select>
              </label>
              <label className="field">Origin
                <select value={e.origin} onChange={(ev) => upd(e.id, (f) => (f.origin = ev.target.value as Co2TransferEntry['origin']))}>
                  <option value="FOSSIL">Fossil (affects Scope 1)</option>
                  <option value="BIOGENIC">Biogenic (affects memo)</option>
                </select>
              </label>
              <NumField label="Quantity" unit="tCO2" value={e.quantityTonnes} onChange={(v) => upd(e.id, (f) => (f.quantityTonnes = v))} />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add transfer</button>
    </div>
  )
}

function ReportedTable({ entries, trace, onChange }: { entries: ReportedEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: ReportedEntry[]) => void }) {
  const upd = (id: string, mut: (f: ReportedEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Disclosed source', basis: 'REPORTED' }])
  return (
    <div className="form-card">
      <h2>Reported / direct emissions</h2>
      <p className="form-sub">For public-disclosure or head-office data: enter disclosed CO2e (or by-gas masses) directly when activity inputs aren&apos;t available. These sit in their own bucket — never mixed with modelled bottom-up sources.</p>
      {entries.length === 0 && <p className="form-sub">No reported figures yet — click <b>Add reported figure</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Reported / direct - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          formula={<>direct disclosed CO2e, or CO2 + CH4·GWP + N2O·GWP from reported gas masses</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
              <label className="field">Source / category tag<input value={e.categoryTag ?? ''} placeholder="e.g. corporate disclosure" onChange={(ev) => upd(e.id, (r) => (r.categoryTag = ev.target.value))} /></label>
              <label className="field">Basis
                <select value={e.basis} onChange={(ev) => upd(e.id, (r) => (r.basis = ev.target.value as ReportedEntry['basis']))}>
                  {(['MEASURED','ESTIMATED','INFERRED','REPORTED','RESIDUAL'] as const).map((b) => <option key={b} value={b}>{b.toLowerCase()}</option>)}
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
              <label className="field" style={{ gridColumn: 'span 2' }}>Source / disclosure reference<input value={e.source ?? ''} placeholder="e.g. Sustainability Report 2025 p.42 / URL" onChange={(ev) => upd(e.id, (r) => (r.source = ev.target.value))} /></label>
              <label className="field" style={{ gridColumn: 'span 2' }}>Note / assumption<input value={e.note ?? ''} placeholder="mapping assumption, exclusions, etc." onChange={(ev) => upd(e.id, (r) => (r.note = ev.target.value))} /></label>
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add reported figure</button>
    </div>
  )
}

/* ----------------------------- live totals ----------------------------- */

function LiveTotals({ live }: { live: PulpPaperCalculationResult | null }) {
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

/* ----------------------------- main wizard ----------------------------- */

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function PulpPaperWizard({ onSwitchSector }: { onSwitchSector?: (s: 'cement' | 'oil_gas' | 'pulp_paper') => void }) {
  const [p, setP] = useState<PulpPaperInputPayload>(emptyPulpPaperPayload)
  const [step, setStep] = useState<number>(1)
  const [cat, setCat] = useState<Cat>('production')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PulpPaperCalculationResult | null>(null)
  const [live, setLive] = useState<PulpPaperCalculationResult | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [importError, setImportError] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [step2Tried, setStep2Tried] = useState(false)
  const [step3Tried, setStep3Tried] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // restore draft (theme stays at the explicit user choice; do NOT auto-flip to OS dark mode)
  useEffect(() => {
    try {
      const restored = loadDraft()
      if (restored && draftIsMeaningful(restored)) { setP(restored); setHasDraft(true) }
    } catch { /* ignore */ }
  }, [])

  // Don't show "required" errors on a fresh return to step 2/3 — only after the
  // user has actually clicked Continue on that step within the current visit.
  useEffect(() => {
    if (step === 1) { setStep2Tried(false); setStep3Tried(false) }
  }, [step])

  // If user toggles the currently-open category OFF, snap to Production (always visible)
  useEffect(() => {
    const meta = CATEGORIES.find((c) => c.key === cat)
    if (meta?.appKey && p.sourceApplicability[meta.appKey] === false) {
      setCat('production')
    }
  }, [cat, p.sourceApplicability])

  // Auto-derive source applicability defaults from the selected mill type
  // (paper-only mills don't have recovery furnaces, lime kilns, biomass etc.).
  // User can still override each flag on Step 4. We only refresh when mill type
  // actually changes — don't clobber a hand-edited applicability set otherwise.
  const prevMillTypeRef = useRef<string | null>(null)
  useEffect(() => {
    const mt = p.facility.millType
    if (mt && mt !== prevMillTypeRef.current) {
      const defaults = MILL_APPLICABILITY_DEFAULTS[mt]
      if (defaults && prevMillTypeRef.current !== null) {
        // Only auto-update when user changes mill type after initial load,
        // not on hydration of an existing draft.
        patch((d) => (d.sourceApplicability = { ...defaults }))
      }
      prevMillTypeRef.current = mt
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.facility.millType])

  // autosave + debounced live calc
  useEffect(() => {
    saveDraft(p)
    const id = setTimeout(() => {
      try { setLive(calculatePulpPaper(p)) } catch { setLive(null) }
    }, 250)
    return () => clearTimeout(id)
  }, [p])

  function patch(mut: (d: PulpPaperInputPayload) => void) {
    setP((prev) => { const draft = JSON.parse(JSON.stringify(prev)) as PulpPaperInputPayload; mut(draft); return draft })
  }

  function startFresh() {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    setP(emptyPulpPaperPayload()); setStep(1); setResult(null); setHasDraft(false)
  }

  async function loadSample() {
    const sample = sampleKraftMill()
    setP(sample)
    saveDraft(sample)
    setHasDraft(true)
    setBusy(true)
    try {
      const r = await fetch('/api/v1/calculations/pulp-paper/calculate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample),
      })
      const data = await r.json()
      setResult(data.result as PulpPaperCalculationResult)
      setStep(5)
    } finally { setBusy(false) }
  }

  function importJson(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const payload = parsed?.inputPayload ?? parsed?.input ?? parsed
        if (payload?.sector?.sectorCode !== 'PULP_PAPER') { setImportError('That file is not a P&P payload (expected sector PULP_PAPER).'); return }
        if (!payload.activityData || !payload.calculationContext) { setImportError('That file does not look like a calculator payload.'); return }
        const base = emptyPulpPaperPayload()
        const merged: PulpPaperInputPayload = {
          ...base, ...payload,
          calculationContext: { ...base.calculationContext, ...payload.calculationContext },
          organization: { ...base.organization, ...payload.organization },
          facility: { ...base.facility, ...payload.facility },
          organizationBoundary: { ...base.organizationBoundary, ...payload.organizationBoundary },
          methodSelections: { ...base.methodSelections, ...payload.methodSelections },
          sourceApplicability: { ...base.sourceApplicability, ...payload.sourceApplicability },
          activityData: { ...base.activityData, ...payload.activityData },
        }
        setImportError(null); setP(merged); saveDraft(merged); setHasDraft(true); setResult(null); setLive(null); setStep(4)
      } catch { setImportError('Could not parse that file as JSON.') }
    }
    reader.readAsText(file)
  }

  async function runCalculate(save: boolean) {
    setBusy(true)
    try {
      const r = await fetch(`/api/v1/calculations/pulp-paper/calculate${save ? '?save=true' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      })
      const data = await r.json()
      const result = data.result as PulpPaperCalculationResult
      // Surface the persisted calculationId on the result so Step 5 can show it.
      if (data.calculationId && result) result.calculationId = data.calculationId
      setResult(result)
      setStep(5)
    } finally { setBusy(false) }
  }

  async function download(format: 'json' | 'xlsx' | 'pdf' | 'csv' | 'audit-pack') {
    const r = await fetch('/api/v1/calculations/pulp-paper/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: p, format }),
    })
    const blob = await r.blob()
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    const ext = format === 'audit-pack' ? 'zip' : format
    const suffix = format === 'audit-pack' ? '-audit-pack' : ''
    a.download = `scope1-pulppaper-${p.facility.name || 'mill'}-FY${p.calculationContext.reportingPeriod.year}${suffix}.${ext}`
    document.body.appendChild(a); a.click(); a.remove()
  }

  const ad = p.activityData
  const ms = p.methodSelections

  const counts = {
    production: Object.values(ad.production).filter((v) => v != null).length,
    stationary: ad.stationaryCombustion.length,
    biomass: ad.biomassCombustion.length,
    limeKiln: ad.limeKilns.length,
    makeup: ad.makeupCarbonates.length,
    mobile: ad.mobile.length,
    landfill: ad.landfills.length,
    wwt: ad.anaerobicWwt.length,
    refrigerant: ad.refrigerants.length,
    chp: ad.chpAllocation.length,
    transfer: ad.co2Transfers.length,
    reported: ad.reported.length,
  } as const

  const orgValid = !!p.organization.name.trim()
    && !!(p.organization.contactName ?? '').trim()
    && emailRe.test((p.organization.contactEmail ?? '').trim())
  const facilityValid = !!p.facility.name.trim() && !!p.facility.millType

  // Validation gates on the step-progress nav: clicking a forward step that
  // isn't yet reachable redirects back to the first incomplete step and
  // surfaces inline field errors (step2Tried / step3Tried).
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

  const trace = (live?.calculationTrace ?? result?.calculationTrace) as TraceEntry[] | undefined

  const COL_GRID = '2.5fr 1fr 1fr 1fr 1fr'

  return (
    <main className={theme === 'dark' ? 'wizard-app dark' : 'wizard-app'}>
      <header className="wizard-header">
        <div className="wizard-header-inner">
          <button className="wizard-brand" onClick={() => setStep(1)} title="Calculator home" aria-label="Back to calculator home">
            <img className="brand-logo" src={theme === 'dark' ? '/brand/typemark-white.svg' : '/brand/typemark-black.svg'} alt="Sustally" />
            <span className="brand-divider" />
            <span className="brand-label">
              <span className="brand-eyebrow">Scope 1 Calculator</span>
              <span className="brand-product">Pulp &amp; Paper</span>
            </span>
          </button>
          <div className="wizard-actions">
            <div className="gwp-switch">
              <span>GWP</span>
              {(['AR5_100', 'AR6_100', 'AR6_20'] as const).map((g) => (
                <button key={g} className={p.calculationContext.gwpSet === g ? 'active' : ''} onClick={() => patch((d) => (d.calculationContext.gwpSet = g))}>
                  {g.replace('_', ' · ')}
                </button>
              ))}
            </div>
            <button className="theme-switch" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </header>

      <nav className="wizard-progress">
        {(['Sector','Organisation','Facility & methods','Activity data','Review & report'] as const).map((label, i) => {
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
            <p className="step-sub">Pulp &amp; Paper uses the ICFPA/NCASI v1.4 ten-category taxonomy. Gross Scope 1 is full CO2e; biogenic CO2 is a separate memo line.</p>
            {hasDraft && (
              <div style={{ alignItems: 'center', background: 'color-mix(in srgb, #2f6b4f 10%, transparent)', border: '1px solid color-mix(in srgb, #2f6b4f 32%, transparent)', borderRadius: 12, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', margin: '14px 0 0', padding: '12px 16px' }}>
                <div><b>Draft restored.</b> <span style={{ color: 'var(--muted)' }}>Your previous entry was autosaved and reloaded.</span></div>
                <button className="btn ghost" onClick={startFresh}>Start fresh</button>
              </div>
            )}
            <div style={{ alignItems: 'center', background: 'color-mix(in srgb, var(--purple) 6%, transparent)', border: '1px dashed color-mix(in srgb, var(--purple) 40%, transparent)', borderRadius: 12, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', margin: '14px 0 18px', padding: '12px 16px' }}>
              <div><b>First time here?</b> <span style={{ color: 'var(--muted)' }}>See the calculator end-to-end with a sample kraft mill.</span></div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.currentTarget.value = '' }} />
                <button className="btn ghost" onClick={() => fileRef.current?.click()}>Load JSON</button>
                <button className="add-entry-btn" onClick={loadSample} disabled={busy}>{busy ? 'Loading…' : 'Try with sample data →'}</button>
              </div>
            </div>
            {importError && <p className="field-error" style={{ marginTop: -6, marginBottom: 12 }}>{importError}</p>}
            <div className="sector-grid">
              <button className="sector-card" onClick={() => onSwitchSector?.('cement')}>
                <span className="icon"><Factory size={22} strokeWidth={1.75} /></span>
                <strong>Cement</strong>
                <small>Integrated, clinker, grinding units</small>
                <span className="tags">CSI Protocol · active</span>
              </button>
              <button className="sector-card" onClick={() => onSwitchSector?.('oil_gas')}>
                <span className="icon"><Fuel size={22} strokeWidth={1.75} /></span>
                <strong>Oil &amp; Gas</strong>
                <small>Upstream · midstream · downstream</small>
                <span className="tags">IPIECA / API · active</span>
              </button>
              <button className="sector-card selected">
                <span className="icon"><TreePine size={22} strokeWidth={1.75} /></span>
                <strong>Pulp &amp; Paper</strong>
                <small>Kraft · recycled · paper · integrated</small>
                <span className="tags">ICFPA / NCASI · active</span>
              </button>
              {['Iron & Steel','Power','Chemicals','Textile','Pharma','General Mfg'].map((x) => (
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
              <p className="step-sub">The consolidation boundary decides which mills count as yours — applies uniformly across all sectors.</p>
              <div className="form-card">
                <h2>Company</h2>
                <label className="field">
                  <span className="field-title">Company name<span className="required-mark">*</span></span>
                  <input value={o.name} placeholder="e.g. Bharat Paper Ltd" onChange={(e) => patch((d) => (d.organization.name = e.target.value))} />
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
                    <select value={p.organizationBoundary.boundaryMethod} onChange={(e) => patch((d) => (d.organizationBoundary.boundaryMethod = e.target.value as PulpPaperInputPayload['organizationBoundary']['boundaryMethod']))}>
                      <option value="OPERATIONAL_CONTROL">Operational control</option>
                      <option value="FINANCIAL_CONTROL">Financial control</option>
                      <option value="EQUITY_SHARE">Equity share</option>
                    </select>
                  </label>
                </div>
                {p.organizationBoundary.boundaryMethod === 'EQUITY_SHARE' ? (
                  <div className="field-row">
                    <NumField label="Consolidation / equity share %" step="0.01" value={p.organizationBoundary.consolidationPercent ?? 100}
                      onChange={(v) => patch((d) => { const next = v ?? 100; d.organizationBoundary.consolidationPercent = next; d.organizationBoundary.ownershipSharePercent = next })}
                      hint="Your equity share — every Scope 1 bucket is scaled by this percentage" />
                  </div>
                ) : (
                  <p className="form-sub" style={{ marginTop: 6 }}>
                    Under <b>{p.organizationBoundary.boundaryMethod.toLowerCase().replace('_', ' ')}</b>, 100% of the mill&apos;s Scope 1 is reported. Switch to <b>Equity share</b> for a non-operating stake.
                  </p>
                )}
                <label className="field" style={{ marginTop: 14 }}>
                  <span className="field-title">Boundary justification</span>
                  <input
                    value={p.organizationBoundary.justification ?? ''}
                    placeholder="Brief narrative of why this boundary applies (e.g. 'Sole operator of the mill under a long-term lease; financial control aligns with consolidated reporting.')"
                    onChange={(e) => patch((d) => (d.organizationBoundary.justification = e.target.value))}
                  />
                  <small className="form-sub">Optional but recommended for assurance (GHG Protocol Chapter 3). Saved with the audit trail.</small>
                </label>
              </div>
              <div className="form-card contact-card">
                <h2>Primary contact</h2>
                <p className="form-sub">Who is preparing this inventory? Saved with the report for follow-up and assurance.</p>
                <div className="field-row">
                  <label className="field"><span className="field-title">Contact name<span className="required-mark">*</span></span>
                    <input value={o.contactName ?? ''} placeholder="e.g. Aditi Sharma" onChange={(e) => patch((d) => (d.organization.contactName = e.target.value))} />
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
            <h1 className="step-title">Mill &amp; <em>methods</em></h1>
            <p className="step-sub">Mill type drives which categories are applicable (kraft → lime kilns + makeup carbonates).</p>
            <div className="form-card">
              <h2>Facility</h2>
              <div className="field-row">
                <label className="field"><span className="field-title">Mill name<span className="required-mark">*</span></span>
                  <input value={p.facility.name} placeholder="e.g. Karnataka Kraft Mill" onChange={(e) => patch((d) => (d.facility.name = e.target.value))} />
                </label>
                <label className="field">Mill type
                  <select value={p.facility.millType} onChange={(e) => patch((d) => (d.facility.millType = e.target.value as PulpPaperInputPayload['facility']['millType']))}>
                    <option value="KRAFT">Kraft (chemical pulp)</option>
                    <option value="SULFITE">Sulfite (chemical pulp)</option>
                    <option value="RECYCLED">Recycled fibre / deinking</option>
                    <option value="MECHANICAL">Mechanical / TMP</option>
                    <option value="PAPER_ONLY">Paper-only (non-integrated)</option>
                    <option value="INTEGRATED">Integrated (pulp + paper)</option>
                    <option value="MIXED">Mixed / portfolio aggregate</option>
                  </select>
                </label>
                <NumField label="Reporting year" step="1" value={p.calculationContext.reportingPeriod.year}
                  onChange={(v) => patch((d) => { const y = v ?? 2026; d.calculationContext.reportingPeriod = { year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31` } })} />
              </div>
              <h2 style={{ marginTop: 22 }}>Methods</h2>
              <div className="field-row">
                <label className="field">Stationary combustion method
                  <select value={ms.stationaryMethod} onChange={(e) => patch((d) => (d.methodSelections.stationaryMethod = e.target.value as PulpPaperInputPayload['methodSelections']['stationaryMethod']))}>
                    <option value="ENERGY_BASED">Energy-based (qty × NCV × EF) — Tier 2</option>
                    <option value="CARBON_CONTENT_BASED">Carbon-content (Tier 3/4)</option>
                    <option value="DIRECT_MEASUREMENT">Direct measurement (CEMS) — Tier 4</option>
                  </select>
                </label>
                <label className="field">Mobile method
                  <select value={ms.mobileMethod} onChange={(e) => patch((d) => (d.methodSelections.mobileMethod = e.target.value as PulpPaperInputPayload['methodSelections']['mobileMethod']))}>
                    <option value="FUEL_BASED">Fuel-based (preferred)</option>
                    <option value="DISTANCE_BASED">Distance-based</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
              <button className="btn primary" onClick={() => { setStep3Tried(true); if (facilityValid) setStep(4) }}>Continue</button>
            </div>
            {step3Tried && !facilityValid && (
              <p className="field-error" style={{ marginTop: 6 }}>Mill name and mill type are required before continuing.</p>
            )}
          </section>
        )}

        {step === 4 && (
          <section className="step-page active">
            <h1 className="step-title">Activity <em>data</em></h1>
            <p className="step-sub">The ten ICFPA categories plus reported. Leave a field blank for <b>missing</b>; type <b>0</b> only for a confirmed zero. <em>Biogenic CO2 is never in gross Scope 1.</em></p>
            <LiveTotals live={live} />

            <div className="form-card">
              <h2>Source applicability — what this mill actually operates</h2>
              <p className="form-sub">
                Auto-set from your <b>{p.facility.millType.toLowerCase().replace('_', ' ')}</b> mill type per the ICFPA decision tree. Toggle OFF any source this mill doesn&apos;t have to hide its tab. Source applicability is part of the audit trail.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px 16px', marginTop: 10 }}>
                {(Object.entries(APPLICABILITY_LABELS) as [keyof PulpPaperInputPayload['sourceApplicability'], string][]).map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                    <input
                      type="checkbox"
                      checked={!!p.sourceApplicability[k]}
                      onChange={(e) => patch((d) => (d.sourceApplicability[k] = e.target.checked))}
                      style={{ width: 16, height: 16, accentColor: 'var(--purple)' }}
                    />
                    <span style={{ color: p.sourceApplicability[k] ? 'var(--ink)' : 'var(--ink-mute)' }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="category-tabs">
              {CATEGORIES.filter(c => !c.appKey || p.sourceApplicability[c.appKey] !== false).map(({ key, label, icon: Icon }) => (
                <button key={key} className={cat === key ? 'active' : ''} onClick={() => setCat(key)}>
                  <Icon size={15} /> {label} <span>{counts[key]}</span>
                </button>
              ))}
            </div>
            <div className="category-panel">
              {cat === 'production' && (
                <div className="form-card">
                  <h2>Production volumes</h2>
                  <p className="form-sub">Reporting-period volumes drive intensity metrics (kgCO2e/ADt pulp, t paper, t board).</p>
                  <div className="field-row">
                    <NumField label="Air-dry pulp (ADt)" unit="t" value={ad.production.airDryPulpTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.airDryPulpTonnes = v))} />
                    <NumField label="Paper produced" unit="t" value={ad.production.paperProducedTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.paperProducedTonnes = v))} />
                    <NumField label="Board produced" unit="t" value={ad.production.boardProducedTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.boardProducedTonnes = v))} />
                  </div>
                </div>
              )}
              {cat === 'stationary' && <StationaryTable entries={ad.stationaryCombustion} trace={trace} onChange={(rows) => patch((d) => (d.activityData.stationaryCombustion = rows))} />}
              {cat === 'biomass' && <BiomassTable entries={ad.biomassCombustion} trace={trace} onChange={(rows) => patch((d) => (d.activityData.biomassCombustion = rows))} />}
              {cat === 'limeKiln' && <LimeKilnTable entries={ad.limeKilns} trace={trace} onChange={(rows) => patch((d) => (d.activityData.limeKilns = rows))} />}
              {cat === 'makeup' && <MakeupTable entries={ad.makeupCarbonates} trace={trace} onChange={(rows) => patch((d) => (d.activityData.makeupCarbonates = rows))} />}
              {cat === 'mobile' && <MobileTable entries={ad.mobile} trace={trace} onChange={(rows) => patch((d) => (d.activityData.mobile = rows))} />}
              {cat === 'landfill' && <LandfillTable entries={ad.landfills} trace={trace} onChange={(rows) => patch((d) => (d.activityData.landfills = rows))} />}
              {cat === 'wwt' && <WwtTable entries={ad.anaerobicWwt} trace={trace} onChange={(rows) => patch((d) => (d.activityData.anaerobicWwt = rows))} />}
              {cat === 'refrigerant' && <RefrigerantTable entries={ad.refrigerants} trace={trace} onChange={(rows) => patch((d) => (d.activityData.refrigerants = rows))} />}
              {cat === 'chp' && <ChpTable entries={ad.chpAllocation} trace={trace} onChange={(rows) => patch((d) => (d.activityData.chpAllocation = rows))} />}
              {cat === 'transfer' && <TransferTable entries={ad.co2Transfers} trace={trace} onChange={(rows) => patch((d) => (d.activityData.co2Transfers = rows))} />}
              {cat === 'reported' && (
                <>
                  <ReportedTable entries={ad.reported} trace={trace} onChange={(rows) => patch((d) => (d.activityData.reported = rows))} />
                  <div className="form-card">
                    <h2>Reconciliation against a disclosed total</h2>
                    <p className="form-sub">Optional. If you have a published gross Scope 1 figure, enter it here. We flag a variance &gt;5%.</p>
                    <div className="field-row">
                      <NumField label="Disclosed gross Scope 1" unit="tCO2e" value={ad.disclosedGrossScope1CO2eTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedGrossScope1CO2eTonnes = v))} hint="from public disclosure" />
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
              <span>Gross Scope 1 (CO2 + CH4 + N2O + HFCs)</span>
              <strong>{fmt.format(result.scope1.grossScope1CO2eTonnes)}</strong>
              <small>tCO2e</small>
              <p style={{ marginTop: 10 }}>
                CO2 {fmt.format(result.scope1.byGas.co2Tonnes)} t · CH4 {fmt.format(result.scope1.byGas.ch4Tonnes)} t ({fmt.format(result.scope1.byGas.ch4CO2eTonnes)} tCO2e) · N2O {fmt.format(result.scope1.byGas.n2oTonnes)} t · refrigerants {fmt.format(result.scope1.byGas.refrigerantCO2eTonnes)} tCO2e
              </p>
            </div>

            <div className="summary-cats">
              {(Object.entries(result.scope1.byCategory) as [string, { co2eTonnes: number }][]).map(([k, g]) => (
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
              <div className="summary-card"><span>Supporting Scope 2</span><strong>{fmt.format(result.supportingScope2.purchasedElectricityCO2eTonnes)}</strong><small>tCO2e (electricity)</small></div>
              <div className="summary-card"><span>Supporting Scope 3</span><strong>{fmt.format(result.supportingScope3.thirdPartyMobileCO2eTonnes)}</strong><small>tCO2e (third-party mobile)</small></div>
            </div>

            {result.reconciliation.checked && (
              <div className="form-card">
                <h2>Reconciliation vs disclosed total</h2>
                <p className="form-sub">{result.reconciliation.note}</p>
                <div className="summary-cats">
                  <div className="summary-card"><span>Disclosed</span><strong>{fmt.format(result.reconciliation.disclosedGrossCO2eTonnes ?? 0)}</strong><small>tCO2e</small></div>
                  <div className="summary-card"><span>Modelled (this calc)</span><strong>{fmt.format(result.reconciliation.modelledGrossCO2eTonnes)}</strong><small>tCO2e</small></div>
                  <div className="summary-card"><span>Variance</span><strong>{fmt.format(result.reconciliation.variancePercent ?? 0)}%</strong><small>{Math.abs(result.reconciliation.variancePercent ?? 0) > 5 ? 'exceeds ±5% — review' : 'within ±5%'}</small></div>
                </div>
              </div>
            )}

            {/* Production & intensity — production volumes ARE the denominators */}
            {((p.activityData.production.airDryPulpTonnes ?? 0) > 0 || (p.activityData.production.paperProducedTonnes ?? 0) > 0 || (p.activityData.production.boardProducedTonnes ?? 0) > 0) && (
              <div className="form-card">
                <h2>Production &amp; intensity</h2>
                <p className="form-sub">Reporting-period production volumes (the denominators) and the derived emission intensities (kgCO2e per unit produced).</p>
                <div className="summary-cats">
                  {(p.activityData.production.airDryPulpTonnes ?? 0) > 0 && (
                    <div className="summary-card"><span>Air-dry pulp produced</span><strong>{fmt.format(p.activityData.production.airDryPulpTonnes ?? 0)}</strong><small>ADt</small></div>
                  )}
                  {(p.activityData.production.paperProducedTonnes ?? 0) > 0 && (
                    <div className="summary-card"><span>Paper produced</span><strong>{fmt.format(p.activityData.production.paperProducedTonnes ?? 0)}</strong><small>t</small></div>
                  )}
                  {(p.activityData.production.boardProducedTonnes ?? 0) > 0 && (
                    <div className="summary-card"><span>Board produced</span><strong>{fmt.format(p.activityData.production.boardProducedTonnes ?? 0)}</strong><small>t</small></div>
                  )}
                  {result.intensityMetrics.co2ePerAdtPulp != null && <div className="summary-card"><span>Intensity per ADt pulp</span><strong>{fmt.format(result.intensityMetrics.co2ePerAdtPulp)}</strong><small>kgCO2e / ADt</small></div>}
                  {result.intensityMetrics.co2ePerTonnePaper != null && <div className="summary-card"><span>Intensity per t paper</span><strong>{fmt.format(result.intensityMetrics.co2ePerTonnePaper)}</strong><small>kgCO2e / t</small></div>}
                  {result.intensityMetrics.co2ePerTonneBoard != null && <div className="summary-card"><span>Intensity per t board</span><strong>{fmt.format(result.intensityMetrics.co2ePerTonneBoard)}</strong><small>kgCO2e / t</small></div>}
                  {result.intensityMetrics.fossilCo2PerAdtPulp != null && <div className="summary-card"><span>Fossil CO2 / ADt pulp</span><strong>{fmt.format(result.intensityMetrics.fossilCo2PerAdtPulp)}</strong><small>kgCO2 / ADt</small></div>}
                </div>
              </div>
            )}
            {!((p.activityData.production.airDryPulpTonnes ?? 0) > 0 || (p.activityData.production.paperProducedTonnes ?? 0) > 0 || (p.activityData.production.boardProducedTonnes ?? 0) > 0) && (
              <div className="form-card">
                <h2>Production &amp; intensity</h2>
                <p className="form-sub">No production volumes entered — intensity metrics (kgCO2e / ADt pulp, t paper, t board) are unavailable. Add production volumes on Step 4 &rarr; <b>Production</b> tab to enable them.</p>
              </div>
            )}

            {result.assumptions.length > 0 && (
              <div className="form-card">
                <h2>Assumptions &amp; limitations</h2>
                <p className="form-sub">Every default, fallback, override, and estimated basis the inventory relied on — the auditable trail for assurance.</p>
                {result.assumptions.map((a, i) => (
                  <p key={i} className="form-sub" style={{ margin: '4px 0' }}>
                    <span className="entry-badge" style={{ marginRight: 8 }}>{a.kind.toLowerCase()}</span>
                    <b>{a.label}</b> — {a.detail}
                  </p>
                ))}
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="form-card" style={{ borderColor: '#c2410c' }}>
                <h2><AlertCircle size={18} /> Validation errors</h2>
                {result.errors.map((e, i) => <p key={i} className="form-sub"><b>{e.code}</b> — {e.message}</p>)}
              </div>
            )}
            {result.warnings.length > 0 && (
              <div className="form-card">
                <h2><Info size={18} /> Warnings</h2>
                {result.warnings.map((w, i) => <p key={i} className="form-sub"><b>{w.code}</b> — {w.message}</p>)}
              </div>
            )}
            {result.errors.length === 0 && result.warnings.length === 0 && (
              <div className="form-card"><h2><CheckCircle2 size={18} /> Clean run</h2><p className="form-sub">No validation issues raised.</p></div>
            )}

            <div className="form-card">
              <h2>Audit trail</h2>
              <p className="form-sub">
                {result.calculationTrace.length} calculation steps · {result.factorSnapshots.length} factor snapshots recorded · methodology pack <b>{result.methodologyPack}</b> · GWP <b>{result.gwpSet.replace('_', ' · ')}</b>. Every override is captured with its reason. Click <b>Calculate &amp; save</b> below to persist this inventory; export an audit-ready Excel, PDF, JSON, or CSV bundle.
              </p>
              {result.calculationId && (
                <p className="form-sub" style={{ marginTop: 8 }}>
                  <span className="entry-badge entry-badge-s1" style={{ marginRight: 8 }}>saved</span>
                  Calculation ID: <code>{result.calculationId}</code>
                </p>
              )}
            </div>

            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(4)}>Back to data</button>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn ghost" onClick={() => download('xlsx')}><Leaf size={15} /> Excel</button>
                <button className="btn ghost" onClick={() => download('pdf')}><FileText size={15} /> PDF</button>
                <button className="btn ghost" onClick={() => download('csv')}><FileText size={15} /> CSV</button>
                <button className="btn ghost" onClick={() => download('json')}><PenTool size={15} /> JSON</button>
                <button className="btn ghost" onClick={() => download('audit-pack')}><FileText size={15} /> Audit pack (.zip)</button>
                <button className="btn primary" onClick={() => runCalculate(true)} disabled={busy}>{busy ? 'Saving…' : 'Calculate & save'}</button>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
