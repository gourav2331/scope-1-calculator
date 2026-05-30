'use client'

/**
 * Iron & Steel Scope 1 wizard. 5 steps (Sector → Org/boundary → Plant/route/
 * methods → Activity data with route-driven applicability → Review). Same
 * look-and-feel as cement / O&G / P&P.
 *
 * Methodology: GHG Protocol + ISO 14064-1 + ISO 14404 + worldsteel CO2 v11 +
 * IPCC 2006 + 2019 Refinement. Carbon-balance Tier 2 for the major processes;
 * Tier 1 defaults for everything else.
 */

import {
  AlertCircle,
  CheckCircle2,
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

import { calculateIronSteel } from '@/lib/engine/ironsteel'
import type {
  BfBofEntry,
  CokeOvenEntry,
  DisclosureBoundaryBasis,
  DriEntry,
  EafEntry,
  FlaringEntry,
  FuelEntry,
  IronSteelCalculationResult,
  IronSteelGwpSet,
  IronSteelInputPayload,
  LimeKilnEntry,
  MobileEntry,
  OtherFugitiveEntry,
  RefrigerantEntry,
  Sf6Entry,
  SinterEntry,
} from '@/lib/engine/ironsteel'
import type { ReportedEntry } from '@/lib/engine/oilgas'

const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const fmt4 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

type Num = number | null
function uid(): string { return Math.random().toString(36).slice(2, 10) }
function toNum(v: string): Num {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* ----------------------------- categories tab ----------------------------- */

type Cat =
  | 'production' | 'stationary' | 'mobile' | 'cokeOven' | 'flaring' | 'sinter'
  | 'dri' | 'bfBof' | 'eaf' | 'limeKiln' | 'fugitiveHFC' | 'fugitiveSF6' | 'fugitiveOther' | 'reported'

const CATEGORIES: { key: Cat; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; appKey?: keyof IronSteelInputPayload['sourceApplicability'] }[] = [
  { key: 'production', label: 'Production', icon: Factory },
  { key: 'stationary', label: 'Stationary', icon: Flame, appKey: 'stationaryCombustion' },
  { key: 'mobile', label: 'Mobile', icon: Truck, appKey: 'mobile' },
  { key: 'cokeOven', label: 'Coke oven', icon: Hexagon, appKey: 'cokeOven' },
  { key: 'flaring', label: 'Flaring', icon: Flame, appKey: 'flaring' },
  { key: 'sinter', label: 'Sinter', icon: Recycle, appKey: 'sinter' },
  { key: 'dri', label: 'DRI', icon: Fuel, appKey: 'dri' },
  { key: 'bfBof', label: 'BF / BOF', icon: Factory, appKey: 'bfBof' },
  { key: 'eaf', label: 'EAF', icon: Zap, appKey: 'eaf' },
  { key: 'limeKiln', label: 'Lime kiln', icon: TreePine, appKey: 'limeKiln' },
  { key: 'fugitiveHFC', label: 'HFCs', icon: Snowflake, appKey: 'fugitiveHFC' },
  { key: 'fugitiveSF6', label: 'SF6', icon: Wind, appKey: 'fugitiveSF6' },
  { key: 'fugitiveOther', label: 'Other CH4', icon: Wind, appKey: 'fugitiveOther' },
  { key: 'reported', label: 'Reported', icon: FileText, appKey: 'reported' },
]

/** Route-driven applicability defaults per FRS §3 decision tree. */
const ROUTE_APPLICABILITY: Record<IronSteelInputPayload['facility']['processRoute'], IronSteelInputPayload['sourceApplicability']> = {
  BF_BOF:       { stationaryCombustion: true, mobile: true, cokeOven: true, flaring: true, sinter: true, dri: false, bfBof: true, eaf: false, limeKiln: true, fugitiveHFC: true, fugitiveSF6: true, fugitiveOther: true, reported: true, purchasedElectricity: true },
  EAF:          { stationaryCombustion: true, mobile: true, cokeOven: false, flaring: false, sinter: false, dri: false, bfBof: false, eaf: true, limeKiln: false, fugitiveHFC: true, fugitiveSF6: true, fugitiveOther: false, reported: true, purchasedElectricity: true },
  DRI_EAF_GAS:  { stationaryCombustion: true, mobile: true, cokeOven: false, flaring: false, sinter: false, dri: true, bfBof: false, eaf: true, limeKiln: true, fugitiveHFC: true, fugitiveSF6: true, fugitiveOther: false, reported: true, purchasedElectricity: true },
  DRI_EAF_COAL: { stationaryCombustion: true, mobile: true, cokeOven: false, flaring: false, sinter: false, dri: true, bfBof: false, eaf: true, limeKiln: true, fugitiveHFC: true, fugitiveSF6: true, fugitiveOther: true, reported: true, purchasedElectricity: true },
  DRI_EAF_H2:   { stationaryCombustion: true, mobile: true, cokeOven: false, flaring: false, sinter: false, dri: true, bfBof: false, eaf: true, limeKiln: true, fugitiveHFC: true, fugitiveSF6: true, fugitiveOther: false, reported: true, purchasedElectricity: true },
  INDUCTION:    { stationaryCombustion: true, mobile: true, cokeOven: false, flaring: false, sinter: false, dri: false, bfBof: false, eaf: false, limeKiln: false, fugitiveHFC: true, fugitiveSF6: true, fugitiveOther: false, reported: true, purchasedElectricity: true },
  INTEGRATED:   { stationaryCombustion: true, mobile: true, cokeOven: true, flaring: true, sinter: true, dri: true, bfBof: true, eaf: true, limeKiln: true, fugitiveHFC: true, fugitiveSF6: true, fugitiveOther: true, reported: true, purchasedElectricity: true },
  MIXED:        { stationaryCombustion: true, mobile: true, cokeOven: true, flaring: true, sinter: true, dri: true, bfBof: true, eaf: true, limeKiln: true, fugitiveHFC: true, fugitiveSF6: true, fugitiveOther: true, reported: true, purchasedElectricity: true },
}

const APPLICABILITY_LABELS: Record<keyof IronSteelInputPayload['sourceApplicability'], string> = {
  stationaryCombustion: 'Stationary combustion (boilers, reheat / annealing furnaces, hot-blast stoves)',
  mobile: 'Mobile / on-site equipment (locomotives, haul trucks, forklifts)',
  cokeOven: 'Onsite coke production',
  flaring: 'Process-gas flaring (COG / BFG / BOFG)',
  sinter: 'Sinter plant',
  dri: 'Direct Reduced Iron (DRI shaft)',
  bfBof: 'Blast furnace + BOF (integrated route)',
  eaf: 'Electric Arc Furnace',
  limeKiln: 'Onsite lime kiln',
  fugitiveHFC: 'Refrigerant HFC fugitives (chillers / AC)',
  fugitiveSF6: 'SF6 from HV switchgear',
  fugitiveOther: 'Other CH4 fugitives (coal stockpile, coke-oven seals, NG pipelines)',
  reported: 'Reported / direct-entry (corporate aggregate disclosure)',
  purchasedElectricity: 'Purchased electricity (supporting Scope 2)',
}

/* ----------------------------- empty payload ----------------------------- */

function emptyIronSteelPayload(): IronSteelInputPayload {
  const year = new Date().getFullYear()
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year, startDate: `${year}-01-01`, endDate: `${year}-12-31` },
      inventoryVersion: 'SUSTALLY_IS_V10',
      gwpSet: 'AR6_100',
    },
    organization: { name: '', country: 'IN', contactName: '', contactEmail: '', contactPhone: '', contactRole: '' },
    facility: { name: '', processRoute: 'BF_BOF' },
    organizationBoundary: { boundaryMethod: 'OPERATIONAL_CONTROL', ownershipSharePercent: 100, consolidationPercent: 100 },
    sector: { sectorCode: 'IRON_STEEL' },
    methodSelections: {
      stationaryMethod: 'ENERGY_BASED',
      mobileMethod: 'FUEL_BASED',
      sinterMethod: 'TIER1_DEFAULT',
      cokeMethod: 'TIER1_DEFAULT',
      bfBofMethod: 'TIER1_INTEGRATED',
      eafMethod: 'TIER1_ELECTRODES_ONLY',
      driMethod: 'TIER1_DEFAULT',
      electricityMethod: 'LOCATION_BASED_SUPPORTING',
      processGasAllocation: 'POINT_OF_EMISSION',
    },
    sourceApplicability: ROUTE_APPLICABILITY.BF_BOF,
    activityData: {
      production: {},
      stationaryCombustion: [], mobile: [], cokeOven: [], flaring: [], sinter: [], dri: [],
      bfBof: [], eaf: [], limeKiln: [], fugitiveHFC: [], fugitiveSF6: [], fugitiveOther: [],
      reported: [],
      purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null },
    },
    factorOverrides: {},
  }
}

