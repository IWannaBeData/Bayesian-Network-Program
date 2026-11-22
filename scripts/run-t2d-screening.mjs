import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { lookupCode } from '../catalog.mjs';
import { pubmedQuery } from '../pubmed-query.mjs';
import { knownPaperChecks, readScreeningCatalog } from './t2d-screening-data.mjs';

const { values: options } = parseArgs({
  options: {
    code: { type: 'string', multiple: true, default: [] },
    'known-papers': { type: 'boolean' },
  },
});
if (!options.code.length && !options['known-papers']) {
  throw new Error('Use --code C34 (repeatable) or --known-papers.');
}

const { index, catalogVersion } = await readScreeningCatalog();
const selected = new Set(options.code.map(code => {
  const record = lookupCode(index, code);
  if (!record) throw new Error('Unknown catalog code ' + code);
  return record.code;
}));
const requests = options['known-papers']
  ? knownPaperChecks.filter(({ code }) => !selected.size || selected.has(code))
  : [...selected].map(code => ({ code }));
if (!requests.length) throw new Error('No known-paper checks exist for the selected codes.');

async function searchPubMed(term) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  url.search = new URLSearchParams({
    db: 'pubmed', term, retmode: 'json', retmax: '10', tool: 'bayesian_network_literature_review',
  });
  if (process.env.NCBI_EMAIL) url.searchParams.set('email', process.env.NCBI_EMAIL);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('PubMed ESearch returned HTTP ' + response.status + '.');
  const { esearchresult: result } = await response.json();
  const resultCount = Number(result?.count);
  if (!/^\d+$/.test(result?.count ?? '') || !Number.isSafeInteger(resultCount) ||
      !Array.isArray(result.idlist) || result.idlist.length !== Math.min(10, resultCount) ||
      result.idlist.some(pmid => !/^\d+$/.test(pmid)) ||
      result.errorlist?.fieldsnotfound?.length || result.error) {
    throw new Error('PubMed ESearch returned an invalid or rejected query response.');
  }
  return {
    resultCount,
    samplePmids: result.idlist,
    ...(result.querytranslation ? { queryTranslation: result.querytranslation } : {}),
    ...(result.warninglist ? { warnings: result.warninglist } : {}),
    ...(result.errorlist ? { queryMessages: result.errorlist } : {}),
  };
}

for (const [position, { code, pmid }] of requests.entries()) {
  if (position) await delay(400);
  const query = pubmedQuery(lookupCode(index, code));
  const term = pmid ? '(' + query.term + ') AND ' + pmid + '[PMID]' : query.term;
  const run = {
    kind: pmid ? 'known-paper' : 'diagnosis',
    source: 'pubmed-esearch',
    catalogVersion, code, term,
    attemptedAt: new Date().toISOString(),
    ...(pmid ? { expectedPmid: pmid } : {}),
  };
  try {
    Object.assign(run, await searchPubMed(term), { status: 'completed' });
    if (pmid) {
      run.matchedExpected = run.samplePmids.includes(pmid);
      if (!run.matchedExpected) process.exitCode = 1;
    }
  } catch (error) {
    run.status = 'failed';
    run.error = error.cause?.code ? error.message + ' (' + error.cause.code + ')' : error.message;
    process.exitCode = 1;
  }
  if (!process.stdout.write(JSON.stringify(run) + '\n')) await once(process.stdout, 'drain');
}
