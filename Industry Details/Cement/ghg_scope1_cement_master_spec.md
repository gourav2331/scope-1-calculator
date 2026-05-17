# GHG Scope 1 Calculator Platform — Cement Module Methodology & Product Specification

**Version:** v0.1  
**Primary active sector:** Cement Manufacturing  
**Platform intent:** Multi-industry GHG Protocol calculator, starting with cement as the first sector module.  
**Primary cement methodology:** CSI Cement CO₂ Protocol / Cement Sustainability Initiative logic  
**Fallback process methodology:** US EPA cement-based method when clinker data is unavailable  
**Supporting modules:** Stationary combustion, mobile combustion, purchased energy, leased assets, CHP, uncertainty, audit workflow, factor library

---

## 1. Product Objective

Build a methodology-driven GHG accounting platform focused first on **Scope 1 direct emissions**, with **cement manufacturing** as the first active sector.

The platform must support sector selection, organization/facility setup, boundary method selection, cement-specific process emissions, stationary/mobile combustion, factor library versioning, evidence/audit trail, validation, scope-separated reporting, review/approval/locking, and calculation trace.

The system must **not** be a one-off cement-only calculator. Cement is the first methodology module. Future modules may include steel, chemicals, power, oil and gas, textile, pharma, and general manufacturing.

---

## 2. Core Accounting Principle

The platform must always separate:

| Bucket | Meaning |
|---|---|
| Scope 1 gross | Direct emissions from owned/controlled sources |
| Scope 2 | Purchased electricity, heat, steam, cooling |
| Scope 3/supporting | Bought clinker, third-party transport, outsourced sources |
| Memo item | Biomass CO₂ reported separately |
| Optional net reporting | Gross emissions minus eligible emission rights/credits |

Never merge these into one hidden total.

---

## 3. Sector Selection Logic

The first step in the calculator must be sector selection.

```text
Select sector
→ Load sector methodology pack
→ Show sector-specific source categories
→ Apply sector-specific formulas and validations
→ Return sector-specific result model
```

### Initial sector registry

```yaml
sector_registry:
  CEMENT:
    status: active
    display_name: Cement Manufacturing
    methodology_pack: CEMENT_CSI_PROTOCOL_V2

  STEEL:
    status: future
    display_name: Iron and Steel

  POWER:
    status: future
    display_name: Power Generation

  CHEMICALS:
    status: future
    display_name: Chemicals

  OIL_AND_GAS:
    status: future
    display_name: Oil and Gas

  TEXTILE:
    status: future
    display_name: Textile Manufacturing

  PHARMA:
    status: future
    display_name: Pharmaceuticals

  GENERAL_MANUFACTURING:
    status: future
    display_name: General Manufacturing
```

### Rule

```yaml
requirement_id: SECTOR_SELECTION_REQUIRED
description: >
  The system must require sector selection before loading source categories,
  formulas, inputs, validation rules, and factor defaults.
```

---

## 4. Cement Methodology Scope

The cement module must calculate:

```text
Gross Scope 1 CO₂ =
  clinker calcination CO₂
+ bypass dust CO₂
+ CKD CO₂
+ raw meal TOC CO₂
+ conventional fossil kiln fuel CO₂
+ alternative fossil kiln fuel CO₂
+ non-kiln fossil fuel CO₂
+ owned/controlled mobile combustion CO₂
```

Excluded from gross Scope 1:

```text
- biomass CO₂ memo item
- purchased electricity
- bought clinker
- third-party transport
- emission rights / credits / offsets
```

---

## 5. Cement Source Categories

| Source category | Treatment |
|---|---|
| Clinker calcination | Scope 1 process |
| Bypass dust | Scope 1 process |
| CKD | Scope 1 process |
| Raw meal TOC | Scope 1 process |
| Conventional kiln fuels | Scope 1 combustion |
| Alternative fossil kiln fuels | Scope 1 combustion |
| Biomass kiln fuels | Memo item, exclude from gross Scope 1 |
| Non-kiln fossil fuels | Scope 1 combustion |
| Owned/controlled mobile equipment | Scope 1 mobile combustion |
| Purchased electricity | Scope 2 support |
| Bought clinker | Scope 3/supporting/main indirect |
| Third-party transport | Scope 3/supporting |
| Emission rights | Optional net reporting only |

