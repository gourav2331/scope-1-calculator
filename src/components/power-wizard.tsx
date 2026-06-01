'use client'

/**
 * Power Sector Scope 1 wizard. 5 steps (Sector → Org/boundary → Plant/methods
 * → Activity data with technology-driven applicability → Review). Same
 * 4-primary-tile + drill-down UX as the other four sectors.
 *
 * Methodology: GHG Protocol + ISO 14064-1 + IPCC 2006 + 2019 Refinement +
 * EU ETS MRR + US EPA Subparts A/C/D/DD + India CEA v21 + NATCOM.
 */

import {
  AlertCircle,
  Atom,
  Boxes,
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
  Snowflake,
  Sun,
  Trash2,
  Truck,
  Wind,
  Zap,
} from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { calculatePower } from '@/lib/engine/power'
import type {
  CcusEntry,
  FgdEntry,
  FuelEntry,
  HfcEntry,
  MobileEntry,
  OtherFugitiveCh4Entry,
  PowerCalculationResult,
  PowerDisclosureBoundaryBasis,
  PowerGwpSet,
  PowerInputPayload,
  ReportedEntry,
  ScrSncrEntry,
  Sf6Entry,
} from '@/lib/engine/power'

const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const fmt4 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

type Num = number | null
function uid(): string { return Math.random().toString(36).slice(2, 10) }
function toNum(v: string): Num {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* ----------------------------- category model ----------------------------- */

type Cat =
  | 'production' | 'stationaryMain' | 'stationaryAux' | 'biomass' | 'mobile'
  | 'fgd' | 'scr' | 'sf6' | 'hfc' | 'otherCh4' | 'ccus' | 'reported'

type PWGroup = 'PRODUCTION' | 'STATIONARY' | 'MOBILE' | 'PROCESS' | 'FUGITIVE' | 'CCUS' | 'REPORTED'

type IconCmp = React.ComponentType<{ size?: number; strokeWidth?: number }>

const PW_GROUP_LABELS: Record<PWGroup, { label: string; hint: string; icon: IconCmp }> = {
  PRODUCTION: { label: 'Generation', hint: 'intensity denominator (MWh net)', icon: Boxes },
  STATIONARY: { label: 'Stationary combustion', hint: 'main boilers / turbines / auxiliary / biomass cofiring', icon: Flame },
  MOBILE:     { label: 'Mobile combustion', hint: 'on-site fleet, locomotives, forklifts', icon: Truck },
  PROCESS:    { label: 'Process emissions', hint: 'wet FGD limestone CO2 + SCR/SNCR urea CO2', icon: Atom },
  FUGITIVE:   { label: 'Fugitive emissions', hint: 'SF6 switchgear · HFC refrigerants · CH4 leaks', icon: Wind },
  CCUS:       { label: 'CCUS netting', hint: 'captured & stored CO2 (per EU ETS Art 49)', icon: Leaf },
  REPORTED:   { label: 'Reported / direct-entry', hint: 'aggregate disclosure + reconciliation', icon: FileText },
}

const CATEGORIES: { key: Cat; label: string; icon: IconCmp; appKey?: keyof PowerInputPayload['sourceApplicability']; group: PWGroup }[] = [
  { key: 'production', label: 'Generation', icon: Boxes, group: 'PRODUCTION' },
  { key: 'stationaryMain', label: 'Main combustion', icon: Flame, appKey: 'stationaryMain', group: 'STATIONARY' },
  { key: 'stationaryAux', label: 'Auxiliary combustion', icon: Fuel, appKey: 'stationaryAuxiliary', group: 'STATIONARY' },
  { key: 'biomass', label: 'Biomass cofiring', icon: Leaf, appKey: 'biomassCofiring', group: 'STATIONARY' },
  { key: 'mobile', label: 'Mobile', icon: Truck, appKey: 'mobile', group: 'MOBILE' },
  { key: 'fgd', label: 'FGD limestone', icon: Hexagon, appKey: 'fgdLimestone', group: 'PROCESS' },
  { key: 'scr', label: 'SCR / SNCR urea', icon: Atom, appKey: 'scrUrea', group: 'PROCESS' },
  { key: 'sf6', label: 'SF6 switchgear', icon: Zap, appKey: 'fugitiveSF6', group: 'FUGITIVE' },
  { key: 'hfc', label: 'HFCs', icon: Snowflake, appKey: 'fugitiveHFC', group: 'FUGITIVE' },
  { key: 'otherCh4', label: 'Other CH4', icon: Wind, appKey: 'fugitiveOtherCH4', group: 'FUGITIVE' },
  { key: 'ccus', label: 'CCUS', icon: Leaf, appKey: 'ccus', group: 'CCUS' },
  { key: 'reported', label: 'Reported', icon: FileText, appKey: 'reported', group: 'REPORTED' },
]

const PW_PRIMARY_GROUPS: PWGroup[] = ['STATIONARY', 'MOBILE', 'PROCESS', 'FUGITIVE']

/** Technology-driven applicability — what each plant type typically has. */
type Tech = PowerInputPayload['facility']['technology']
const TECH_APPLICABILITY: Record<Tech, PowerInputPayload['sourceApplicability']> = {
  PC_SUBCRITICAL:        { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: false, mobile: true, fgdLimestone: true, scrUrea: true, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: true, ccus: false, reported: true, purchasedElectricity: true },
  PC_SUPERCRITICAL:      { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: false, mobile: true, fgdLimestone: true, scrUrea: true, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: true, ccus: false, reported: true, purchasedElectricity: true },
  PC_ULTRA_SUPERCRITICAL:{ stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: false, mobile: true, fgdLimestone: true, scrUrea: true, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: true, ccus: false, reported: true, purchasedElectricity: true },
  CFB_COAL:              { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: true,  mobile: true, fgdLimestone: false, scrUrea: false, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: true, ccus: false, reported: true, purchasedElectricity: true },
  IGCC:                  { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: false, mobile: true, fgdLimestone: false, scrUrea: true, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: true, ccus: false, reported: true, purchasedElectricity: true },
  OCGT:                  { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: false, mobile: false, fgdLimestone: false, scrUrea: false, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: true, ccus: false, reported: true, purchasedElectricity: true },
  CCGT:                  { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: false, mobile: false, fgdLimestone: false, scrUrea: true, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: true, ccus: false, reported: true, purchasedElectricity: true },
  RECIPROCATING_ENGINE:  { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: false, mobile: false, fgdLimestone: false, scrUrea: false, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: false, ccus: false, reported: true, purchasedElectricity: true },
  BIOMASS_STEAM:         { stationaryMain: false, stationaryAuxiliary: true, biomassCofiring: true, mobile: true, fgdLimestone: false, scrUrea: false, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: false, ccus: false, reported: true, purchasedElectricity: true },
  WASTE_STEAM:           { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: true, mobile: true, fgdLimestone: false, scrUrea: false, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: false, ccus: false, reported: true, purchasedElectricity: true },
  OIL_STEAM:             { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: false, mobile: true, fgdLimestone: false, scrUrea: false, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: false, ccus: false, reported: true, purchasedElectricity: true },
  CHP:                   { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: false, mobile: false, fgdLimestone: false, scrUrea: true, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: true, ccus: false, reported: true, purchasedElectricity: true },
  MIXED:                 { stationaryMain: true, stationaryAuxiliary: true, biomassCofiring: true, mobile: true, fgdLimestone: true, scrUrea: true, fugitiveSF6: true, fugitiveHFC: true, fugitiveOtherCH4: true, ccus: true, reported: true, purchasedElectricity: true },
}

const FUELS_MAIN = ['bituminous_coal', 'sub_bituminous_coal', 'lignite', 'anthracite', 'petcoke', 'natural_gas', 'lng', 'residual_oil', 'diesel'] as const
const FUELS_AUX = ['diesel', 'natural_gas', 'residual_oil', 'lpg'] as const
const FUELS_BIOMASS = ['wood_bark', 'agri_residue', 'biogas', 'msw_rdf', 'industrial_waste'] as const
const TECHS_MAIN = ['PULVERIZED_DRY_WALL', 'PULVERIZED_DRY_TANGENTIAL', 'PULVERIZED_WET', 'CFB', 'BFB', 'SPREADER_STOKER', 'IGCC', 'GAS_TURBINE_OCGT', 'GAS_TURBINE_CCGT', 'RECIPROCATING_ENGINE_LEAN', 'BOILER_LARGE'] as const
const TECHS_AUX = ['BOILER', 'EMERGENCY_GENSET', 'STARTUP_BURNER', 'AUXILIARY_BOILER'] as const
const TECHS_BIOMASS = ['STOKER_BOILER', 'CFB', 'BFB', 'GAS_ENGINE'] as const
const VEHICLES = ['DIESEL_HAUL', 'DIESEL_LOCO', 'DIESEL_LIGHT', 'LPG_FORKLIFT', 'NATGAS_MOBILE'] as const
const SF6_CLASSES = ['GAS_INSULATED_SWITCHGEAR_SEALED_NEW', 'GAS_INSULATED_SWITCHGEAR_SEALED_OLDER', 'GAS_INSULATED_SWITCHGEAR_CLOSED_NEW', 'GAS_INSULATED_SWITCHGEAR_CLOSED_OLDER', 'CIRCUIT_BREAKER_LIVE_TANK', 'GAS_INSULATED_LINE'] as const
const HFC_GASES = ['r134a', 'r410a', 'r404a', 'r407c', 'r32', 'r507a', 'r23', 'r125', 'r143a', 'r449a', 'r1234yf'] as const

const PLANT_TECH_LABELS: Record<Tech, string> = {
  PC_SUBCRITICAL: 'PC subcritical (coal)',
  PC_SUPERCRITICAL: 'PC supercritical (coal)',
  PC_ULTRA_SUPERCRITICAL: 'PC ultra-supercritical (coal)',
  CFB_COAL: 'CFB coal',
  IGCC: 'IGCC',
  OCGT: 'OCGT — gas peaker',
  CCGT: 'CCGT — gas combined cycle',
  RECIPROCATING_ENGINE: 'Reciprocating engine',
  BIOMASS_STEAM: 'Biomass steam',
  WASTE_STEAM: 'Waste-to-energy',
  OIL_STEAM: 'Oil steam (HFO)',
  CHP: 'Cogeneration / CHP',
  MIXED: 'Mixed / multiple units',
}

/* ----------------------------- empty payload ----------------------------- */

function emptyPayload(): PowerInputPayload {
  const year = new Date().getFullYear()
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year, startDate: `${year}-04-01`, endDate: `${year + 1}-03-31` },
      inventoryVersion: 'SUSTALLY_PWR_V1',
      gwpSet: 'AR6_100',
    },
    organization: { name: '', country: 'IN' },
    facility: { name: '', technology: 'PC_SUPERCRITICAL', country: 'IN' },
    organizationBoundary: { boundaryMethod: 'OPERATIONAL_CONTROL', ownershipSharePercent: 100, consolidationPercent: 100 },
    sector: { sectorCode: 'POWER' },
    methodSelections: {
      stationaryMethod: 'ENERGY_BASED', mobileMethod: 'FUEL_BASED',
      fgdMethod: 'STOICHIOMETRIC', scrMethod: 'UREA_STOICHIOMETRIC',
      sf6Method: 'DEFAULT_LEAK_RATE', hfcMethod: 'EQUIPMENT_BASED',
      ccusMethod: 'NOT_APPLICABLE', defaultTier: 'TIER_2',
    },
    sourceApplicability: TECH_APPLICABILITY.PC_SUPERCRITICAL,
    activityData: {
      production: {},
      stationaryMain: [], stationaryAuxiliary: [], biomassCofiring: [], mobile: [],
      fgd: [], scr: [], fugitiveSF6: [], fugitiveHFC: [], fugitiveOtherCH4: [],
      ccus: [], reported: [],
      purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null },
    },
    factorOverrides: {},
  }
}

