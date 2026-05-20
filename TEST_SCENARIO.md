# Test Scenario — Sample Sustainability (Scope 1) Report

Use this to test the calculator. It is a realistic mid‑size Indian integrated
cement plant. Enter the inputs exactly as below, click **Calculate Scope 1**,
and check your result against the **Expected results** table at the end.

Every expected number was produced by the calculation engine itself, so a
correct run must match it exactly (to the rounding shown).

---

## 1. Plant profile (the "sustainability report")

> **Bharat Cement Ltd — Plant 1, Rajasthan**
> Integrated cement plant. Reporting year **FY 2026**. Operational control,
> 100% owned. Annual production: **1,200,000 t clinker**, **1,800,000 t
> cement**, **1,900,000 t cementitious product**.
>
> The plant fires its kiln on **petroleum coke and bituminous coal**, and
> co‑processes **used tyres** as an alternative fuel. Diesel runs the standby
> DG sets and the owned mining fleet (haul trucks and loaders). Refrigerant
> top‑ups and SF₆ switchgear losses are tracked as fugitive emissions.
> Purchased electricity (Scope 2) and bought clinker (Scope 3) are out of
> scope for this Scope 1 tool.

---

## 2. What to enter in the wizard

### Step 1 — Sector
- Choose **Cement** → Continue

### Step 2 — Organisation
- Company name: `Bharat Cement Ltd`
- Operating country: `India`
- Consolidation / boundary method: `Operational control`
- → Continue

### Step 3 — Facility & methods
- Facility name: `Plant 1 - Rajasthan`
- Facility type: `Integrated cement plant`
- Reporting year: `2026`
- Process method: `CSI clinker-based`
- Clinker EF method: `CSI default 0.525`
- Dust method: `IPCC 2% fallback`
- Raw meal TOC method: `CSI default TOC`
- Fuel combustion method: `Energy-based (qty × LHV × EF)`
- GWP (top right): `AR6`
- → Continue to activity data

### Step 4 — Activity data (the four Scope 1 tabs)

**Tab: Process**
| Field | Value |
|---|---|
| Clinker produced | `1200000` t |
| Cement produced | `1800000` t |
| Cementitious product | `1900000` t |

