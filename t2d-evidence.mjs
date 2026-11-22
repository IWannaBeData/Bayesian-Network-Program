import { lookupCode } from './catalog.mjs';

export const T2D = 'dx_type2_diabetes';
export const CONDITION_GIVEN_T2D = 'condition_given_t2d';
export const T2D_GIVEN_CONDITION = 't2d_given_condition';

function addToIndex(index, key, value) {
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(value);
}

function percent(value) {
  return (100 * value).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
}

function readProbability(input) {
  if (typeof input === 'number' && Number.isFinite(input) && input >= 0 && input <= 1) {
    return { probability: input, reportedFraction: input };
  }
  const [numerator, denominator] = Array.isArray(input) ? input : [];
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) ||
      numerator < 0 || denominator <= 0 || numerator > denominator) {
    throw new Error('An estimate must contain a published fraction or valid counts.');
  }
  return { probability: numerator / denominator, numerator, denominator };
}

function indexProbabilityStudies(reviewData, catalogIndex) {
  const results = new Map();
  for (const cohort of reviewData.cohorts) {
    const paper = reviewData.papers[cohort.paperId];
    if (!paper?.pdf || !cohort.table) throw new Error('Missing source for ' + cohort.id);
    for (const row of cohort.rows) {
      const record = lookupCode(catalogIndex, row.code);
      if (!record) throw new Error('Unknown study anchor ' + row.code);
      const directions = [CONDITION_GIVEN_T2D, T2D_GIVEN_CONDITION];
      if (!directions.includes(cohort.direction)) throw new Error('Unknown estimate direction.');
      const estimates = {};
      for (const [state, sourceValue] of Object.entries(row.given)) {
        if (!Object.hasOwn(cohort.groups, state)) throw new Error('Unknown conditioning state.');
        const estimate = readProbability(sourceValue);
        const interval = row.intervals?.[state];
        if (interval && (interval.length !== 2 || !interval.every(Number.isFinite) ||
            interval[0] < 0 || interval[0] > estimate.probability ||
            interval[1] < estimate.probability || interval[1] > 1)) {
          throw new Error('Invalid confidence interval for ' + row.code);
        }
        estimates[state] = interval ? { ...estimate, confidenceInterval95: interval } : estimate;
      }
      const { rows, ...cohortInfo } = cohort;
      const candidate = {
        variableName: record.variableName,
        code: record.code,
        phenotype: row.phenotype,
        phenotypeId: cohort.id + '__' + record.variableName,
        mapping: row.mapping ?? cohort.mapping,
        cohort: cohortInfo,
        paper: { id: cohort.paperId, ...paper },
        estimates,
        support: {
          location: cohort.table + ', ' + row.tableRow,
          excerpt: row.excerpt ?? null,
          values: Object.entries(estimates).map(([state, estimate]) => {
            const group = cohort.groups[state];
            const value = 'denominator' in estimate
              ? estimate.numerator.toLocaleString('en-US') + ' / ' + estimate.denominator.toLocaleString('en-US')
              : percent(estimate.reportedFraction);
            const ci = estimate.confidenceInterval95;
            return group + ' · ' + value + (ci ? ' (95% CI ' + ci.map(percent).join(' to ') + ')' : '');
          }),
        },
      };
      if (results.get(record.variableName)?.some(entry => entry.cohort.id === cohort.id)) {
        throw new Error('Repeated study estimate for ' + record.variableName);
      }
      results.set(record.variableName, [...(results.get(record.variableName) ?? []), candidate]);
    }
  }
  return results;
}

function indexClaims(csv, catalogIndex) {
  const [header, ...lines] = csv.trimEnd().split(/\r?\n/);
  const expected = ['Age', 'ICD10 Code', 'Relative Risk RR', 'CI (lower)', 'CI (upper)', 'p-Value', 'Sex Ratio SR'];
  if (header.split(',').map(field => field.trim()).join('|') !== expected.join('|')) {
    throw new Error('Unexpected claims supplement columns.');
  }
  const associations = new Map();
  const sourceCodes = new Set();
  const unmapped = new Set();
  for (const [index, line] of lines.entries()) {
    const fields = line.split(',').map(field => field.trim());
    if (fields.length !== expected.length || !fields.every(Boolean)) {
      throw new Error('Invalid claims source row ' + (index + 2));
    }
    const [age, code, effect, ciLow, ciHigh, p] = fields;
    sourceCodes.add(code);
    const entry = lookupCode(catalogIndex, code);
    if (!entry) {
      unmapped.add(code);
      continue;
    }
    const data = {
      ageBandLabel: Number(age),
      relativeRisk: Number(effect),
      ci: [Number(ciLow), Number(ciHigh)],
      pValue: p === 'NaN' ? null : Number(p),
      sourceRow: index + 2,
    };
    if (![data.ageBandLabel, data.relativeRisk, ...data.ci].every(Number.isFinite) ||
        data.relativeRisk <= 0 || data.ci[0] > data.ci[1] ||
        (data.pValue !== null && !(data.pValue >= 0 && data.pValue <= 1))) {
      throw new Error('Invalid numeric fields at claims source row ' + data.sourceRow);
    }
    addToIndex(associations, entry.variableName, data);
  }
  return { associations, sourceCodes: sourceCodes.size, unmapped: [...unmapped], sourceRows: lines.length };
}

