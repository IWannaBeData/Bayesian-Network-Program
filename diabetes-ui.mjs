import { indexCatalog } from './catalog.mjs';
import { loadCatalogRecords } from './catalog-loader.mjs';
import { createEvidenceReview } from './t2d-evidence.mjs';
import { diagnosisSearchTerms } from './pubmed-query.mjs';
import { readChartCase } from './chart-network.mjs';
import {
  DIABETES_CASE_KEY, applyDiabetesOverrides, compileDiabetesNetwork, evaluateDiabetes,
  readChartObservations, setDiabetesObservation,
} from './diabetes-network.mjs';

const get = id => document.getElementById(id);
const cohortPicker = get('diabetes-cohort');
const priorField = get('diabetes-prior');
const search = get('finding-search');
const shown = new Set();
const baselineByCohort = new Map();
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 });
const count = new Intl.NumberFormat('en-US');
const defaultCohort = 'kangbuk_samsung_gdm_nafld_5y';
let network;
let model;
let observations = new Map();
let chartObservations = new Map();
let chartOrigins = new Map();
let overrides = new Map();
let searchable;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(label, url, newTab = false) {
  const node = element('a', label);
  node.href = url;
  if (newTab) {
    node.target = '_blank';
    node.rel = 'noopener';
  }
  return node;
}

function caseMessage(message) {
  const note = get('chart-import-status');
  note.textContent = message;
  note.hidden = !message;
}

function saveNetworkCase() {
  try {
    const state = { overrides: [...overrides], baselines: [...baselineByCohort], shown: [...shown], cohort: model.id };
    sessionStorage.setItem(DIABETES_CASE_KEY, JSON.stringify(state));
  } catch {
    caseMessage('Network entries will stay on this page. Browser session storage is unavailable.');
  }
}

function labeledLinks(...links) {
  const row = element('p', '', 'sources');
  for (const [index, item] of links.entries()) {
    if (index) row.append(' · ');
    row.append(item);
  }
  return row;
}

function nodeLabel(node) {
  const label = model.variables.get(node.id) ?? node.label;
  return node.code ? label + ' · ' + node.code : label;
}

function chartValue(entry) {
  const value = entry.recordedValue;
  if (entry.value === 'unknown') return value === 'uncertain' ? 'Uncertain' : value === 'Declined' ? 'Declined' : 'Unknown';
  if (value?.type === 'quantity') {
    return [value.comparator === '=' ? null : value.comparator, value.value, value.unit].filter(part => part != null).join(' ');
  }
  if (value?.type === 'text') return value.value;
  if (value === 'present' || value === 'absent') return value === 'present' ? 'Yes' : 'No';
  return [value, entry.unit].filter(part => part != null).join(' ');
}

function outlineFinding(node, origin, details) {
  const value = observations.get(node.id);
  const override = overrides.has(node.id);
  details.replaceChildren(element('summary', 'Value and sources'));
  if (override) details.append(element('p', 'The current value was set on the Diabetes Network.'));
  if (origin) {
    if (origin.conflict) details.append(element('p', 'The chart entries differ. Review their dates before choosing a value.'));
    for (const entry of origin.entries) {
      const description = [entry.label, entry.code, entry.recordedOn, chartValue(entry)].filter(Boolean).join(' · ');
      details.append(element('p', description),
        labeledLinks(link('Open this chart entry', './chart.html#chart-entry-' + entry.chartEntry)));
    }
    if (override) {
      const reset = element('button', 'Use chart value');
      reset.type = 'button';
      reset.addEventListener('click', () => {
        overrides.delete(node.id);
        updateObservations();
        renderFindings();
        get('node-' + node.id)?.querySelector('details').setAttribute('open', '');
        renderEstimate();
        saveNetworkCase();
      });
      details.append(reset);
    }
  } else if (!override && value === undefined) {
    details.append(element('p', 'This finding is undocumented.'));
  }
  if (!model.variables.has(node.id)) {
    details.append(element('p', 'The selected study has no parameter for this finding.'));
  }
  const label = node.kind === 'icd' ? 'Review linked evidence' : 'Review chart field definitions';
  details.append(labeledLinks(link('Link to this finding', '#node-' + node.id), link(label, node.sourceUrl, true)));
  for (const source of node.sources) {
    details.append(labeledLinks(link(source.cohort.cohortLabel, '#estimate-' + source.cohort.id),
      link(source.support.location, source.paper.pdf, true)));
  }
}

