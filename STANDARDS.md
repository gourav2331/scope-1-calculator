# Sustally Scope 1 Calculator — Standards & Methodologies

This is the **rulebook the engine enforces.** It documents the standards each sector pack
adheres to, plus the cross-cutting rules every sector inherits. Anyone auditing or extending the
calculator should read this before changing the engine math.

The calculator scope is **Scope 1 only** as primary output. Scope 2 (electricity) and Scope 3
(third-party) appear only as clearly separated *supporting* buckets — never inside gross.

---

## 1. Cross-cutting rules (every sector inherits these)

| Rule | What it means | Where enforced |
|---|---|---|
| **Scope boundary** | Gross Scope 1 is primary; S2/S3 are supporting buckets, never merged | `assert*ScopeSeparation` in each pack |
| **`null` ≠ `0`** | Missing data is `null`, confirmed zero is `0`. Engine refuses to silently treat missing as zero | `isMissing` / `isPresent` in `src/lib/engine/util.ts` |
| **GWP horizon-aware** | AR5_100, AR6_100 (default), AR6_20. Fossil CH₄ ≠ biogenic CH₄ | `gwp.ts` per sector |
| **Factor snapshots** | Every factor used is captured with source, value, unit, overridden? | `FactorResolver` in `src/lib/engine/factors.ts` |
| **Calculation trace** | Every step recorded: input → factor → intermediate → output | `EngineContext.trace` |
| **No negative inputs / gross** | Negative composition, fuel, leak, etc. are blocked at validation + a backstop checks gross ≥ 0 | `validate*` + `calculate*` orchestrators |
| **Biogenic CO₂ is a memo** | Excluded from gross Scope 1; reported separately | `memoItems.biogenicCO2Tonnes` |
| **Overrides require a reason** | Setting a row's LHV / EF override without an `overrideReason` triggers a blocking validation | `validate*` |
| **Compound-unique factor library** | `(sectorCode, factorCode)` so packs may share codes (e.g. `CO2_PER_C`) | `src/collections/FactorLibrary.ts` |

## 2. Common external standards (shared across packs)

- **GHG Protocol Corporate Standard** (WRI / WBCSD) — scopes, organisational boundary
  (operational control · financial control · equity share).
- **ISO 14064-1** — GHG inventory quantification at the organisation level.
- **ISO 14064-3** — verification / assurance principles (audit trail, completeness, accuracy,
  conservativeness, comparability, transparency).
- **IPCC AR5 (2014) / AR6 (2021)** — Global Warming Potentials for CH₄ (fossil & biogenic),
  N₂O, HFCs, SF₆.
- **IPCC 2006 Guidelines for National GHG Inventories (refined 2019)** — combustion NCVs and
  default emission factors.

---

## 3. Cement sector pack

**Pack ID:** `CSI_CEMENT_CO2_PROTOCOL_V3` · **Status:** ACTIVE

### Primary methodology
**WBCSD Cement Sustainability Initiative — Cement CO₂ and Energy Protocol v3.1** (the de facto
industry standard; adopted by GCCA member cement producers). The pack also accepts v2-shaped
inputs for legacy disclosures.

### Sub-standards referenced
- **IPCC 2006 (refined 2019)** — combustion NCVs / EFs for kiln and non-kiln fuels.
- **US EPA Mandatory Greenhouse Gas Reporting Rule, Subpart H (Cement Production)** —
  fallback cement-based method when CSI/IPCC inputs aren't available.
- **GHG Protocol** *"Calculating CO₂ emissions from production of cement"* worksheet —
  cross-check.
- **India CEA Grid Emission Factor** (latest CEA publication) — supporting Scope 2 electricity
  factor.

### What counts as gross Scope 1 (cement)
1. **Process calcination CO₂** — clinker calcination · raw-meal TOC · CKD · bypass dust.
2. **Stationary combustion CO₂** — kiln fuels + non-kiln fossil fuels (fossil portion only).
3. **Mobile combustion CO₂** — owned / operationally-controlled equipment.
4. **Fugitive CO₂e** — refrigerant / SF₆ leakage (small but in-scope).

### Excluded from cement gross Scope 1
- **Biomass CO₂** — memo only (CSI rule).
- **Purchased electricity** — supporting Scope 2 (not collected in the UI by default).
- **Outbound logistics / employee commute / third-party transport** — Scope 3.