export function createEvidenceReview(catalogIndex, reviewData, claimsCsv) {
  const probabilities = indexProbabilityStudies(reviewData, catalogIndex);
  const claims = indexClaims(claimsCsv, catalogIndex);
  const linked = new Set([...probabilities.keys(), ...claims.associations.keys()]);
  const claimsPaper = reviewData.papers[reviewData.claims.paperId];
  if (!claimsPaper?.pdf || !reviewData.claims.csv) throw new Error('Missing claims provenance.');
  return {
    checkedOn: reviewData.checkedOn,
    probabilities,
    associations: claims.associations,
    claimsSource: { ...reviewData.claims, paper: claimsPaper },
    counts: {
      catalog: catalogIndex.size,
      linked: linked.size,
      probabilityAnchors: probabilities.size,
      mappedClaimsCategories: claims.associations.size,
      sourceClaimsCategories: claims.sourceCodes,
      sourceClaimsRows: claims.sourceRows,
    },
    unmappedClaimsCategories: claims.unmapped,
  };
}

export function evidenceFor(review, record) {
  const direct = {
    probabilities: review.probabilities.get(record.variableName) ?? [],
    associations: review.associations.get(record.variableName) ?? [],
  };
  const category = 'icd10cm_' + record.category.toLowerCase();
  const related = category !== record.variableName && (
    review.probabilities.has(category) || review.associations.has(category)
  ) ? category : null;
  return { ...direct, related };
}

export function evidenceStatus(review, record) {
  if (review.probabilities.has(record.variableName)) return 'probability';
  if (review.associations.has(record.variableName)) return 'association';
  if (evidenceFor(review, record).related) return 'related';
  return 'unreviewed';
}

export function pubmedQuery(record) {
  const literal = '"' + record.title.replace(/["\r\n]/g, '') + '"[Title/Abstract]';
  const code = '"' + record.code + '"[Title/Abstract]';
  const variants = [
    '"Diabetes Mellitus, Type 2"[MeSH Terms]',
    '"type 2 diabetes"[Title/Abstract]',
    '"type II diabetes"[Title/Abstract]',
    'T2DM[Title/Abstract]',
  ];
  const term = '(' + variants.join(' OR ') + ') AND (' + literal + ' OR ' + code + ')';
  return { term, url: 'https://pubmed.ncbi.nlm.nih.gov/?' + new URLSearchParams({ term }) };
}

export function getConditionalEvidence(review, { variableName, cohortId, direction, givenState }) {
  const candidate = review.probabilities.get(variableName)?.find(entry =>
    entry.cohort.id === cohortId && entry.cohort.direction === direction
  );
  if (!candidate || !Object.hasOwn(candidate.estimates, givenState)) {
    return { status: 'unavailable', variableName, cohortId, direction, givenState };
  }
  const reverse = direction === T2D_GIVEN_CONDITION;
  const diabetesId = T2D + '__' + candidate.cohort.id;
  return {
    status: 'study_estimate',
    ...candidate.estimates[givenState],
    variableName,
    phenotype: candidate.phenotype,
    mapping: candidate.mapping,
    direction,
    outcomeId: reverse ? diabetesId : candidate.phenotypeId,
    givenId: reverse ? candidate.phenotypeId : diabetesId,
    endpoint: {
      kind: candidate.cohort.endpointKind,
      denominatorUnit: candidate.cohort.unit,
      timeWindow: candidate.cohort.timeWindow,
      horizonYears: candidate.cohort.horizonYears ?? null,
      landmarkMonths: candidate.cohort.landmarkMonths ?? null,
    },
    givenState,
    givenLabel: candidate.cohort.groups[givenState],
    cohort: candidate.cohort,
    source: candidate.paper,
    support: candidate.support,
  };
}

export function getConditionalRows(review, query) {
  const present = getConditionalEvidence(review, { ...query, givenState: 'present' });
  const absent = getConditionalEvidence(review, { ...query, givenState: 'absent' });
  if (present.status !== 'study_estimate' || absent.status !== 'study_estimate') {
    return { status: 'incomplete', rows: [] };
  }
  return {
    status: 'study_estimate',
    outcomeId: present.outcomeId,
    givenId: present.givenId,
    rows: [present, absent].map(estimate => ({
      givenState: estimate.givenState,
      present: estimate.probability,
      absent: 1 - estimate.probability,
      evidence: estimate,
    })),
  };
}