function samplePlant(): PowerInputPayload {
  const p = emptyPayload()
  p.organization = { name: 'Sample Power Ltd', country: 'IN', contactName: 'Priya Sharma', contactEmail: 'priya.s@samplepower.example', contactPhone: '+91 98xxxxxxxx', contactRole: 'Head of Sustainability' }
  p.facility = { name: 'Mundra Unit-3 supercritical', technology: 'PC_SUPERCRITICAL', country: 'IN', state: 'GJ', nameplateCapacityMw: 660, numberOfUnits: 1 }
  p.activityData.production = { grossGenerationMwh: 4_500_000, netGenerationMwh: 4_200_000, auxiliaryPowerPercent: 6.7, operatingHoursYr: 7_800 }
  p.activityData.stationaryMain = [
    { id: uid(), label: 'Main boiler — bituminous coal', fuelCode: 'bituminous_coal', technology: 'PULVERIZED_DRY_WALL', quantity: 1_800_000, quantityUnit: 'tonne', useIndiaNatcom: true, overrideReason: 'India NATCOM CEF for Indian coal' },
    { id: uid(), label: 'Cofired NG for low-load support', fuelCode: 'natural_gas', technology: 'BOILER_LARGE', quantity: 5_000_000, quantityUnit: 'Sm3' },
  ]
  p.activityData.stationaryAuxiliary = [
    { id: uid(), label: 'Startup oil burner — LDO', fuelCode: 'diesel', technology: 'STARTUP_BURNER', quantity: 1_500_000, quantityUnit: 'L' },
    { id: uid(), label: 'Emergency DG sets', fuelCode: 'diesel', technology: 'EMERGENCY_GENSET', quantity: 30_000, quantityUnit: 'L' },
  ]
  p.activityData.mobile = [
    { id: uid(), label: 'Coal haul fleet', ownership: 'OWNED_CONTROLLED', vehicleCode: 'DIESEL_HAUL', quantity: 800_000, quantityUnit: 'L' },
  ]
  p.activityData.fgd = [{ id: uid(), label: 'Wet FGD unit', limestoneTonnes: 45_000 }]
  p.activityData.scr = [{ id: uid(), label: 'SCR unit', ureaTonnes: 1_200 }]
  p.activityData.fugitiveSF6 = [{ id: uid(), label: 'GIS switchyard', equipmentClass: 'GAS_INSULATED_SWITCHGEAR_SEALED_NEW', method: 'DEFAULT_LEAK_RATE', nameplateInventoryKg: 2_500 }]
  p.activityData.fugitiveHFC = [{ id: uid(), label: 'Plant chillers (R-410A)', gasCode: 'r410a', method: 'EQUIPMENT_BASED', chargeKg: 800, annualLeakRate: 0.08 }]
  p.activityData.fugitiveOtherCH4 = [{ id: uid(), label: 'Coal stockpile CH4', source: 'COAL_STORAGE', activityQuantity: 1_800_000, activityUnit: 't_coal' }]
  p.activityData.purchasedElectricity = { mwh: 0, gridEfTco2PerMwh: null }
  return p
}

/* ----------------------------- draft autosave ----------------------------- */

const DRAFT_KEY = 'sustally:power:draft:v1'
function saveDraft(p: PowerInputPayload) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(p)) } catch {} }
function loadDraft(): PowerInputPayload | null { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) as PowerInputPayload : null } catch { return null } }
function draftIsMeaningful(p: PowerInputPayload): boolean {
  const a = p?.activityData
  return (
    !!p?.organization?.name?.trim() || !!p?.facility?.name?.trim() ||
    (a?.stationaryMain?.length ?? 0) > 0 ||
    (a?.stationaryAuxiliary?.length ?? 0) > 0 ||
    (a?.biomassCofiring?.length ?? 0) > 0 ||
    (a?.mobile?.length ?? 0) > 0 ||
    (a?.fgd?.length ?? 0) > 0 ||
    (a?.scr?.length ?? 0) > 0 ||
    (a?.fugitiveSF6?.length ?? 0) > 0 ||
    (a?.fugitiveHFC?.length ?? 0) > 0 ||
    (a?.fugitiveOtherCH4?.length ?? 0) > 0 ||
    (a?.ccus?.length ?? 0) > 0 ||
    (a?.reported?.length ?? 0) > 0
  )
}

/* ----------------------------- shared bits ----------------------------- */

const S1_BADGE = <span className="entry-badge entry-badge-s1">Gross Scope 1 (CO2e)</span>
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

function EntryShell({ index, title, badge, onRemove, children, formula }: {
  index: number; title: string; badge: React.ReactNode; onRemove: () => void; children: React.ReactNode; formula?: React.ReactNode
}) {
  return (
    <div className="entry-card">
      <div className="entry-card-head">
        <div className="entry-card-head-left">
          <span className="entry-num">#{index + 1}</span>
          <span className="entry-title">{title}</span>
          {badge}
        </div>
        <button className="entry-delete" onClick={onRemove}><Trash2 size={13} /> Remove</button>
      </div>
      {children}
      {formula && <div className="entry-formula">{formula}</div>}
    </div>
  )
}

/* ----------------------------- Tables (entry editors) ----------------------------- */