### Methodology forks (per calculation)
- **Clinker EF method:** CSI default `0.525 tCO₂/t clinker` · plant-specific from CaO/MgO
  chemistry · US-EPA cement-based fallback.
- **Dust method:** assume all CKD / bypass dust 100% calcined · actual dust data with site
  calcination rate.
- **TOC method:** default fraction `0.002` · plant-specific lab data.
- **Fuel combustion method:** energy-based (qty × LHV × EF) · carbon-content-based ·
  direct CEMS measurement.

### Key factors (cement library)
`CSI_DEFAULT_CLINKER_EF` (0.525) · `CKD_CALCINATION_RATE_DEFAULT` (1.0) ·
`RAW_MEAL_TO_CLINKER_RATIO` (1.55) · `TOC_FRACTION` (0.002) · `INDIA_GRID_EF` (0.71 tCO₂/MWh).

### Cement-specific validations
- Production volumes ≥ 0; intensity metrics require clinker / cementitious > 0.
- Biomass fraction in `[0, 1]`.
- CaO / MgO percentages and dust calcination rates in `[0, 100]` / `[0, 1]`.
- If any row factor (LHV, CO₂ EF, CH₄/N₂O EF, biomass fraction) is overridden →
  `overrideReason` required.

---

## 4. Oil & Gas sector pack

**Pack ID:** `IPIECA_API_OG_2023` · **Status:** ACTIVE

### Primary methodology
**IPIECA / IOGP / API — Petroleum Industry Guidelines for Reporting Greenhouse Gas Emissions,
4th Edition (2023).** Spans upstream / midstream / downstream and is the recognised industry
standard.

### Sub-standards referenced
- **API Compendium of Greenhouse Gas Emissions Methodologies (2021)** — source-level
  formulas, default EFs, fuel NCVs.
- **US EPA GHGRP Subpart W (Petroleum and Natural Gas Systems)** — fugitive component-count
  leak factors (valves, flanges, PRVs, compressor seals) and venting/flaring methodology.
- **IPCC 2006 (refined 2019)** — combustion EFs and default NCVs.
- **OGMP 2.0** (UNEP Methane Partnership) — methane reporting tiers (L1–L5). Pack supports
  L1–L3; L4/L5 satellite/top-down reconciliation is deferred.
- **GHG Protocol Corporate Standard** — scopes & consolidation.

### What counts as gross Scope 1 (oil & gas)
Gross Scope 1 = **full CO₂e (CO₂ + CH₄ + N₂O)** from:
1. **Stationary combustion** — boilers, fired heaters, gas turbines, engines.
2. **Mobile combustion** — owned / controlled fleet.
3. **Flaring** — combustion CO₂ + inert CO₂ passthrough + CH₄ slip.
4. **Venting** — CH₄ and CO₂ in vented gas, density-based.
5. **Fugitive component-count** — Subpart W tiered leak factors × component counts.
6. **Process** — SMR (benchmark / stoichiometric) · FCC regen · amine acid-gas · generic ·
   direct.
7. **Refrigerants** — Tier 1 (capacity × leak rate) · Tier 2 (mass balance: purchases −
   disposals − Δinventory).
8. **Reported / direct entries** — disclosed CO₂e or per-gas masses when activity inputs
   aren't available (used for corporate-aggregate / public-disclosure cases).

**Methane is a primary Scope 1 gas** in O&G — never moved to a separate addendum.

### Excluded from O&G gross Scope 1
- **Biogenic CO₂** — memo only.
- **Purchased electricity** — supporting Scope 2 (not collected in UI).
- **Third-party mobile transport** — supporting Scope 3.

### Methodology forks
- **GWP horizon:** AR5_100 · AR6_100 (default, CH₄ fossil 29.8) · AR6_20 (CH₄ fossil 82.5).
- **Stationary combustion method:** energy-based · carbon-content-based · direct measurement.
- **Mobile combustion method:** fuel-based · distance-based · equipment-hours-based.
- **Fugitive tier:** T1 (default leak factor) · T2 (refined factor) · T3 (direct measurement).
- **Refrigerant tier:** T1 capacity × leak · T2 mass balance.

