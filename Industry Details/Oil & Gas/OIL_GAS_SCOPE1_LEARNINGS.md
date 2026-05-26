# Oil & Gas — Scope 1 Calculator: Learnings & Reference

Everything learned and built for the **Oil & Gas Scope 1 methodology pack** of the Sustally
multi-sector calculator. This is the engineering + methodology reference; the calculation
engine in `src/lib/engine/oilgas/` is the source of truth and is fully unit-tested.

Built from the Sustally research PDFs *"Scope 1 Emissions in the Oil & Gas Industry — Zero to
Hero" (Vol 1 v4.0)* and *"From Calculator to Platform" (Vol 2 v3.0)*, cross-checked against the
citable primary sources below.

---

## 1. What this is (and isn't)

- A **Scope 1 only** calculator. Scope 2 / Scope 3 are **not primary outputs** — they appear only
  as clearly separated *supporting* buckets, and purchased electricity (pure Scope 2) is **not
  collected in the UI at all** (excluded by default, matching the cement pack).
- **Gross Scope 1 = full CO₂e (CO₂ + CH₄ + N₂O)**, unlike the cement (CSI) pack which is CO₂-only.
  In Oil & Gas, **methane is a primary Scope 1 gas** (often the dominant one), so it is never
  pushed into a separate addendum.
- Sector-extensible: Oil & Gas is the **second** active pack after Cement. They share the
  sector-agnostic engine primitives.

### Standards implemented
| Standard | Role |
|---|---|
| GHG Protocol Corporate Standard | Scopes, consolidation boundary (operational / financial / equity) |
| IPIECA / IOGP / API Petroleum Guidelines (4th ed., 2023) | The six-category taxonomy, tiered methods |
| API Compendium (2021) | Source-level formulas & EFs |
| US EPA GHGRP **Subpart W** | Fugitive component-count leak factors |
| IPCC 2006 Guidelines (refined 2019) | Combustion NCVs & emission factors |
| IPCC AR5 / AR6 | Global Warming Potentials |
| OGMP 2.0 | Methane reporting tiers (referenced; L4/L5 reconciliation deferred) |

---

## 2. The six-category taxonomy (+ refrigerants + process)

Every Scope 1 emission point maps to exactly one category. The calculator's Step 4 has **7
data-entry tabs** (the IPIECA six + refrigerants; purchased electricity is excluded):

| # | Category | Primary gases | Method |
|---|---|---|---|
| 1 | **Stationary combustion** | CO₂, CH₄, N₂O | fuel × NCV × EF |
| 2 | **Mobile combustion** | CO₂, CH₄, N₂O | fuel (or distance / hours) × EF; owned = S1, third-party = supporting S3 |
| 3 | **Flaring** | CO₂ + CH₄ slip | combustion via DRE + inert CO₂ passthrough |
| 4 | **Venting** | CH₄ (+ CO₂ in gas) | gas composition × volume × density |
| 5 | **Fugitive (component count)** | mostly CH₄ | count × leak factor × hours (EPA Subpart W) |
| 6 | **Process** | CO₂ (mainly) | SMR / FCC / amine / generic / direct |
| + | **Refrigerants** | HFCs | Tier 1 capacity × leak, Tier 2 mass balance |

---

## 3. Key methodology decisions (the non-obvious ones)

These are **NOT obvious from the code** and would be easy to "fix" wrongly. Read before changing
any engine math.

1. **Gross Scope 1 is full CO₂e, not CO₂-only.** Each category returns a `GasAmounts`
   `{ co2Tonnes, ch4Tonnes, n2oTonnes, co2eTonnes, biogenicCO2Tonnes }`; gross = Σ category
   `co2eTonnes`. Don't merge CH₄/N₂O into a separate addendum the way cement does.

2. **GWP is horizon-aware.** Three sets: `AR5_100`, `AR6_100`, `AR6_20`. Fossil and biogenic
   CH₄ have different values. The 20-year horizon is supported because it materially changes
   methane's weight and therefore abatement priorities. **Refrigerant HFC GWPs always use the
   100-year basis** regardless of the chosen CH₄ horizon (standard practice).

