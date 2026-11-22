# Bayesian Network Diagnostic Program

This project explores how documented medical history could update the probability of a diagnosis. It includes a literature review, a sparse Bayesian network design, a versioned diagnosis catalog, and a chart variable builder. Patient network parameters are unset. Study-specific estimates are available with their source data.

- [Literature review](https://iwannabedata.github.io/Bayesian-Network-Program/#review) on probabilistic diagnosis, longitudinal modeling, and validation.
- [Type 2 diabetes evidence](https://iwannabedata.github.io/Bayesian-Network-Program/#diabetes) with cohort estimates, cited extracts, PDF copies, and a searchable evidence status.
- [Network design](https://iwannabedata.github.io/Bayesian-Network-Program/#network) with function contracts and inference strategies for sparse graphs with thousands of variables.
- [Chart variable builder](https://iwannabedata.github.io/Bayesian-Network-Program/chart.html) for selecting chart values and exporting draft nodes.
- [Diagnosis catalog and CSV export](https://iwannabedata.github.io/Bayesian-Network-Program/#catalog) for all 98,403 entries in the U.S. FY 2027 ICD-10-CM order file, including 74,879 reportable codes and 23,524 hierarchy headers.

- [Diabetes Network](https://iwannabedata.github.io/Bayesian-Network-Program/diabetes.html) for following type 2 diabetes estimates as chart findings are recorded.


## Diabetes Network

The page loads the ICD-10-CM catalog, clinical chart fields, and study evidence into a fixed node registry and cohort-specific factors. Changing a finding updates its observation state on the existing graph. The Chart builder and Diabetes Network share evidence within the current browser tab. Each finding shows its recorded state, links to chart entries when available, and links to the relevant evidence. Explicitly absent chart findings become No. Unresolved or conflicting findings remain Unknown until a state is chosen. Use sample data with this demo.

Each estimate links to its inputs, source and calculation. Matching studies update from the same findings. Published conditional rows give a cohort-specific prevalence or risk at a defined horizon. With one input still unknown, the page shows the range across the compatible rows. Cohorts that supply both diabetes-group likelihoods can demonstrate a Bayesian update from an entered baseline for that population. A case-wide probability requires a calibrated joint model. Relative-risk associations and nonuniform follow-up fractions are available as linked evidence.

Run `node --test scripts/diabetes-network.test.mjs` to verify the fixed topology, chart transfer, conditional estimates, and Bayesian updates.

## Catalog contract

`E11.9` resolves to `icd10cm_e119`, tagged `chapter:04` and `category:e11`. The variable name is derived from the undotted code and stays stable across releases. Each record also stores its coding system, release, effective dates, official title, and reporting status. Resolve historic clinical records using the applicable release and preserve any unmapped or ambiguous coding for review. [CMS ICD-10 release files](https://www.cms.gov/medicare/coding-billing/icd-10-codes)

[`catalog.mjs`](catalog.mjs) expands the [compressed data](data/manifest.json) into named records. It exports `readCatalogShard`, `indexCatalog`, `lookupCode`, and `draftObservation`. The draft function accepts a reportable code and an evidence window identifier and returns a coded-observation node with an unset parameter set. Clinical hypothesis IDs such as `dx_type2_diabetes` are defined separately and mapped through reviewed clinical concepts.

```js
const code = lookupCode(index, 'E11.9');
const node = draftObservation(code, 'prior_history');
// node.id is icd10cm_e119__prior_history
// node.parameterSetId is null
```

## Type 2 diabetes evidence

Open the Type 2 diabetes evidence column in the catalog to see study estimates, table extracts, PDFs, and a PubMed query for the exact variable. The Austrian nationwide claims supplement is indexed using same-code category anchors. Each row retains the study's age-band label, relative risk, confidence interval and CSV row. Check the original code definitions, cohort selection and multiple-testing methods when interpreting it. Findings for a category remain attached to that category.

The [evidence manifest](evidence/t2d-review.json) holds the targeted study extracts and all citations. Three publisher PDFs and the claims supplement are archived here. Other studies link to open full-paper PDF copies at a publisher or research archive. The public PDFs cover every cited study in the evidence manifest.

```js
import { createEvidenceReview, getConditionalEvidence, getConditionalRows,
  T2D_GIVEN_CONDITION } from './t2d-evidence.mjs';

// catalogIndex, reviewData and claimsCsv are the catalog code map,
// the parsed evidence manifest, and the text of the claims supplement.
const review = createEvidenceReview(catalogIndex, reviewData, claimsCsv);
const query = {
  variableName: 'icd10cm_c34',
  cohortId: 'cprd_aurum_lung_2010_2022',
  direction: T2D_GIVEN_CONDITION,
};
const estimate = getConditionalEvidence(review, { ...query, givenState: 'present' });
// estimate.probability = 14566 / 69674, with a source, extract, and endpoint.
const conditional = getConditionalRows(review, query);
// conditional.status === 'incomplete' because the study has no lung cancer–free group.
```

`getConditionalRows` returns research parameter rows when the study reports every conditioning state. For example, use `icd10cm_z8632`, `kangbuk_samsung_gdm_nafld_5y` and `T2D_GIVEN_CONDITION` to retrieve the four joint rows with `parentStates`. The fatty liver anchor `icd10cm_k760` links to the same outcome and conditioning IDs. Use `givenState: 'both'` to retrieve the single estimate for both exposures. Fractions observed across variable follow-up can be read with `getConditionalEvidence`. They retain an `observed_followup_fraction` endpoint and have no fixed-horizon parameter rows. Each result retains the study's phenotype, age or eligibility constraints, endpoint, and time window. Match these to the intended network nodes before calibration. Relative measures stay in the evidence catalog. The patient network's parameters remain unset.

### PubMed searches

The catalog's links and the screening exporter use the same query builder. [Vetted entries](pubmed-query.mjs) add clinical phrases and NLM MeSH descriptors to the official ICD-10-CM title and code. The expansion applies to the exact mapped code. A broader search hit still needs review against the study phenotype.

```sh
node --test scripts/t2d-screening.test.mjs
node scripts/run-t2d-screening.mjs --known-papers --code C34 >> evidence/t2d-search-log.jsonl
node scripts/run-t2d-screening.mjs --code C34 --code I21 >> evidence/t2d-search-log.jsonl
node scripts/export-t2d-screening.mjs > t2d-screening.jsonl
```

The offline test checks title terms for papers already in the review. The `--known-papers` command intersects the generated query with the expected PMID in PubMed, starting with [40692755](https://pubmed.ncbi.nlm.nih.gov/40692755/) for C34. Omit `--code` to run all eight known-paper checks. A regular `--code` run records the entire diagnosis query, its result count, and up to ten sample PMIDs. Append runs to the [search log](evidence/t2d-search-log.jsonl) to preserve their exact queries and dates.

The exported `search` field reflects the current diagnosis query. A completed zero-result query is recorded as completed. Failed attempts have their own status. Each row also carries the independent `evidenceStatus`. A PMID check, an evidence link, or a result returned by a previous query does not mark the current diagnosis search complete. Use `--search-log PATH` with the exporter to read a different JSONL log.

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

The builder loads the pinned ICD-10-CM release when a code needs validation. It accepts identifiers from other vocabularies as charted. Evidence values are shared with the Diabetes Network through browser-tab session storage. Chart metadata stays in page memory and is included in an explicit JSON export.

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