function FuelTable<T extends FuelEntry>({ kind, entries, onChange }: {
  kind: 'main' | 'aux' | 'biomass'; entries: T[]; onChange: (rows: T[]) => void
}) {
  const fuels = kind === 'main' ? FUELS_MAIN : kind === 'aux' ? FUELS_AUX : FUELS_BIOMASS
  const techs = kind === 'main' ? TECHS_MAIN : kind === 'aux' ? TECHS_AUX : TECHS_BIOMASS
  const add = () => onChange([...entries, { id: uid(), label: '', fuelCode: fuels[0], technology: techs[0], quantity: null, quantityUnit: 'tonne' } as T])
  const upd = (id: string, fn: (e: T) => void) => onChange(entries.map((e) => { if (e.id !== id) return e; const c = { ...e }; fn(c); return c }))
  const rem = (id: string) => onChange(entries.filter((e) => e.id !== id))
  const title = kind === 'main' ? 'Main combustion (boilers / turbines / engines)' : kind === 'aux' ? 'Auxiliary combustion (startup / aux / emergency)' : 'Biomass cofiring (CO2 → memo, CH4/N2O → Scope 1)'
  return (
    <div className="form-card">
      <h2>{title}</h2>
      {entries.length === 0 && <p className="form-sub">No rows yet — click <b>Add fuel row</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || `(unnamed ${kind})`} badge={kind === 'biomass' ? MEMO_BADGE : S1_BADGE} onRemove={() => rem(e.id)} formula={<>energy = qty &times; NCV &middot; CO2 = energy &times; EF &middot; CH4/N2O via tech defaults</>}>
          <div className="field-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>Label<input value={e.label} placeholder={`e.g. ${kind === 'main' ? 'Boiler-1 PC' : kind === 'aux' ? 'Emergency DG' : 'Wood-chip cofiring'}`} onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
            <label className="field">Fuel
              <select value={e.fuelCode} onChange={(ev) => upd(e.id, (r) => (r.fuelCode = ev.target.value))}>{fuels.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select>
            </label>
            <label className="field">Technology
              <select value={e.technology} onChange={(ev) => upd(e.id, (r) => (r.technology = ev.target.value))}>{techs.map((c) => <option key={c} value={c}>{c.toLowerCase().replace(/_/g, ' ')}</option>)}</select>
            </label>
            <NumField label="Quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (r) => (r.quantity = v))} />
            <label className="field">Unit
              <select value={e.quantityUnit} onChange={(ev) => upd(e.id, (r) => (r.quantityUnit = ev.target.value))}>{['tonne', 'L', 'Sm3', 'GJ', 'kg', 'tonne_dry'].map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </label>
            <NumField label="NCV override" unit={`GJ/${e.quantityUnit}`} step="0.0001" value={e.ncvGjPerUnit ?? null} onChange={(v) => upd(e.id, (r) => (r.ncvGjPerUnit = v))} hint="blank = library" />
            <NumField label="CO2 EF override" unit="kg/GJ" step="0.01" value={e.co2EfKgPerGj ?? null} onChange={(v) => upd(e.id, (r) => (r.co2EfKgPerGj = v))} hint="blank = library" />
            {kind !== 'biomass' && (
              <label className="field" style={{ alignItems: 'flex-end', display: 'flex' }}>
                <input type="checkbox" checked={!!e.useIndiaNatcom} onChange={(ev) => upd(e.id, (r) => (r.useIndiaNatcom = ev.target.checked))} style={{ marginRight: 6 }} />
                India NATCOM CEF
              </label>
            )}
            <NumField label="Oxidation factor" unit="0-1" step="0.001" value={e.oxidationFactor ?? null} onChange={(v) => upd(e.id, (r) => (r.oxidationFactor = v))} hint="default 1.0" />
            <NumField label="CEMS CO2 (Tier 5)" unit="tCO2" value={e.cemsCo2Tonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.cemsCo2Tonnes = v))} hint="direct measurement" />
            <label className="field" style={{ gridColumn: 'span 2' }}>Override / evidence note<input value={e.overrideReason ?? ''} placeholder="lab report, RATA reference, NATCOM applicability…" onChange={(ev) => upd(e.id, (r) => (r.overrideReason = ev.target.value))} /></label>
          </div>
        </EntryShell>
      ))}
      <button className="btn ghost" onClick={add}><Plus size={14} /> Add fuel row</button>
    </div>
  )
}

function MobileTable({ entries, onChange }: { entries: MobileEntry[]; onChange: (rows: MobileEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), label: '', ownership: 'OWNED_CONTROLLED', vehicleCode: 'DIESEL_HAUL', quantity: null, quantityUnit: 'L' }])
  const upd = (id: string, fn: (e: MobileEntry) => void) => onChange(entries.map((e) => { if (e.id !== id) return e; const c = { ...e }; fn(c); return c }))
  const rem = (id: string) => onChange(entries.filter((e) => e.id !== id))
  return (
    <div className="form-card">
      <h2>Mobile / on-site equipment</h2>
      <p className="form-sub">Owned / controlled rows go to Scope 1. Third-party rows route to <b>supporting Scope 3</b> and are excluded from gross.</p>
      {entries.length === 0 && <p className="form-sub">No mobile rows yet.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed mobile)'} badge={e.ownership === 'THIRD_PARTY' ? <span className="entry-badge entry-badge-s3">Supporting Scope 3</span> : S1_BADGE} onRemove={() => rem(e.id)}>
          <div className="field-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>Label<input value={e.label} placeholder="e.g. Coal haul fleet" onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
            <label className="field">Ownership
              <select value={e.ownership} onChange={(ev) => upd(e.id, (r) => (r.ownership = ev.target.value as MobileEntry['ownership']))}>
                <option value="OWNED_CONTROLLED">Owned / controlled (Scope 1)</option>
                <option value="THIRD_PARTY">Third-party (Scope 3)</option>
              </select>
            </label>
            <label className="field">Vehicle / fuel type
              <select value={e.vehicleCode} onChange={(ev) => upd(e.id, (r) => (r.vehicleCode = ev.target.value))}>{VEHICLES.map((c) => <option key={c} value={c}>{c.toLowerCase().replace(/_/g, ' ')}</option>)}</select>
            </label>
            <NumField label="Fuel quantity" unit={e.quantityUnit} value={e.quantity} onChange={(v) => upd(e.id, (r) => (r.quantity = v))} />
            <label className="field">Unit
              <select value={e.quantityUnit} onChange={(ev) => upd(e.id, (r) => (r.quantityUnit = ev.target.value))}>{['L', 'tonne', 'Sm3'].map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </label>
          </div>
        </EntryShell>
      ))}
      <button className="btn ghost" onClick={add}><Plus size={14} /> Add equipment row</button>
    </div>
  )
}

function FgdTable({ entries, onChange }: { entries: FgdEntry[]; onChange: (rows: FgdEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), label: '', limestoneTonnes: null }])
  const upd = (id: string, fn: (e: FgdEntry) => void) => onChange(entries.map((e) => { if (e.id !== id) return e; const c = { ...e }; fn(c); return c }))
  const rem = (id: string) => onChange(entries.filter((e) => e.id !== id))
  return (
    <div className="form-card">
      <h2>Wet FGD limestone (CaCO3 → CaSO4 + CO2)</h2>
      <p className="form-sub">CO2 = limestone × purity × 0.4396 (44/100.09). Default purity 0.92 (override per row).</p>
      {entries.length === 0 && <p className="form-sub">No FGD rows yet — non-FGD plants leave blank.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed FGD unit)'} badge={S1_BADGE} onRemove={() => rem(e.id)} formula={<>CO2 = limestone &times; purity &times; 0.4396</>}>
          <div className="field-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>Label<input value={e.label} placeholder="e.g. Wet FGD scrubber" onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
            <NumField label="Limestone consumed" unit="t" value={e.limestoneTonnes} onChange={(v) => upd(e.id, (r) => (r.limestoneTonnes = v))} />
            <NumField label="Purity override" unit="0-1" step="0.01" value={e.purity ?? null} onChange={(v) => upd(e.id, (r) => (r.purity = v))} hint="default 0.92" />
          </div>
        </EntryShell>
      ))}
      <button className="btn ghost" onClick={add}><Plus size={14} /> Add FGD row</button>
    </div>
  )
}

function ScrTable({ entries, onChange }: { entries: ScrSncrEntry[]; onChange: (rows: ScrSncrEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), label: '', ureaTonnes: null }])
  const upd = (id: string, fn: (e: ScrSncrEntry) => void) => onChange(entries.map((e) => { if (e.id !== id) return e; const c = { ...e }; fn(c); return c }))
  const rem = (id: string) => onChange(entries.filter((e) => e.id !== id))
  return (
    <div className="form-card">
      <h2>SCR / SNCR urea oxidation</h2>
      <p className="form-sub">CO2 = urea × purity × 0.733 (44/60.06). Default purity 0.99 (solid urea).</p>
      {entries.length === 0 && <p className="form-sub">No SCR/SNCR rows yet.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed SCR unit)'} badge={S1_BADGE} onRemove={() => rem(e.id)} formula={<>CO2 = urea &times; purity &times; 0.733</>}>
          <div className="field-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>Label<input value={e.label} placeholder="e.g. SCR unit" onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
            <NumField label="Urea consumed" unit="t" value={e.ureaTonnes} onChange={(v) => upd(e.id, (r) => (r.ureaTonnes = v))} />
            <NumField label="Purity override" unit="0-1" step="0.01" value={e.purity ?? null} onChange={(v) => upd(e.id, (r) => (r.purity = v))} hint="default 0.99" />
            <NumField label="N2O slip (optional)" unit="kg N2O/yr" value={e.scrN2oSlipKg ?? null} onChange={(v) => upd(e.id, (r) => (r.scrN2oSlipKg = v))} hint="measured if known" />
          </div>
        </EntryShell>
      ))}
      <button className="btn ghost" onClick={add}><Plus size={14} /> Add SCR/SNCR row</button>
    </div>
  )
}