3. **The source PDFs have internal numeric inconsistencies.** The Vol 1 §8 worked examples are
   treated as the unit tests, but where the doc contradicts itself we used the citable/consistent
   value and documented it:
   - **Flaring** uses molar volume **23.685 L/mol** (→ 42.2208 mol/Sm³) for combustion CO₂, but
     density **0.657 kg/Sm³** for the CH₄ slip — both are the doc's own Appendix A.3 constants,
     mutually ~1.5% inconsistent. Both are overridable.
   - **SMR §8.5** has a ~10× arithmetic error in its volumetric derivation, so SMR is modelled
     either by a benchmark `tCO₂/tH₂` factor **or** stoichiometrically — never by reproducing the
     doc's broken intermediate numbers.
   - **Mass balance §11.5** computes to **3.20%** here (the engine includes the +0.20 MSm³
     inventory term the doc dropped from its quoted 3.34%).

4. **Inert CO₂ in flared/vented gas passes through uncombusted** (not multiplied by DRE) — more
   correct than the doc, which lumped feed-CO₂ into the ×DRE carbon sum. An **unlit flare ⇒ DRE 0**
   ⇒ counted as venting (full CH₄ released), with a warning.

5. **Scope separation is enforced** (`assertOilGasScopeSeparation`): biogenic CO₂ = memo,
   purchased electricity = supporting Scope 2, third-party mobile = supporting Scope 3 — never
   inside gross. Same `null` ≠ `0` rule (`null`/`undefined` = missing; `0` = confirmed zero) and
   per-source factor-snapshot + calculation-trace guarantees as the cement pack.

---

## 4. Global Warming Potentials

Source: IPCC AR6 WG1 Ch.7 Table 7.15 / AR5 Ch.8 (also Vol 1 Appendix A.2).

| Set | CO₂ | CH₄ (fossil) | CH₄ (biogenic) | N₂O |
|---|---|---|---|---|
| `AR5_100` | 1 | 30 | 28 | 265 |
| `AR6_100` (default) | 1 | **29.8** | 27.0 | 273 |
| `AR6_20` | 1 | **82.5** | 79.7 | 273 |

---

## 5. Standard-condition constants

Source: Vol 1 Appendix A.3 (IPIECA-aligned, 15 °C / 101.325 kPa). All overridable per calculation.

| Constant | Value | Used for |
|---|---|---|
| Molar volume | 23.685 L/mol → `MOL_PER_SM3` = **42.2208 mol/Sm³** | flaring combustion CO₂ |
| `MOL_CO2_MASS` | 44.01 g/mol | mole → CO₂ mass |
| `CO2_PER_C` | 44/12 | FCC coke carbon → CO₂ |
| `CH4_DENSITY_SM3` | **0.657 kg/Sm³** | venting/flaring CH₄ mass |
| `CO2_DENSITY_SM3` | **1.842 kg/Sm³** | venting/amine CO₂ mass |
| `FLARE_DRE_DEFAULT` | 0.98 | default flare destruction efficiency |
| `INDIA_GRID_EF` | 0.71 tCO₂/MWh (CEA) | supporting Scope 2 (engine only) |

---

## 6. Per-category formulas

### Stationary & mobile combustion (reuses the shared, tested `calculateFuel`)
```
energyTJ = quantity × LHV(GJ/unit) / 1000
CO2(t)   = energyTJ × EF(kgCO2/GJ)          → fossil part = Scope 1, biogenic part = memo
CH4(t)   = energyTJ × 1000 × ch4EF(kg/GJ) / 1000
N2O(t)   = energyTJ × 1000 × n2oEF(kg/GJ) / 1000
CO2e     = fossilCO2 + CH4×GWP_CH4 + N2O×GWP_N2O
```
Mobile: owned/controlled → gross Scope 1; third-party → supporting Scope 3 (excluded).
Derivation modes: fuel-based (preferred), distance-based (km × fuel/km), equipment-hours.

