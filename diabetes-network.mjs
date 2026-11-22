import { AGE_SCALES, AGE_VARIABLES, CHART_FIELDS, lookupChartVariable } from './chart-variables.mjs';
import { CHART_SCHEMA_VERSION } from './chart-network.mjs';
import { CONDITION_GIVEN_T2D, T2D, getConditionalEvidence } from './t2d-evidence.mjs';

export const DIABETES_CASE_KEY = 'diagnostic-program-diabetes-v1';

function addModel(models, candidate) {
  const { cohort, variableName } = candidate;
  if (!models.has(cohort.id)) {
    models.set(cohort.id, {
      id: cohort.id,
      outcomeId: T2D + '__' + cohort.id,
      cohort,
      paper: candidate.paper,
      entries: new Map(),
      variables: new Map(),
    });
  }
  const model = models.get(cohort.id);
  model.entries.set(variableName, candidate);
  if (cohort.conditioning) {
    for (const [studyId, catalogId] of Object.entries(cohort.conditioning.parents)) {
      model.variables.set(catalogId, studyId.replace('nafld', 'fatty_liver').replaceAll('_', ' '));
    }
  } else {
    model.variables.set(variableName, candidate.phenotype);
  }
}

function compileModel(model, review) {
  const { cohort, entries } = model;
  const estimatesFor = candidate => new Map(Object.keys(candidate.estimates).map(givenState => [
    givenState,
    getConditionalEvidence(review, {
      variableName: candidate.variableName, cohortId: model.id, direction: cohort.direction, givenState,
    }),
  ]));
  const [first] = entries.values();
  if (cohort.direction === CONDITION_GIVEN_T2D) {
    model.likelihoods = new Map();
    for (const entry of entries.values()) {
      const estimates = estimatesFor(entry);
      if (estimates.has('present') && estimates.has('absent')) {
        model.likelihoods.set(entry.variableName, estimates);
      }
    }
    model.mode = model.likelihoods.size ? 'bayes' : 'reference';
  } else {
    model.rows = [...estimatesFor(first)].map(([state, estimate]) => ({
      estimate,
      assignments: cohort.conditioning
        ? Object.entries(estimate.parentStates).map(([id, value]) => [cohort.conditioning.parents[id], value])
        : [[first.variableName, state]],
    }));
    model.mode = cohort.endpointKind === 'observed_followup_fraction' ? 'reference' : 'conditional';
  }
}

export function compileDiabetesNetwork(records, review) {
  const nodes = new Map(records.map(record => [record.variableName, {
    id: record.variableName,
    code: record.code,
    label: record.title,
    kind: 'icd',
    sources: review.probabilities.get(record.variableName) ?? [],
    associations: review.associations.get(record.variableName) ?? [],
    sourceUrl: './?' + new URLSearchParams({ evidence: record.code }) + '#catalog',
  }]));
  const additionalAgeFields = AGE_SCALES.slice(1).map(scale => lookupChartVariable(scale.id));
  for (const field of [...CHART_FIELDS, ...additionalAgeFields, ...AGE_VARIABLES]) {
    if (field.role !== 'evidence') continue;
    nodes.set(field.id, {
      id: field.id, kind: 'chart', label: field.label, field, sources: [], associations: [],
      sourceUrl: './chart.html#source-title',
    });
  }
  const models = new Map();
  for (const candidates of review.probabilities.values()) {
    for (const candidate of candidates) addModel(models, candidate);
  }
  const edges = [];
  for (const model of models.values()) {
    compileModel(model, review);
    for (const variable of model.variables.keys()) {
      const direct = model.cohort.direction !== CONDITION_GIVEN_T2D;
      edges.push({
        from: direct ? variable : model.outcomeId,
        to: direct ? model.outcomeId : variable,
        cohortId: model.id,
        mode: model.mode,
        sourceUrl: model.paper.article,
      });
    }
    nodes.set(model.outcomeId, {
      id: model.outcomeId, kind: 'outcome', label: 'Type 2 diabetes',
      sources: [...model.entries.values()], associations: [], sourceUrl: model.paper.article,
    });
  }
  return { nodes, edges, models, associationSource: review.claimsSource };
}

export function setDiabetesObservation(network, observations, nodeId, value) {
  const node = network.nodes.get(nodeId);
  if (!node || node.kind === 'outcome') throw new Error('Unknown observation node.');
  if (value === 'unknown' || value === '' || value === 'Unknown' || value === 'Declined') {
    observations.delete(nodeId);
    return;
  }
  const field = node.field;
  if (field?.type === 'enum') {
    if (!field.options.includes(value)) throw new Error('Choose a listed chart value.');
  } else if (field?.type === 'age' || field?.type === 'number') {
    value = Number(value);
    const min = field.type === 'age' ? 0 : field.min;
    const max = (field.type === 'age' ? field.scale.max : field.max) ?? Infinity;
    if (!Number.isFinite(value) || value < (min ?? -Infinity) || value > max ||
        ((field.type === 'age' || field.integer) && !Number.isInteger(value))) {
      throw new Error('Enter a value in the displayed range.');
    }
  } else if (value !== 'present' && value !== 'absent') {
    throw new Error('Choose present, absent or unknown.');
  }
  if (field?.type === 'age' || (field?.type === 'age_state' && value === 'present')) {
    for (const id of observations.keys()) {
      const previous = network.nodes.get(id)?.field?.type;
      if (previous === 'age' || previous === 'age_state') observations.delete(id);
    }
  }
  observations.set(nodeId, value);
}