function Sf6Table({ entries, onChange }: { entries: Sf6Entry[]; onChange: (rows: Sf6Entry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), label: '', equipmentClass: 'GAS_INSULATED_SWITCHGEAR_SEALED_NEW', method: 'DEFAULT_LEAK_RATE', nameplateInventoryKg: null }])
  const upd = (id: string, fn: (e: Sf6Entry) => void) => onChange(entries.map((e) => { if (e.id !== id) return e; const c = { ...e }; fn(c); return c }))
  const rem = (id: string) => onChange(entries.filter((e) => e.id !== id))
  return (
    <div className="form-card">
      <h2>SF6 from gas-insulated switchgear (GWP 25,200)</h2>
      <p className="form-sub">Mass-balance per EPA Subpart DD / EU ETS Annex IV is preferred. Default-leak-rate fallback uses nameplate × manufacturer class rate.</p>
      {entries.length === 0 && <p className="form-sub">No SF6 rows yet.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed SF6)'} badge={S1_BADGE} onRemove={() => rem(e.id)} formula={<>SF6 (kg) &times; 25,200 / 1000 = tCO2e</>}>
          <div className="field-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>Label<input value={e.label} placeholder="e.g. GIS substation" onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
            <label className="field">Equipment class
              <select value={e.equipmentClass} onChange={(ev) => upd(e.id, (r) => (r.equipmentClass = ev.target.value as Sf6Entry['equipmentClass']))}>{SF6_CLASSES.map((c) => <option key={c} value={c}>{c.toLowerCase().replace(/_/g, ' ')}</option>)}</select>
            </label>
            <label className="field">Method
              <select value={e.method} onChange={(ev) => upd(e.id, (r) => (r.method = ev.target.value as Sf6Entry['method']))}>
                <option value="MASS_BALANCE">Mass balance (preferred)</option>
                <option value="DEFAULT_LEAK_RATE">Default leak rate</option>
              </select>
            </label>
            <NumField label="Nameplate kg" value={e.nameplateInventoryKg} onChange={(v) => upd(e.id, (r) => (r.nameplateInventoryKg = v))} />
            {e.method === 'MASS_BALANCE' && (
              <>
                <NumField label="Inventory start (kg)" value={e.inventoryStartKg ?? null} onChange={(v) => upd(e.id, (r) => (r.inventoryStartKg = v))} />
                <NumField label="Inventory end (kg)" value={e.inventoryEndKg ?? null} onChange={(v) => upd(e.id, (r) => (r.inventoryEndKg = v))} />
                <NumField label="Purchased (kg)" value={e.purchasedKg ?? null} onChange={(v) => upd(e.id, (r) => (r.purchasedKg = v))} />
                <NumField label="Sold (kg)" value={e.soldKg ?? null} onChange={(v) => upd(e.id, (r) => (r.soldKg = v))} />
                <NumField label="Recovered (kg)" value={e.recoveredKg ?? null} onChange={(v) => upd(e.id, (r) => (r.recoveredKg = v))} />
                <NumField label="In new equipment (kg)" value={e.inNewEquipmentKg ?? null} onChange={(v) => upd(e.id, (r) => (r.inNewEquipmentKg = v))} />
                <NumField label="In retired equipment (kg)" value={e.inRetiredEquipmentKg ?? null} onChange={(v) => upd(e.id, (r) => (r.inRetiredEquipmentKg = v))} />
              </>
            )}
            <NumField label="Leak rate override" unit="fraction/yr" step="0.001" value={e.leakRateOverride ?? null} onChange={(v) => upd(e.id, (r) => (r.leakRateOverride = v))} hint="blank = class default" />
          </div>
        </EntryShell>
      ))}
      <button className="btn ghost" onClick={add}><Plus size={14} /> Add SF6 row</button>
    </div>
  )
}

function HfcTable({ entries, onChange }: { entries: HfcEntry[]; onChange: (rows: HfcEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), label: '', gasCode: 'r410a', method: 'EQUIPMENT_BASED', chargeKg: null, annualLeakRate: 0.05 }])
  const upd = (id: string, fn: (e: HfcEntry) => void) => onChange(entries.map((e) => { if (e.id !== id) return e; const c = { ...e }; fn(c); return c }))
  const rem = (id: string) => onChange(entries.filter((e) => e.id !== id))
  return (
    <div className="form-card">
      <h2>Refrigerant HFC fugitives</h2>
      <p className="form-sub">Mass balance (preferred) or equipment-based (charge × annual leak rate). AR6 100-yr GWPs.</p>
      {entries.length === 0 && <p className="form-sub">No refrigerant rows yet.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed chiller)'} badge={S1_BADGE} onRemove={() => rem(e.id)} formula={<>kg leaked &times; GWP / 1000 = tCO2e</>}>
          <div className="field-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>Label<input value={e.label} placeholder="e.g. Plant chiller" onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
            <label className="field">Gas code
              <select value={e.gasCode} onChange={(ev) => upd(e.id, (r) => (r.gasCode = ev.target.value))}>{HFC_GASES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select>
            </label>
            <label className="field">Method
              <select value={e.method} onChange={(ev) => upd(e.id, (r) => (r.method = ev.target.value as HfcEntry['method']))}>
                <option value="MASS_BALANCE">Mass balance (preferred)</option>
                <option value="EQUIPMENT_BASED">Equipment-based (charge × leak rate)</option>
              </select>
            </label>
            {e.method === 'EQUIPMENT_BASED' ? (
              <>
                <NumField label="Charge" unit="kg" value={e.chargeKg ?? null} onChange={(v) => upd(e.id, (r) => (r.chargeKg = v))} />
                <NumField label="Annual leak rate" unit="fraction/yr" step="0.01" value={e.annualLeakRate ?? null} onChange={(v) => upd(e.id, (r) => (r.annualLeakRate = v))} hint="0.05-0.10 typical" />
              </>
            ) : (
              <>
                <NumField label="Inventory start (kg)" value={e.inventoryStartKg ?? null} onChange={(v) => upd(e.id, (r) => (r.inventoryStartKg = v))} />
                <NumField label="Inventory end (kg)" value={e.inventoryEndKg ?? null} onChange={(v) => upd(e.id, (r) => (r.inventoryEndKg = v))} />
                <NumField label="Purchased (kg)" value={e.purchasedKg ?? null} onChange={(v) => upd(e.id, (r) => (r.purchasedKg = v))} />
                <NumField label="Sold (kg)" value={e.soldKg ?? null} onChange={(v) => upd(e.id, (r) => (r.soldKg = v))} />
                <NumField label="Recovered (kg)" value={e.recoveredKg ?? null} onChange={(v) => upd(e.id, (r) => (r.recoveredKg = v))} />
              </>
            )}
          </div>
        </EntryShell>
      ))}
      <button className="btn ghost" onClick={add}><Plus size={14} /> Add HFC row</button>
    </div>
  )
}

function OtherCh4Table({ entries, onChange }: { entries: OtherFugitiveCh4Entry[]; onChange: (rows: OtherFugitiveCh4Entry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), label: '', source: 'COAL_STORAGE', activityQuantity: null, activityUnit: 't_coal' }])
  const upd = (id: string, fn: (e: OtherFugitiveCh4Entry) => void) => onChange(entries.map((e) => { if (e.id !== id) return e; const c = { ...e }; fn(c); return c }))
  const rem = (id: string) => onChange(entries.filter((e) => e.id !== id))
  return (
    <div className="form-card">
      <h2>Other CH4 fugitives (coal piles / handling / NG pipework)</h2>
      <p className="form-sub">Activity × EF. Defaults: coal storage 0.13 kg CH4/t; coal handling 0.10; NG pipework 0.0001 kg CH4/GJ.</p>
      {entries.length === 0 && <p className="form-sub">No CH4 fugitive rows yet.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed CH4)'} badge={S1_BADGE} onRemove={() => rem(e.id)} formula={<>activity &times; EF (kg CH4/unit)</>}>
          <div className="field-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>Label<input value={e.label} placeholder="e.g. Coal stockpile" onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
            <label className="field">Source
              <select value={e.source} onChange={(ev) => upd(e.id, (r) => (r.source = ev.target.value as OtherFugitiveCh4Entry['source']))}>
                <option value="COAL_STORAGE">Coal storage pile</option>
                <option value="COAL_HANDLING">Coal handling / conveyors</option>
                <option value="NATURAL_GAS_PIPEWORK">Natural gas pipework</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <NumField label="Activity quantity" unit={e.activityUnit} value={e.activityQuantity} onChange={(v) => upd(e.id, (r) => (r.activityQuantity = v))} />
            <label className="field">Activity unit
              <select value={e.activityUnit} onChange={(ev) => upd(e.id, (r) => (r.activityUnit = ev.target.value as OtherFugitiveCh4Entry['activityUnit']))}>{['t_coal', 't_coal_handled', 'GJ_gas', 'other'].map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </label>
            <NumField label="EF override" unit="kg CH4/unit" step="0.001" value={e.efKgCh4PerUnit ?? null} onChange={(v) => upd(e.id, (r) => (r.efKgCh4PerUnit = v))} hint="blank = library default" />
          </div>
        </EntryShell>
      ))}
      <button className="btn ghost" onClick={add}><Plus size={14} /> Add CH4 row</button>
    </div>
  )
}