### Flaring
```
DRE              = unlit ? 0 : (override | default-by-type | 0.98)
combustion CO2(t)= Σ_HC(molfrac_i × nC_i) × MOL_PER_SM3 × volume × DRE × 44.01 / 1e6
inert CO2(t)     = molfrac_CO2 × volume × 1.842 / 1000            (NOT subject to DRE)
CH4 slip(t)      = molfrac_CH4 × volume × (1 − DRE) × 0.657 / 1000
CO2e             = combustionCO2 + inertCO2 + CH4slip × GWP_CH4
```
Carbon numbers: CH₄=1, C₂H₆=2, C₃H₈=3, C₄⁺=4.

### Venting
```
residual   = 1 − captureFraction(VRU)
CH4(t)     = volume × molfrac_CH4 × 0.657 × residual / 1000
CO2(t)     = volume × molfrac_CO2 × 1.842 × residual / 1000
CO2e       = CO2 + CH4 × GWP_CH4
```

### Fugitive (component count)
```
Tier 1/2: CH4(kg) = count × leakFactor(kgCH4/hr) × hours(default 8760)
Tier 3:   CH4(kg) = measuredCh4Kg
CO2e      = (CH4/1000) × GWP_CH4
```
Tier 1 raises a warning that component-count methods under-count real methane 2–5× (super-emitters).

### Process
```
SMR (benchmark):      CO2 = H2_tonnes × 7.69 (tCO2/tH2)
SMR (stoichiometric): CO2 = feedstockGas × CH4frac × MOL_PER_SM3 × 44.01 / 1e6  + fuel combustion
FCC regen:            CO2 = cokeBurned × cokeCarbonFraction(0.94) × (44/12)
Amine acid gas:       CO2 = acidGasVol × CO2frac × 1.842 × (1 − capture) / 1000
Generic:              CO2 = throughput × EF(tCO2/unit)
Direct:               CO2 = directCo2Tonnes
(+ optional process CH4/N2O × GWP)
```
> CCS capture only reduces the *vented* quantity for the period; storage permanence / reversal is
> **deferred** and raises a warning when a capture fraction is supplied.

### Refrigerants
```
Tier 1: CO2e = chargeCapacityKg × leakRate%/100 × GWP / 1000
Tier 2: CO2e = (purchases − disposals − Δinventory) × GWP / 1000
GWP from the shared gas library (HFCs, 100-yr) or per-entry override.
```

---

## 7. Factor tables

### Fuels (`OILGAS_FUEL_DEFAULTS`) — IPCC 2006 / Vol 1 Appendix A.1
NCV is GJ per default unit; CO₂ EF in kgCO₂/GJ (≡ tCO₂/TJ); CH₄/N₂O in kg/GJ.

| Fuel | Unit | NCV | CO₂ EF | CH₄ EF | N₂O EF | Notes |
|---|---|---|---|---|---|---|
| natural_gas | Sm³ | 0.0383 | 56.1 | 0.001 | 0.0001 | |
| refinery_fuel_gas | Sm³ | 0.0395 | 57.6 | 0.001 | 0.0001 | |
| diesel | L | 0.03612 | 74.1 | 0.003 | 0.0006 | |
| heavy_fuel_oil | tonne | 40.4 | 77.4 | 0.003 | 0.0006 | |
| lpg | tonne | 47.3 | 63.1 | 0.001 | 0.0001 | |
| petcoke | tonne | 32.5 | 97.5 | 0.003 | 0.0006 | |
| coal_bituminous | tonne | 25.8 | 94.6 | 0.001 | 0.0015 | |
| crude_oil | tonne | 42.3 | 73.3 | 0.003 | 0.0006 | |
| motor_gasoline | L | 0.03278 | 69.3 | 0.0033 | 0.0032 | fleet |
| jet_kerosene | L | 0.03528 | 71.5 | 0.0005 | 0.002 | helicopters |
| biodiesel | L | 0.033 | 75.8 | 0.0027 | 0.0042 | **biomass** → CO₂ is a memo |

> Volumetric NCVs assume a documented density; users routinely override LHV/EF per row. Worked-example
> tests pass explicit LHV/EF so they reproduce exactly regardless of these defaults.

### Fugitive component leak factors (`COMPONENT_EF_DEFAULTS`) — EPA Subpart W Table W-1A
| Component | kg CH₄ / hr / source |
|---|---|
| valve_gas | 0.0029 |
| valve_light_liquid | 0.0048 |
| flange_connector | 0.00038 |
| pump_seal | 0.0024 |
| open_ended_line | 0.002 |
| pressure_relief_valve | 0.20 |
| compressor_seal | 0.50 |

