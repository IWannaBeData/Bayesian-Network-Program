# Bayesian Network Diagnostic Program

This project explores how documented medical history could update the probability of a diagnosis. It includes a literature review, a sparse Bayesian network design, a versioned diagnosis catalog, and a chart variable builder. All model parameters are unset.

- [Literature review](https://iwannabedata.github.io/Bayesian-Network-Program/#review) on probabilistic diagnosis, longitudinal modeling, and validation.
- [Network design](https://iwannabedata.github.io/Bayesian-Network-Program/#network) with function contracts and inference strategies for sparse graphs with thousands of variables.
- [Chart variable builder](https://iwannabedata.github.io/Bayesian-Network-Program/chart.html) for selecting chart values and exporting draft nodes.
- [Diagnosis catalog and CSV export](https://iwannabedata.github.io/Bayesian-Network-Program/#catalog) for all 98,403 entries in the U.S. FY 2027 ICD-10-CM order file, including 74,879 reportable codes and 23,524 hierarchy headers.

## Catalog contract

`E11.9` resolves to `icd10cm_e119`, tagged `chapter:04` and `category:e11`. The variable name is derived from the undotted code and stays stable across releases. Each record also stores its coding system, release, effective dates, official title, and reporting status. Resolve historic clinical records using the applicable release and preserve any unmapped or ambiguous coding for review. [CMS ICD-10 release files](https://www.cms.gov/medicare/coding-billing/icd-10-codes)

[`catalog.mjs`](catalog.mjs) expands the [compressed data](data/manifest.json) into named records. It exports `readCatalogShard`, `indexCatalog`, `lookupCode`, and `draftObservation`. The draft function accepts a reportable code and an evidence window identifier and returns a coded-observation node with an unset parameter set. Clinical hypothesis IDs such as `dx_type2_diabetes` are defined separately and mapped through reviewed clinical concepts.

```js
const code = lookupCode(index, 'E11.9');
const node = draftObservation(code, 'prior_history');
// node.id is icd10cm_e119__prior_history
// node.parameterSetId is null
```

## Chart variables and network export

[chart-variables.mjs](chart-variables.mjs) defines the chart fields and age variables. The age picker supports 0–140 completed years (`age_0` through `age_140`), 0–120 completed months (`age_month_0` through `age_month_120`), 0–104 completed weeks (`age_week_0` through `age_week_104`), and 0–365 completed days (`age_days`, with the day count as its value). A chart snapshot holds one selected age across units. The builder brings together common chart sections documented by [athenaOne](https://docs.athenahealth.com/downloads/import-specification-download), [eClinicalWorks](https://www.eclinicalworks.com/products-services/patient-engagement/check-in/), and [Epic](https://open.epic.com/EHITables/GetTable/_index.htm), with [USCDI](https://isp.healthit.gov/all-uscdi-versions) as a standards reference. Practice-specific and specialty fields can be added using local terms or a named custom field.

[chart-network.mjs](chart-network.mjs) creates draft nodes and generates a snapshot. Existing ICD-10-CM codes retain their catalog variable name for a patient diagnosis or coded symptom. Family and history fields preserve the code under a separate contextual identifier. Medications, lab results and other repeatable observations accept source codes, dates, units, and record keys. An explicitly unknown observation has an unresolved status. An untouched field has no observation. Identifiers, registrations and notes remain in the export's metadata.

```js
import { createChartNode, selectChartNode, buildChartNetwork } from './chart-network.mjs';

let selection = [];
selection = selectChartNode(selection, createChartNode('age_week_6'));
selection = selectChartNode(selection, createChartNode('smoking_status', { value: 'Former' }));
selection = selectChartNode(selection, createChartNode('lab_result', {
  system: 'loinc', code: '4548-4', label: 'Hemoglobin A1c',
  resultType: 'number', result: 6.2, unit: '%', recordKey: 'lab_1',
}));
const snapshot = buildChartNetwork(selection);
```

The builder loads the pinned ICD-10-CM release when a code needs validation. It accepts identifiers from other vocabularies as charted. Values stay in page memory until the user exports them.

## Run locally

Serve the repository root with an HTTP server, then open `http://localhost:8080` in a current browser. The published static site and local server use the same bundled data. Search and export run in the browser.

```sh
python -m http.server 8080
```

## Rebuild the pinned catalog

Extract `icd10cm_order_2027.txt` and `icd10cm_codes_2027.txt` from the [official CMS ZIP](https://www.cms.gov/files/zip/2027-code-descriptions-tabular-order.zip). Run the builder with Node.js 20 or later. The generator cross-checks reportable code IDs and titles against the second official file, checks for duplicate variable names, and records hashes for both inputs and every output shard.

```sh
node scripts/build-catalog.mjs /path/to/icd10cm_order_2027.txt /path/to/icd10cm_codes_2027.txt
```

The catalog reflects the October 1, 2026 release. Its chapter ranges come from the [CDC/NCHS tabular list](https://ftp.cdc.gov/pub/health_statistics/nchs/publications/ICD10CM/2027/icd10cm-tabular-2027.pdf). The repository includes public terminology and research documentation.
