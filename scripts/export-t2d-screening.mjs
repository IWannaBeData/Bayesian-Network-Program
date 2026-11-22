import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createEvidenceReview, evidenceStatus, pubmedQuery } from '../t2d-evidence.mjs';
import { diagnosticSearchStatus, indexDiagnosticSearches, readRepo, readScreeningCatalog } from './t2d-screening-data.mjs';

const { values: options } = parseArgs({ options: { 'search-log': { type: 'string' } } });
const [catalog, reviewText, claimsCsv, log] = await Promise.all([
  readScreeningCatalog(),
  readRepo('evidence/t2d-review.json', 'utf8'),
  readRepo('evidence/klimek-2015-s2.csv', 'utf8'),
  options['search-log']
    ? readFile(options['search-log'], 'utf8')
    : readRepo('evidence/t2d-search-log.jsonl', 'utf8'),
]);
const review = createEvidenceReview(catalog.index, JSON.parse(reviewText), claimsCsv);
const searches = indexDiagnosticSearches(log, catalog.catalogVersion);
for (const record of catalog.records) {
  const pubmed = pubmedQuery(record);
  const line = JSON.stringify({
    catalogVersion: catalog.catalogVersion,
    code: record.code,
    variableName: record.variableName,
    title: record.title,
    reportable: record.reportable,
    evidenceStatus: evidenceStatus(review, record),
    pubmed,
    search: diagnosticSearchStatus(searches, record.code, pubmed.term),
  });
  if (!process.stdout.write(line + '\n')) await once(process.stdout, 'drain');
}