---

## 6. Cement Method Selection Tree

```text
START
│
├── Sector = Cement
│
├── Boundary method selected?
│   ├── Operational control
│   ├── Financial control
│   └── Equity share
│
├── Process emissions
│   ├── Clinker data available?
│   │   ├── Yes → CSI clinker-based method
│   │   │   ├── CaO/MgO chemistry available?
│   │   │   │   ├── Yes → plant-specific clinker EF
│   │   │   │   └── No → CSI default 525 kgCO₂/t clinker
│   │   │   ├── Dust data available?
│   │   │   │   ├── Yes → actual CKD/bypass dust calculation
│   │   │   │   └── No → IPCC 2% dust fallback
│   │   │   └── TOC data available?
│   │   │       ├── Yes → plant-specific TOC
│   │   │       └── No → default raw meal TOC
│   │   └── No → US EPA fallback only if cement production and ratios are reliable
│
├── Combustion emissions
│   ├── Kiln fossil fuel → Scope 1
│   ├── Alternative fossil fuel → Scope 1
│   ├── Biomass fuel → Memo item
│   └── Non-kiln controlled fuel → Scope 1
│
├── Mobile sources
│   ├── Owned/controlled → Scope 1
│   └── Third-party → Scope 3/supporting
│
├── Supporting indirect
│   ├── Purchased electricity → Scope 2
│   └── Bought clinker → Scope 3/supporting
│
└── Reporting
    ├── Gross Scope 1
    ├── Biomass memo
    ├── Supporting Scope 2
    ├── Supporting Scope 3
    ├── Optional net CO₂
    ├── Intensity metrics
    └── Data quality / audit status
```

---

## 7. Formula Library

### 7.1 Plant-specific clinker emission factor

```text
Corrected CaO fraction =
(CaO% - non-carbonate CaO%) / 100

Corrected MgO fraction =
(MgO% - non-carbonate MgO%) / 100

Clinker EF =
(Corrected CaO fraction × 0.785)
+
(Corrected MgO fraction × 1.092)
```

Output: `tCO₂/t clinker`

### 7.2 CSI default clinker factor

```text
Clinker EF = 0.525 tCO₂/t clinker
```

### 7.3 IPCC clinker default factor

```text
IPCC clinker EF = 0.785 × 0.65 = 0.510 tCO₂/t clinker
```

### 7.4 Clinker calcination

```text
Clinker Calcination CO₂ = Clinker Produced × Clinker EF
```

### 7.5 Bypass dust

```text
Bypass Dust CO₂ = Bypass Dust Leaving Kiln × Clinker EF
```

### 7.6 CKD

```text
EFCli = clinker_ef_tco2_per_t
fraction = (EFCli / (1 + EFCli)) × ckd_calcination_rate
ckd_ef = fraction / (1 - fraction)
CKD CO₂ = CKD quantity × ckd_ef
```

Default: `ckd_calcination_rate = 1`

### 7.7 Dust fallback

```text
Dust fallback CO₂ = Clinker Calcination CO₂ × 0.02
```

### 7.8 Raw meal TOC

```text
Raw Meal TOC CO₂ =
Clinker Produced
× Raw Meal-to-Clinker Ratio
× TOC Fraction
× 44/12
```

Defaults:

```text
Raw meal-to-clinker ratio = 1.55
TOC fraction = 0.002
Carbon-to-CO₂ = 44/12 = 3.6667
```

### 7.9 Fuel energy

```text
Fuel Energy TJ = Fuel Quantity × LHV / 1000
```

### 7.10 Fuel CO₂

```text
Fuel CO₂ t = Fuel Energy TJ × EF kgCO₂/GJ
```

### 7.11 Gross Scope 1

```text
Gross Scope 1 CO₂ =
clinker_calcination_co2
+ bypass_dust_co2
+ ckd_co2
+ raw_meal_toc_co2
+ conventional_kiln_fuel_co2
+ alternative_fossil_kiln_fuel_co2
+ non_kiln_fossil_co2
+ owned_controlled_mobile_combustion_co2
```

