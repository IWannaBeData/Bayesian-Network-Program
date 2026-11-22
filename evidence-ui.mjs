import {
  createEvidenceReview, evidenceFor, getConditionalEvidence, pubmedQuery,
  T2D_GIVEN_CONDITION,
} from './t2d-evidence.mjs';

const coverage = document.querySelector('#evidence-coverage');
const dialog = document.querySelector('#evidence-detail');
const heading = document.querySelector('#evidence-variable');
const content = document.querySelector('#evidence-results');
const close = document.querySelector('#evidence-close');
const formatInteger = new Intl.NumberFormat('en-US');
const formatPercent = new Intl.NumberFormat('en-US', {
  style: 'percent', maximumFractionDigits: 2,
});

close.addEventListener('click', () => dialog.close());

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(text, href) {
  const node = element('a', text);
  node.href = href;
  node.target = '_blank';
  node.rel = 'noopener';
  return node;
}

function sourceLinks(paper, csv) {
  const sources = element('p', '', 'sources');
  sources.append(
    link(paper.pdfKind || 'Read the paper PDF', paper.pdf),
    ' · ', link('Article and citation', paper.article),
    ' · ', link(paper.license, paper.licenseUrl),
  );
  if (csv) sources.append(' · ', link('Download the supporting CSV', csv));
  return sources;
}

function renderProbability(review, candidate) {
  const section = element('article', '', 'evidence-card');
  const { cohort, paper } = candidate;
  section.append(element('h3', candidate.phenotype), element('p', cohort.cohortLabel, 'cohort-label'));

  for (const givenState of Object.keys(candidate.estimates)) {
    const estimate = getConditionalEvidence(review, {
      variableName: candidate.variableName,
      cohortId: cohort.id,
      direction: cohort.direction,
      givenState,
    });
    const inverse = cohort.direction === T2D_GIVEN_CONDITION;
    const outcome = inverse
      ? cohort.endpointKind === 'cumulative_incidence' ? 'incident type 2 diabetes' : 'documented type 2 diabetes'
      : candidate.phenotype;
    const row = element('p', '', 'estimate');
    row.append(
      element('strong', formatPercent.format(estimate.probability)),
      ' with ' + outcome + ' among ' + estimate.givenLabel.toLowerCase(),
    );
    section.append(row);
  }

  const support = element('div', '', 'evidence-support');
  support.append(element('h4', candidate.support.location));
  for (const value of candidate.support.values) support.append(element('p', value));
  if (candidate.support.excerpt) support.append(element('blockquote', candidate.support.excerpt));
  section.append(
    support, element('p', cohort.population), element('p', cohort.timeWindow),
    element('p', candidate.mapping), element('p', cohort.limitations),
    element('p', paper.citation, 'sources'), sourceLinks(paper),
  );
  return section;
}

function renderClaims(review, record, rows) {
  const { claimsSource: source } = review;
  const section = element('article', '', 'evidence-card');
  section.append(
    element('h3', 'Age-stratified relative risk'),
    element('p', source.population), element('p', source.limits),
    element('p', source.table + ' · source code ' + record.code, 'cohort-label'),
  );
  const region = element('div', '', 'table-scroll');
  region.tabIndex = 0;
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'Published age-stratified relative risks');
  const table = element('table');
  const head = table.createTHead().insertRow();
  for (const label of ['Age band label', 'Relative risk', 'Reported CI', 'P value', 'CSV row']) {
    const column = element('th', label);
    column.scope = 'col';
    head.append(column);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const line = body.insertRow();
    for (const value of [
      row.ageBandLabel, row.relativeRisk, row.ci.join('–'), row.pValue ?? 'Unavailable', row.sourceRow,
    ]) {
      line.append(element('td', String(value)));
    }
  }
  region.append(table);
  section.append(region, element('p', source.paper.citation, 'sources'), sourceLinks(source.paper, source.csv));
  return section;
}

export function openEvidence(record, review, openVariable) {
  heading.textContent = record.code + ' · ' + record.title;
  const query = pubmedQuery(record);
  const intro = element('p', '', 'evidence-intro');
  intro.append(element('code', record.variableName), ' · ', link('Search PubMed for this diagnosis', query.url));
  content.replaceChildren(intro);

  if (review) {
    const found = evidenceFor(review, record);
    for (const candidate of found.probabilities) content.append(renderProbability(review, candidate));
    if (found.associations.length) content.append(renderClaims(review, record, found.associations));
    if (!found.probabilities.length && !found.associations.length) {
      content.append(element('p', 'No study extract has been linked to this exact variable. Its literature review is open.'));
    }
    if (found.related) {
      const related = element('button', 'Open related category ' + record.category);
      related.type = 'button';
      related.addEventListener('click', () => openVariable(record.category));
      content.append(
        element('p', 'The parent category has evidence for its own definition and cohort.'),
        related,
      );
    }
  } else {
    content.append(element('p', 'The review data are temporarily unavailable. The PubMed query is ready to open.'));
  }
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

export async function loadEvidence(catalogIndex) {
  try {
    const [details, claims] = await Promise.all([
      fetch('./evidence/t2d-review.json'),
      fetch('./evidence/klimek-2015-s2.csv'),
    ]);
    if (!details.ok || !claims.ok) throw new Error('A review asset could not be fetched.');
    const review = createEvidenceReview(catalogIndex, await details.json(), await claims.text());
    const { linked, catalog, probabilityAnchors, mappedClaimsCategories } = review.counts;
    coverage.textContent = formatInteger.format(linked) + ' of ' + formatInteger.format(catalog) +
      ' catalog entries have evidence linked to that variable. ' +
      formatInteger.format(probabilityAnchors) + ' have cohort probabilities. The claims supplement has rows for ' +
      formatInteger.format(mappedClaimsCategories) + ' categories. Entries without a verified extract still need individual screening.';
    return review;
  } catch (error) {
    console.error(error);
    coverage.textContent = 'The review data could not load. The paper and supplement links are available below.';
    return null;
  }
}