function findingControl(node) {
  const field = node.field;
  const value = observations.get(node.id);
  if (field?.type === 'number' || field?.type === 'age') {
    const input = element('input');
    input.type = 'number';
    if (field.type === 'age') {
      input.min = '0';
      input.max = String(field.scale.max);
      input.placeholder = field.scale.unit;
    } else {
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      input.placeholder = field.unit || 'Unknown';
    }
    input.step = field.type === 'age' || field.integer ? '1' : 'any';
    input.value = value ?? '';
    return input;
  }
  const control = element('select');
  const choices = field?.type === 'enum'
    ? [['unknown', 'Unknown'], ...field.options.filter(option => !['Unknown', 'Declined'].includes(option)).map(option => [option, option])]
    : [['unknown', 'Unknown'], ['present', field?.result || ['code', 'date', 'text', 'custom'].includes(field?.type) ? 'Recorded' : 'Yes'],
      ['absent', 'No']];
  for (const [state, label] of choices) {
    const option = element('option', label);
    option.value = state;
    control.append(option);
  }
  control.value = value ?? 'unknown';
  return control;
}

function findingRow(id) {
  const node = network.nodes.get(id);
  const row = element('div', '', 'finding-row');
  row.id = 'node-' + id;
  const head = element('div', '', 'finding-heading');
  const label = element('label', nodeLabel(node));
  const control = findingControl(node);
  const details = element('details');
  control.id = 'finding-' + id;
  label.htmlFor = control.id;
  head.append(label, control);
  row.append(head, details);
  outlineFinding(node, chartOrigins.get(id), details);
  control.addEventListener('change', () => {
    control.setCustomValidity('');
    try {
      const changes = new Map(overrides);
      // Reinsert so the most recent age selection wins over earlier age observations.
      changes.delete(id);
      changes.set(id, control.value);
      observations = applyDiabetesOverrides(network, chartObservations, changes);
      overrides = changes;
      if (['age', 'age_state'].includes(node.field?.type)) {
        renderFindings();
        get(control.id)?.focus();
      } else {
        outlineFinding(node, chartOrigins.get(id), details);
      }
      get('clear-findings').disabled = overrides.size === 0;
      renderEstimate();
      saveNetworkCase();
    } catch (error) {
      control.setCustomValidity(error.message);
      control.reportValidity();
    }
  });
  return row;
}

function updateObservations() {
  observations = applyDiabetesOverrides(network, chartObservations, overrides);
  get('clear-findings').disabled = overrides.size === 0;
}

function renderFindings() {
  get('model-findings').replaceChildren(...[...model.variables.keys()].map(findingRow));
  const extra = [...new Set([...chartOrigins.keys(), ...shown])].filter(id => !model.variables.has(id));
  get('other-findings').replaceChildren(...extra.map(findingRow));
}

function renderMatches() {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = get('finding-results');
  results.replaceChildren();
  if (!terms.length) return;
  let matches = 0;
  for (const [id, haystack] of searchable) {
    if (shown.has(id) || chartOrigins.has(id) || model.variables.has(id) || !terms.every(term => haystack.includes(term))) continue;
    const node = network.nodes.get(id);
    const item = element('li');
    const button = element('button', nodeLabel(node));
    button.type = 'button';
    button.addEventListener('click', () => {
      shown.add(id);
      search.value = '';
      renderFindings();
      renderMatches();
      get('finding-' + id)?.focus();
      saveNetworkCase();
    });
    item.append(button);
    results.append(item);
    if (++matches === 10) break;
  }
  if (!matches) results.append(element('li', 'No additional matches.', 'diabetes-muted'));
}