### Key factors (O&G library)
`MOL_PER_SM3` (42.2208) · `CH4_DENSITY_SM3` (0.657 kg/Sm³) · `CO2_DENSITY_SM3` (1.842 kg/Sm³)
· `CO2_PER_C` (44/12) · `FLARE_DRE_DEFAULT` (0.98) · `FLARE_DRE_*` per flare type ·
`COMPONENT_EF_*` (Subpart W W-1A) · fuel NCVs/EFs (natural_gas, refinery_fuel_gas, diesel,
HFO, LPG, petcoke, jet_kerosene, etc.) · `SMR_GREY_H2_INTENSITY` (7.69 tCO₂/tH₂) ·
`FCC_COKE_CARBON_FRACTION` (0.94).

### O&G-specific validations
- Gas composition sums to **100 ± 0.5 mol%** (blocking).
- Flare DRE in `[0, 1]`; **unlit flare ⇒ DRE 0 ⇒ treated as venting** (warning).
- Refrigerant Δinventory may be negative; purchases / disposals must be ≥ 0.
- Component-count **Tier 1 raises a warning** about 2–5× under-count by super-emitters.
- Mass-balance imbalance > 3% raises a warning.
- Reconciliation: when a disclosed gross Scope 1 is supplied, variance >5% (signed) raises a
  warning (`reconciliation_variance_exceeds_5pct`).

---

## 5. Disclosed-vs-modelled reconciliation (O&G only)

When activity data isn't available (typical for corporate sustainability-report users), the
calculator supports a **`reported` 8th category** plus an optional **disclosed gross** input.
The engine computes:

- **Modelled gross** = Σ all eight category CO₂e
- **Variance %** = (modelled − disclosed) / disclosed × 100
- **Per-gas variance** (CO₂, CH₄, N₂O) when disclosed gas masses are supplied
- **Scope 2 supporting variance** if a disclosed Scope 2 is supplied

Reconciliation is an **assurance check only** — it never alters the result. Variance >5%
triggers a "review before sign-off" warning. The data-quality tier becomes
`REPORTED_AGGREGATE` when most of the gross comes from reported entries.

---

## 6. Standards version policy

- Default standard versions are pinned at compile time in `src/seed/index.ts`. Active packs:
  `CSI_CEMENT_CO2_PROTOCOL_V3` and `IPIECA_API_OG_2023`.
- **Updating a factor requires all three of:**
  1. The **citable source string** (e.g. "IPCC 2006 Refinement, Vol 2 Ch 1, Table 1.2").
  2. **Updating the affected hand-computed unit test** — the worked examples in the source
     PDFs are the unit tests. Never weaken a test to make a change pass; fix the math.
  3. A **changelog entry** noting what changed, when, and why.
- The GWP set defaults to AR6_100 and can be switched per calculation; the choice is recorded
  in the audit output.

## 7. Extending the calculator (adding a new sector)

When adding a new sector pack:

1. Author the methodology in `src/lib/engine/<sector>/`.
2. Reuse the **shared `FactorResolver`** — pass an own constants map (`*_CONSTANT_FACTORS`).
3. Use horizon-aware **`resolveGwp` / `*ToCO2e`** when CH₄ or N₂O matter.
4. Enforce scope separation via an `assert*ScopeSeparation` invariant.
5. **Write the worked-example unit tests *before* the engine** (TDD; the source-document
   examples are the contract).
6. Add the sector code to the `SectorCode` union; expose `/api/v1/calculations/<sector>/*`
   routes; seed factor-library entries with the new `sectorCode`.
7. Use the shared report helpers in `src/lib/report/shared*` for Excel and PDF (methodology
   disclosure, factor snapshots, audit trace, validation pages).

---

## 8. Audit & assurance

Every calculation produces:

- **Per-source factor snapshots** — `{factorCode, value, unit, source, overridden}` for each
  factor used, so an auditor can see whether the user supplied a value or the library default
  was used (the `FactorResolver.resolveOrSupplied` rule prevents eager-default mis-recording).
- **Calculation trace** — every step (input → intermediate → output) with category tag.
- **Methodology disclosure** — written into the Excel and PDF deliverables (which standards,
  which GWP horizon, which methodology forks were chosen).
- **Assumptions register** — every default factor or assumed value is named.
- **Validation register** — every blocking error and every warning.

This is the audit trail an **ISO 14064-3** reviewer expects.

---

*Generated by the Sustally Scope 1 Calculator. The deterministic engine in `src/lib/engine/`
is the source of truth and is fully unit-tested.*