### 7.12 Biomass memo

```text
Biomass CO₂ Memo = kiln_biomass_co2 + non_kiln_biomass_co2
```

### 7.13 Bought clinker

```text
Net External Clinker Purchases = External Clinker Bought - External Clinker Sold
Bought Clinker CO₂ = Net External Clinker Purchases × 862 / 1000
```

### 7.14 Purchased electricity

```text
Purchased Electricity CO₂ = Electricity MWh × Electricity EF
```

### 7.15 Net CO₂

```text
Net CO₂ = Gross Scope 1 CO₂ - Acquired Emission Rights
```

Gross must always remain visible.

### 7.16 Specific emissions

```text
Specific Gross CO₂ per t clinker = Gross Scope 1 CO₂ × 1000 / Clinker Produced
Specific Gross CO₂ per t cementitious product = Gross Scope 1 CO₂ × 1000 / Cementitious Product
```

---

## 8. Required Input Payload Model

Top-level payload:

```json
{
  "calculationContext": {},
  "organization": {},
  "facility": {},
  "organizationBoundary": {},
  "sector": {},
  "methodSelections": {},
  "sourceApplicability": {},
  "activityData": {},
  "factorOverrides": {},
  "evidence": [],
  "auditMetadata": {}
}
```

### Required context

```json
{
  "calculationContext": {
    "calculationType": "ANNUAL_INVENTORY",
    "reportingPeriod": {
      "year": 2026,
      "startDate": "2026-01-01",
      "endDate": "2026-12-31"
    },
    "inventoryVersion": "DRAFT_V1"
  }
}
```

### Boundary

```json
{
  "organizationBoundary": {
    "boundaryMethod": "OPERATIONAL_CONTROL",
    "operationalControlStatus": "CONTROLLED",
    "financialControlStatus": "CONTROLLED",
    "ownershipSharePercent": 100,
    "consolidationPercent": 100,
    "boundaryEvidenceRef": "ev_boundary_001"
  }
}
```

### Cement method selections

```json
{
  "methodSelections": {
    "processEmissionMethod": "CSI_CLINKER_BASED",
    "clinkerEmissionFactorMethod": "CSI_DEFAULT_525",
    "dustMethod": "ACTUAL_DUST_DATA",
    "tocMethod": "CSI_DEFAULT_TOC",
    "fuelCombustionMethod": "ENERGY_BASED",
    "mobileCombustionMethod": "FUEL_BASED",
    "electricityMethod": "LOCATION_BASED_SUPPORTING",
    "boughtClinkerMethod": "CSI_NET_CLINKER_PURCHASES",
    "netReportingMethod": "NONE"
  }
}
```

Allowed values:

```yaml
processEmissionMethod:
  - CSI_CLINKER_BASED
  - US_EPA_CEMENT_BASED_FALLBACK

clinkerEmissionFactorMethod:
  - PLANT_SPECIFIC_CAO_MGO
  - CSI_DEFAULT_525
  - IPCC_DEFAULT_510

dustMethod:
  - ACTUAL_DUST_DATA
  - IPCC_2_PERCENT_FALLBACK
  - NOT_APPLICABLE

tocMethod:
  - PLANT_SPECIFIC_TOC
  - CSI_DEFAULT_TOC

fuelCombustionMethod:
  - ENERGY_BASED
  - CARBON_CONTENT_BASED
  - DIRECT_MEASUREMENT

mobileCombustionMethod:
  - FUEL_BASED
  - EQUIPMENT_HOURS_BASED
  - DISTANCE_BASED
```

### Important null/zero rule

```text
null = missing / unknown
0 = confirmed actual zero
```

---

## 9. Required Result Model

The calculation engine must return:

```json
{
  "calculationId": "string_or_null",
  "status": "SUCCESS_WITH_WARNINGS",
  "sectorCode": "CEMENT",
  "methodologyPack": "CSI_CEMENT_PROTOCOL_V2",
  "reportingPeriod": {},
  "scope1": {},
  "memoItems": {},
  "supportingScope2": {},
  "supportingScope3": {},
  "optionalNetReporting": {},
  "intensityMetrics": {},
  "performanceIndicators": {},
  "dataQuality": {},
  "warnings": [],
  "errors": [],
  "calculationTrace": [],
  "auditStatus": {}
}
```

