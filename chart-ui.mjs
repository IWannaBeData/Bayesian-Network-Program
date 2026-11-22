import { CHART_FIELDS, CHART_SECTIONS, AGE_SCALES, ageValueLabel, VOCABULARIES, lookupChartVariable } from './chart-variables.mjs';
import {
  buildChartNetwork, createChartNode, FINDING_STATES, readChartCase, saveChartCase, selectChartNode,
} from './chart-network.mjs';
import { indexCatalog } from './catalog.mjs';
import { loadCatalogRecords } from './catalog-loader.mjs';

const get = id => document.getElementById(id);
const form = get('chart-form');
const search = get('field-search');
const fieldSelect = get('chart-field');
const controls = get('variable-controls');
const preview = get('variable-preview');
const message = get('chart-message');
const add = get('add-chart-node');
const download = get('export-chart');
const sendDiabetes = get('send-diabetes');
const nodesList = get('chart-nodes');
const metadataList = get('chart-metadata');
const incomingCode = new URLSearchParams(location.search).get('icd10cm');
let selection = [];
let catalogRequest;
let submitting = false;

function saveSelection() {
  try {
    saveChartCase(sessionStorage, selection);
    return true;
  } catch {
    messageText('This browser could not share the chart with the Diabetes Network.', true);
    return false;
  }
}

function element(tag, text) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  return item;
}

function labeled(label, control) {
  const wrapper = element('label');
  wrapper.append(label, control);
  return wrapper;
}

function input(name, type = 'text', attributes = {}) {
  const control = element('input');
  control.name = name;
  control.type = type;
  control.autocomplete = 'off';
  Object.assign(control, attributes);
  return control;
}

function select(name, options, initial = '') {
  const control = element('select');
  control.name = name;
  for (const [value, label] of options) {
    const option = element('option', label);
    option.value = value;
    control.append(option);
  }
  control.value = initial;
  return control;
}

function messageText(text, error = false) {
  message.textContent = text;
  message.classList.toggle('error', error);
}

