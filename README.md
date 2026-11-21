# Bayesian Network Diagnostic Program

This project explores how an EHR app could use longitudinal medical history to update the probability of a diagnosis. The first milestone is a literature review, a proposed sparse Bayesian network, and a versioned diagnosis-code catalog. All model parameters are unset.

- [Literature review](https://iwannabedata.github.io/Bayesian-Network-Program/#review) on probabilistic diagnosis, longitudinal modeling, and validation.
- [Network design](https://iwannabedata.github.io/Bayesian-Network-Program/#network) with function contracts and inference strategies for sparse graphs with thousands of variables.
- [EHR integration](https://iwannabedata.github.io/Bayesian-Network-Program/#ehr) for a future read-only SMART on FHIR app, starting with Practice Fusion.
- [Diagnosis catalog and CSV export](https://iwannabedata.github.io/Bayesian-Network-Program/#catalog) for all 98,403 entries in the U.S. FY 2027 ICD-10-CM order file, including 74,879 reportable codes and 23,524 hierarchy headers.

## Catalog contract

`E11.9` resolves to `icd10cm_e119`, tagged `chapter:04` and `category:e11`. The variable name is derived from the undotted code and stays stable across releases. Each record also stores its coding system, release, effective dates, official title, and reporting status. Resolve historic EHR records using the applicable release and preserve any unmapped or ambiguous coding for review. [CMS ICD-10 release files](https://www.cms.gov/medicare/coding-billing/icd-10-codes)

[`catalog.mjs`](catalog.mjs) expands the [compressed data](data/manifest.json) into named records. It exports `readCatalogShard`, `indexCatalog`, `lookupCode`, and `draftObservation`. The draft function accepts a reportable code and an evidence window identifier and returns a coded-observation node with an unset parameter set. Clinical hypothesis IDs such as `dx_type2_diabetes` are defined separately and mapped through reviewed clinical concepts.

```js
const code = lookupCode(index, 'E11.9');
const node = draftObservation(code, 'prior_history');
// node.id is icd10cm_e119__prior_history
// node.parameterSetId is null
```

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