### Scope 1 result example

```json
{
  "scope1": {
    "grossScope1CO2Tonnes": 84361.3,
    "components": {
      "processCO2Tonnes": 54612.7,
      "fossilKilnFuelCO2Tonnes": 29696.0,
      "nonKilnFossilCO2Tonnes": 0,
      "mobileCombustionCO2Tonnes": 53.6
    },
    "excludedFromGrossScope1": {
      "biomassCO2MemoTonnes": 0,
      "purchasedElectricityCO2Tonnes": 8592.0,
      "boughtClinkerCO2Tonnes": 0,
      "emissionRightsTonnes": 1000
    }
  }
}
```

---

## 10. Factor Library Requirements

Every factor record must store:

```yaml
factor_record_fields:
  - factor_id
  - factor_code
  - factor_name
  - factor_type
  - sector_code
  - source_category
  - fuel_type
  - gas
  - value
  - unit
  - source_name
  - source_version
  - publisher
  - country
  - region
  - factor_year
  - valid_from
  - valid_to
  - factor_quality
  - priority_rank
  - is_default
  - is_locked
  - replacement_allowed
  - evidence_ref
```

### Factor priority

```text
1. Plant-specific
2. Supplier-specific
3. Official national/regional
4. Sector methodology default
5. International default
6. User estimate
```

### Seed cement factors

```yaml
seed_cement_factors:
  process:
    CSI_DEFAULT_CLINKER_EF:
      value: 0.525
      unit: tCO2/t_clinker

    IPCC_DEFAULT_CLINKER_EF:
      value: 0.510
      unit: tCO2/t_clinker

    BOUGHT_CLINKER_EF:
      value: 862
      unit: kgCO2/t_clinker

  constants:
    CO2_PER_CAO:
      value: 0.785
      unit: tCO2/tCaO

    CO2_PER_MGO:
      value: 1.092
      unit: tCO2/tMgO

    CO2_PER_CACO3:
      value: 0.44
      unit: tCO2/tCaCO3

    CO2_PER_C:
      value: 3.6667
      unit: tCO2/tC

  raw_meal:
    RAW_MEAL_TO_CLINKER_RATIO:
      value: 1.55
      unit: t_raw_meal/t_clinker

    TOC_FRACTION:
      value: 0.002
      unit: fraction

  dust:
    CKD_CALCINATION_RATE_DEFAULT:
      value: 1
      unit: fraction

    DUST_FALLBACK_PERCENT:
      value: 0.02
      unit: fraction_of_clinker_calcination_co2

  fuels:
    PETCOKE_EF:
      value: 92.8
      unit: kgCO2/GJ

    COAL_EF:
      value: 96
      unit: kgCO2/GJ

    DIESEL_EF:
      value: 74
      unit: kgCO2/GJ

    NATURAL_GAS_EF:
      value: 56.1
      unit: kgCO2/GJ

    HEAVY_FUEL_OIL_EF:
      value: 77.3
      unit: kgCO2/GJ

    WASTE_OIL_EF:
      value: 74
      unit: kgCO2/GJ

    TYRES_EF:
      value: 85
      unit: kgCO2/GJ

    PLASTICS_EF:
      value: 75
      unit: kgCO2/GJ

    MIXED_INDUSTRIAL_WASTE_EF:
      value: 83
      unit: kgCO2/GJ

    SOLID_BIOMASS_EF:
      value: 110
      unit: kgCO2/GJ
```

### Factor snapshot rule

When a calculation runs, preserve exact factor values.

```yaml
requirement_id: FACTOR_SNAPSHOT_ON_CALCULATION
rule: >
  Every calculation run must store a snapshot of factor value, unit,
  source, version, factor year, and applicability metadata.
```

---

## 11. Validation and Warning Catalogue

### Blocking validations