/** Sample integrated mill (BF-BOF route) for the Try-with-sample button. */
function sampleIntegratedMill(): IronSteelInputPayload {
  const p = emptyIronSteelPayload()
  p.organization = { name: 'Sample Steel Ltd', country: 'IN', contactName: 'Vikram Kapoor', contactEmail: 'vikram.k@samplesteel.example', contactPhone: '+91 98xxxxxxxx', contactRole: 'Head of Decarbonisation' }
  p.facility = { name: 'Jharkhand Integrated Mill', processRoute: 'BF_BOF', state: 'JH', hasOwnPowerPlant: true }
  p.activityData.production = { crudeSteelTonnes: 4_000_000, hotMetalTonnes: 3_800_000, hotRolledTonnes: 3_500_000, sinterProducedTonnes: 4_500_000, cokeProducedTonnes: 1_800_000 }
  p.activityData.stationaryCombustion = [
    { id: uid(), label: 'Power boiler — bituminous coal', fuelCode: 'bituminous_coal', technology: 'BOILER', quantity: 200_000, quantityUnit: 'tonne', useIndiaNatcom: true, overrideReason: 'India NATCOM CEF applied (Indian operations)' },
    { id: uid(), label: 'Reheat furnace — natural gas', fuelCode: 'natural_gas', technology: 'REHEAT_FURNACE', quantity: 50_000_000, quantityUnit: 'Sm3' },
  ]
  p.activityData.bfBof = [{ id: uid(), label: 'BF #1 + BOF #1 integrated', method: 'TIER1_INTEGRATED', crudeSteelProducedTonnes: 4_000_000 }]
  p.activityData.sinter = [{ id: uid(), label: 'Sinter strand', method: 'TIER1_DEFAULT', sinterProducedTonnes: 4_500_000 }]
  p.activityData.cokeOven = [{ id: uid(), label: 'Coke battery', method: 'TIER1_DEFAULT', cokeProducedTonnes: 1_800_000 }]
  p.activityData.limeKiln = [{ id: uid(), label: 'Rotary lime kiln', kilnType: 'ROTARY', fuelCode: 'natural_gas', fuelQuantity: 8_000_000, fuelQuantityUnit: 'Sm3', limestoneChargedTonnes: 200_000 }]
  p.activityData.mobile = [{ id: uid(), label: 'Diesel haul fleet', ownership: 'OWNED_CONTROLLED', vehicleCode: 'DIESEL_HAUL', quantity: 5_000_000, quantityUnit: 'L' }]
  p.activityData.fugitiveHFC = [{ id: uid(), label: 'Plant chillers (R-410A)', gasCode: 'r410a', method: 'MASS_BALANCE', inventoryStartKg: 800, purchasedKg: 60, soldKg: 0, inventoryEndKg: 800, recoveredForRecycleKg: 0 }]
  p.activityData.fugitiveSF6 = [{ id: uid(), label: 'HV substation switchgear', nameplateInventoryKg: 2_500 }]
  p.activityData.fugitiveOther = [{ id: uid(), label: 'Coal stockpile CH4', source: 'COAL_STOCKPILE', activityTonnes: 2_000_000 }]
  p.activityData.purchasedElectricity = { mwh: 600_000, gridEfTco2PerMwh: null }
  return p
}

/* ----------------------------- draft autosave ----------------------------- */

const DRAFT_KEY = 'sustally:ironsteel:draft:v1'
function saveDraft(p: IronSteelInputPayload) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(p)) } catch {} }
function loadDraft(): IronSteelInputPayload | null { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) as IronSteelInputPayload : null } catch { return null } }
function draftIsMeaningful(p: IronSteelInputPayload): boolean {
  const a = p?.activityData
  const hasName = !!p?.organization?.name?.trim() || !!p?.facility?.name?.trim()
  const hasAny =
    (a?.stationaryCombustion?.length ?? 0) > 0 || (a?.mobile?.length ?? 0) > 0 ||
    (a?.cokeOven?.length ?? 0) > 0 || (a?.flaring?.length ?? 0) > 0 ||
    (a?.sinter?.length ?? 0) > 0 || (a?.dri?.length ?? 0) > 0 ||
    (a?.bfBof?.length ?? 0) > 0 || (a?.eaf?.length ?? 0) > 0 ||
    (a?.limeKiln?.length ?? 0) > 0 || (a?.fugitiveHFC?.length ?? 0) > 0 ||
    (a?.fugitiveSF6?.length ?? 0) > 0 || (a?.fugitiveOther?.length ?? 0) > 0 ||
    (a?.reported?.length ?? 0) > 0
  return hasName || hasAny
}

/* --------------------------- shared form atoms --------------------------- */

const S1_BADGE = <span className="entry-badge entry-badge-s1">Gross Scope 1 (CO2e)</span>
const S3_BADGE = <span className="entry-badge entry-badge-s3">Supporting Scope 3 (excluded)</span>
const MEMO_BADGE = <span className="entry-badge entry-badge-mixed">Biogenic CO2 → memo only</span>