function fieldMenu(initial) {
  const previous = initial ?? fieldSelect.value;
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  fieldSelect.replaceChildren();
  for (const section of CHART_SECTIONS) {
    const eligible = section.fields.filter(field => {
      const haystack = [section.label, field.label, field.id, field.keywords].join(' ').toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
    if (!eligible.length) continue;
    const group = element('optgroup');
    group.label = section.label;
    for (const field of eligible) {
      const opt = element('option', field.label);
      opt.value = field.id;
      group.append(opt);
    }
    fieldSelect.append(group);
  }
  if ([...fieldSelect.options].some(option => option.value === previous)) fieldSelect.value = previous;
  setFieldControls();
}

function resultControls() {
  const group = element('div');
  group.className = 'result-controls';
  const kind = select('resultType', [['number', 'Quantity'], ['text', 'Text or qualitative result']], 'number');
  const comparator = select('comparator', [['=', '='], ['<', '<'], ['<=', '≤'], ['>', '>'], ['>=', '≥']], '=');
  const value = input('result', 'number', { required: true, step: 'any' });
  const unit = input('unit', 'text', { placeholder: 'Use the source unit, e.g. mg/dL' });
  const comparatorRow = labeled('Comparator', comparator);
  const unitRow = labeled('Unit (optional)', unit);
  kind.addEventListener('change', () => {
    const quantity = kind.value === 'number';
    value.value = '';
    value.type = quantity ? 'number' : 'text';
    comparatorRow.hidden = !quantity;
    unitRow.hidden = !quantity;
    comparator.disabled = !quantity;
    unit.disabled = !quantity;
  });
  group.append(labeled('Result type', kind), comparatorRow, labeled('Result value', value), unitRow);
  return group;
}

function codedControls(field) {
  const systems = field.systems.map(name => [name, VOCABULARIES[name].label]);
  const system = select('system', systems, systems[0][0]);
  const code = input('code', 'text', { required: true });
  const title = input('label', 'text');
  const help = element('p');
  help.className = 'field-help';
  function setCodeHelp() {
    code.placeholder = system.value === 'icd10cm' ? 'e.g. E11.9' :
      system.value === 'local' ? 'e.g. intermittent ear fullness' : 'Enter the recorded identifier';
    help.textContent = system.value === 'icd10cm'
      ? 'Use a reportable code from the full ICD-10-CM catalog.'
      : 'Enter the code from the chart. Use an uncoded term when no code is documented.';
  }
  system.addEventListener('change', setCodeHelp);
  setCodeHelp();
  controls.append(labeled('Vocabulary', system), labeled('Code or term', code), help,
    labeled('Display label (optional)', title));
  if (field.relationships) {
    const relatives = [['', 'Select relationship'], ...field.relationships.map(name => [name, name])];
    const relation = select('relationship', relatives);
    relation.required = true;
    controls.append(labeled('Relative’s relationship', relation));
  }
  if (field.result) {
    controls.append(resultControls());
  } else {
    const labels = ['Present', 'Explicitly absent', 'Uncertain', 'Unknown'];
    controls.append(labeled('Chart finding status', select('findingState',
      FINDING_STATES.map((value, i) => [value, labels[i]]), 'present')));
  }
}

function ageControls() {
  const units = select('ageUnit', AGE_SCALES.map(scale => [scale.unit, 'Completed ' + scale.unit]), 'years');
  const value = select('value', []);
  value.required = true;

  function setAges() {
    const scale = AGE_SCALES.find(item => item.unit === units.value);
    const ages = Array.from({ length: scale.max + 1 }, (_, age) => {
      const option = element('option', ageValueLabel(age, scale));
      option.value = String(age);
      return option;
    });
    const placeholder = element('option', 'Choose an age');
    placeholder.value = '';
    value.replaceChildren(placeholder, ...ages);
    value.value = '';
  }

  units.addEventListener('change', setAges);
  setAges();
  controls.append(labeled('Age unit', units), labeled('Completed age', value));
}

function setFieldControls() {
  const field = lookupChartVariable(fieldSelect.value);
  const key = form.elements.namedItem('recordKey');
  const isAge = field?.type === 'age';
  controls.replaceChildren();
  key.disabled = isAge || !field;
  if (key.disabled) key.value = '';
  get('record-key-label').hidden = key.disabled;
  get('record-key-help').hidden = key.disabled;
  get('chart-context').hidden = !field;
  add.disabled = !field || submitting;
  get('field-help').textContent = field
    ? (field.role === 'metadata' ? 'Stored with the chart metadata.' : '')
    : 'No chart fields match your search.';
  if (!field) return updatePreview();

  if (field.type === 'age') {
    ageControls();
  } else if (field.type === 'number') {
    const value = input('value', 'number', { required: true, step: field.integer ? '1' : 'any' });
    if (field.min !== undefined) value.min = field.min;
    if (field.max !== undefined) value.max = field.max;
    controls.append(labeled(field.unit ? 'Value (' + field.unit + ')' : 'Value', value));
  } else if (field.type === 'enum') {
    const value = select('value', [['', 'Choose a recorded value'], ...field.options.map(item => [item, item])]);
    value.required = true;
    controls.append(labeled('Recorded value', value));
  } else if (field.type === 'code') {
    codedControls(field);
  } else if (field.type === 'date') {
    controls.append(labeled('Date', input('value', 'date', { required: true })));
  } else {
    if (field.type === 'custom') {
      controls.append(labeled('Field identifier', input('key', 'text', {
        required: true, placeholder: 'e.g. visual_aura_pattern', pattern: '[a-z][a-z0-9_]*',
      })), labeled('Field label', input('label', 'text', { required: true })));
    }
    const value = element('textarea');
    value.name = 'value';
    value.required = true;
    value.rows = 2;
    controls.append(labeled('Chart value', value));
  }
  messageText('');
  updatePreview();
}

function updatePreview() {
  try {
    const node = createChartNode(fieldSelect.value, Object.fromEntries(new FormData(form)));
    preview.textContent = node.id;
  } catch {
    preview.textContent = lookupChartVariable(fieldSelect.value)?.id ?? '—';
  }
}

function terminology() {
  if (!catalogRequest) {
    catalogRequest = loadCatalogRecords().then(records => indexCatalog(records)).catch(error => {
      catalogRequest = undefined;
      throw error;
    });
  }
  return catalogRequest;
}

function displayValue(node) {
  const value = node.value;
  if (value?.type === 'quantity') {
    return (value.comparator === '=' ? '' : value.comparator + ' ') + value.value +
      (value.unit ? ' ' + value.unit : '');
  }
  if (value?.type === 'text') return value.value;
  return String(value) + (node.unit ? ' ' + node.unit : '');
}

function card(node, index) {
  const row = element('li');
  if (node.role === 'evidence') row.id = 'chart-entry-' + (index + 1);
  const label = element('strong', node.label);
  const id = element('code', node.id);
  const value = element('p', displayValue(node));
  row.append(label, id, value);
  const extra = [
    node.source && VOCABULARIES[node.source.system].label + ' ' + node.source.code,
    node.recordedOn && 'Recorded ' + node.recordedOn,
    node.recordKey && 'Record ' + node.recordKey,
  ].filter(Boolean);
  if (extra.length) row.append(element('p', extra.join(' · ')));
  if (node.source?.system === 'icd10cm') {
    const evidence = element('a', 'Review diabetes evidence');
    evidence.href = './?' + new URLSearchParams({ evidence: node.source.code }) + '#catalog';
    evidence.target = '_blank';
    evidence.rel = 'noopener';
    row.append(evidence);
  }
  const remove = element('button', 'Remove');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Remove ' + node.id);
  remove.addEventListener('click', () => {
    selection = selection.filter(item => item.id !== node.id);
    renderSelection();
    add.focus();
    if (saveSelection()) messageText('Removed ' + node.id + '.');
  });
  row.append(remove);
  return row;
}

function renderSelection() {
  const snapshot = buildChartNetwork(selection);
  nodesList.replaceChildren(...snapshot.nodes.map(card));
  metadataList.replaceChildren(...snapshot.metadata.map(card));
  get('node-totals').textContent = snapshot.nodes.length.toLocaleString() +
    (snapshot.nodes.length === 1 ? ' node' : ' nodes');
  get('empty-nodes').hidden = Boolean(snapshot.nodes.length);
  get('metadata-panel').hidden = !snapshot.metadata.length;
  get('metadata-count').textContent = '(' + snapshot.metadata.length + ')';
  download.disabled = !selection.length;
  sendDiabetes.disabled = !snapshot.nodes.length;
}

search.addEventListener('input', () => fieldMenu());
fieldSelect.addEventListener('change', setFieldControls);
form.addEventListener('input', updatePreview);
form.addEventListener('change', updatePreview);
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  const field = fieldSelect.value;
  const fields = Object.fromEntries(new FormData(form));
  submitting = true;
  add.disabled = true;
  try {
    if (fields.system === 'icd10cm') messageText('Checking the ICD-10-CM catalog…');
    const index = fields.system === 'icd10cm' ? await terminology() : undefined;
    const node = createChartNode(field, fields, index);
    const priorSize = selection.length;
    selection = selectChartNode(selection, node);
    renderSelection();
    if (saveSelection()) messageText((selection.length === priorSize ? 'Updated ' : 'Added ') + node.id + '.');
  } catch (error) {
    messageText(error.message, true);
  } finally {
    submitting = false;
    add.disabled = !fieldSelect.value;
  }
});

download.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(buildChartNetwork(selection), null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = element('a');
  anchor.href = url;
  anchor.download = 'chart-network.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

sendDiabetes.addEventListener('click', () => {
  if (saveSelection()) location.assign('./diabetes.html');
});

get('registry-summary').textContent = CHART_FIELDS.length + ' predefined fields across ' +
  CHART_SECTIONS.length + ' chart sections, alongside the full ICD-10-CM catalog and custom fields.';
fieldMenu(incomingCode ? 'diagnosis' : undefined);
if (incomingCode) {
  form.elements.namedItem('code').value = incomingCode;
  updatePreview();
}
try {
  selection = readChartCase(sessionStorage).nodes;
  renderSelection();
  const chartEntry = /^#chart-entry-(\d+)$/.exec(location.hash);
  if (chartEntry) get('chart-entry-' + chartEntry[1])?.scrollIntoView();
} catch {
  messageText('This browser could not load the shared chart case.', true);
}