```yaml
blocking_validations:
  - missing_sector_code
  - missing_reporting_period
  - missing_facility
  - missing_boundary_method
  - unsupported_sector
  - missing_clinker_production_for_csi_method
  - missing_cement_production_for_us_epa_fallback
  - negative_production_value
  - negative_corrected_cao
  - negative_corrected_mgo
  - ckd_calcination_rate_outside_0_1
  - missing_fuel_quantity
  - missing_lhv_for_energy_based_fuel
  - missing_fuel_emission_factor
  - incompatible_factor_unit
  - biomass_co2_included_in_gross_scope1
  - purchased_electricity_included_in_scope1
  - bought_clinker_included_in_scope1
  - emission_rights_applied_to_gross
```

### Warning validations

```yaml
warning_validations:
  - default_clinker_ef_used
  - default_ckd_calcination_rate_used
  - dust_2_percent_fallback_used
  - default_toc_used
  - high_toc_material_without_lab_data
  - default_fuel_ef_used
  - default_lhv_used
  - alternative_fuel_split_unknown
  - biomass_claim_without_evidence
  - internal_external_clinker_split_missing
  - old_electricity_factor_used
  - non_india_factor_used_for_india_facility
```

---

## 12. Audit and Evidence Workflow

### Workflow states

```yaml
workflow_statuses:
  - DRAFT
  - SUBMITTED
  - UNDER_REVIEW
  - CHANGES_REQUESTED
  - APPROVED
  - LOCKED
  - REOPENED
  - SUPERSEDED
```

### Workflow rules

```yaml
workflow_rules:
  - drafts_can_be_edited
  - submitted_records_are_limited_edit
  - approval_requires_no_blocking_errors
  - approval_requires_mandatory_evidence
  - approved_records_are_read_only
  - locked_records_are_immutable
  - reopen_creates_new_version
  - all_changes_are_logged
```

### Evidence object

```json
{
  "evidenceId": "ev_clinker_prod_001",
  "evidenceType": "ERP_PRODUCTION_REPORT",
  "fileName": "clinker_production_2026.pdf",
  "description": "Annual clinker production report from ERP",
  "linkedFieldPaths": [
    "activityData.production.clinkerProduced.value"
  ],
  "facilityId": "fac_001",
  "reportingPeriod": {
    "year": 2026
  },
  "uploadedBy": "user_001",
  "uploadedAt": "2026-05-18T10:00:00Z",
  "reviewStatus": "PENDING_REVIEW",
  "reviewedBy": null,
  "reviewedAt": null,
  "reviewComment": null,
  "fileHash": "sha256:...",
  "accessLevel": "FACILITY_REVIEWERS_ONLY"
}
```

### Mandatory evidence cases

```yaml
mandatory_evidence:
  - clinker_production_for_csi_method
  - clinker_lab_report_for_plant_specific_cao_mgo
  - ckd_lab_report_for_plant_specific_ckd_rate
  - alternative_fuel_composition_for_fossil_biogenic_split
  - biomass_origin_evidence_for_biomass_memo
  - custom_factor_evidence
  - emission_rights_certificate_for_net_reporting
```

---

## 13. API Contract Draft

### Sector

```http
GET /api/v1/sectors
GET /api/v1/sectors/{sectorCode}
```

### Cement calculation

```http
POST /api/v1/calculations/cement/validate
POST /api/v1/calculations/cement/calculate
POST /api/v1/calculations/cement/drafts
PUT  /api/v1/calculations/{calculationId}/draft
GET  /api/v1/calculations/{calculationId}
```

### Workflow

```http
POST /api/v1/calculations/{calculationId}/submit
POST /api/v1/calculations/{calculationId}/review
POST /api/v1/calculations/{calculationId}/approve
POST /api/v1/calculations/{calculationId}/lock
POST /api/v1/calculations/{calculationId}/reopen
```

### Factors

```http
GET  /api/v1/factors
GET  /api/v1/factors/{factorId}
POST /api/v1/factors/custom
```

### Evidence

```http
POST /api/v1/evidence
POST /api/v1/evidence/{evidenceId}/link
POST /api/v1/evidence/{evidenceId}/review
```

### Audit

```http
GET /api/v1/calculations/{calculationId}/audit-trail
GET /api/v1/calculations/{calculationId}/export/audit-package
```

---

## 14. Suggested Database Tables