function CcusTable({ entries, onChange }: { entries: CcusEntry[]; onChange: (rows: CcusEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), label: '', capturedAndStoredTonnes: null, mrvProtocol: 'EU_ETS_ARTICLE_49' }])
  const upd = (id: string, fn: (e: CcusEntry) => void) => onChange(entries.map((e) => { if (e.id !== id) return e; const c = { ...e }; fn(c); return c }))
  const rem = (id: string) => onChange(entries.filter((e) => e.id !== id))
  return (
    <div className="form-card">
      <h2>CCUS — captured &amp; stored CO2 (deducted from gross)</h2>
      <p className="form-sub">Per EU ETS Article 49 / EPA Subpart RR. Permanence / reversal NOT modelled — flagged in audit trail.</p>
      {entries.length === 0 && <p className="form-sub">No CCUS rows yet.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed capture)'} badge={<span className="entry-badge entry-badge-mixed">Net off gross</span>} onRemove={() => rem(e.id)} formula={<>gross -= capturedAndStored</>}>
          <div className="field-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>Label<input value={e.label} placeholder="e.g. Post-combustion amine" onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
            <NumField label="Captured &amp; stored" unit="tCO2" value={e.capturedAndStoredTonnes} onChange={(v) => upd(e.id, (r) => (r.capturedAndStoredTonnes = v))} />
            <NumField label="Captured &amp; utilised" unit="tCO2 (not deducted)" value={e.capturedAndUtilisedTonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.capturedAndUtilisedTonnes = v))} hint="short-cycle re-release" />
            <NumField label="Process vent (start-up/regen)" unit="tCO2 (memo)" value={e.processVentTonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.processVentTonnes = v))} />
            <label className="field">MRV protocol
              <select value={e.mrvProtocol} onChange={(ev) => upd(e.id, (r) => (r.mrvProtocol = ev.target.value as CcusEntry['mrvProtocol']))}>
                <option value="EU_ETS_ARTICLE_49">EU ETS Article 49</option>
                <option value="EPA_SUBPART_RR">US EPA Subpart RR</option>
                <option value="EPA_SUBPART_PP">US EPA Subpart PP</option>
                <option value="ISO_27914">ISO 27914</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="field" style={{ gridColumn: 'span 2' }}>Storage reference<input value={e.storageReference ?? ''} placeholder="storage site permit / well ID" onChange={(ev) => upd(e.id, (r) => (r.storageReference = ev.target.value))} /></label>
          </div>
        </EntryShell>
      ))}
      <button className="btn ghost" onClick={add}><Plus size={14} /> Add CCUS row</button>
    </div>
  )
}

function ReportedTable({ entries, onChange }: { entries: ReportedEntry[]; onChange: (rows: ReportedEntry[]) => void }) {
  const add = () => onChange([...entries, { id: uid(), label: '', basis: 'reported' as const, totalCO2eTonnes: null }])
  const upd = (id: string, fn: (e: ReportedEntry) => void) => onChange(entries.map((e) => { if (e.id !== id) return e; const c = { ...e }; fn(c); return c }))
  const rem = (id: string) => onChange(entries.filter((e) => e.id !== id))
  return (
    <>
      <p className="form-sub">For public-disclosure or head-office data: enter disclosed CO2e (or by-gas masses) directly when activity inputs aren&apos;t available.</p>
      {entries.length === 0 && <p className="form-sub">No reported figures yet — click <b>Add reported figure</b>.</p>}
      {entries.map((e, i) => (
        <EntryShell key={e.id} index={i} title={e.label || '(unnamed reported)'} badge={S1_BADGE} onRemove={() => rem(e.id)}>
          <div className="field-row">
            <label className="field" style={{ gridColumn: 'span 2' }}>Label<input value={e.label} placeholder="e.g. BRSR Section A.III Scope 1" onChange={(ev) => upd(e.id, (r) => (r.label = ev.target.value))} /></label>
            <label className="field">Source / category tag<input value={e.source ?? ''} placeholder="e.g. annual report, CDP, BRSR" onChange={(ev) => upd(e.id, (r) => (r.source = ev.target.value))} /></label>
            <label className="field">Basis
              <select value={e.basis} onChange={(ev) => upd(e.id, (r) => (r.basis = ev.target.value as ReportedEntry['basis']))}>
                <option value="measured">measured</option>
                <option value="estimated">estimated</option>
                <option value="inferred">inferred</option>
                <option value="reported">reported</option>
                <option value="residual">residual</option>
              </select>
            </label>
            <NumField label="Total CO2e" unit="tCO2e (authoritative if set)" value={e.totalCO2eTonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.totalCO2eTonnes = v))} />
            <NumField label="…or CO2" unit="t" value={e.co2Tonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.co2Tonnes = v))} />
            <NumField label="CH4" unit="t" value={e.ch4Tonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.ch4Tonnes = v))} />
            <NumField label="N2O" unit="t" value={e.n2oTonnes ?? null} onChange={(v) => upd(e.id, (r) => (r.n2oTonnes = v))} />
            <label className="field" style={{ gridColumn: 'span 2' }}>Source / disclosure reference<input value={e.evidenceReference ?? ''} placeholder="e.g. annual report URL + page" onChange={(ev) => upd(e.id, (r) => (r.evidenceReference = ev.target.value))} /></label>
            <label className="field" style={{ gridColumn: 'span 2' }}>Note / assumption<input value={e.note ?? ''} placeholder="optional" onChange={(ev) => upd(e.id, (r) => (r.note = ev.target.value))} /></label>
          </div>
        </EntryShell>
      ))}
      <button className="btn ghost" onClick={add}><Plus size={14} /> Add reported figure</button>
    </>
  )
}

/* ----------------------------- Live totals strip ----------------------------- */

function LiveTotals({ live }: { live: PowerCalculationResult | null }) {
  if (!live) return null
  const g = live.scope1.byGas
  return (
    <div className="live-totals-strip">
      <span className="live-totals-strip-label">Live results — updates as you type</span>
      <div className="live-totals-strip-rows">
        <div className="summary-card"><span>Gross Scope 1</span><strong>{fmt.format(live.scope1.grossScope1CO2eTonnes)}</strong><small>tCO2e</small></div>
        <div className="summary-card"><span>CO2</span><strong>{fmt.format(g.co2Tonnes)}</strong><small>tCO2</small></div>
        <div className="summary-card"><span>CH4 (as CO2e)</span><strong>{fmt.format(g.ch4Tonnes * 29.8)}</strong><small>tCO2e</small></div>
        <div className="summary-card"><span>N2O (as CO2e)</span><strong>{fmt.format(g.n2oTonnes * 273)}</strong><small>tCO2e</small></div>
        <div className="summary-card"><span>HFCs</span><strong>{fmt.format(g.hfcCO2eTonnes)}</strong><small>tCO2e</small></div>
        <div className="summary-card"><span>SF6 (as CO2e)</span><strong>{fmt.format(g.sf6Tonnes * 25200)}</strong><small>tCO2e</small></div>
        <div className="summary-card"><span>Biogenic memo</span><strong>{fmt.format(live.memoItems.biogenicCO2Tonnes)}</strong><small>tCO2 (excluded)</small></div>
      </div>
    </div>
  )
}

/* ----------------------------- Main component ----------------------------- */

const COL_GRID = '1.6fr 1fr 1fr 1fr 1fr'