function NumField({ label, value, onChange, unit, step = 'any', hint }: { label: string; value: Num; onChange: (v: Num) => void; unit?: string; step?: string; hint?: string }) {
  return (
    <label className="field">
      {label}{unit ? <span style={{ color: 'var(--muted)', marginLeft: 6, fontWeight: 400 }}>{unit}</span> : null}
      <input type="number" step={step} value={value == null ? '' : String(value)} onChange={(e) => onChange(toNum(e.target.value))} />
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
              <input value={evidenceReference ?? ''} placeholder="meter log · fuel invoice · lab report · LDAR record" onChange={(e) => onEvidenceChange({ evidenceReference: e.target.value })} />
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
  const add = () => onChange([...entries, { id: uid(), label: 'Power boiler', fuelCode: 'natural_gas', technology: 'BOILER', quantity: null, quantityUnit: 'Sm3' }])
  const FUELS = ['natural_gas','coking_coal','bituminous_coal','sub_bituminous_coal','lignite','anthracite','coke_oven_coke','petcoke','residual_oil','diesel','lpg','coke_oven_gas','blast_furnace_gas','bof_gas']
  const TECHS = ['BOILER','REHEAT_FURNACE','COKE_OVEN_UNDERFIRING','HOT_BLAST_STOVE','TURBINE','ENGINE','SINTER_STRAND','PULVERIZED','CFB']
  return (
    <div className="form-card">
      <h2>Stationary combustion</h2>
      <p className="form-sub">Boilers, reheat / annealing furnaces, hot-blast stoves, coke-oven underfiring, RTOs, turbines, engines. Process gases (COG / BFG / BOFG) are first-class fuels. Tick <b>India NATCOM CEF</b> for Indian-coal rows.</p>
      {entries.length === 0 && <p className="form-sub">No fuel rows yet — click <b>Add fuel</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Stationary - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>quantity × NCV ÷ 1000 × CO2 EF = tCO2 · CH4/N2O = energy × EF_tech / 1000 · fossil → Scope 1</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Fuel
                <select value={e.fuelCode} onChange={(ev) => upd(e.id, (f) => (f.fuelCode = ev.target.value))}>{FUELS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </label>
              <label className="field">Combustion tech
                <select value={e.technology ?? 'BOILER'} onChange={(ev) => upd(e.id, (f) => (f.technology = ev.target.value))}>{TECHS.map((c) => <option key={c} value={c}>{c.toLowerCase().replace(/_/g, ' ')}</option>)}</select>
              </label>
              <NumField label="Quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (f) => (f.quantity = v))} />
            </div>
            <div className="field-row">
              <label className="field">Unit
                <select value={e.quantityUnit} onChange={(ev) => upd(e.id, (f) => (f.quantityUnit = ev.target.value))}>{['Sm3','Nm3','tonne','L','GJ'].map((u) => <option key={u} value={u}>{u}</option>)}</select>
              </label>
              <NumField label="NCV override" unit={`GJ/${e.quantityUnit}`} step="0.0001" value={e.ncvGjPerUnit ?? null} onChange={(v) => upd(e.id, (f) => (f.ncvGjPerUnit = v))} hint="blank = library" />
              <NumField label="CO2 EF override" unit="kg/GJ" step="0.01" value={e.co2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (f) => (f.co2EfKgPerGj = v))} hint="blank = library" />
              <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!e.useIndiaNatcom} onChange={(ev) => upd(e.id, (f) => (f.useIndiaNatcom = ev.target.checked))} style={{ width: 16, height: 16, accentColor: 'var(--purple)' }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>India NATCOM CEF</span>
              </label>
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add fuel</button>
    </div>
  )
}

function MobileTable({ entries, trace, onChange }: { entries: MobileEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: MobileEntry[]) => void }) {
  const upd = (id: string, mut: (f: MobileEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Yard equipment', ownership: 'OWNED_CONTROLLED', vehicleCode: 'DIESEL_OFFROAD', quantity: null, quantityUnit: 'L' }])
  const VEH = ['DIESEL_OFFROAD','DIESEL_HAUL','DIESEL_LOCO','LPG_FORKLIFT','NATGAS_MOBILE']
  return (
    <div className="form-card">
      <h2>Mobile / on-site equipment</h2>
      <p className="form-sub">Locomotives, slag pots, ladle cars, forklifts, haul trucks. Owned/controlled → Scope 1; third-party transport → Scope 3 (excluded). N2O is the dominant non-CO2 GHG for diesel off-road.</p>
      {entries.length === 0 && <p className="form-sub">No mobile rows yet — click <b>Add equipment</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={e.ownership === 'OWNED_CONTROLLED' ? S1_BADGE : S3_BADGE}
          co2={traceOut(trace, `${e.ownership === 'OWNED_CONTROLLED' ? 'Mobile (owned)' : 'Mobile (third-party, supporting Scope 3, EXCLUDED)'} - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>E = qty × NCV × EF / 1000 (CO2/CH4/N2O)</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Ownership
                <select value={e.ownership} onChange={(ev) => upd(e.id, (f) => (f.ownership = ev.target.value as MobileEntry['ownership']))}>
                  <option value="OWNED_CONTROLLED">Owned / controlled</option>
                  <option value="THIRD_PARTY">Third-party (excluded)</option>
                </select>
              </label>
              <label className="field">Vehicle / fuel
                <select value={e.vehicleCode} onChange={(ev) => upd(e.id, (f) => (f.vehicleCode = ev.target.value))}>{VEH.map((c) => <option key={c} value={c}>{c.toLowerCase().replace(/_/g, ' ')}</option>)}</select>
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

function CokeOvenTable({ entries, trace, onChange }: { entries: CokeOvenEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: CokeOvenEntry[]) => void }) {
  const upd = (id: string, mut: (f: CokeOvenEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Coke battery', method: 'TIER1_DEFAULT', cokeProducedTonnes: null }])
  return (
    <div className="form-card">
      <h2>Onsite coke production</h2>
      <p className="form-sub">Tier 1: coke × 0.56 tCO2/t (IPCC 2006 recovery oven). Tier 2: carbon balance (coal C in − coke C − COG C − tar C) × 44/12.</p>
      {entries.length === 0 && <p className="form-sub">No coke ovens yet — click <b>Add coke battery</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Coke oven - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={e.method === 'TIER1_DEFAULT' ? <>CO2 = coke × 0.56</> : <>CO2 = (coal × C − coke × C − COG × C − tar × C) × 44/12</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Method
                <select value={e.method} onChange={(ev) => upd(e.id, (f) => (f.method = ev.target.value as CokeOvenEntry['method']))}>
                  <option value="TIER1_DEFAULT">Tier 1 default (0.56 tCO2/t)</option>
                  <option value="TIER2_CARBON_BALANCE">Tier 2 carbon balance</option>
                </select>
              </label>
              <NumField label="Coke produced" unit="t" value={e.cokeProducedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.cokeProducedTonnes = v))} />
            </div>
            {e.method === 'TIER2_CARBON_BALANCE' && (
              <div className="field-row">
                <NumField label="Coking coal charged" unit="t" value={e.cokingCoalChargedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.cokingCoalChargedTonnes = v))} />
                <NumField label="Coke out" unit="t" value={e.cokeOutTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.cokeOutTonnes = v))} />
                <NumField label="COG produced" unit="Nm3" value={e.cogProducedNm3 ?? null} onChange={(v) => upd(e.id, (f) => (f.cogProducedNm3 = v))} hint="credit (export)" />
                <NumField label="Tar / BTX produced" unit="t" value={e.tarBtxProducedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.tarBtxProducedTonnes = v))} hint="carbon retained" />
              </div>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add coke battery</button>
    </div>
  )
}

function SinterTable({ entries, trace, onChange }: { entries: SinterEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: SinterEntry[]) => void }) {
  const upd = (id: string, mut: (f: SinterEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Sinter strand', method: 'TIER1_DEFAULT', sinterProducedTonnes: null }])
  return (
    <div className="form-card">
      <h2>Sinter plant</h2>
      <p className="form-sub">Tier 1: sinter × 0.20 tCO2/t (IPCC 2006). Tier 2: coke breeze + fluxes + NG. Plus Tier-1 CH4 (0.07 kg/t) and N2O (0.025 kg/t) from 2019 Refinement.</p>
      {entries.length === 0 && <p className="form-sub">No sinter strands yet — click <b>Add sinter strand</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Sinter - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>CO2 = sinter × 0.20 OR Σ(coke C×44/12 + flux 0.440/0.477 + NG×EFng)</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Method
                <select value={e.method} onChange={(ev) => upd(e.id, (f) => (f.method = ev.target.value as SinterEntry['method']))}>
                  <option value="TIER1_DEFAULT">Tier 1 default (0.20 tCO2/t)</option>
                  <option value="TIER2_CARBON_BALANCE">Tier 2 carbon balance</option>
                </select>
              </label>
              <NumField label="Sinter produced" unit="t" value={e.sinterProducedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.sinterProducedTonnes = v))} />
            </div>
            {e.method === 'TIER2_CARBON_BALANCE' && (
              <div className="field-row">
                <NumField label="Coke breeze" unit="t" value={e.cokeBreezeConsumedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.cokeBreezeConsumedTonnes = v))} />
                <NumField label="Limestone flux" unit="t" value={e.fluxLimestoneTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.fluxLimestoneTonnes = v))} />
                <NumField label="Dolomite flux" unit="t" value={e.fluxDolomiteTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.fluxDolomiteTonnes = v))} />
                <NumField label="NG consumed" unit="GJ" value={e.naturalGasConsumedGj ?? null} onChange={(v) => upd(e.id, (f) => (f.naturalGasConsumedGj = v))} />
              </div>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add sinter strand</button>
    </div>
  )
}

function DriTable({ entries, trace, onChange }: { entries: DriEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: DriEntry[]) => void }) {
  const upd = (id: string, mut: (f: DriEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'DRI shaft', driType: 'NATURAL_GAS', method: 'TIER1_DEFAULT', driProducedTonnes: null }])
  return (
    <div className="form-card">
      <h2>Direct Reduced Iron (DRI)</h2>
      <p className="form-sub">Tier 1 defaults by route: NG-based 0.70 tCO2/t · Coal-based (rotary kiln, India typical) 2.50 · Green-H2 0.15 · Syngas 0.70. Tier 2: reductant C in − DRI C out.</p>
      {entries.length === 0 && <p className="form-sub">No DRI units yet — click <b>Add DRI shaft</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `DRI - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={e.method === 'TIER1_DEFAULT' ? <>CO2 = DRI × EF_route</> : <>CO2 = (reductant × C − DRI × C) × 44/12</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Route
                <select value={e.driType} onChange={(ev) => upd(e.id, (f) => (f.driType = ev.target.value as DriEntry['driType']))}>
                  <option value="NATURAL_GAS">Natural-gas (MIDREX / Energiron)</option>
                  <option value="COAL_BASED">Coal-based (rotary kiln)</option>
                  <option value="GREEN_HYDROGEN">Green hydrogen</option>
                  <option value="SYNGAS">Syngas</option>
                </select>
              </label>
              <label className="field">Method
                <select value={e.method} onChange={(ev) => upd(e.id, (f) => (f.method = ev.target.value as DriEntry['method']))}>
                  <option value="TIER1_DEFAULT">Tier 1 default</option>
                  <option value="TIER2_CARBON_BALANCE">Tier 2 carbon balance</option>
                </select>
              </label>
              <NumField label="DRI produced" unit="t" value={e.driProducedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.driProducedTonnes = v))} />
            </div>
            {e.method === 'TIER2_CARBON_BALANCE' && (
              <div className="field-row">
                <NumField label="Reductant consumed" unit={e.driType === 'NATURAL_GAS' ? 'Sm3' : 't'} value={e.reductantConsumed ?? null} onChange={(v) => upd(e.id, (f) => (f.reductantConsumed = v))} />
              </div>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add DRI shaft</button>
    </div>
  )
}

function BfBofTable({ entries, trace, onChange }: { entries: BfBofEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: BfBofEntry[]) => void }) {
  const upd = (id: string, mut: (f: BfBofEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'BF + BOF', method: 'TIER1_INTEGRATED', crudeSteelProducedTonnes: null }])
  return (
    <div className="form-card">
      <h2>Blast furnace + BOF</h2>
      <p className="form-sub">The dominant source of an integrated mill (~70% of CO2). Tier 1 integrated default: crude steel × 1.46 tCO2/t. Tier 2: BF carbon balance + BOF carbon balance with process-gas (BFG / BOFG) export credit.</p>
      {entries.length === 0 && <p className="form-sub">No BF / BOF units yet — click <b>Add BF + BOF</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `BF/BOF - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={e.method === 'TIER1_INTEGRATED' ? <>CO2 = crude_steel × 1.46 (IPCC integrated)</> : <>BF: (coke + PCI + NG + 12%·CaCO3 + 13.2%·Dolomite − HM·4.3% − BFG·C)·44/12; BOF: (HM + scrap − CS − slag − BOFG)·44/12</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Method
                <select value={e.method} onChange={(ev) => upd(e.id, (f) => (f.method = ev.target.value as BfBofEntry['method']))}>
                  <option value="TIER1_INTEGRATED">Tier 1 integrated (1.46 tCO2/t CS)</option>
                  <option value="TIER2_CARBON_BALANCE">Tier 2 carbon balance</option>
                </select>
              </label>
              <NumField label="Crude steel produced" unit="t" value={e.crudeSteelProducedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.crudeSteelProducedTonnes = v))} />
            </div>
            {e.method === 'TIER2_CARBON_BALANCE' && (
              <>
                <div className="field-row">
                  <NumField label="Coke charged" unit="t" value={e.cokeChargedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.cokeChargedTonnes = v))} />
                  <NumField label="PCI coal" unit="t" value={e.pciCoalTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.pciCoalTonnes = v))} />
                  <NumField label="NG injected" unit="GJ" value={e.naturalGasInjectedGj ?? null} onChange={(v) => upd(e.id, (f) => (f.naturalGasInjectedGj = v))} />
                  <NumField label="Limestone to BF" unit="t" value={e.limestoneChargedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.limestoneChargedTonnes = v))} />
                </div>
                <div className="field-row">
                  <NumField label="Hot metal produced" unit="t" value={e.hotMetalProducedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.hotMetalProducedTonnes = v))} />
                  <NumField label="BFG exported" unit="Nm3" value={e.bfgExportedNm3 ?? null} onChange={(v) => upd(e.id, (f) => (f.bfgExportedNm3 = v))} />
                  <NumField label="Scrap to BOF" unit="t" value={e.scrapChargedToBof ?? null} onChange={(v) => upd(e.id, (f) => (f.scrapChargedToBof = v))} />
                  <NumField label="BOF slag" unit="t" value={e.bofSlagTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.bofSlagTonnes = v))} />
                </div>
              </>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add BF + BOF</button>
    </div>
  )
}

function EafTable({ entries, trace, onChange }: { entries: EafEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: EafEntry[]) => void }) {
  const upd = (id: string, mut: (f: EafEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'EAF #1', method: 'TIER1_ELECTRODES_ONLY', crudeSteelProducedTonnes: null }])
  return (
    <div className="form-card">
      <h2>Electric Arc Furnace (EAF)</h2>
      <p className="form-sub">Tier 1 electrodes-only: 0.08 tCO2/t crude steel. Tier 2: electrodes × 0.99 + charge C + DRI C + scrap C − CS C (0.5%), plus flux calcination + oxy-fuel NG.</p>
      {entries.length === 0 && <p className="form-sub">No EAFs yet — click <b>Add EAF</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `EAF - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={e.method === 'TIER1_ELECTRODES_ONLY' ? <>CO2 = crude_steel × 0.08</> : <>CO2 = [(electrode·0.99 + charge C + DRI C + scrap C) − CS·0.005] × 44/12 + lime·0.440 + dolomite·0.477 + NG·EFng/1000</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Method
                <select value={e.method} onChange={(ev) => upd(e.id, (f) => (f.method = ev.target.value as EafEntry['method']))}>
                  <option value="TIER1_ELECTRODES_ONLY">Tier 1 electrodes-only (0.08)</option>
                  <option value="TIER2_FULL_BALANCE">Tier 2 full carbon balance</option>
                </select>
              </label>
              <NumField label="Crude steel produced" unit="t" value={e.crudeSteelProducedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.crudeSteelProducedTonnes = v))} />
            </div>
            {e.method === 'TIER2_FULL_BALANCE' && (
              <>
                <div className="field-row">
                  <NumField label="Electrodes consumed" unit="t" value={e.electrodeConsumedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.electrodeConsumedTonnes = v))} hint="~1–4 kg/t steel" />
                  <NumField label="Charge carbon" unit="t" value={e.chargeCarbonTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.chargeCarbonTonnes = v))} hint="anthracite / coke breeze" />
                  <NumField label="DRI/HBI charged" unit="t" value={e.driChargedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.driChargedTonnes = v))} />
                  <NumField label="Scrap charged" unit="t" value={e.scrapChargedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.scrapChargedTonnes = v))} />
                </div>
                <div className="field-row">
                  <NumField label="Lime / CaCO3 charged" unit="t" value={e.limeChargedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.limeChargedTonnes = v))} />
                  <NumField label="Dolomite charged" unit="t" value={e.dolomiteChargedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.dolomiteChargedTonnes = v))} />
                  <NumField label="Oxy-fuel NG" unit="GJ" value={e.oxyFuelNaturalGasGj ?? null} onChange={(v) => upd(e.id, (f) => (f.oxyFuelNaturalGasGj = v))} />
                </div>
              </>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add EAF</button>
    </div>
  )
}