```yaml
database_tables:
  core:
    - organizations
    - facilities
    - reporting_periods
    - sectors
    - methodology_packs

  calculations:
    - calculations
    - calculation_versions
    - calculation_payloads
    - calculation_results
    - calculation_traces
    - validation_results

  factors:
    - factor_library
    - custom_factors
    - factor_snapshots

  evidence:
    - evidence_files
    - evidence_field_links
    - evidence_reviews

  workflow:
    - review_actions
    - approvals
    - warning_acknowledgements
    - exceptions

  audit:
    - audit_logs
    - change_logs
```

---

## 15. Test Case Matrix

### Critical calculation tests

```yaml
critical_calculation_tests:
  - clinker_default_525_calculates_correctly
  - plant_specific_cao_mgo_calculates_correctly
  - bypass_dust_calculates_correctly
  - ckd_calculates_correctly
  - raw_meal_toc_calculates_correctly
  - petcoke_fuel_calculates_correctly
  - alternative_fossil_included_in_scope1
  - biomass_co2_excluded_from_gross_scope1
  - mixed_fuel_split_calculates_scope1_and_memo
  - purchased_electricity_excluded_from_scope1
  - bought_clinker_excluded_from_scope1
  - gross_scope1_total_correct
  - net_co2_does_not_replace_gross
```

### Critical validation tests

```yaml
critical_validation_tests:
  - missing_clinker_production_blocks_csi_method
  - us_epa_fallback_requires_all_ratios
  - negative_corrected_cao_blocks
  - ckd_rate_outside_0_1_blocks
  - biomass_in_gross_scope1_blocks
  - purchased_electricity_in_scope1_blocks
  - bought_clinker_in_scope1_blocks
  - missing_lhv_blocks_energy_method
  - source_exclusion_without_reason_blocks_submission
  - null_vs_zero_handled_correctly
```

### Critical audit tests

```yaml
critical_audit_tests:
  - plant_specific_method_requires_evidence
  - biomass_classification_requires_evidence
  - custom_factor_requires_evidence
  - approved_record_read_only
  - locked_record_immutable
  - reopen_creates_new_version
  - high_risk_warning_requires_acknowledgement
  - factor_snapshot_preserved
  - calculation_trace_preserved
```

---

## 16. Suggested Implementation Order

### Step 1 — Core skeleton

```yaml
step_1:
  - create_backend_project
  - create_database_schema_base
  - create_sector_registry
  - seed_cement_sector
  - seed_basic_factor_library
```

### Step 2 — Cement calculation engine

```yaml
step_2:
  - implement_clinker_calcination
  - implement_bypass_dust
  - implement_ckd
  - implement_raw_meal_toc
  - implement_kiln_fuel
  - implement_gross_scope1_total
```

### Step 3 — Validation engine

```yaml
step_3:
  - implement_payload_validation
  - implement_method_validation
  - implement_scope_validation
  - implement_factor_validation
  - implement_warning_catalogue
```

### Step 4 — Result model

```yaml
step_4:
  - return_scope1_breakdown
  - return_biomass_memo
  - return_supporting_scope2
  - return_supporting_scope3
  - return_data_quality
  - return_calculation_trace
```

### Step 5 — Draft/save workflow

```yaml
step_5:
  - create_draft
  - update_draft
  - get_calculation
  - store_payload
  - store_result
  - store_trace
```

### Step 6 — Factor library

```yaml
step_6:
  - factor_search
  - factor_detail
  - custom_factor_creation
  - factor_snapshot_on_calculation
```

### Step 7 — Evidence and audit

```yaml
step_7:
  - evidence_upload_or_register
  - evidence_link_to_field
  - evidence_review
  - change_log
  - audit_trail
```

### Step 8 — Review/approval/lock

```yaml
step_8:
  - submit
  - review
  - approve
  - lock
  - reopen
```

### Step 9 — Frontend

```yaml
step_9:
  - sector_selection_screen
  - facility_boundary_setup
  - cement_activity_data_forms
  - validation_panel
  - result_dashboard
  - evidence_panel
  - review_workflow_views
```

---

## 17. Minimum Viable Cement Release

