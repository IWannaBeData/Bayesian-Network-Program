export const RELEASE = Object.freeze({
  system: 'http://hl7.org/fhir/sid/icd-10-cm',
  version: 'FY2027-2026-10-01',
  effectiveFrom: '2026-10-01',
  effectiveThrough: '2027-09-30',
});

// Category ranges from the FY 2027 CDC/NCHS Tabular List of Diseases and Injuries.
export const CHAPTERS = [
  ['01', 'A00', 'B99', 'Infectious and parasitic diseases'],
  ['02', 'C00', 'D49', 'Neoplasms'],
  ['03', 'D50', 'D89', 'Blood and immune disorders'],
  ['04', 'E00', 'E89', 'Endocrine, nutritional and metabolic diseases'],
  ['05', 'F01', 'F99', 'Mental, behavioral and neurodevelopmental disorders'],
  ['06', 'G00', 'G99', 'Nervous system'],
  ['07', 'H00', 'H59', 'Eye and adnexa'],
  ['08', 'H60', 'H95', 'Ear and mastoid process'],
  ['09', 'I00', 'I99', 'Circulatory system'],
  ['10', 'J00', 'J99', 'Respiratory system'],
  ['11', 'K00', 'K95', 'Digestive system'],
  ['12', 'L00', 'L99', 'Skin and subcutaneous tissue'],
  ['13', 'M00', 'M99', 'Musculoskeletal system and connective tissue'],
  ['14', 'N00', 'N99', 'Genitourinary system'],
  ['15', 'O00', 'O9A', 'Pregnancy, childbirth and the puerperium'],
  ['16', 'P00', 'P96', 'Perinatal conditions'],
  ['17', 'Q00', 'QA1', 'Congenital, chromosomal and genetic conditions'],
  ['18', 'R00', 'R99', 'Symptoms, signs and abnormal findings'],
  ['19', 'S00', 'T88', 'Injury, poisoning and other consequences of external causes'],
  ['20', 'V00', 'Y99', 'External causes of morbidity'],
  ['21', 'Z00', 'Z99', 'Health status and contact with health services'],
  ['22', 'U00', 'U85', 'Special purposes'],
].map(([id, first, last, label]) => ({ id, first, last, label }));

export function normalizeCode(value) {
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{2}(?:\.[A-Z0-9]{1,4}|[A-Z0-9]{1,4})?$/.test(code)) {
    throw new TypeError(`Invalid ICD-10-CM code: ${code}`);
  }
  return code.replace('.', '');
}

export function chapterFor(category) {
  return CHAPTERS.find(({ first, last }) => first <= category && category <= last);
}

export function catalogRecord(rawCode, title, reportable) {
  const normalized = normalizeCode(rawCode);
  const category = normalized.slice(0, 3);
  const suffix = normalized.slice(3);
  const chapter = chapterFor(category);
  if (!chapter) throw new Error(`No ICD-10-CM chapter for ${rawCode}`);

  return {
    ...RELEASE,
    code: suffix ? `${category}.${suffix}` : category,
    title,
    variableName: `icd10cm_${normalized.toLowerCase()}`,
    tags: [`chapter:${chapter.id}`, `category:${category.toLowerCase()}`],
    chapterId: chapter.id,
    category,
    reportable,
  };
}

export function readCatalogShard(tsv) {
  return tsv.trimEnd().split('\n').map(line => {
    const [code, flag, title] = line.split('\t');
    if ((flag !== '1' && flag !== '0') || !title) throw new Error(`Invalid catalog row: ${code}`);
    return catalogRecord(code, title, flag === '1');
  });
}

export function indexCatalog(records) {
  return new Map(records.map(record => [normalizeCode(record.code), record]));
}

export function lookupCode(index, code) {
  return index.get(normalizeCode(code));
}

// A draft records how a code could enter a graph. Its time window and CPD need review.
export function draftObservation(record, windowId) {
  if (!record?.reportable) throw new TypeError('A draft requires a reportable ICD-10-CM code.');
  if (typeof windowId !== 'string' || !/^[a-z][a-z0-9_]*$/.test(windowId)) {
    throw new TypeError('Use a lowercase identifier for the evidence window.');
  }
  return {
    id: `${record.variableName}__${windowId}`,
    kind: 'coded_observation',
    states: ['recorded', 'not_recorded'],
    source: { system: record.system, version: record.version, code: record.code },
    windowId,
    parents: [],
    parameterSetId: null,
  };
}