function LimeKilnTable({ entries, trace, onChange }: { entries: LimeKilnEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: LimeKilnEntry[]) => void }) {
  const upd = (id: string, mut: (f: LimeKilnEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Lime kiln', kilnType: 'ROTARY', fuelCode: 'natural_gas', fuelQuantity: null, fuelQuantityUnit: 'Sm3' }])
  return (
    <div className="form-card">
      <h2>Onsite lime kiln</h2>
      <p className="form-sub">Fuel combustion + carbonate calcination. CaCO3 → 0.440 tCO2/t; Dolomite → 0.477 tCO2/t. Charge limestone (CaCO3), not lime (CaO).</p>
      {entries.length === 0 && <p className="form-sub">No lime kilns yet — click <b>Add lime kiln</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Lime kiln - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>CO2_combustion = E × EFco2/1000; CO2_calcination = (CaCO3 × 0.440 + Dolomite × 0.477) × calcFrac</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Kiln type
                <select value={e.kilnType} onChange={(ev) => upd(e.id, (f) => (f.kilnType = ev.target.value as LimeKilnEntry['kilnType']))}>
                  <option value="ROTARY">Rotary</option><option value="SHAFT">Shaft</option><option value="FLUIDIZED_BED">Fluidized bed</option>
                </select>
              </label>
              <label className="field">Fuel
                <select value={e.fuelCode} onChange={(ev) => upd(e.id, (f) => (f.fuelCode = ev.target.value))}>{['natural_gas','coke_oven_gas','bof_gas','diesel','residual_oil'].map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </label>
              <NumField label="Fuel quantity" unit={e.fuelQuantityUnit} value={e.fuelQuantity ?? null} onChange={(v) => upd(e.id, (f) => (f.fuelQuantity = v))} />
            </div>
            <div className="field-row">
              <NumField label="Limestone (CaCO3) charged" unit="t" value={e.limestoneChargedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.limestoneChargedTonnes = v))} />
              <NumField label="Dolomite charged" unit="t" value={e.dolomiteChargedTonnes ?? null} onChange={(v) => upd(e.id, (f) => (f.dolomiteChargedTonnes = v))} />
              <NumField label="Calcination fraction" step="0.01" value={e.calcinationFraction ?? null} onChange={(v) => upd(e.id, (f) => (f.calcinationFraction = v))} hint="default 1.0 (full)" />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add lime kiln</button>
    </div>
  )
}

function FlaringTable({ entries, trace, onChange }: { entries: FlaringEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: FlaringEntry[]) => void }) {
  const upd = (id: string, mut: (f: FlaringEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'COG flare', gasType: 'COG', flaredVolumeNm3: null }])
  return (
    <div className="form-card">
      <h2>Process-gas flaring</h2>
      <p className="form-sub">CO2 from flared COG/BFG/BOFG. Default DRE 0.98 (lit assisted). Unlit flare ⇒ all gas vents (warning raised).</p>
      {entries.length === 0 && <p className="form-sub">No flares yet — click <b>Add flare</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Flaring - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>CO2 = V × C × DRE / 1000; CH4 slip = V × EF_CH4 × (1−DRE) / 1000</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (f) => (f.label = ev.target.value))} /></label>
              <label className="field">Gas type
                <select value={e.gasType} onChange={(ev) => upd(e.id, (f) => (f.gasType = ev.target.value as FlaringEntry['gasType']))}>
                  <option value="COG">COG (coke oven gas)</option><option value="BFG">BFG (blast furnace gas)</option>
                  <option value="BOFG">BOFG (BOF gas)</option><option value="MIXED">Mixed</option>
                </select>
              </label>
              <NumField label="Flared volume" unit="Nm3" value={e.flaredVolumeNm3} onChange={(v) => upd(e.id, (f) => (f.flaredVolumeNm3 = v))} />
              <NumField label="Combustion efficiency" step="0.01" value={e.combustionEfficiency ?? null} onChange={(v) => upd(e.id, (f) => (f.combustionEfficiency = v))} hint="0=vent, 0.98=lit assisted" />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add flare</button>
    </div>
  )
}