export function readChartObservations(network, snapshot) {
  if (snapshot?.schemaVersion !== CHART_SCHEMA_VERSION || !Array.isArray(snapshot.nodes)) {
    throw new TypeError('Invalid chart snapshot.');
  }
  const groups = new Map();
  for (const [index, entry] of snapshot.nodes.entries()) {
    if (!entry || entry.role !== 'evidence') continue;
    const node = network.nodes.get(entry.variableName) ?? network.nodes.get(entry.fieldId);
    if (!node || node.kind === 'outcome') continue;
    const isStructured = !node.field || ['enum', 'age', 'number'].includes(node.field.type);
    const isFinding = entry.value === 'present' || entry.value === 'absent';
    const value = entry.observationStatus === 'unresolved' || entry.value === 'uncertain' ? 'unknown' :
      isStructured || isFinding ? entry.value : 'present';
    if (!groups.has(node.id)) groups.set(node.id, []);
    groups.get(node.id).push({
      value, recordedValue: entry.value, unit: entry.unit, label: entry.label,
      recordedOn: entry.recordedOn, code: entry.source?.code, chartEntry: index + 1,
    });
  }
  const observations = new Map();
  const provenance = new Map();
  for (const [id, entries] of groups) {
    const values = new Set(entries.map(entry => entry.value));
    const conflict = values.size > 1;
    if (!conflict) setDiabetesObservation(network, observations, id, entries[0].value);
    provenance.set(id, { entries, conflict });
  }
  return { observations, provenance };
}

export function applyDiabetesOverrides(network, chartObservations, overrides) {
  const observations = new Map(chartObservations);
  for (const [id, value] of overrides) {
    setDiabetesObservation(network, observations, id, value);
  }
  return observations;
}

function evaluateConditional(model, observations) {
  const observed = [...model.variables.keys()].filter(id => observations.has(id));
  const compatible = model.rows.filter(row => row.assignments.every(([id, value]) =>
    !observations.has(id) || observations.get(id) === value
  ));
  if (!observed.length) return { status: 'awaiting-findings' };
  if (!compatible.length) return { status: 'missing-row' };
  const missing = [...model.variables.keys()].filter(id => !observations.has(id));
  if (missing.length) {
    const estimates = compatible.map(row => row.estimate);
    const values = estimates.map(estimate => estimate.probability);
    return { status: 'partial', missing, estimates, range: [Math.min(...values), Math.max(...values)] };
  }
  const { estimate } = compatible[0];
  return { status: 'estimate', probability: estimate.probability, estimate };
}

function evaluateBayes(model, observations, prior) {
  const active = [...model.likelihoods].filter(([id]) => observations.has(id));
  if (!active.length) {
    return prior === null ? { status: 'awaiting-findings' } : { status: 'baseline', probability: prior };
  }
  if (prior === null) return { status: 'baseline-required' };
  const updates = [];
  for (const [id, likelihoods] of active) {
    const state = observations.get(id);
    const withDiabetes = likelihoods.get('present');
    const withoutDiabetes = likelihoods.get('absent');
    const a = state === 'present' ? withDiabetes.probability : 1 - withDiabetes.probability;
    const b = state === 'present' ? withoutDiabetes.probability : 1 - withoutDiabetes.probability;
    const mass = prior * a + (1 - prior) * b;
    updates.push({
      variableName: id, state, estimate: withDiabetes, withoutDiabetes,
      prior, likelihoodWith: a, likelihoodWithout: b,
      probability: mass > 0 ? prior * a / mass : null,
    });
  }
  if (updates.length > 1) return { status: 'joint-unavailable', updates };
  const [update] = updates;
  return { status: update.probability === null ? 'incompatible' : 'estimate', ...update };
}

export function evaluateDiabetes(network, modelId, observations, prior = null) {
  const model = network.models.get(modelId);
  if (!model) throw new Error('Unknown diabetes cohort.');
  if (model.mode === 'reference') return { status: 'reference' };
  if (model.mode === 'conditional') return evaluateConditional(model, observations);
  if (prior !== null && (!Number.isFinite(prior) || prior <= 0 || prior >= 1)) {
    throw new RangeError('Scenario baseline must be between 0% and 100%, excluding endpoints.');
  }
  return evaluateBayes(model, observations, prior);
}