function appendFormula(parent, result) {
  const { prior, likelihoodWith, likelihoodWithout, variableName, state } = result;
  const condition = state === 'present' ? 'present' : 'absent';
  parent.append(
    element('p', 'P(finding ' + condition + ' | diabetes) = ' + percent.format(likelihoodWith)),
    element('p', 'P(finding ' + condition + ' | no diabetes) = ' + percent.format(likelihoodWithout)),
    element('p', 'P(diabetes | finding) = ' + percent.format(prior) + ' × ' + percent.format(likelihoodWith) +
      ' ÷ [' + percent.format(prior) + ' × ' + percent.format(likelihoodWith) + ' + ' +
      percent.format(1 - prior) + ' × ' + percent.format(likelihoodWithout) + ']', 'formula'),
    labeledLinks(link('Finding status', '#node-' + variableName), link('Scenario baseline', '#diabetes-prior'),
      link('Review both likelihoods', network.nodes.get(variableName).sourceUrl, true)),
    element('p', result.estimate.support.location),
    ...result.estimate.support.values.map(value => element('p', value)),
  );
}

function displayResult(result) {
  if (result.range) return result.range.map(value => percent.format(value)).join('–');
  return Number.isFinite(result.probability) ? percent.format(result.probability) : undefined;
}

function renderRelatedEstimates() {
  const list = get('related-estimates');
  const rows = [];
  for (const entry of network.models.values()) {
    if (entry === model || ![...entry.variables.keys()].some(id => observations.has(id))) continue;
    const input = Number(baselineByCohort.get(entry.id)) / 100;
    const result = evaluateDiabetes(network, entry.id, observations, input > 0 && input < 1 ? input : null);
    const value = displayResult(result) ?? {
      'baseline-required': 'Baseline needed',
      'joint-unavailable': 'Individual updates available',
      'missing-row': 'No matching study row',
      'incompatible': 'Incompatible scenario',
      reference: 'Descriptive evidence',
    }[result.status];
    const row = element('li');
    row.append(link(entry.cohort.cohortLabel, '#estimate-' + entry.id));
    if (value) row.append(' · ' + value);
    rows.push(row);
  }
  list.replaceChildren(...rows);
  get('related-estimate-panel').hidden = rows.length === 0;
}