(No clinker chemistry / dust / raw‑meal fields appear — that's correct,
because CSI default + IPCC 2% + CSI TOC methods don't need them.)

**Tab: Stationary combustion → Kiln fuels** (click *Add fuel* for each row)
| Label | Fuel | Category | Quantity |
|---|---|---|---|
| Kiln petcoke | `petcoke` | Conventional fossil | `110000` |
| Kiln coal | `coal_bituminous` | Conventional fossil | `95000` |
| Kiln tyres (alt fuel) | `tyres` | Mixed (fossil + biomass) | `8000` |

Leave LHV / CO₂ EF / Biomass‑frac **blank** (uses the sourced defaults).

**Tab: Stationary combustion → Non-kiln fossil fuels**
| Label | Fuel | Category | Quantity |
|---|---|---|---|
| DG set diesel | `diesel` | Conventional fossil | `250000` |

**Tab: Mobile combustion** (click *Add mobile equipment*)
| Label | Ownership | Fuel | Fuel quantity |
|---|---|---|---|
| Haul trucks & loaders | Owned / controlled | `diesel` | `480000` |

**Tab: Fugitive** (click *Add fugitive source* for each)
| Label | Gas | Quantity leaked (kg) |
|---|---|---|
| Plant AC / chillers | `r410a` | `350` |
| HV switchgear | `sf6` | `12` |

→ Click **Calculate Scope 1**.

---

## 3. Expected results (must match exactly)

| Scope 1 component | Expected (tCO₂e) |
|---|---:|
| Clinker calcination | 630,000.00 |
| Bypass dust | 0.00 |
| CKD (IPCC 2% fallback) | 12,600.00 |
| Raw meal TOC | 13,640.00 |
| Conventional kiln fuel | 580,427.10 |
| Alternative fossil kiln fuel | 13,899.20 |
| Non-kiln fossil | 663.20 |
| Mobile combustion | 1,273.33 |
| Fugitive | 1,081.20 |
| **GROSS SCOPE 1** | **1,253,584.03** |

| Shown separately (NOT in gross) | Expected |
|---|---:|
| Biomass CO₂ memo (27% of tyres) | 5,140.80 tCO₂ |
| Combustion CH₄/N₂O | 2,709.71 tCO₂e |

| Intensity | Expected |
|---|---:|
| Gross CO₂e per tonne clinker | 1,044.653 kgCO₂e/t |
| Gross CO₂e per tonne cementitious | 659.781 kgCO₂e/t |

**Status:** `SUCCESS_WITH_WARNINGS` — 0 errors, 5 warnings.
The warnings are **expected and correct** for this scenario (they tell you a
default was used, not that anything is wrong):
`default_clinker_ef_used`, `dust_2_percent_fallback_used`, `default_lhv_used`,
`default_fuel_ef_used`, `alternative_fuel_split_unknown`.

---

## 4. Hand‑check the math (optional, for trust)

| Item | Formula | Result |
|---|---|---:|
| Clinker calcination | 1,200,000 × 0.525 | 630,000 |
| CKD (2%) | 630,000 × 0.02 | 12,600 |
| Raw meal TOC | 1,200,000 × 1.55 × 0.002 × (44/12) | 13,640 |
| Petcoke | 110,000 × 32.5 ÷ 1000 × 97.5 | 348,562.5 |
| Coal | 95,000 × 25.8 ÷ 1000 × 94.6 | 231,864.6 |
| → Conventional kiln fuel | 348,562.5 + 231,864.6 | 580,427.1 |
| Tyres total | 8,000 × 28 ÷ 1000 × 85 | 19,040 |
| → Fossil 73% / Biomass 27% | 19,040 × 0.73 / × 0.27 | 13,899.2 / 5,140.8 |
| Non-kiln diesel | 250,000 × 0.0358 ÷ 1000 × 74.1 | 663.2 |
| Mobile diesel | 480,000 × 0.0358 ÷ 1000 × 74.1 | 1,273.33 |
| Fugitive R-410A | 350 × 2,256 ÷ 1000 | 789.6 |
| Fugitive SF₆ | 12 × 24,300 ÷ 1000 | 291.6 |
| → Fugitive total | 789.6 + 291.6 | 1,081.2 |

These reconcile to the gross total above — that's the point of the
calculation trace in the Excel/PDF export.

---

## 5. Test checklist

- [ ] Gross Scope 1 = **1,253,584.03 tCO₂e**
- [ ] Biomass memo = **5,140.80** and is **NOT** inside the gross total
- [ ] Tyres split correctly (fossil → kiln fuel, biomass → memo)
- [ ] Fugitive tab works and contributes **1,081.20**
- [ ] Status `SUCCESS_WITH_WARNINGS`, **0 errors**
- [ ] **Download PDF** opens a 2‑page report with these numbers
- [ ] **Download Excel** has Summary + Factor snapshots + full Calculation trace
- [ ] **Download JSON** matches the result
- [ ] **Save draft to database** returns an ID (and appears in `/admin`)

### Extra tests worth trying
1. Change **GWP** to `AR5` → fugitive becomes **955.40** tCO₂e
   (R‑410A 350 × 1,924 + SF₆ 12 × 23,500, ÷ 1000).
2. Switch Clinker EF to **Plant-specific CaO/MgO** but leave chemistry blank →
   it should **auto‑fall back** to CSI 0.525 with a warning (not an error).
3. On the Process tab set Clinker produced **blank** → status becomes
   `BLOCKED` with `missing_clinker_production_for_csi_method`.
4. Type `0` for Clinker produced instead of blank → **not** blocked
   (0 = confirmed zero), gross drops accordingly.

---

## 6. Testing via the API (optional)

The exact input payload is saved at
[`samples/bharat-cement-FY2026.json`](samples/bharat-cement-FY2026.json).
With the app running you can also test without the UI:

```bash
curl -s -X POST http://localhost:3000/api/v1/calculations/cement/calculate \
  -H 'Content-Type: application/json' \
  --data @samples/bharat-cement-FY2026.json | python3 -m json.tool
```