```yaml
mvp_cement_release:
  required:
    - sector_selection
    - facility_boundary_setup
    - clinker_calcination_with_default_525
    - plant_specific_cao_mgo_optional
    - bypass_dust
    - ckd
    - raw_meal_toc
    - kiln_fuel_combustion
    - biomass_memo_exclusion
    - gross_scope1_total
    - purchased_electricity_supporting_scope2
    - bought_clinker_supporting_indirect
    - validation_warnings
    - factor_library_seed
    - calculation_trace
    - draft_save
    - result_dashboard

  can_defer:
    - full_audit_package_zip
    - advanced_uncertainty_math
    - CHP_allocation_UI
    - base_year_recalculation_UI
    - multi_sector_active_calculations
    - advanced_role_based_approval
```

---

## 18. Developer Guardrails

The developer/agent must not:

```yaml
developer_must_not:
  - hardcode_hidden_emission_factors_without_factor_records
  - merge_scope1_scope2_scope3_memo_net_into_one_total
  - treat_biomass_co2_as_gross_scope1
  - treat_purchased_electricity_as_scope1
  - treat_bought_clinker_as_buyer_scope1
  - allow_null_to_mean_zero
  - mutate_approved_results_after_factor_updates
  - allow_editing_locked_calculations
  - skip_calculation_trace
  - skip_factor_snapshots
  - skip_warning_return_model
```

---

## 19. Codex Prompt Skeleton

```text
Build a multi-industry GHG Protocol calculator platform with Cement as the first active sector. The platform must be methodology-driven, audit-ready, and sector-extensible.

Implement a backend with modules for:
1. Sector registry
2. Facility and boundary setup
3. Scope classification
4. Factor library
5. Cement calculation engine
6. Validation/warning engine
7. Evidence and audit workflow
8. Calculation trace
9. Review/approval workflow

The Cement module must implement:
- clinker calcination using CSI default 0.525 tCO2/t clinker and optional plant-specific CaO/MgO factor
- bypass dust CO2
- CKD CO2 with calcination rate
- raw meal TOC CO2 using default 1.55 raw meal/clinker and 0.002 TOC fraction
- kiln fuel combustion using quantity × LHV × EF
- alternative fossil fuel inclusion in gross Scope 1
- biomass CO2 memo exclusion from gross Scope 1
- non-kiln fuel combustion
- mobile combustion support
- purchased electricity as Scope 2 support
- bought clinker as Scope 3/supporting indirect using 862 kgCO2/t clinker
- optional net CO2 reporting without replacing gross CO2

The system must always separate:
- gross Scope 1
- Scope 2 support
- Scope 3/supporting
- biomass memo
- optional net reporting

Implement validation to block:
- purchased electricity in Scope 1
- bought clinker in Scope 1
- biomass CO2 in gross Scope 1
- missing clinker production for CSI method
- invalid CKD calcination rate
- negative corrected CaO/MgO
- incompatible factor units
- missing required evidence for plant-specific/custom methods

Implement result schema with:
- scope1 breakdown
- process emissions breakdown
- combustion breakdown
- memo items
- supporting Scope 2/3
- net reporting
- intensity metrics
- warnings
- errors
- data quality flags
- factor snapshots
- calculation trace
- audit status

Implement APIs:
- GET /api/v1/sectors
- POST /api/v1/calculations/cement/validate
- POST /api/v1/calculations/cement/calculate
- POST /api/v1/calculations/cement/drafts
- PUT /api/v1/calculations/{id}/draft
- GET /api/v1/calculations/{id}
- GET /api/v1/factors
- POST /api/v1/evidence
- POST /api/v1/calculations/{id}/submit
- POST /api/v1/calculations/{id}/review
- POST /api/v1/calculations/{id}/approve
- POST /api/v1/calculations/{id}/lock

Use PostgreSQL. Preserve factor snapshots and calculation traces. Approved and locked calculations must be immutable.
```

---

## 20. Final Conclusion

This specification is enough to start the first serious build of the cement Scope 1 calculator.

The first release should prioritize:

```text
1. Correct methodology
2. Correct scope separation
3. Correct formulas
4. Correct factor handling
5. Correct validation warnings
6. Calculation trace
7. Evidence-ready data model
```

Do not start with decorative UI. Start with calculation correctness and audit-grade data structure.