function renderEstimate() {
  const resultbox = get('diabetes-result');
  const provenance = get('diabetes-provenance');
  const text = priorField.value.trim();
  const prior = text ? Number(text) / 100 : null;
  renderRelatedEstimates();
  let result;
  try {
    result = evaluateDiabetes(network, model.id, observations, prior);
  } catch (error) {
    resultbox.replaceChildren(element('p', error.message));
    provenance.replaceChildren();
    return;
  }

  const { status, estimate, updates } = result;
  const expanded = provenance.querySelector('details')?.open ?? false;
  const heading = {
    'awaiting-findings': 'Set a finding to Yes or No to update this estimate.',
    'missing-row': 'The study has no estimate for this combination.',
    partial: 'Range across the remaining study rows. Set the other finding for a single estimate.',
    reference: 'This source provides descriptive evidence for this cohort.',
    'baseline-required': 'Enter a baseline for this study population.',
    baseline: 'Scenario baseline',
    'joint-unavailable': 'A combined estimate requires joint data for these findings.',
    incompatible: 'The selected finding has zero probability under the scenario.',
    estimate: model.mode === 'bayes' ? 'Updated scenario probability' :
      model.cohort.endpointKind === 'cumulative_incidence' ? 'Study-specific cumulative incidence' : 'Study-specific prevalence',
  }[status];
  const display = displayResult(result);
  resultbox.replaceChildren();
  if (display) resultbox.append(element('p', display, 'estimate-number'));
  resultbox.append(element('p', heading));
  if (status === 'estimate' && estimate?.confidenceInterval95 && model.mode === 'conditional') {
    resultbox.append(element('p', '95% CI ' + estimate.confidenceInterval95.map(x => percent.format(x)).join('–'),
      'diabetes-muted'));
  }
  if (status === 'estimate' && model.mode === 'conditional') {
    resultbox.append(element('p', 'Given ' + estimate.givenLabel, 'diabetes-muted'));
  }

  const paper = model.paper;
  const details = element('details');
  details.open = expanded;
  details.append(element('summary', 'Calculation and source'));
  if (estimate && model.mode === 'conditional') {
    details.append(element('p', estimate.support.location));
    if (estimate.denominator !== undefined) {
      details.append(element('p', count.format(estimate.numerator) + ' ÷ ' + count.format(estimate.denominator) +
        ' ' + estimate.endpoint.denominatorUnit + ' = ' + display));
    } else {
      details.append(element('p', 'Published conditional estimate for this group = ' + display));
    }
    if (estimate.support.excerpt) details.append(element('p', estimate.support.excerpt));
    details.append(element('p', estimate.mapping));
  }
  if (status === 'partial') {
    for (const row of result.estimates) {
      details.append(element('p', row.givenLabel + ' · ' + percent.format(row.probability)));
    }
    details.append(element('p', result.estimates[0].support.location));
  }
  if (status === 'reference') {
    for (const entry of model.entries.values()) {
      details.append(element('p', entry.support.location),
        ...entry.support.values.map(value => element('p', value)));
    }
  }
  if (result.likelihoodWith !== undefined) appendFormula(details, result);
  details.append(element('p', model.cohort.population), element('p', model.cohort.limitations),
    element('p', paper.citation, 'sources'));
  const links = [link('Link to this estimate', '#estimate-' + model.id), link('Study', paper.article, true),
    link('PDF', paper.pdf, true)];
  for (const id of model.variables.keys()) {
    if (observations.has(id)) links.push(link(nodeLabel(network.nodes.get(id)), '#node-' + id));
  }

  provenance.replaceChildren(labeledLinks(...links), details);
  for (const update of updates ?? []) {
    const item = element('details');
    const label = nodeLabel(network.nodes.get(update.variableName));
    const value = update.probability === null ? 'unavailable' : percent.format(update.probability);
    item.append(element('summary', label + ' alone · ' + value));
    appendFormula(item, update);
    provenance.append(item);
  }
}

function selectCohort() {
  model = network.models.get(cohortPicker.value);
  priorField.value = baselineByCohort.get(model.id) ?? '';
  get('scenario-baseline').hidden = model.mode !== 'bayes';
  get('cohort-window').textContent = model.cohort.timeWindow;
  renderFindings();
  renderMatches();
  renderEstimate();
}

async function fetchAsset(path, type) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Could not load ' + path + '.');
  return response[type]();
}

function loadCase() {
  overrides.clear();
  shown.clear();
  baselineByCohort.clear();
  try {
    const imported = readChartObservations(network, readChartCase(sessionStorage));
    chartObservations = imported.observations;
    chartOrigins = imported.provenance;
    const size = chartOrigins.size;
    caseMessage(size ? count.format(size) + (size === 1 ? ' finding from the chart.' : ' findings from the chart.') : '');
    const state = JSON.parse(sessionStorage.getItem(DIABETES_CASE_KEY));
    if (!state) return false;
    const saved = new Map(state.overrides);
    applyDiabetesOverrides(network, chartObservations, saved);
    overrides = saved;
    for (const [id, baseline] of state.baselines) baselineByCohort.set(id, baseline);
    for (const id of state.shown) if (network.nodes.has(id)) shown.add(id);
    if (network.models.has(state.cohort)) cohortPicker.value = state.cohort;
    return true;
  } catch (error) {
    overrides.clear();
    caseMessage('The saved browser case could not be fully loaded.');
    return false;
  }
}