function HfcTable({ entries, trace, onChange }: { entries: RefrigerantEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: RefrigerantEntry[]) => void }) {
  const upd = (id: string, mut: (f: RefrigerantEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Plant chiller', gasCode: 'r410a', method: 'MASS_BALANCE' }])
  return (
    <div className="form-card">
      <h2>Refrigerant HFC fugitives</h2>
      <p className="form-sub">Chillers, AC, cold-rolling oil chillers. HFC GWPs use AR6 100-yr regardless of CH4 horizon.</p>
      {entries.length === 0 && <p className="form-sub">No refrigerants yet — click <b>Add refrigerant</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Refrigerant HFC - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={e.method === 'MASS_BALANCE' ? <>E = inv_start + purchased − sold − inv_end − recovered; CO2e = E × GWP / 1000</> : <>E = charge × leak_rate; CO2e = E × GWP / 1000</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
              <label className="field">Gas
                <select value={e.gasCode} onChange={(ev) => upd(e.id, (r) => (r.gasCode = ev.target.value))}>{['r134a','r410a','r404a','r407c','r32','r507a','r23','r125','r143a','r449a','r1234yf'].map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </label>
              <label className="field">Method
                <select value={e.method} onChange={(ev) => upd(e.id, (r) => (r.method = ev.target.value as RefrigerantEntry['method']))}>
                  <option value="MASS_BALANCE">Mass balance (preferred)</option><option value="SCREENING">Screening</option>
                </select>
              </label>
            </div>
            {e.method === 'MASS_BALANCE' ? (
              <>
                <div className="field-row">
                  <NumField label="Inventory start" unit="kg" value={e.inventoryStartKg ?? null} onChange={(v) => upd(e.id, (r) => (r.inventoryStartKg = v))} />
                  <NumField label="Purchased" unit="kg" value={e.purchasedKg ?? null} onChange={(v) => upd(e.id, (r) => (r.purchasedKg = v))} />
                  <NumField label="Sold" unit="kg" value={e.soldKg ?? null} onChange={(v) => upd(e.id, (r) => (r.soldKg = v))} />
                </div>
                <div className="field-row">
                  <NumField label="Inventory end" unit="kg" value={e.inventoryEndKg ?? null} onChange={(v) => upd(e.id, (r) => (r.inventoryEndKg = v))} />
                  <NumField label="Recovered for recycle" unit="kg" value={e.recoveredForRecycleKg ?? null} onChange={(v) => upd(e.id, (r) => (r.recoveredForRecycleKg = v))} />
                </div>
              </>
            ) : (
              <div className="field-row">
                <NumField label="Charge" unit="kg" value={e.chargeKg ?? null} onChange={(v) => upd(e.id, (r) => (r.chargeKg = v))} />
                <NumField label="Annual leak rate" step="0.001" value={e.annualLeakRate ?? null} onChange={(v) => upd(e.id, (r) => (r.annualLeakRate = v))} hint="0–1" />
              </div>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add refrigerant</button>
    </div>
  )
}

function Sf6Table({ entries, trace, onChange }: { entries: Sf6Entry[]; trace: TraceEntry[] | undefined; onChange: (rows: Sf6Entry[]) => void }) {
  const upd = (id: string, mut: (f: Sf6Entry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'HV substation', nameplateInventoryKg: null }])
  return (
    <div className="form-card">
      <h2>SF6 from switchgear</h2>
      <p className="form-sub">High-voltage switchgear at owned substations. Default sealed-pressure leak rate 0.5%/yr; older closed-pressure up to 8%/yr. SF6 GWP 25,200.</p>
      {entries.length === 0 && <p className="form-sub">No switchgear yet — click <b>Add SF6 source</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `SF6 - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>CO2e = leakedKg × 25,200 / 1000</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
              <NumField label="Nameplate inventory" unit="kg" value={e.nameplateInventoryKg ?? null} onChange={(v) => upd(e.id, (r) => (r.nameplateInventoryKg = v))} />
              <NumField label="Annual leak rate" step="0.001" value={e.annualLeakRate ?? null} onChange={(v) => upd(e.id, (r) => (r.annualLeakRate = v))} hint="default 0.005 (sealed-pressure)" />
              <NumField label="…or direct leaked mass" unit="kg/yr" value={e.leakedMassKg ?? null} onChange={(v) => upd(e.id, (r) => (r.leakedMassKg = v))} hint="overrides rate" />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add SF6 source</button>
    </div>
  )
}

function OtherFugitiveTable({ entries, trace, onChange }: { entries: OtherFugitiveEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: OtherFugitiveEntry[]) => void }) {
  const upd = (id: string, mut: (f: OtherFugitiveEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Coal stockpile', source: 'COAL_STOCKPILE' }])
  return (
    <div className="form-card">
      <h2>Other CH4 fugitives</h2>
      <p className="form-sub">Coal stockpile CH4, coke-oven seal CH4, NG pipeline leaks. Activity × EF (defaults: 0.13 kg CH4/t coal · 0.1 kg/t coke) or direct mass.</p>
      {entries.length === 0 && <p className="form-sub">No other fugitives yet — click <b>Add source</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Other fugitive - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          evidenceReference={e.evidenceReference} notes={e.overrideReason}
          onEvidenceChange={(patch) => upd(e.id, (x) => Object.assign(x, patch))}
          formula={<>CH4 kg = (direct mass | activity × EF); CO2e = CH4 × GWP / 1000</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
              <label className="field">Source
                <select value={e.source} onChange={(ev) => upd(e.id, (r) => (r.source = ev.target.value as OtherFugitiveEntry['source']))}>
                  <option value="COAL_STOCKPILE">Coal stockpile</option><option value="COKE_OVEN_SEAL">Coke-oven seal</option>
                  <option value="NG_PIPELINE">NG pipeline</option><option value="OTHER_CH4">Other CH4</option>
                </select>
              </label>
              <NumField label="Activity" unit="t" value={e.activityTonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.activityTonnes = v))} />
              <NumField label="…or direct CH4 mass" unit="kg" value={e.ch4MassKg ?? null} onChange={(v) => upd(e.id, (r) => (r.ch4MassKg = v))} />
            </div>
          </div>
        </EntryShell>
      ))}
      <button className="add-entry-btn" onClick={add}><Plus size={15} /> Add source</button>
    </div>
  )
}

function ReportedTable({ entries, trace, onChange }: { entries: ReportedEntry[]; trace: TraceEntry[] | undefined; onChange: (rows: ReportedEntry[]) => void }) {
  const upd = (id: string, mut: (f: ReportedEntry) => void) => onChange(entries.map((e) => e.id === id ? (() => { const c = { ...e }; mut(c); return c })() : e))
  const add = () => onChange([...entries, { id: uid(), label: 'Disclosed source', basis: 'REPORTED' }])
  return (
    <div className="form-card">
      <h2>Reported / direct emissions</h2>
      <p className="form-sub">For public-disclosure or head-office data: enter disclosed CO2e (or by-gas masses) directly when activity inputs aren&apos;t available.</p>
      {entries.length === 0 && <p className="form-sub">No reported figures yet — click <b>Add reported figure</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed)'} badge={S1_BADGE} co2={traceOut(trace, `Reported / direct - ${e.label}`)}
          onRemove={() => onChange(entries.filter((x) => x.id !== e.id))}
          formula={<>direct disclosed CO2e, or CO2 + CH4·GWP + N2O·GWP from reported gas masses</>}>
          <div className="entry-card-section">
            <div className="field-row">
              <label className="field">Label<input value={e.label} onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
              <label className="field">Source / category tag<input value={e.categoryTag ?? ''} placeholder="e.g. ETS verified statement" onChange={(ev) => upd(e.id, (r) => (r.categoryTag = ev.target.value))} /></label>
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
              <label className="field" style={{ gridColumn: 'span 2' }}>Source / disclosure reference<input value={e.source ?? ''} placeholder="e.g. ETS report, BRSR Section A.III.E" onChange={(ev) => upd(e.id, (r) => (r.source = ev.target.value))} /></label>
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

function LiveTotals({ live }: { live: IronSteelCalculationResult | null }) {
  if (!live) return null
  const s = live.scope1
  const items: { k: string; v: number; unit?: string; headline?: boolean }[] = [
    { k: 'Gross Scope 1', v: s.grossScope1CO2eTonnes, unit: 'tCO2e', headline: true },
    { k: 'CO2', v: s.byGas.co2Tonnes, unit: 'tCO2' },
    { k: 'CH4 (as CO2e)', v: s.byGas.ch4CO2eTonnes, unit: 'tCO2e' },
    { k: 'N2O (as CO2e)', v: s.byGas.n2oCO2eTonnes, unit: 'tCO2e' },
    { k: 'HFCs', v: s.byGas.hfcCO2eTonnes, unit: 'tCO2e' },
    { k: 'SF6', v: s.byGas.sf6CO2eTonnes, unit: 'tCO2e' },
    { k: 'Biogenic memo', v: live.memoItems.biogenicCO2Tonnes, unit: 'tCO2' },
  ]
  return (
    <div className="live-totals-strip">
      <h3>Live results — updates as you type</h3>
      <div className="live-totals-grid">
        {items.map(({ k, v, unit, headline }) => (
          <div key={k} className={headline ? 'live-cell live-cell-headline' : 'live-cell'}>
            <div className="live-cell-label">{k}</div>
            <div className="live-cell-value">{fmt.format(v)}<span className="live-cell-unit">{unit}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------- main wizard ----------------------------- */

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function IronSteelWizard({ onSwitchSector }: { onSwitchSector?: (s: 'cement' | 'oil_gas' | 'pulp_paper' | 'iron_steel') => void }) {
  const [p, setP] = useState<IronSteelInputPayload>(emptyIronSteelPayload)
  const [step, setStep] = useState<number>(1)
  const [cat, setCat] = useState<Cat>('production')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<IronSteelCalculationResult | null>(null)
  const [live, setLive] = useState<IronSteelCalculationResult | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [importError, setImportError] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [step2Tried, setStep2Tried] = useState(false)
  const [step3Tried, setStep3Tried] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // restore draft
  useEffect(() => {
    try {
      const restored = loadDraft()
      if (restored && draftIsMeaningful(restored)) { setP(restored); setHasDraft(true) }
    } catch {}
  }, [])

  // reset Tried flags when arriving back at Step 1
  useEffect(() => {
    if (step === 1) { setStep2Tried(false); setStep3Tried(false) }
  }, [step])

  // snap cat to Production if current cat is hidden
  useEffect(() => {
    const meta = CATEGORIES.find((c) => c.key === cat)
    if (meta?.appKey && p.sourceApplicability[meta.appKey] === false) setCat('production')
  }, [cat, p.sourceApplicability])

  // auto-derive applicability when process route changes
  const prevRouteRef = useRef<string | null>(null)
  useEffect(() => {
    const route = p.facility.processRoute
    if (route && route !== prevRouteRef.current) {
      const defaults = ROUTE_APPLICABILITY[route]
      if (defaults && prevRouteRef.current !== null) {
        patch((d) => (d.sourceApplicability = { ...defaults }))
      }
      prevRouteRef.current = route
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.facility.processRoute])

  // autosave + debounced live calc
  useEffect(() => {
    saveDraft(p)
    const id = setTimeout(() => { try { setLive(calculateIronSteel(p)) } catch { setLive(null) } }, 250)
    return () => clearTimeout(id)
  }, [p])

  function patch(mut: (d: IronSteelInputPayload) => void) {
    setP((prev) => { const draft = JSON.parse(JSON.stringify(prev)) as IronSteelInputPayload; mut(draft); return draft })
  }
  function startFresh() { try { localStorage.removeItem(DRAFT_KEY) } catch {}; setP(emptyIronSteelPayload()); setStep(1); setResult(null); setHasDraft(false) }
  async function loadSample() {
    const sample = sampleIntegratedMill()
    setP(sample); saveDraft(sample); setHasDraft(true); setBusy(true)
    try {
      const r = await fetch('/api/v1/calculations/iron-steel/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample) })
      const data = await r.json(); setResult(data.result as IronSteelCalculationResult); setStep(5)
    } finally { setBusy(false) }
  }

  function importJson(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const payload = parsed?.inputPayload ?? parsed?.input ?? parsed
        if (payload?.sector?.sectorCode !== 'IRON_STEEL') { setImportError('That file is not an Iron & Steel payload (expected sector IRON_STEEL).'); return }
        if (!payload.activityData || !payload.calculationContext) { setImportError('That file does not look like a calculator payload.'); return }
        const base = emptyIronSteelPayload()
        const merged: IronSteelInputPayload = {
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
      const r = await fetch(`/api/v1/calculations/iron-steel/calculate${save ? '?save=true' : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
      const data = await r.json()
      const result = data.result as IronSteelCalculationResult
      if (data.calculationId && result) result.calculationId = data.calculationId
      setResult(result); setStep(5)
    } finally { setBusy(false) }
  }

  async function lockInventory() {
    if (!result?.calculationId) return
    setBusy(true)
    try {
      const r = await fetch(`/api/v1/calculations/${result.calculationId}/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: p.organization.contactName || 'system' }) })
      if (!r.ok) { const err = await r.json().catch(() => ({})); alert(`Lock failed: ${err.detail || err.error || r.statusText}`); return }
      const data = await r.json()
      setResult({ ...result, auditStatus: { ...result.auditStatus, workflowStatus: data.workflowStatus, calculatedAt: result.auditStatus.calculatedAt } })
    } finally { setBusy(false) }
  }

  async function download(format: 'json' | 'xlsx' | 'pdf' | 'csv' | 'audit-pack') {
    const r = await fetch('/api/v1/calculations/iron-steel/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: p, format }) })
    const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    const ext = format === 'audit-pack' ? 'zip' : format
    const suffix = format === 'audit-pack' ? '-audit-pack' : ''
    a.download = `scope1-ironsteel-${p.facility.name || 'plant'}-FY${p.calculationContext.reportingPeriod.year}${suffix}.${ext}`
    document.body.appendChild(a); a.click(); a.remove()
  }

  const ad = p.activityData
  const ms = p.methodSelections

  const counts = useMemo(() => ({
    production: Object.values(ad.production).filter((v) => v != null).length,
    stationary: ad.stationaryCombustion.length, mobile: ad.mobile.length,
    cokeOven: ad.cokeOven.length, flaring: ad.flaring.length,
    sinter: ad.sinter.length, dri: ad.dri.length,
    bfBof: ad.bfBof.length, eaf: ad.eaf.length, limeKiln: ad.limeKiln.length,
    fugitiveHFC: ad.fugitiveHFC.length, fugitiveSF6: ad.fugitiveSF6.length,
    fugitiveOther: ad.fugitiveOther.length, reported: ad.reported.length,
  } as const), [ad])

  const orgValid = !!p.organization.name.trim() && !!(p.organization.contactName ?? '').trim() && emailRe.test((p.organization.contactEmail ?? '').trim())
  const facilityValid = !!p.facility.name.trim() && !!p.facility.processRoute
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
              <span className="brand-product">Iron &amp; Steel</span>
            </span>
          </button>
          <div className="wizard-actions">
            <div className="gwp-switch">
              <span>GWP</span>
              {(['AR5_100', 'AR6_100', 'AR6_20'] as const).map((g) => (
                <button key={g} className={p.calculationContext.gwpSet === g ? 'active' : ''} onClick={() => patch((d) => (d.calculationContext.gwpSet = g))}>{g.replace('_', ' · ')}</button>
              ))}
            </div>
            <button className="theme-switch" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </header>

      <nav className="wizard-progress">
        {(['Sector','Organisation','Plant & route','Activity data','Review & report'] as const).map((label, i) => {
          const target = i + 1; const reachable = canReach(target)
          return (
            <button key={label} className={step === target ? 'active' : step > target ? 'complete' : ''} onClick={() => tryGoTo(target)} disabled={!reachable && target !== step} aria-disabled={!reachable && target !== step}>
              <span>{target}</span><b>{label}</b>
            </button>
          )
        })}
      </nav>

      <section className="wizard-main">
        {step === 1 && (
          <section className="step-page active">
            <h1 className="step-title">What <em>sector</em> are you in?</h1>
            <p className="step-sub">Iron &amp; Steel uses the worldsteel + ISO 14404 site-level methodology with IPCC 2006 + 2019 Refinement Tier 1/2/3 EFs. Gross Scope 1 is full CO2e (CO2 + CH4 + N2O + HFCs + SF6); biogenic CO2 is a memo line.</p>
            {hasDraft && (
              <div style={{ alignItems: 'center', background: 'color-mix(in srgb, #2f6b4f 10%, transparent)', border: '1px solid color-mix(in srgb, #2f6b4f 32%, transparent)', borderRadius: 12, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', margin: '14px 0 0', padding: '12px 16px' }}>
                <div><b>Draft restored.</b> <span style={{ color: 'var(--muted)' }}>Your previous entry was autosaved and reloaded.</span></div>
                <button className="btn ghost" onClick={startFresh}>Start fresh</button>
              </div>
            )}
            <div style={{ alignItems: 'center', background: 'color-mix(in srgb, var(--purple) 6%, transparent)', border: '1px dashed color-mix(in srgb, var(--purple) 40%, transparent)', borderRadius: 12, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', margin: '14px 0 18px', padding: '12px 16px' }}>
              <div><b>First time here?</b> <span style={{ color: 'var(--muted)' }}>See the calculator end-to-end with a sample integrated BF-BOF mill.</span></div>
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
                <strong>Cement</strong><small>Integrated, clinker, grinding units</small><span className="tags">CSI Protocol · active</span>
              </button>
              <button className="sector-card" onClick={() => onSwitchSector?.('oil_gas')}>
                <span className="icon"><Fuel size={22} strokeWidth={1.75} /></span>
                <strong>Oil &amp; Gas</strong><small>Upstream · midstream · downstream</small><span className="tags">IPIECA / API · active</span>
              </button>
              <button className="sector-card" onClick={() => onSwitchSector?.('pulp_paper')}>
                <span className="icon"><TreePine size={22} strokeWidth={1.75} /></span>
                <strong>Pulp &amp; Paper</strong><small>Kraft · recycled · paper · integrated</small><span className="tags">ICFPA / NCASI · active</span>
              </button>
              <button className="sector-card selected">
                <span className="icon"><Factory size={22} strokeWidth={1.75} /></span>
                <strong>Iron &amp; Steel</strong><small>BF-BOF · EAF · DRI-EAF</small><span className="tags">worldsteel / ISO 14404 · active</span>
              </button>
              {['Power','Chemicals','Textile','Pharma','General Mfg'].map((x) => (
                <button className="sector-card muted" key={x} disabled>
                  <span className="icon"><Hexagon size={22} strokeWidth={1.75} /></span>
                  <strong>{x}</strong><small>Future sector pack</small><span className="tags">Planned</span>
                </button>
              ))}
            </div>
            <div className="step-footer"><div /><button className="btn primary" onClick={() => setStep(2)}>Continue</button></div>
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
              <p className="step-sub">The consolidation boundary decides which plants count as yours — applies uniformly across all sectors.</p>
              <div className="form-card">
                <h2>Company</h2>
                <label className="field">
                  <span className="field-title">Company name<span className="required-mark">*</span></span>
                  <input value={o.name} placeholder="e.g. JSW Steel Ltd" onChange={(e) => patch((d) => (d.organization.name = e.target.value))} />
                  {show && err.name && <div className="field-error">Company name is required.</div>}
                </label>
                <div className="field-row">
                  <label className="field">Operating country
                    <select value={o.country} onChange={(e) => patch((d) => (d.organization.country = e.target.value))}>
                      <option value="IN">India</option><option value="GLOBAL">Other</option>
                    </select>
                  </label>
                  <label className="field">Consolidation / boundary method
                    <select value={p.organizationBoundary.boundaryMethod} onChange={(e) => patch((d) => (d.organizationBoundary.boundaryMethod = e.target.value as IronSteelInputPayload['organizationBoundary']['boundaryMethod']))}>
                      <option value="OPERATIONAL_CONTROL">Operational control</option>
                      <option value="FINANCIAL_CONTROL">Financial control</option>
                      <option value="EQUITY_SHARE">Equity share</option>
                    </select>
                  </label>
                </div>
                {p.organizationBoundary.boundaryMethod === 'EQUITY_SHARE' ? (
                  <div className="field-row">
                    <NumField label="Consolidation / equity share %" step="0.01" value={p.organizationBoundary.consolidationPercent ?? 100}
                      onChange={(v) => patch((d) => { const next = v ?? 100; d.organizationBoundary.consolidationPercent = next; d.organizationBoundary.ownershipSharePercent = next })} hint="every Scope 1 bucket × this %" />
                  </div>
                ) : (
                  <p className="form-sub" style={{ marginTop: 6 }}>Under <b>{p.organizationBoundary.boundaryMethod.toLowerCase().replace('_', ' ')}</b>, 100% of the plant&apos;s Scope 1 is reported.</p>
                )}
                <label className="field" style={{ marginTop: 14 }}>
                  <span className="field-title">Boundary justification</span>
                  <input value={p.organizationBoundary.justification ?? ''} placeholder="Brief narrative (e.g. 'Sole operator under operational control; alignment with consolidated financial reporting')" onChange={(e) => patch((d) => (d.organizationBoundary.justification = e.target.value))} />
                  <small className="form-sub">Optional but recommended for assurance (GHG Protocol Chapter 3).</small>
                </label>
              </div>
              <div className="form-card contact-card">
                <h2>Primary contact</h2>
                <p className="form-sub">Who is preparing this inventory? Saved with the report for follow-up and assurance.</p>
                <div className="field-row">
                  <label className="field"><span className="field-title">Contact name<span className="required-mark">*</span></span>
                    <input value={o.contactName ?? ''} placeholder="e.g. Vikram Kapoor" onChange={(e) => patch((d) => (d.organization.contactName = e.target.value))} />
                    {show && err.contactName && <div className="field-error">Contact name is required.</div>}
                  </label>
                  <label className="field"><span className="field-title">Work email<span className="required-mark">*</span></span>
                    <input type="email" value={o.contactEmail ?? ''} placeholder="name@company.com" onChange={(e) => patch((d) => (d.organization.contactEmail = e.target.value))} />
                    {show && err.contactEmail && <div className="field-error">A valid work email is required.</div>}
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">Phone<input value={o.contactPhone ?? ''} placeholder="+91 98xxxxxxxx" onChange={(e) => patch((d) => (d.organization.contactPhone = e.target.value))} /></label>
                  <label className="field">Role / designation<input value={o.contactRole ?? ''} placeholder="e.g. Head of Decarbonisation" onChange={(e) => patch((d) => (d.organization.contactRole = e.target.value))} /></label>
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
            <h1 className="step-title">Plant, route &amp; <em>methods</em></h1>
            <p className="step-sub">Process route drives which categories are applicable (BF-BOF route enables coke / sinter / BF / BOF; EAF disables them; DRI-EAF adds DRI shaft; etc.).</p>
            <div className="form-card">
              <h2>Plant</h2>
              <div className="field-row">
                <label className="field"><span className="field-title">Plant name<span className="required-mark">*</span></span>
                  <input value={p.facility.name} placeholder="e.g. Jharkhand Integrated Mill" onChange={(e) => patch((d) => (d.facility.name = e.target.value))} />
                </label>
                <label className="field">Process route
                  <select value={p.facility.processRoute} onChange={(e) => patch((d) => (d.facility.processRoute = e.target.value as IronSteelInputPayload['facility']['processRoute']))}>
                    <option value="BF_BOF">BF-BOF (integrated, ~70% global)</option>
                    <option value="EAF">EAF (scrap-based)</option>
                    <option value="DRI_EAF_GAS">DRI-EAF gas-based (MIDREX / Energiron)</option>
                    <option value="DRI_EAF_COAL">DRI-EAF coal-based (rotary kiln; India typical)</option>
                    <option value="DRI_EAF_H2">DRI-EAF green hydrogen</option>
                    <option value="INDUCTION">Induction furnace</option>
                    <option value="INTEGRATED">Integrated (BF-BOF + EAF on one site)</option>
                    <option value="MIXED">Mixed / portfolio aggregate</option>
                  </select>
                </label>
                <NumField label="Reporting year" step="1" value={p.calculationContext.reportingPeriod.year}
                  onChange={(v) => patch((d) => { const y = v ?? 2026; d.calculationContext.reportingPeriod = { year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31` } })} />
              </div>
              <h2 style={{ marginTop: 22 }}>Methods</h2>
              <div className="field-row">
                <label className="field">Stationary method
                  <select value={ms.stationaryMethod} onChange={(e) => patch((d) => (d.methodSelections.stationaryMethod = e.target.value as IronSteelInputPayload['methodSelections']['stationaryMethod']))}>
                    <option value="ENERGY_BASED">Energy-based (qty × NCV × EF) — Tier 2</option>
                    <option value="CARBON_CONTENT_BASED">Carbon-content (Tier 3/4)</option>
                    <option value="DIRECT_MEASUREMENT">Direct measurement (CEMS) — Tier 4</option>
                  </select>
                </label>
                <label className="field">Process-gas allocation
                  <select value={ms.processGasAllocation} onChange={(e) => patch((d) => (d.methodSelections.processGasAllocation = e.target.value as IronSteelInputPayload['methodSelections']['processGasAllocation']))}>
                    <option value="POINT_OF_EMISSION">Point of emission (GHG Protocol default, EU ETS, EPA)</option>
                    <option value="CARBON_ALLOCATION_UPSTREAM">Carbon allocation upstream (ISO 14404, worldsteel)</option>
                    <option value="ENERGY_BASED_CHP">Energy-based CHP allocation</option>
                  </select>
                  {ms.processGasAllocation !== 'POINT_OF_EMISSION' && (
                    <small className="form-sub" style={{ marginTop: 6, color: '#c2410c' }}>
                      Methodology fork: this selection is captured in the audit trail but the engine still allocates emissions at the point of combustion (GHG Protocol default). A formal alternative-allocation rerun is on the roadmap — verifier sign-off would need a side calculation.
                    </small>
                  )}
                </label>
              </div>
            </div>
            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
              <button className="btn primary" onClick={() => { setStep3Tried(true); if (facilityValid) setStep(4) }}>Continue</button>
            </div>
            {step3Tried && !facilityValid && <p className="field-error" style={{ marginTop: 6 }}>Plant name and process route are required before continuing.</p>}
          </section>
        )}

        {step === 4 && (
          <section className="step-page active">
            <h1 className="step-title">Activity <em>data</em></h1>
            <p className="step-sub">13 source categories plus reported. Leave a field blank for <b>missing</b>; type <b>0</b> for a confirmed zero. <em>Biogenic CO2 is never in gross Scope 1.</em></p>
            <LiveTotals live={live} />

            <div className="form-card">
              <h2>Source applicability — what this plant operates</h2>
              <p className="form-sub">
                Auto-set from your <b>{p.facility.processRoute.toLowerCase().replace(/_/g, ' ')}</b> route per ISO 14404 + worldsteel. Toggle OFF any source this plant doesn&apos;t have to hide its tab. Source applicability is part of the audit trail.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px 16px', marginTop: 10 }}>
                {(Object.entries(APPLICABILITY_LABELS) as [keyof IronSteelInputPayload['sourceApplicability'], string][]).map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                    <input type="checkbox" checked={!!p.sourceApplicability[k]} onChange={(e) => patch((d) => (d.sourceApplicability[k] = e.target.checked))} style={{ width: 16, height: 16, accentColor: 'var(--purple)' }} />
                    <span style={{ color: p.sourceApplicability[k] ? 'var(--ink)' : 'var(--ink-mute)' }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="category-tabs">
              {CATEGORIES.filter((c) => !c.appKey || p.sourceApplicability[c.appKey] !== false).map(({ key, label, icon: Icon }) => (
                <button key={key} className={cat === key ? 'active' : ''} onClick={() => setCat(key)}>
                  <Icon size={15} /> {label} <span>{counts[key]}</span>
                </button>
              ))}
            </div>

            <div className="category-panel">
              {cat === 'production' && (
                <div className="form-card">
                  <h2>Production volumes</h2>
                  <p className="form-sub">Reporting-period volumes drive intensity metrics (kgCO2e per t crude steel / hot-rolled / hot metal).</p>
                  <div className="field-row">
                    <NumField label="Crude steel" unit="t" value={ad.production.crudeSteelTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.crudeSteelTonnes = v))} />
                    <NumField label="Hot metal (BF output)" unit="t" value={ad.production.hotMetalTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.hotMetalTonnes = v))} />
                    <NumField label="Hot-rolled" unit="t" value={ad.production.hotRolledTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.hotRolledTonnes = v))} />
                  </div>
                  <div className="field-row">
                    <NumField label="Sinter produced" unit="t" value={ad.production.sinterProducedTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.sinterProducedTonnes = v))} />
                    <NumField label="Pellet produced" unit="t" value={ad.production.pelletProducedTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.pelletProducedTonnes = v))} />
                    <NumField label="Coke produced" unit="t" value={ad.production.cokeProducedTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.cokeProducedTonnes = v))} />
                    <NumField label="DRI produced" unit="t" value={ad.production.driProducedTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.production.driProducedTonnes = v))} />
                  </div>
                </div>
              )}
              {cat === 'stationary' && <StationaryTable entries={ad.stationaryCombustion} trace={trace} onChange={(rows) => patch((d) => (d.activityData.stationaryCombustion = rows))} />}
              {cat === 'mobile' && <MobileTable entries={ad.mobile} trace={trace} onChange={(rows) => patch((d) => (d.activityData.mobile = rows))} />}
              {cat === 'cokeOven' && <CokeOvenTable entries={ad.cokeOven} trace={trace} onChange={(rows) => patch((d) => (d.activityData.cokeOven = rows))} />}
              {cat === 'flaring' && <FlaringTable entries={ad.flaring} trace={trace} onChange={(rows) => patch((d) => (d.activityData.flaring = rows))} />}
              {cat === 'sinter' && <SinterTable entries={ad.sinter} trace={trace} onChange={(rows) => patch((d) => (d.activityData.sinter = rows))} />}
              {cat === 'dri' && <DriTable entries={ad.dri} trace={trace} onChange={(rows) => patch((d) => (d.activityData.dri = rows))} />}
              {cat === 'bfBof' && <BfBofTable entries={ad.bfBof} trace={trace} onChange={(rows) => patch((d) => (d.activityData.bfBof = rows))} />}
              {cat === 'eaf' && <EafTable entries={ad.eaf} trace={trace} onChange={(rows) => patch((d) => (d.activityData.eaf = rows))} />}
              {cat === 'limeKiln' && <LimeKilnTable entries={ad.limeKiln} trace={trace} onChange={(rows) => patch((d) => (d.activityData.limeKiln = rows))} />}
              {cat === 'fugitiveHFC' && <HfcTable entries={ad.fugitiveHFC} trace={trace} onChange={(rows) => patch((d) => (d.activityData.fugitiveHFC = rows))} />}
              {cat === 'fugitiveSF6' && <Sf6Table entries={ad.fugitiveSF6} trace={trace} onChange={(rows) => patch((d) => (d.activityData.fugitiveSF6 = rows))} />}
              {cat === 'fugitiveOther' && <OtherFugitiveTable entries={ad.fugitiveOther} trace={trace} onChange={(rows) => patch((d) => (d.activityData.fugitiveOther = rows))} />}
              {cat === 'reported' && (
                <>
                  <ReportedTable entries={ad.reported} trace={trace} onChange={(rows) => patch((d) => (d.activityData.reported = rows))} />
                  <div className="form-card">
                    <h2>Reconciliation against a disclosed total</h2>
                    <p className="form-sub">For audit defensibility, enter (a) what boundary the public number describes, (b) the gross Scope 1 figure and — where available — its per-gas split, supporting Scope 2, and intensity. We reconcile each line independently and flag variance &gt;5%.</p>

                    <h3 style={{ marginTop: 14, marginBottom: 4, fontSize: 14, fontWeight: 700, color: 'var(--ink-mute)' }}>Boundary &amp; provenance</h3>
                    <div className="field-row">
                      <label className="field">Boundary basis
                        <select
                          value={p.disclosure?.boundaryBasis ?? ''}
                          onChange={(ev) => {
                            const v = ev.target.value as DisclosureBoundaryBasis | ''
                            patch((d) => {
                              d.disclosure = { ...(d.disclosure ?? {}), boundaryBasis: v === '' ? undefined : v }
                            })
                          }}
                        >
                          <option value="">— select —</option>
                          <option value="STEELMAKING_SITES_ONLY">Steelmaking sites only (worldsteel / ISO 14404)</option>
                          <option value="ALL_SITES">All sites (corporate aggregate inc. non-steelmaking)</option>
                          <option value="WSA_SCOPE_1_PLUS_1A">worldsteel Scope 1 + 1A (purchased intermediates)</option>
                          <option value="BRSR_BOUNDARY">BRSR boundary (India SEBI)</option>
                          <option value="EU_ETS">EU ETS (Annex I installation)</option>
                          <option value="CBAM">CBAM (Annex II direct embedded)</option>
                          <option value="CORPORATE_AGGREGATE">Corporate aggregate (catch-all)</option>
                          <option value="OTHER">Other — explain in note</option>
                        </select>
                        <small className="form-sub" style={{ marginTop: 4 }}>Required when reported entries are material (≥10% of gross). Picks the lens the disclosed numbers were measured under.</small>
                      </label>
                      <label className="field">Public report URL
                        <input
                          value={p.disclosure?.publicReportUrl ?? ''}
                          placeholder="https://… (annual report, BRSR, ETS verified statement)"
                          onChange={(ev) => patch((d) => { d.disclosure = { ...(d.disclosure ?? {}), publicReportUrl: ev.target.value } })}
                        />
                      </label>
                      <label className="field">Page / section reference
                        <input
                          value={p.disclosure?.publicReportPageReference ?? ''}
                          placeholder="e.g. BRSR Section A.III.E, p. 142"
                          onChange={(ev) => patch((d) => { d.disclosure = { ...(d.disclosure ?? {}), publicReportPageReference: ev.target.value } })}
                        />
                      </label>
                    </div>
                    {p.disclosure?.boundaryBasis === 'OTHER' && (
                      <div className="field-row">
                        <label className="field" style={{ gridColumn: 'span 3' }}>Boundary note (required when basis = Other)
                          <input
                            value={p.disclosure?.boundaryNote ?? ''}
                            placeholder="e.g. group-level boundary minus joint ventures; mining excluded; downstream rolling included"
                            onChange={(ev) => patch((d) => { d.disclosure = { ...(d.disclosure ?? {}), boundaryNote: ev.target.value } })}
                          />
                        </label>
                      </div>
                    )}

                    <h3 style={{ marginTop: 14, marginBottom: 4, fontSize: 14, fontWeight: 700, color: 'var(--ink-mute)' }}>Disclosed gross figures</h3>
                    <div className="field-row">
                      <NumField label="Disclosed gross Scope 1" unit="tCO2e" value={ad.disclosedGrossScope1CO2eTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedGrossScope1CO2eTonnes = v))} hint="top-line gross from disclosure" />
                      <NumField label="Disclosed Scope 2" unit="tCO2e" value={ad.disclosedScope2CO2eTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope2CO2eTonnes = v))} hint="location-based, for supporting recon" />
                      <NumField label="Disclosed intensity" unit="kgCO2e / t crude steel" value={ad.disclosedIntensityKgPerTcrudeSteel ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedIntensityKgPerTcrudeSteel = v))} hint="the canonical steel KPI — often the headline" />
                    </div>

                    <h3 style={{ marginTop: 14, marginBottom: 4, fontSize: 14, fontWeight: 700, color: 'var(--ink-mute)' }}>By-gas split (optional)</h3>
                    <p className="form-sub">If the disclosure breaks gross into CO2 / CH4 / N2O masses (common in BRSR Section A.III, ETS verified statements, worldsteel returns), enter them — each gas reconciles independently.</p>
                    <div className="field-row">
                      <NumField label="Disclosed CO2" unit="tCO2" value={ad.disclosedScope1CO2Tonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope1CO2Tonnes = v))} />
                      <NumField label="Disclosed CH4" unit="t CH4 (mass)" value={ad.disclosedScope1CH4Tonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope1CH4Tonnes = v))} hint="enter mass, not CO2e" />
                      <NumField label="Disclosed N2O" unit="t N2O (mass)" value={ad.disclosedScope1N2OTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope1N2OTonnes = v))} hint="enter mass, not CO2e" />
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
              <span>Gross Scope 1 (CO2 + CH4 + N2O + HFCs + SF6)</span>
              <strong>{fmt.format(result.scope1.grossScope1CO2eTonnes)}</strong>
              <small>tCO2e</small>
              <p style={{ marginTop: 10 }}>
                CO2 {fmt.format(result.scope1.byGas.co2Tonnes)} t · CH4 {fmt.format(result.scope1.byGas.ch4Tonnes)} t ({fmt.format(result.scope1.byGas.ch4CO2eTonnes)} tCO2e) · N2O {fmt.format(result.scope1.byGas.n2oTonnes)} t · HFCs {fmt.format(result.scope1.byGas.hfcCO2eTonnes)} tCO2e · SF6 {fmt.format(result.scope1.byGas.sf6CO2eTonnes)} tCO2e
              </p>
            </div>

            <div className="summary-cats">
              {(Object.entries(result.scope1.byCategory) as [string, { co2eTonnes: number }][]).map(([k, g]) => (
                <div key={k} className="summary-card">
                  <span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</span>
                  <strong>{fmt.format(g.co2eTonnes)}</strong><small>tCO2e</small>
                </div>
              ))}
            </div>

            <div className="form-card">
              <h2>By category</h2>
              <div className="result-table">
                <div className="result-row" style={{ gridTemplateColumns: COL_GRID, fontWeight: 800, color: 'var(--ink-mute)' }}>
                  <span>Category</span><span style={{ textAlign: 'right' }}>CO2 (t)</span><span style={{ textAlign: 'right' }}>CH4 (t)</span><span style={{ textAlign: 'right' }}>N2O (t)</span><span style={{ textAlign: 'right' }}>tCO2e</span>
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
                <h2>Reconciliation vs disclosed figures</h2>
                <p className="form-sub">{result.reconciliation.note}</p>
                {p.disclosure?.boundaryBasis && (
                  <p className="form-sub" style={{ marginTop: 0 }}>
                    <b>Boundary basis:</b> {p.disclosure.boundaryBasis.replace(/_/g, ' ').toLowerCase()}
                    {p.disclosure.publicReportPageReference ? <> · {p.disclosure.publicReportPageReference}</> : null}
                    {p.disclosure.publicReportUrl ? <> · <a href={p.disclosure.publicReportUrl} target="_blank" rel="noopener noreferrer">source</a></> : null}
                  </p>
                )}
                <div className="result-table">
                  <div className="result-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', fontWeight: 800, color: 'var(--ink-mute)' }}>
                    <span>Metric</span>
                    <span style={{ textAlign: 'right' }}>Disclosed</span>
                    <span style={{ textAlign: 'right' }}>Modelled</span>
                    <span style={{ textAlign: 'right' }}>Variance</span>
                    <span style={{ textAlign: 'right' }}>Status</span>
                  </div>
                  {result.reconciliation.lines.map((line) => (
                    <div key={line.metric} className="result-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
                      <strong>{line.label}</strong>
                      <span style={{ textAlign: 'right' }}>{fmt.format(line.disclosed ?? 0)} <small style={{ color: 'var(--muted)' }}>{line.unit}</small></span>
                      <span style={{ textAlign: 'right' }}>{fmt.format(line.modelled)} <small style={{ color: 'var(--muted)' }}>{line.unit}</small></span>
                      <span style={{ textAlign: 'right', color: line.withinThreshold ? 'inherit' : '#c2410c', fontWeight: 700 }}>{fmt.format(line.variancePercent ?? 0)}%</span>
                      <span style={{ textAlign: 'right', color: line.withinThreshold ? 'var(--ink-mute)' : '#c2410c' }}>{line.withinThreshold ? 'within ±5%' : 'review'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {((p.activityData.production.crudeSteelTonnes ?? 0) > 0 || (p.activityData.production.hotRolledTonnes ?? 0) > 0) && (
              <div className="form-card">
                <h2>Production &amp; intensity</h2>
                <p className="form-sub">Production volumes (the denominators) and derived emission intensities (kgCO2e per t crude steel — the canonical steel KPI).</p>
                <div className="summary-cats">
                  {(p.activityData.production.crudeSteelTonnes ?? 0) > 0 && <div className="summary-card"><span>Crude steel produced</span><strong>{fmt.format(p.activityData.production.crudeSteelTonnes ?? 0)}</strong><small>t</small></div>}
                  {(p.activityData.production.hotRolledTonnes ?? 0) > 0 && <div className="summary-card"><span>Hot-rolled produced</span><strong>{fmt.format(p.activityData.production.hotRolledTonnes ?? 0)}</strong><small>t</small></div>}
                  {(p.activityData.production.hotMetalTonnes ?? 0) > 0 && <div className="summary-card"><span>Hot metal produced</span><strong>{fmt.format(p.activityData.production.hotMetalTonnes ?? 0)}</strong><small>t</small></div>}
                  {result.intensityMetrics.co2ePerTonneCrudeSteel != null && <div className="summary-card"><span>Per t crude steel</span><strong>{fmt.format(result.intensityMetrics.co2ePerTonneCrudeSteel)}</strong><small>kgCO2e / t</small></div>}
                  {result.intensityMetrics.co2ePerTonneHotRolled != null && <div className="summary-card"><span>Per t hot-rolled</span><strong>{fmt.format(result.intensityMetrics.co2ePerTonneHotRolled)}</strong><small>kgCO2e / t</small></div>}
                  {result.intensityMetrics.co2ePerTonneHotMetal != null && <div className="summary-card"><span>Per t hot metal</span><strong>{fmt.format(result.intensityMetrics.co2ePerTonneHotMetal)}</strong><small>kgCO2e / t</small></div>}
                  {result.intensityMetrics.fossilCo2PerTonneCrudeSteel != null && <div className="summary-card"><span>Fossil CO2 / t crude steel</span><strong>{fmt.format(result.intensityMetrics.fossilCo2PerTonneCrudeSteel)}</strong><small>kgCO2 / t</small></div>}
                </div>
              </div>
            )}

            {result.assumptions.length > 0 && (
              <div className="form-card">
                <h2>Assumptions &amp; limitations</h2>
                <p className="form-sub">Every default, fallback, override, and estimated basis the inventory relied on.</p>
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
                {result.calculationTrace.length} calculation steps · {result.factorSnapshots.length} factor snapshots · methodology pack <b>{result.methodologyPack}</b> · GWP <b>{result.gwpSet.replace('_', ' · ')}</b>. Every override is captured with its reason. Export an audit-ready Excel, PDF, CSV, JSON, or full audit pack ZIP.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-mute)' }}>Workflow:</span>
                {(() => {
                  const ws = (result.auditStatus?.workflowStatus ?? 'DRAFT').toUpperCase()
                  const styles: Record<string, { bg: string; fg: string; label: string }> = {
                    DRAFT:    { bg: 'color-mix(in srgb, #6b7280 18%, transparent)', fg: '#374151', label: '✎ Draft' },
                    LOCKED:   { bg: 'color-mix(in srgb, #2f6b4f 20%, transparent)', fg: '#15803d', label: '🔒 Locked' },
                    VERIFIED: { bg: 'color-mix(in srgb, #2563eb 22%, transparent)', fg: '#1d4ed8', label: '✓ Verified' },
                  }
                  const s = styles[ws] ?? styles.DRAFT
                  return <span style={{ background: s.bg, color: s.fg, borderRadius: 999, fontSize: 11.5, fontWeight: 800, letterSpacing: 0.3, padding: '4px 10px' }}>{s.label}</span>
                })()}
                {result.calculationId && (
                  <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>Calculation ID: <code style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{result.calculationId}</code></span>
                )}
              </div>
              {result.auditStatus?.workflowStatus?.toUpperCase() === 'LOCKED' && (
                <p className="form-sub" style={{ marginTop: 10, color: '#15803d', fontWeight: 600 }}>This inventory is locked. Re-runs create a new revision.</p>
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
                {result.auditStatus?.workflowStatus?.toUpperCase() === 'LOCKED' ? (
                  <button className="btn primary" disabled style={{ background: '#15803d', opacity: 0.85 }}>🔒 Locked</button>
                ) : (
                  <>
                    <button className="btn primary" onClick={() => runCalculate(true)} disabled={busy}>{busy ? 'Saving…' : 'Calculate & save'}</button>
                    {result.calculationId && (
                      <button className="btn primary" onClick={lockInventory} disabled={busy || result.errors.length > 0} title={result.errors.length > 0 ? 'Resolve validation errors before locking' : 'Lock this inventory'} style={{ background: '#15803d' }}>
                        {busy ? 'Locking…' : '🔒 Submit & lock'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