### Flare DRE by type (`FLARE_DRE_BY_TYPE`)
steam_assisted_lit 0.98 · air_assisted_lit 0.98 · enclosed_ground 0.995 · unassisted_lit 0.96 ·
smoking 0.80 · unstable 0.85 · **unlit 0** · acid_gas 0.98 · emergency_relief 0.98

### Process factors
SMR grey-H₂ intensity = **7.69 tCO₂/tH₂** · FCC coke carbon fraction = **0.94**

---

## 8. Validation rules

**Blocking** (status = BLOCKED): gas composition not summing to 100 ± 0.5 mol%; purchased
electricity entered as a combustion fuel (scope decision-tree); a source excluded without a
recorded reason; missing required quantities (flare/vent volume, component count, etc.); negative
inputs; consolidation share outside [0, 100]; scope-separation invariant breaches.

**Warnings** (SUCCESS_WITH_WARNINGS): default factor used; flare DRE = 100% or < 60%; unlit flare
treated as venting; Tier-1 fugitive likely under-count; mass-balance imbalance > 3%; VRU/capture
fraction clamped; CCS permanence not modelled; override supplied without a reason.

Every resolved factor is snapshotted with provenance, and every step is recorded in the
calculation trace — the audit trail an ISO 14064-3 reviewer expects.

---

## 9. Worked examples = unit tests

Vol 1 §8 examples are reproduced as the validation suite (`oilgas/__tests__/oilgas.test.ts`,
**31 tests**; 99 total across the repo). Key expected values (default `AR6_100`):

| Example | Input | Expected |
|---|---|---|
| Stationary CDU heater (§8.1) | 43,680,000 Sm³ × NCV 0.0395 × EF 56.4 | **97,310 tCO₂** |
| Flaring (§8.2) | 5,110,000 Sm³, 78/12/5/3 % comp, DRE 0.98 | CO₂ 11,169 · CH₄ slip 52.4 t · **12,730 tCO₂e** |
| Venting (§8.3) | 6,825,500 Sm³ × 0.95 CH₄ | 4,260 tCH₄ → **126,952 tCO₂e** (351,461 @ AR6_20) |
| Fugitive (§8.4) | Subpart W component counts | 872.5 tCH₄ → **25,999 tCO₂e** |
| SMR benchmark (§8.5) | 36,500 tH₂ × 7.69 | **280,685 tCO₂** |
| Refrigerant Tier 1 / Tier 2 (§8.6) | 12,000 kg × 6 % × 1800 / (1200−0−50) × 1800 | **1,296 / 2,070 tCO₂e** |
| Mass balance (§11.5) | 152 MSm³ in vs 147.13 out | **−3.20 %** imbalance → warning |

> If a value must change, update the cited source **and** the affected hand-computed test
> expectation together. Never weaken a test to make a change pass — fix the math.

---

## 10. Engine architecture & file map

```
src/lib/engine/
  constants.ts      shared: GAS_DEFAULTS (HFC GWPs), FuelDefault/FactorDefault types, cement GWP
  factors.ts        FactorResolver(overrides, constants?) — constants param added for multi-sector
  context.ts        EngineContext (warnings/errors/trace/defaults/fallbacks)
  util.ts           isMissing / isPresent / orDefault / round  (the ONLY missing-test)
  combustion.ts     calculateFuel(...) — fuel→energy→CO2, biomass split; now also returns ch4Kg/n2oKg
  types.ts          SectorCode = 'CEMENT' | 'OIL_GAS'
  oilgas/
    constants.ts          OILGAS_GWP, OILGAS_CONSTANT_FACTORS, OILGAS_FUEL_DEFAULTS,
                          COMPONENT_EF_DEFAULTS, FLARE_DRE_BY_TYPE, PROCESS_FACTORS, sharedGwpSetFor()
    types.ts              OilGasInputPayload, OilGasActivityData, the 7 entry types,
                          GasAmounts, OilGasCalculationResult
    gwp.ts                resolveGwp() + ch4ToCO2e()/n2oToCO2e() (horizon-aware)
    helpers.ts            emptyGas / addGas / scaleGas / roundGas
    combustion.ts         stationary + mobile (reuse calculateFuel + O&G GWP)
    flaring.ts            flaring.ts / venting.ts / fugitiveComponents.ts / refrigerants.ts / process.ts
    validate.ts           validateOilGasInput + assertOilGasScopeSeparation
    calculate.ts          calculateOilGas() orchestrator
    index.ts              public exports
    __tests__/            fixture.ts + oilgas.test.ts
```