function followProvenanceLink() {
  const { hash } = location;
  if (hash.startsWith('#estimate-')) {
    const id = hash.slice('#estimate-'.length);
    if (!network.models.has(id)) return;
    cohortPicker.value = id;
    selectCohort();
    get('diabetes-provenance').querySelector('details')?.setAttribute('open', '');
    get('estimate-title').scrollIntoView();
    saveNetworkCase();
  } else if (hash.startsWith('#node-')) {
    const id = hash.slice('#node-'.length);
    const node = network.nodes.get(id);
    if (!node || node.kind === 'outcome') return;
    if (!get('node-' + id)) {
      shown.add(id);
      renderFindings();
      renderMatches();
    }
    const row = get('node-' + id);
    row.querySelector('details').open = true;
    row.scrollIntoView();
  }
}

async function initialize() {
  const [records, source, claims] = await Promise.all([
    loadCatalogRecords(),
    fetchAsset('./evidence/t2d-review.json', 'json'),
    fetchAsset('./evidence/klimek-2015-s2.csv', 'text'),
  ]);
  const review = createEvidenceReview(indexCatalog(records), source, claims);
  network = compileDiabetesNetwork(records, review);
  searchable = [...network.nodes.values()].filter(node => node.kind !== 'outcome').map(node => [
    node.id, [node.label, node.code, node.code?.replace('.', ''), node.id,
      ...(diagnosisSearchTerms[node.code?.replace('.', '')]?.synonyms ?? [])].filter(Boolean).join(' ').toLowerCase(),
  ]);

  const groups = new Map([
    ['cumulative_incidence', 'Future type 2 diabetes'],
    ['co_prevalence', 'Recorded type 2 diabetes'],
    ['bayes', 'Bayesian scenarios with a baseline'],
    ['reference', 'Descriptive evidence'],
  ].map(([key, label]) => {
    const group = element('optgroup');
    group.label = label;
    return [key, group];
  }));
  for (const entry of network.models.values()) {
    const group = entry.mode === 'conditional' ? entry.cohort.endpointKind : entry.mode;
    const option = element('option', entry.cohort.cohortLabel);
    option.value = entry.id;
    groups.get(group).append(option);
  }
  cohortPicker.append(...groups.values());
  cohortPicker.value = network.models.has(defaultCohort) ? defaultCohort : network.models.keys().next().value;
  const hasNetworkCase = loadCase();
  updateObservations();
  if (!hasNetworkCase && observations.size) {
    const applies = entry => entry.mode === 'conditional' &&
      [...entry.variables.keys()].some(id => observations.has(id));
    if (!applies(network.models.get(cohortPicker.value))) {
      const matching = [...network.models.values()].find(applies);
      if (matching) cohortPicker.value = matching.id;
    }
  }
  selectCohort();
  get('network-summary').textContent = count.format(network.nodes.size - network.models.size) +
    ' finding nodes · ' + count.format(network.models.size) + ' study endpoints';
  get('network-load').hidden = true;
  get('diabetes-workspace').hidden = false;
  followProvenanceLink();

  window.addEventListener('hashchange', followProvenanceLink);
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      loadCase();
      updateObservations();
      selectCohort();
      followProvenanceLink();
    }
  });
  cohortPicker.addEventListener('change', () => {
    if (location.hash.startsWith('#estimate-')) history.replaceState(null, '', location.pathname + location.search);
    selectCohort();
    saveNetworkCase();
  });
  priorField.addEventListener('input', () => {
    baselineByCohort.set(model.id, priorField.value);
    renderEstimate();
    saveNetworkCase();
  });
  search.addEventListener('input', renderMatches);
  get('clear-findings').addEventListener('click', () => {
    overrides.clear();
    shown.clear();
    updateObservations();
    renderFindings();
    renderMatches();
    renderEstimate();
    saveNetworkCase();
  });
}

initialize().catch(error => {
  const load = get('network-load');
  const retry = element('button', 'Retry');
  retry.addEventListener('click', () => location.reload());
  load.replaceChildren(error.message + ' ', retry);
});