export default function PowerWizard({ onSwitchSector }: { onSwitchSector?: (s: 'cement' | 'oil_gas' | 'pulp_paper' | 'iron_steel' | 'power') => void }) {
  const [step, setStep] = useState(1)
  const [cat, setCat] = useState<Cat>('stationaryMain')
  const [p, setP] = useState<PowerInputPayload>(emptyPayload)
  const [hasDraft, setHasDraft] = useState(false)
  const [result, setResult] = useState<PowerCalculationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [step3Tried, setStep3Tried] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // load draft
  useEffect(() => {
    const d = loadDraft()
    if (d && draftIsMeaningful(d)) { setP(d); setHasDraft(true) }
  }, [])
  // autosave
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => saveDraft(p), 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [p])
  // live calc
  const live = useMemo(() => { try { return calculatePower(p) } catch { return null } }, [p])

  function patch(fn: (d: PowerInputPayload) => void) { setP((prev) => { const c: PowerInputPayload = JSON.parse(JSON.stringify(prev)); fn(c); return c }) }
  function startFresh() { try { localStorage.removeItem(DRAFT_KEY) } catch {}; setP(emptyPayload()); setStep(1); setResult(null); setHasDraft(false) }
  function trySample() { setP(samplePlant()); setStep(2); setResult(null); setHasDraft(false) }

  async function runCalculate(save = false) {
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/calculations/power/calculate${save ? '?save=true' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      })
      const data = await res.json()
      if (data?.result) { setResult(data.result); setStep(5); window.scrollTo(0, 0) }
    } catch (err) { console.error(err) } finally { setBusy(false) }
  }

  const facilityValid = !!p.facility.name?.trim() && !!p.facility.technology
  const ad = p.activityData
  const ms = p.methodSelections
  const counts: Record<Cat, number> = {
    production: 0,
    stationaryMain: ad.stationaryMain?.length ?? 0,
    stationaryAux: ad.stationaryAuxiliary?.length ?? 0,
    biomass: ad.biomassCofiring?.length ?? 0,
    mobile: ad.mobile?.length ?? 0,
    fgd: ad.fgd?.length ?? 0,
    scr: ad.scr?.length ?? 0,
    sf6: ad.fugitiveSF6?.length ?? 0,
    hfc: ad.fugitiveHFC?.length ?? 0,
    otherCh4: ad.fugitiveOtherCH4?.length ?? 0,
    ccus: ad.ccus?.length ?? 0,
    reported: ad.reported?.length ?? 0,
  }

  return (
    <div className="wizard-app">
      <header className="wizard-header">
        <div className="brand-row">
          <button className="brand-btn" onClick={() => onSwitchSector?.('cement')}>
            <span className="brand-mark">⚡</span>
            <span className="brand-text"><b>SCOPE 1 CALCULATOR</b><br /><span className="brand-sector">Power</span></span>
          </button>
          <div className="gwp-strip">
            <span>GWP</span>
            {(['AR5_100', 'AR6_100', 'AR6_20'] as PowerGwpSet[]).map((g) => (
              <button key={g} className={p.calculationContext.gwpSet === g ? 'gwp-pill active' : 'gwp-pill'} onClick={() => patch((d) => (d.calculationContext.gwpSet = g))}>
                {g.replace('_', ' · ')}
              </button>
            ))}
          </div>
        </div>
        <div className="stepper">
          {['Sector', 'Organisation', 'Plant & methods', 'Activity data', 'Review & report'].map((lbl, i) => (
            <button key={lbl} className={step === i + 1 ? 'stepper-step active' : step > i + 1 ? 'stepper-step complete' : 'stepper-step'} onClick={() => setStep(i + 1)}>{i + 1}<span>{lbl}</span></button>
          ))}
        </div>
      </header>

      <section className="wizard-main">
        {step === 1 && (
          <section className="step-page active">
            <h1 className="step-title">What <em>sector</em> are you in?</h1>
            <p className="step-sub">Power uses the GHG Protocol + IPCC 2006 + EU ETS MRR + US EPA Subparts A/C/D/DD stack with India CEA v21 / NATCOM overrides for Indian operations. Gross Scope 1 covers <b>stationary combustion</b> (main + auxiliary + biomass), <b>mobile</b>, <b>process</b> (wet FGD + SCR/SNCR), <b>fugitive</b> (SF6 + HFCs + CH4 leaks), with optional CCUS netting. Biogenic CO2 is a memo line.</p>
            {hasDraft && (
              <div className="form-card" style={{ background: 'color-mix(in srgb, #2f6b4f 10%, transparent)', borderColor: 'color-mix(in srgb, #2f6b4f 32%, transparent)' }}>
                <div><b>Draft restored.</b> Your previous entry was autosaved and reloaded. <button className="btn ghost" onClick={startFresh}>Start fresh</button></div>
              </div>
            )}
            <div className="form-card">
              <p className="form-sub"><b>First time here?</b> See the calculator end-to-end with a sample 660 MW supercritical PC plant.</p>
              <button className="btn primary" onClick={trySample}>Try with sample data →</button>
            </div>
            <div className="sector-grid">
              {[
                { code: 'cement', name: 'Cement', sub: 'CSI · IPCC · ACTIVE' },
                { code: 'oil_gas', name: 'Oil & Gas', sub: 'IPIECA · API · ACTIVE' },
                { code: 'pulp_paper', name: 'Pulp & Paper', sub: 'ICFPA · NCASI · ACTIVE' },
                { code: 'iron_steel', name: 'Iron & Steel', sub: 'worldsteel · ISO 14404 · ACTIVE' },
                { code: 'power', name: 'Power', sub: 'GHG Protocol · IPCC · EU ETS · ACTIVE' },
              ].map((s) => (
                <button key={s.code} className={s.code === 'power' ? 'sector-card selected' : 'sector-card'} onClick={() => s.code !== 'power' && onSwitchSector?.(s.code as 'cement' | 'oil_gas' | 'pulp_paper' | 'iron_steel' | 'power')}>
                  <Zap size={20} /><span className="sector-name">{s.name}</span><small>{s.sub}</small>
                </button>
              ))}
            </div>
            <div className="step-footer">
              <button className="btn primary" onClick={() => setStep(2)}>Continue →</button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="step-page active">
            <h1 className="step-title">Organisation &amp; <em>boundary</em></h1>
            <p className="step-sub">Operational control is the GHG Protocol default. Equity share is common for JV / IPP arrangements (AM/NS-style joint generators).</p>
            <div className="form-card">
              <h2>Reporting entity</h2>
              <div className="field-row">
                <label className="field" style={{ gridColumn: 'span 2' }}>Organisation name *<input value={p.organization.name} onChange={(e) => patch((d) => (d.organization.name = e.target.value))} /></label>
                <label className="field">Country
                  <select value={p.organization.country} onChange={(e) => patch((d) => (d.organization.country = e.target.value))}>
                    {['IN', 'US', 'EU', 'UK', 'CN', 'AU', 'JP', 'OTHER'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="field">Contact name<input value={p.organization.contactName ?? ''} onChange={(e) => patch((d) => (d.organization.contactName = e.target.value))} /></label>
                <label className="field">Contact email<input value={p.organization.contactEmail ?? ''} onChange={(e) => patch((d) => (d.organization.contactEmail = e.target.value))} /></label>
              </div>
            </div>
            <div className="form-card">
              <h2>Boundary &amp; consolidation</h2>
              <div className="field-row">
                <label className="field">Boundary method
                  <select value={p.organizationBoundary.boundaryMethod} onChange={(e) => patch((d) => (d.organizationBoundary.boundaryMethod = e.target.value as PowerInputPayload['organizationBoundary']['boundaryMethod']))}>
                    <option value="OPERATIONAL_CONTROL">Operational control (GHG Protocol recommended)</option>
                    <option value="FINANCIAL_CONTROL">Financial control</option>
                    <option value="EQUITY_SHARE">Equity share</option>
                  </select>
                </label>
                <NumField label="Consolidation %" value={p.organizationBoundary.consolidationPercent ?? 100} onChange={(v) => patch((d) => (d.organizationBoundary.consolidationPercent = v ?? 100))} hint="100 for control; ownership % for equity share" />
              </div>
            </div>
            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn primary" onClick={() => setStep(3)}>Continue →</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="step-page active">
            <h1 className="step-title">Plant, technology &amp; <em>methods</em></h1>
            <p className="step-sub">Plant technology drives which sources are applicable (PC plants enable FGD + SCR; CFB disables FGD; gas turbines disable FGD/SCR; etc.).</p>
            <div className="form-card">
              <h2>Plant</h2>
              <div className="field-row">
                <label className="field" style={{ gridColumn: 'span 2' }}>Plant name *<input value={p.facility.name} placeholder="e.g. Mundra Unit-3" onChange={(e) => patch((d) => (d.facility.name = e.target.value))} /></label>
                <label className="field">Technology
                  <select value={p.facility.technology} onChange={(e) => {
                    const t = e.target.value as Tech
                    patch((d) => {
                      d.facility.technology = t
                      d.sourceApplicability = TECH_APPLICABILITY[t]
                    })
                  }}>
                    {(Object.keys(PLANT_TECH_LABELS) as Tech[]).map((c) => <option key={c} value={c}>{PLANT_TECH_LABELS[c]}</option>)}
                  </select>
                </label>
                <NumField label="Nameplate capacity" unit="MW" value={p.facility.nameplateCapacityMw ?? null} onChange={(v) => patch((d) => (d.facility.nameplateCapacityMw = v ?? undefined))} />
                <NumField label="Number of units" value={p.facility.numberOfUnits ?? null} onChange={(v) => patch((d) => (d.facility.numberOfUnits = v ?? undefined))} />
                <NumField label="Reporting year" value={p.calculationContext.reportingPeriod.year} onChange={(v) => patch((d) => (d.calculationContext.reportingPeriod.year = (v ?? new Date().getFullYear())))} />
              </div>
            </div>
            <div className="form-card">
              <h2>Methods</h2>
              <div className="field-row">
                <label className="field">Stationary method
                  <select value={ms.stationaryMethod} onChange={(e) => patch((d) => (d.methodSelections.stationaryMethod = e.target.value as PowerInputPayload['methodSelections']['stationaryMethod']))}>
                    <option value="ENERGY_BASED">Energy-based (qty × NCV × EF) — Tier 1/2</option>
                    <option value="CARBON_CONTENT_BASED">Carbon-content (Tier 3)</option>
                    <option value="DIRECT_MEASUREMENT">Direct measurement (CEMS) — Tier 5</option>
                  </select>
                </label>
                <label className="field">Default tier
                  <select value={ms.defaultTier} onChange={(e) => patch((d) => (d.methodSelections.defaultTier = e.target.value as PowerInputPayload['methodSelections']['defaultTier']))}>
                    <option value="TIER_1">Tier 1 (IPCC defaults)</option>
                    <option value="TIER_2">Tier 2 (CEA / NATCOM / national)</option>
                    <option value="TIER_3">Tier 3 (plant-specific %C)</option>
                    <option value="TIER_5_CEMS">Tier 5 (CEMS)</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
              <button className="btn primary" onClick={() => { setStep3Tried(true); if (facilityValid) setStep(4) }}>Continue</button>
            </div>
            {step3Tried && !facilityValid && <p className="field-error" style={{ marginTop: 6 }}>Plant name and technology are required before continuing.</p>}
          </section>
        )}

        {step === 4 && (() => {
          const activeGroupOfCat = (CATEGORIES.find((c) => c.key === cat)?.group ?? 'STATIONARY') as PWGroup
          const activeGroup: PWGroup = PW_PRIMARY_GROUPS.includes(activeGroupOfCat) ? activeGroupOfCat : 'STATIONARY'
          const subCats = CATEGORIES.filter((c) => c.group === activeGroup && (!c.appKey || p.sourceApplicability[c.appKey] !== false))
          if (subCats.length > 0 && !subCats.some((c) => c.key === cat)) {
            setTimeout(() => setCat(subCats[0].key), 0)
          }
          const ccusCats = CATEGORIES.filter((c) => c.group === 'CCUS' && (!c.appKey || p.sourceApplicability[c.appKey] !== false))
          return (
            <section className="step-page active">
              <h1 className="step-title">Activity <em>data</em></h1>
              <p className="step-sub">Pick a Scope 1 source type below: <b>stationary combustion</b> (main + auxiliary + biomass cofiring), <b>mobile</b>, <b>process</b> (FGD + SCR/SNCR), <b>fugitive</b> (SF6 + HFCs + CH4 leaks). <b>Generation</b> at the top is the intensity denominator. <b>Reported</b> at the bottom is for corporate-aggregate disclosure + reconciliation.</p>
              <LiveTotals live={live} />

              <details className="form-card">
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Source applicability — what this plant operates ({Object.values(p.sourceApplicability).filter(Boolean).length} of {Object.keys(p.sourceApplicability).length} sources active)</summary>
                <p className="form-sub" style={{ marginTop: 8 }}>Auto-set from your <b>{PLANT_TECH_LABELS[p.facility.technology]}</b> technology. Toggle OFF any source this plant doesn&apos;t have.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px 16px' }}>
                  {(Object.keys(p.sourceApplicability) as (keyof PowerInputPayload['sourceApplicability'])[]).map((k) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                      <input type="checkbox" checked={!!p.sourceApplicability[k]} onChange={(e) => patch((d) => (d.sourceApplicability[k] = e.target.checked))} style={{ width: 16, height: 16, accentColor: 'var(--purple)' }} />
                      <span>{k}</span>
                    </label>
                  ))}
                </div>
              </details>

              <div className="form-card">
                <h2>Generation volumes (intensity denominators)</h2>
                <p className="form-sub">kgCO2e per MWh net is the canonical power-sector KPI. Net = gross − auxiliary load.</p>
                <div className="field-row">
                  <NumField label="Gross generation" unit="MWh" value={ad.production.grossGenerationMwh ?? null} onChange={(v) => patch((d) => (d.activityData.production.grossGenerationMwh = v))} />
                  <NumField label="Net generation (sent out)" unit="MWh" value={ad.production.netGenerationMwh ?? null} onChange={(v) => patch((d) => (d.activityData.production.netGenerationMwh = v))} />
                  <NumField label="Auxiliary power" unit="%" value={ad.production.auxiliaryPowerPercent ?? null} onChange={(v) => patch((d) => (d.activityData.production.auxiliaryPowerPercent = v))} hint="typical 6-10% PC; 2-4% CCGT" />
                  <NumField label="Operating hours" unit="h/yr" value={ad.production.operatingHoursYr ?? null} onChange={(v) => patch((d) => (d.activityData.production.operatingHoursYr = v))} />
                  {p.facility.isChp && <NumField label="Heat supplied (CHP)" unit="GJ" value={ad.production.heatSuppliedGj ?? null} onChange={(v) => patch((d) => (d.activityData.production.heatSuppliedGj = v))} />}
                </div>
              </div>

              <div className="primary-tabs">
                {PW_PRIMARY_GROUPS.map((g) => {
                  const inGroup = CATEGORIES.filter((c) => c.group === g && (!c.appKey || p.sourceApplicability[c.appKey] !== false))
                  const total = inGroup.reduce((sum, c) => sum + (counts[c.key] || 0), 0)
                  const meta = PW_GROUP_LABELS[g]
                  const Icon = meta.icon
                  const isActive = activeGroup === g
                  const disabled = inGroup.length === 0
                  return (
                    <button key={g} type="button" className={`primary-tab ${isActive ? 'active' : ''}`} disabled={disabled} style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined} onClick={() => { if (inGroup[0]) setCat(inGroup[0].key) }}>
                      <span className="primary-tab-row">
                        <span className="primary-tab-icon"><Icon size={18} /></span>
                        <span className="primary-tab-label">{meta.label}</span>
                        <span className="primary-tab-count">{total}</span>
                      </span>
                      <span className="primary-tab-hint">{meta.hint}</span>
                    </button>
                  )
                })}
              </div>

              {subCats.length > 1 && (
                <div className="sub-tabs">
                  {subCats.map(({ key, label, icon: Icon }) => (
                    <button key={key} className={cat === key ? 'active' : ''} onClick={() => setCat(key)}>
                      <Icon size={13} /> {label} <span>{counts[key]}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="category-panel">
                {cat === 'stationaryMain' && <FuelTable kind="main" entries={ad.stationaryMain} onChange={(rows) => patch((d) => (d.activityData.stationaryMain = rows))} />}
                {cat === 'stationaryAux' && <FuelTable kind="aux" entries={ad.stationaryAuxiliary} onChange={(rows) => patch((d) => (d.activityData.stationaryAuxiliary = rows))} />}
                {cat === 'biomass' && <FuelTable kind="biomass" entries={ad.biomassCofiring} onChange={(rows) => patch((d) => (d.activityData.biomassCofiring = rows))} />}
                {cat === 'mobile' && <MobileTable entries={ad.mobile} onChange={(rows) => patch((d) => (d.activityData.mobile = rows))} />}
                {cat === 'fgd' && <FgdTable entries={ad.fgd} onChange={(rows) => patch((d) => (d.activityData.fgd = rows))} />}
                {cat === 'scr' && <ScrTable entries={ad.scr} onChange={(rows) => patch((d) => (d.activityData.scr = rows))} />}
                {cat === 'sf6' && <Sf6Table entries={ad.fugitiveSF6} onChange={(rows) => patch((d) => (d.activityData.fugitiveSF6 = rows))} />}
                {cat === 'hfc' && <HfcTable entries={ad.fugitiveHFC} onChange={(rows) => patch((d) => (d.activityData.fugitiveHFC = rows))} />}
                {cat === 'otherCh4' && <OtherCh4Table entries={ad.fugitiveOtherCH4} onChange={(rows) => patch((d) => (d.activityData.fugitiveOtherCH4 = rows))} />}
              </div>

              {ccusCats.length > 0 && (
                <CcusTable entries={ad.ccus} onChange={(rows) => patch((d) => (d.activityData.ccus = rows))} />
              )}

              {p.sourceApplicability.reported !== false && (
                <div className="form-card">
                  <h2>Reported / direct-entry + reconciliation</h2>
                  <p className="form-sub">For corporate-aggregate disclosure where line-item activity isn&apos;t available. Add reported rows; the engine reconciles each disclosed metric independently and flags variance &gt;5%.</p>
                  <ReportedTable entries={ad.reported} onChange={(rows) => patch((d) => (d.activityData.reported = rows))} />

                  <h3 style={{ marginTop: 18, marginBottom: 4, fontSize: 14, fontWeight: 700, color: 'var(--ink-mute)' }}>Boundary &amp; provenance</h3>
                  <div className="field-row">
                    <label className="field">Boundary basis
                      <select value={p.disclosure?.boundaryBasis ?? ''} onChange={(ev) => {
                        const v = ev.target.value as PowerDisclosureBoundaryBasis | ''
                        patch((d) => { d.disclosure = { ...(d.disclosure ?? {}), boundaryBasis: v === '' ? undefined : v } })
                      }}>
                        <option value="">— select —</option>
                        <option value="OPERATIONAL_CONTROL">Operational control (GHG Protocol)</option>
                        <option value="FINANCIAL_CONTROL">Financial control</option>
                        <option value="EQUITY_SHARE">Equity share</option>
                        <option value="EU_ETS_INSTALLATION">EU ETS Annex I installation</option>
                        <option value="US_EPA_GHGRP">US EPA GHGRP Subpart D</option>
                        <option value="INDIA_CEA_BOUNDARY">India CEA station-level</option>
                        <option value="BRSR_BOUNDARY">India BRSR (SEBI)</option>
                        <option value="CORPORATE_AGGREGATE">Corporate aggregate (catch-all)</option>
                        <option value="OTHER">Other — explain in note</option>
                      </select>
                    </label>
                    <label className="field">Public report URL<input value={p.disclosure?.publicReportUrl ?? ''} placeholder="annual report, BRSR, CDP, ETS verified" onChange={(ev) => patch((d) => { d.disclosure = { ...(d.disclosure ?? {}), publicReportUrl: ev.target.value } })} /></label>
                    <label className="field">Page / section reference<input value={p.disclosure?.publicReportPageReference ?? ''} placeholder="e.g. BRSR p.142" onChange={(ev) => patch((d) => { d.disclosure = { ...(d.disclosure ?? {}), publicReportPageReference: ev.target.value } })} /></label>
                  </div>
                  {p.disclosure?.boundaryBasis === 'OTHER' && (
                    <div className="field-row">
                      <label className="field" style={{ gridColumn: 'span 3' }}>Boundary note (required when basis = Other)<input value={p.disclosure?.boundaryNote ?? ''} placeholder="describe the boundary" onChange={(ev) => patch((d) => { d.disclosure = { ...(d.disclosure ?? {}), boundaryNote: ev.target.value } })} /></label>
                    </div>
                  )}

                  <h3 style={{ marginTop: 14, marginBottom: 4, fontSize: 14, fontWeight: 700, color: 'var(--ink-mute)' }}>Disclosed gross figures</h3>
                  <div className="field-row">
                    <NumField label="Disclosed gross Scope 1" unit="tCO2e" value={ad.disclosedGrossScope1CO2eTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedGrossScope1CO2eTonnes = v))} />
                    <NumField label="Disclosed Scope 2" unit="tCO2e" value={ad.disclosedScope2CO2eTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope2CO2eTonnes = v))} />
                    <NumField label="Disclosed intensity" unit="kgCO2e / MWh net" value={ad.disclosedIntensityKgPerMwhNet ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedIntensityKgPerMwhNet = v))} hint="canonical power KPI" />
                  </div>
                  <h3 style={{ marginTop: 14, marginBottom: 4, fontSize: 14, fontWeight: 700, color: 'var(--ink-mute)' }}>By-gas split (optional)</h3>
                  <div className="field-row">
                    <NumField label="Disclosed CO2" unit="tCO2" value={ad.disclosedScope1CO2Tonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope1CO2Tonnes = v))} />
                    <NumField label="Disclosed CH4" unit="tCH4" value={ad.disclosedScope1CH4Tonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope1CH4Tonnes = v))} hint="mass, not CO2e" />
                    <NumField label="Disclosed N2O" unit="tN2O" value={ad.disclosedScope1N2OTonnes ?? null} onChange={(v) => patch((d) => (d.activityData.disclosedScope1N2OTonnes = v))} hint="mass, not CO2e" />
                  </div>
                </div>
              )}

              <div className="step-footer">
                <button className="btn ghost" onClick={() => setStep(3)}>Back</button>
                <button className="btn primary" onClick={() => runCalculate(false)} disabled={busy}>{busy ? 'Calculating…' : 'Calculate Scope 1 →'}</button>
              </div>
            </section>
          )
        })()}

        {step === 5 && result && (
          <section className="step-page active">
            <h1 className="step-title">Scope 1 <em>report</em></h1>
            <p className="step-sub">{result.methodologyPack} · GWP {result.gwpSet.replace('_', ' · ')} · {result.dataQuality.overall.replace(/_/g, ' ').toLowerCase()} data quality</p>

            <div className="summary-hero">
              <span>Gross Scope 1 — CO2 + CH4 + N2O + HFCs + SF6 − CCS</span>
              <strong>{fmt.format(result.scope1.grossScope1CO2eTonnes)}</strong>
              <small>tCO2e</small>
              {result.ccsCapturedAndStoredTonnes > 0 && (
                <p style={{ marginTop: 10 }}>CCS deducted: {fmt.format(result.ccsCapturedAndStoredTonnes)} tCO2 (per EU ETS Art 49)</p>
              )}
              <p style={{ marginTop: 10 }}>
                CO2 {fmt.format(result.scope1.byGas.co2Tonnes)} t · CH4 {fmt.format(result.scope1.byGas.ch4Tonnes)} t · N2O {fmt.format(result.scope1.byGas.n2oTonnes)} t · SF6 {fmt.format(result.scope1.byGas.sf6Tonnes)} t · HFCs {fmt.format(result.scope1.byGas.hfcCO2eTonnes)} tCO2e
              </p>
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
              <div className="summary-card"><span>CCS process vent</span><strong>{fmt.format(result.memoItems.ccsProcessVentTonnes)}</strong><small>tCO2 (memo)</small></div>
              <div className="summary-card"><span>Supporting Scope 2</span><strong>{fmt.format(result.supportingScope2.purchasedElectricityCO2eTonnes)}</strong><small>tCO2e</small></div>
              <div className="summary-card"><span>Supporting Scope 3</span><strong>{fmt.format(result.supportingScope3.thirdPartyMobileCO2eTonnes)}</strong><small>tCO2e</small></div>
            </div>

            {result.reconciliation.checked && (
              <div className="form-card">
                <h2>Reconciliation vs disclosed figures</h2>
                <p className="form-sub">{result.reconciliation.note}</p>
                <div className="result-table">
                  <div className="result-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', fontWeight: 800, color: 'var(--ink-mute)' }}>
                    <span>Metric</span><span style={{ textAlign: 'right' }}>Disclosed</span><span style={{ textAlign: 'right' }}>Modelled</span><span style={{ textAlign: 'right' }}>Variance</span><span style={{ textAlign: 'right' }}>Status</span>
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

            {((p.activityData.production.netGenerationMwh ?? 0) > 0 || (p.activityData.production.grossGenerationMwh ?? 0) > 0) && (
              <div className="form-card">
                <h2>Generation &amp; intensity</h2>
                <p className="form-sub">kgCO2e per MWh net is the canonical power-sector KPI.</p>
                <div className="summary-cats">
                  {(p.activityData.production.grossGenerationMwh ?? 0) > 0 && <div className="summary-card"><span>Gross generation</span><strong>{fmt.format(p.activityData.production.grossGenerationMwh ?? 0)}</strong><small>MWh</small></div>}
                  {(p.activityData.production.netGenerationMwh ?? 0) > 0 && <div className="summary-card"><span>Net generation</span><strong>{fmt.format(p.activityData.production.netGenerationMwh ?? 0)}</strong><small>MWh</small></div>}
                  {result.intensityMetrics.co2ePerMwhNet != null && <div className="summary-card"><span>Per MWh net (KPI)</span><strong>{fmt.format(result.intensityMetrics.co2ePerMwhNet)}</strong><small>kgCO2e / MWh</small></div>}
                  {result.intensityMetrics.co2ePerMwhGross != null && <div className="summary-card"><span>Per MWh gross</span><strong>{fmt.format(result.intensityMetrics.co2ePerMwhGross)}</strong><small>kgCO2e / MWh</small></div>}
                  {result.intensityMetrics.fossilCo2PerMwhNet != null && <div className="summary-card"><span>Fossil CO2 / MWh net</span><strong>{fmt.format(result.intensityMetrics.fossilCo2PerMwhNet)}</strong><small>kgCO2 / MWh</small></div>}
                </div>
              </div>
            )}

            {result.assumptions.length > 0 && (
              <div className="form-card">
                <h2>Assumptions &amp; limitations</h2>
                {result.assumptions.map((a, i) => (
                  <p key={i} className="form-sub" style={{ margin: '4px 0' }}><span className="entry-badge" style={{ marginRight: 8 }}>{a.kind.toLowerCase()}</span><b>{a.label}</b> — {a.detail}</p>
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
              <p className="form-sub">{result.calculationTrace.length} calculation steps · {result.factorSnapshots.length} factor snapshots · methodology pack <b>{result.methodologyPack}</b> · GWP <b>{result.gwpSet.replace('_', ' · ')}</b>.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 10 }}>
                {(['xlsx', 'pdf', 'csv', 'json', 'audit-pack'] as const).map((fmt) => (
                  <button key={fmt} className="btn ghost" onClick={async () => {
                    const res = await fetch('/api/v1/calculations/power/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: p, format: fmt }) })
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `scope1-power.${fmt === 'audit-pack' ? 'zip' : fmt}`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}>{fmt.toUpperCase()}</button>
                ))}
              </div>
            </div>

            <div className="step-footer">
              <button className="btn ghost" onClick={() => setStep(4)}>Back to data</button>
              <button className="btn primary" onClick={() => runCalculate(true)} disabled={busy}>{busy ? 'Saving…' : 'Calculate & save'}</button>
            </div>
          </section>
        )}
      </section>
    </div>
  )
}