### Multi-sector design (shared primitives, non-breaking)
- `SectorCode` is a union; cement is untouched.
- `FactorResolver` takes an optional **constants map** (defaults to cement's); O&G passes its own
  (`OILGAS_CONSTANT_FACTORS` + `PROCESS_FACTORS`).
- `calculateFuel` takes an optional **fuel-defaults map** and now returns raw `ch4Kg`/`n2oKg`, so
  O&G applies its own horizon-aware GWP (cement keeps using the pre-combined CO₂e value).
- The O&G context maps its GWP set to the shared `AR5`/`AR6` basis (`sharedGwpSetFor`) for any
  reused primitive.

### Data layer
- API routes: `POST /api/v1/calculations/oil-gas/calculate` (`?save=true` persists) and `/validate`.
- The Payload `factor-library` collection is **compound-unique on `(sectorCode, factorCode)`** so
  cement and O&G can share codes (e.g. `CO2_PER_C`). `npm run seed` writes both packs.
- `SectorPacks` has an active `oil_gas` pack; `Organizations.sector` offers `cement | oil_gas`.

---

## 11. UI / wizard

- `src/app/page.tsx` → `CalculatorRoot` (sector state, default cement) → `Scope1Wizard` or
  `OilGasWizard`. Each wizard's **Step 1 sector grid** switches sectors via `onSwitchSector`.
- `src/components/oilgas-wizard.tsx` — 5 steps: Sector → Organisation/boundary → Facility
  (segment/type)/period/methods → **Activity data (7 tabs)** → Review & report.
  - Live, debounced recalculation drives **per-row CO₂e previews** (from the calculation trace)
    and a live-totals strip.
  - GWP switch in the header: AR5·100 / AR6·100 / AR6·20.
  - Review: gross CO₂e hero, by-category + by-gas breakdown, intensity (per BOE / bbl / t-LNG /
    methane %), supporting Scope 3, biogenic memo, mass-balance status, validation, JSON export.
- Header is **theme-aware**: light (day) shows the black Sustally typemark; dark (night) shows the
  white one. The brand is a button that returns to the sector home. Sector/category icons are
  purple line icons (lucide).

---

## 12. Deferred (NOT built — do not assume present)

Scoped out as "Advanced" per Vol 2 §10.7; the build delivered the MVP (six categories +
refrigerants + process + biogenic gate + mass-balance + scope decision-tree + audit trail):

- CCS permanence accounting (capture/transport/storage/reversal)
- Full tank-emissions model (flashing / working / breathing / loading / seal)
- Compressor sub-types (reciprocating / centrifugal wet & dry seal / electric / turbine)
- Uncertainty engine (RSS + Monte Carlo) and portfolio confidence bands
- Top-down / satellite reconciliation (OGMP 2.0 L4/L5)
- MACC curves, variance waterfalls, intensity heatmaps
- GRI-GLYCalc dehydrator modelling; pneumatic-device taxonomy
- Evidence-attachment workflow
- **Oil & Gas Excel/PDF report export** — the export route + `src/lib/report/*` are still
  cement-shaped; O&G currently exports JSON only.

---

## 13. How to run, test, extend

```bash
npm test          # vitest — 99 tests (68 cement + 31 oil & gas)
npm run lint      # tsc --noEmit
npm run seed      # seed the factor library (both packs) into SQLite
npm run dev       # Next.js dev server (http://localhost:3000)
```

**Before changing any engine constant or formula:** run `npm test`. If a value must change,
update the cited source string and the affected hand-computed test expectation together, and keep
the scope buckets separate. The engine is pure and deterministic by design so it can be
re-audited and replayed.
