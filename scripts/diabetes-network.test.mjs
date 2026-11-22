import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChartNetwork, createChartNode, readChartCase, saveChartCase } from '../chart-network.mjs';
import {
  applyDiabetesOverrides, compileDiabetesNetwork, evaluateDiabetes, readChartObservations, setDiabetesObservation,
} from '../diabetes-network.mjs';
import { createEvidenceReview } from '../t2d-evidence.mjs';
import { readRepo, readScreeningCatalog } from './t2d-screening-data.mjs';

const { records, index } = await readScreeningCatalog();
const review = createEvidenceReview(index, JSON.parse(await readRepo('evidence/t2d-review.json', 'utf8')),
  await readRepo('evidence/klimek-2015-s2.csv', 'utf8'));
const network = compileDiabetesNetwork(records, review);
const gdm = 'icd10cm_z8632';
const fattyLiver = 'icd10cm_k760';
const pneumonia = 'icd10cm_j189';
const joint = 'kangbuk_samsung_gdm_nafld_5y';
const chartDiagnosis = (code, findingState, recordedOn) => createChartNode('diagnosis', {
  code, findingState, system: 'icd10cm', recordedOn,
}, index);

test('the graph contains the catalog, chart nodes and all study cohorts before selection', () => {
  assert.equal(network.models.size, 13);
  assert.equal([...network.nodes.values()].filter(node => node.kind === 'icd').length, 98403);
  assert.equal(network.nodes.get(pneumonia).kind, 'icd');
  assert.equal(network.nodes.get('age_week_8').kind, 'chart');
  for (const edge of network.edges) {
    assert(network.nodes.has(edge.from));
    assert(network.nodes.has(edge.to));
    assert(edge.sourceUrl);
  }
  assert(network.nodes.get('icd10cm_c34').sources.some(entry => entry.paper.pmid === '40692755'));
  assert(network.nodes.get('icd10cm_i10').associations.length);
});

test('an explicitly absent chart diagnosis is No and an undocumented diagnosis stays Unknown', () => {
  const chart = buildChartNetwork([
    chartDiagnosis('Z86.32', 'present'),
    chartDiagnosis('K76.0', 'absent'),
    chartDiagnosis('J18.9', 'absent'),
    chartDiagnosis('E28.2', 'uncertain'),
    createChartNode('age_years', { ageUnit: 'weeks', value: 8 }),
  ]);
  const { observations, provenance } = readChartObservations(network, chart);
  assert.equal(observations.get(pneumonia), 'absent');
  assert.equal(observations.has('icd10cm_j18'), false);
  assert.equal(observations.has('icd10cm_e282'), false);
  assert.equal(observations.get('age_week_8'), 'present');
  assert.equal(provenance.get(pneumonia).entries[0].code, 'J18.9');
  assert.equal(evaluateDiabetes(network, joint, observations).probability, 0.0289);
});

test('conflicting chart findings remain unresolved until a state is chosen', () => {
  const chart = buildChartNetwork([
    chartDiagnosis('J18.9', 'present', '2026-10-01'),
    chartDiagnosis('J18.9', 'absent', '2026-10-02'),
  ]);
  const { observations, provenance } = readChartObservations(network, chart);
  assert.equal(observations.has(pneumonia), false);
  assert.equal(provenance.get(pneumonia).conflict, true);
});

test('the shared case preserves chart values and uses a manual override without changing the chart', () => {
  const session = new Map();
  const storage = {
    getItem: key => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, value),
    removeItem: key => session.delete(key),
  };
  const lab = createChartNode('lab_result', {
    system: 'loinc', code: '4548-4', label: 'Hemoglobin A1c', resultType: 'number',
    result: 6.2, unit: '%', recordedOn: '2026-10-01',
  });
  saveChartCase(storage, [chartDiagnosis('Z86.32', 'present'), chartDiagnosis('K76.0', 'absent'), lab,
    createChartNode('patient_name', { value: 'Sample name' })]);
  const { observations, provenance } = readChartObservations(network, readChartCase(storage));
  assert.equal(readChartCase(storage).nodes.length, 3);
  assert.equal(provenance.get('lab_result').entries[0].chartEntry, 3);
  assert.deepEqual(provenance.get('lab_result').entries[0].recordedValue, lab.value);
  const updated = applyDiabetesOverrides(network, observations, new Map([[fattyLiver, 'present']]));
  assert.equal(evaluateDiabetes(network, joint, updated).probability, 0.2292);
  assert.equal(evaluateDiabetes(network, joint, observations).probability, 0.0289);
  const unresolved = applyDiabetesOverrides(network, observations, new Map([[fattyLiver, 'unknown']]));
  assert.equal(evaluateDiabetes(network, joint, unresolved).status, 'partial');
});

test('observations update the existing joint factors and preserve relative risks as source data', () => {
  const observations = new Map();
  const { nodes, edges } = network;
  const edgeCount = edges.length;
  const nodeCount = nodes.size;
  setDiabetesObservation(network, observations, gdm, 'present');
  setDiabetesObservation(network, observations, pneumonia, 'absent');
  assert.deepEqual(evaluateDiabetes(network, joint, observations).range, [0.0289, 0.2292]);
  setDiabetesObservation(network, observations, fattyLiver, 'present');
  assert.equal(evaluateDiabetes(network, joint, observations).probability, 0.2292);
  setDiabetesObservation(network, observations, fattyLiver, 'absent');
  assert.equal(evaluateDiabetes(network, joint, observations).probability, 0.0289);
  assert.equal(evaluateDiabetes(network, joint, observations).estimate.source.pmid, '37253998');
  assert.equal(network.nodes, nodes);
  assert.equal(network.edges, edges);
  assert.equal(edges.length, edgeCount);
  assert.equal(nodes.size, nodeCount);
});

test('one-sided prevalence and unequal follow-up produce only supported results', () => {
  const observations = new Map([['icd10cm_c34', 'present']]);
  assert.equal(evaluateDiabetes(network, 'cprd_aurum_lung_2010_2022', observations).probability, 14566 / 69674);
  setDiabetesObservation(network, observations, 'icd10cm_c34', 'absent');
  assert.equal(evaluateDiabetes(network, 'cprd_aurum_lung_2010_2022', observations).status, 'missing-row');
  assert.equal(evaluateDiabetes(network, 'aric_shhs_osa_observed_1996_2013', observations).status, 'reference');
});

test('Bayes uses a supplied baseline, complements No, and declines unsupported joint updating', () => {
  const cohort = 'cprd_gold_2014_matched_prevalence';
  const asthma = 'icd10cm_j45';
  const observations = new Map([[asthma, 'absent']]);
  assert.equal(evaluateDiabetes(network, cohort, observations).status, 'baseline-required');
  const result = evaluateDiabetes(network, cohort, observations, 0.1);
  const expected = (0.1 * (1 - 0.085)) / (0.1 * (1 - 0.085) + 0.9 * (1 - 0.059));
  assert.equal(result.probability, expected);
  assert.equal(result.estimate.source.pmid, '32611677');
  setDiabetesObservation(network, observations, 'icd10cm_i10', 'present');
  const mixed = evaluateDiabetes(network, cohort, observations, 0.1);
  assert.equal(mixed.status, 'joint-unavailable');
  assert.equal(mixed.updates.length, 2);
});
