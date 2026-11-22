import { normalizeCode } from './catalog.mjs';
import { AGE_SCALES, ageValueLabel, lookupChartVariable, VOCABULARIES } from './chart-variables.mjs';

export const CHART_SCHEMA_VERSION = 'chart-variables-v1';
export const CHART_CASE_KEY = 'diagnostic-program-chart-v1';
export const FINDING_STATES = Object.freeze(['present', 'absent', 'uncertain', 'unknown']);

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Enter ' + label + '.');
  return value.trim();
}

function ageValue(field, input) {
  const scale = field.id === 'age_years' && input.ageUnit
    ? AGE_SCALES.find(item => item.unit === input.ageUnit)
    : field.scale;
  if (!scale) throw new TypeError('Select an age unit.');
  const value = field.type === 'age_state' ? field.value : numericValue(input.value, {
    label: 'age in completed ' + scale.unit, min: 0, max: scale.max, integer: true,
  });
  return {
    variableName: scale.prefix ? scale.prefix + value : scale.id,
    fieldId: scale.id,
    label: 'Age ' + ageValueLabel(value, scale),
    value,
    unit: scale.unit === 'days' ? 'd' : scale.unit,
    exclusiveGroup: 'age_years',
  };
}

function dateValue(value, label) {
  const date = requireText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date) {
    throw new TypeError('Enter a valid date for ' + label + '.');
  }
  return date;
}

function numericValue(input, field) {
  const raw = typeof input === 'number' ? String(input) : requireText(input, field.label);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) {
    throw new TypeError('Enter a number for ' + field.label + '.');
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || (field.integer && !Number.isSafeInteger(value)) ||
      (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
    throw new RangeError('Enter a value in the allowed range for ' + field.label + '.');
  }
  return value;
}

function localKey(value) {
  return Array.from(value.normalize('NFC').toLowerCase().replace(/\s+/g, ' '), char =>
    /^[a-z0-9]$/.test(char) ? char : '_' + char.codePointAt(0).toString(16) + '_',
  ).join('');
}

