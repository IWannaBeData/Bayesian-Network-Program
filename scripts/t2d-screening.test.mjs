import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupCode } from '../catalog.mjs';
import { diagnosisSearchTerms, pubmedQuery } from '../pubmed-query.mjs';
import { diagnosticSearchStatus, indexDiagnosticSearches, knownPaperChecks, readRepo, readScreeningCatalog } from './t2d-screening-data.mjs';

const { catalogVersion, index } = await readScreeningCatalog();
const { papers } = JSON.parse(await readRepo('evidence/t2d-review.json', 'utf8'));
const papersByPmid = new Map(Object.values(papers).map(paper => [paper.pmid, paper]));

for (const { code, pmid, phrase } of knownPaperChecks) {
  test(code + ' query includes matching title terms for PMID ' + pmid, () => {
    const record = lookupCode(index, code);
    const { term, url, vocabulary } = pubmedQuery(record);
    const title = papersByPmid.get(pmid).title.toLowerCase();
    assert.equal(vocabulary, 'vetted');
    assert.equal(new URL(url).searchParams.get('term'), term);
    const [diabetes, diagnosis] = term.toLowerCase().split(') and (');
    assert(title.includes(phrase));
    assert(diagnosis.includes('"' + phrase + '"[title/abstract]'));
    const diabetesPhrases = [...diabetes.matchAll(/"([^"]+)"\[title\/abstract\]/g)].map(match => match[1]);
    assert(diabetesPhrases.some(phrase => title.includes(phrase)));
  });
}

test('C34 adds the missing clinical phrase and NLM heading', () => {
  const record = lookupCode(index, 'C34');
  const { term } = pubmedQuery(record);
  const title = papersByPmid.get('40692755').title.toLowerCase();
  assert(!title.includes(record.title.toLowerCase()));
  assert(!title.includes(record.code.toLowerCase()));
  assert(term.includes('"lung cancer"[Title/Abstract]'));
  assert(term.includes('"Lung Neoplasms"[MeSH Terms]'));
  assert.deepEqual(diagnosisSearchTerms.C34.mesh, [['Lung Neoplasms', 'D008175']]);
  assert.equal(pubmedQuery(lookupCode(index, 'C34.90')).vocabulary, 'catalog_terms');
});

test('only a completed run of the same diagnosis query counts as searched', () => {
  const code = 'C34';
  const { term } = pubmedQuery(lookupCode(index, code));
  const base = { catalogVersion, code, term, status: 'completed', resultCount: 0 };
  const jsonl = [
    { ...base, kind: 'diagnosis', status: 'failed', attemptedAt: '2026-10-01T00:00:00Z' },
    { ...base, kind: 'known-paper', resultCount: 1, attemptedAt: '2026-10-02T00:00:00Z' },
    { ...base, kind: 'diagnosis', term: 'old query', attemptedAt: '2026-10-03T00:00:00Z' },
    { ...base, kind: 'diagnosis', catalogVersion: 'old', attemptedAt: '2026-10-04T00:00:00Z' },
  ].map(row => JSON.stringify(row));
  const knownOnly = indexDiagnosticSearches(jsonl[1], catalogVersion);
  assert.equal(diagnosticSearchStatus(knownOnly, code, term).status, 'not_run');
  const read = () => diagnosticSearchStatus(indexDiagnosticSearches(jsonl.join('\n'), catalogVersion), code, term);
  assert.equal(read().status, 'failed');
  assert.equal(read().resultCount, null);
  jsonl.push(JSON.stringify({ ...base, kind: 'diagnosis', attemptedAt: '2026-10-05T00:00:00Z' }));
  jsonl.push(JSON.stringify({ ...base, kind: 'diagnosis', status: 'failed', attemptedAt: '2026-10-06T00:00:00Z' }));
  assert.equal(read().status, 'completed');
  assert.equal(read().resultCount, 0);
  assert.equal(read().lastAttemptStatus, 'failed');
});