function labelKey(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const codePatterns = {
  snomedct: /^\d{6,18}$/,
  rxnorm: /^\d+$/,
  ndc: /^(?:\d{10,12}|\d{4,6}-\d{3,4}-\d{1,2})$/,
  loinc: /^(?:\d+-\d|LA\d+-\d|LP\d+-\d)$/i,
  cvx: /^\d{2,3}$/,
  cpt: /^(?:\d{5}|\d{4}[a-z]|[a-z]\d{4})$/i,
  hcpcs: /^[a-z]\d{4}$/i,
  icd10pcs: /^[0-9a-hj-np-z]{7}$/i,
  hgnc: /^(?:HGNC:)?\d+$/i,
  clinvar: /^(?:\d+|[rv]cv\d{9,}(?:\.\d+)?)$/i,
};

function normalizedCode(system, code) {
  if (system === 'icd10cm') return normalizeCode(code);
  if (system === 'local' || system === 'hgvs' || system === 'udi') return code;
  if (!codePatterns[system]?.test(code)) {
    throw new TypeError('Enter the ' + VOCABULARIES[system].label + ' code as documented.');
  }
  if (system === 'hgnc') return code.toUpperCase().replace(/^HGNC:/, '');
  if (system === 'cvx') return String(Number(code));
  return code.toUpperCase();
}

function measurement(input) {
  if (input.resultType === 'number') {
    const comparator = input.comparator ?? '=';
    if (!['=', '<', '<=', '>', '>='].includes(comparator)) throw new TypeError('Select a result comparator.');
    return { type: 'quantity', value: numericValue(input.result, { label: 'the result' }),
      unit: input.unit?.trim() || null, comparator };
  }
  if (input.resultType !== 'text') throw new TypeError('Select a result type.');
  return { type: 'text', value: requireText(input.result, 'the reported result') };
}

function codedValue(field, input, terminology) {
  const system = input.system;
  if (!field.systems.includes(system)) throw new TypeError('Select a vocabulary for this field.');
  const sourceCode = requireText(input.code, system === 'local' ? 'a term or local code' : 'the source code');
  const canonical = normalizedCode(system, sourceCode);
  const catalogRecord = system === 'icd10cm' && terminology?.get(canonical);
  if (system === 'icd10cm' && terminology && !catalogRecord?.reportable) {
    throw new TypeError('Choose a reportable code in the pinned ICD-10-CM catalog.');
  }
  if (field.relationships && !field.relationships.includes(input.relationship)) {
    throw new TypeError('Select the relative’s relationship.');
  }
  const relationship = field.relationships ? input.relationship : null;
  const token = system === 'hgvs' || system === 'udi'
    ? Array.from(canonical, char => char.codePointAt(0).toString(16)).join('_')
    : system === 'local' ? localKey(canonical) : labelKey(canonical);
  const conceptId = system + '_' + token;
  const context = field.id + (relationship ? '_' + labelKey(relationship) : '');
  const isPatientICD = field.reuseICD && system === 'icd10cm';
  const label = input.label?.trim() || catalogRecord?.title || sourceCode;
  const base = {
    variableName: isPatientICD ? conceptId : context + '_' + conceptId,
    label: isPatientICD || field.result || field.id === 'custom_finding'
      ? label : field.label + ' · ' + (relationship ? relationship + ' · ' : '') + label,
    relationship,
    source: {
      system,
      systemUri: VOCABULARIES[system].uri ?? null,
      code: catalogRecord?.code ?? sourceCode,
      originalCode: sourceCode,
      conceptId,
      display: label,
      version: catalogRecord?.version ?? (input.version?.trim() || null),
      verification: catalogRecord ? 'pinned_catalog' : 'chart_supplied',
    },
  };
  if (field.result) return { ...base, value: measurement(input) };
  const value = input.findingState ?? 'present';
  if (!FINDING_STATES.includes(value)) throw new TypeError('Select the documented finding status.');
  return { ...base, value, states: FINDING_STATES };
}

function fieldValue(field, input, terminology) {
  switch (field.type) {
    case 'age_state':
    case 'age': return ageValue(field, input);
    case 'number': return { value: numericValue(input.value, field), unit: field.unit ?? null };
    case 'date': return { value: dateValue(input.value, field.label) };
    case 'code': return codedValue(field, input, terminology);
    case 'enum':
      if (!field.options.includes(input.value)) throw new TypeError('Select a value for ' + field.label + '.');
      return { value: input.value, states: field.options, exclusiveGroup: field.id };
    case 'custom': {
      const key = requireText(input.key, 'a field identifier');
      if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new TypeError('Use lowercase letters, numbers and underscores in the ID.');
      return { variableName: 'custom_field_' + key, label: requireText(input.label, 'a field label'),
        value: requireText(input.value, 'the chart value') };
    }
    default: return { value: requireText(input.value, field.label) };
  }
}

export function createChartNode(fieldId, input = {}, terminology) {
  const field = lookupChartVariable(fieldId);
  if (!field) throw new TypeError('Unknown chart field ' + fieldId + '.');
  const data = fieldValue(field, input, terminology);
  const variableName = data.variableName ?? field.id;
  const recordKey = input.recordKey?.trim() || null;
  if (recordKey && !/^[a-z][a-z0-9_]*$/.test(recordKey)) {
    throw new TypeError('Use a lowercase record key such as lab_1.');
  }
  const recordedOn = input.recordedOn ? dateValue(input.recordedOn, 'recorded date') : null;
  const isAge = data.exclusiveGroup === 'age_years';
  if (isAge && recordKey) throw new TypeError('Select one age for this chart snapshot.');
  const instance = isAge ? '' : recordKey ? '__record_' + recordKey : recordedOn
    ? '__date_' + recordedOn.replaceAll('-', '') : '';
  return {
    id: variableName + instance,
    variableName,
    fieldId: data.fieldId ?? field.id,
    label: data.label ?? field.label,
    role: field.role,
    section: field.section,
    value: data.value,
    unit: data.unit ?? null,
    source: data.source ?? null,
    relationship: data.relationship ?? null,
    observationStatus: ['Unknown', 'Declined', 'unknown', 'uncertain'].includes(data.value)
      ? 'unresolved' : 'recorded',
    recordedOn,
    recordKey,
    exclusiveGroup: data.exclusiveGroup ? data.exclusiveGroup + instance : null,
    states: data.states ?? null,
    parents: [],
    parameterSetId: null,
  };
}

export function selectChartNode(selection, node) {
  const matching = selection.findIndex(old => old.id === node.id ||
    (node.exclusiveGroup && old.exclusiveGroup === node.exclusiveGroup));
  if (matching < 0) return [...selection, node];
  return selection.map((old, index) => index === matching ? node : old);
}

export function buildChartNetwork(selection) {
  return {
    schemaVersion: CHART_SCHEMA_VERSION,
    nodes: selection.filter(node => node.role === 'evidence'),
    edges: [],
    metadata: selection.filter(node => node.role === 'metadata'),
  };
}

export function readChartCase(storage) {
  const snapshot = JSON.parse(storage.getItem(CHART_CASE_KEY));
  if (snapshot === null) return buildChartNetwork([]);
  if (snapshot.schemaVersion !== CHART_SCHEMA_VERSION || !Array.isArray(snapshot.nodes)) {
    throw new TypeError('Invalid chart case.');
  }
  return snapshot;
}

export function saveChartCase(storage, selection) {
  const { schemaVersion, nodes } = buildChartNetwork(selection);
  if (nodes.length) storage.setItem(CHART_CASE_KEY, JSON.stringify({ schemaVersion, nodes }));
  else storage.removeItem(CHART_CASE_KEY);
}
