import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { indexCatalog, readCatalogShard } from '../catalog.mjs';

export const repoRoot = new URL('../', import.meta.url);
export const readRepo = (path, encoding) => readFile(new URL(path, repoRoot), encoding);

export const knownPaperChecks = [
  { code: 'C34', pmid: '40692755', phrase: 'lung cancer' },
  { code: 'I21', pmid: '38932992', phrase: 'myocardial infarction' },
  { code: 'I63', pmid: '38662635', phrase: 'ischemic stroke' },
  { code: 'C50', pmid: '39436974', phrase: 'breast cancer' },
  { code: 'G47.33', pmid: '27810258', phrase: 'obstructive sleep apnea' },
  { code: 'E28.2', pmid: '38986027', phrase: 'polycystic ovary syndrome' },
  { code: 'K76.0', pmid: '37253998', phrase: 'non-alcoholic fatty liver disease' },
  { code: 'Z86.32', pmid: '37253998', phrase: 'history of gestational diabetes' },
];

export async function readScreeningCatalog() {
  const manifest = JSON.parse(await readRepo('data/manifest.json', 'utf8'));
  const shards = await Promise.all(manifest.shards.map(async ({ name }) =>
    readCatalogShard(gunzipSync(await readRepo('data/' + name)).toString('utf8'))
  ));
  const records = shards.flat();
  const index = indexCatalog(records);
  if (records.length !== manifest.entries || index.size !== records.length) {
    throw new Error('The catalog is incomplete or contains duplicate codes.');
  }
  return { catalogVersion: manifest.version, records, index };
}

export function indexDiagnosticSearches(jsonl, catalogVersion) {
  const index = new Map();
  for (const line of jsonl.trim().split(/\r?\n/).filter(Boolean)) {
    const run = JSON.parse(line);
    if (run.kind !== 'diagnosis' || run.catalogVersion !== catalogVersion) continue;
    if (!run.code || !run.term || !Number.isFinite(Date.parse(run.attemptedAt)) ||
        !['completed', 'failed'].includes(run.status) ||
        (run.status === 'completed' && !(Number.isSafeInteger(run.resultCount) && run.resultCount >= 0))) {
      throw new Error('Invalid diagnosis search log record.');
    }
    const key = run.code + '\t' + run.term;
    const entry = index.get(key) ?? {};
    if (!entry.lastAttempt || run.attemptedAt >= entry.lastAttempt.attemptedAt) entry.lastAttempt = run;
    if (run.status === 'completed' && (!entry.lastSuccess || run.attemptedAt >= entry.lastSuccess.attemptedAt)) {
      entry.lastSuccess = run;
    }
    index.set(key, entry);
  }
  return index;
}

export function diagnosticSearchStatus(index, code, term) {
  const entry = index.get(code + '\t' + term);
  return {
    status: entry?.lastSuccess ? 'completed' : entry ? 'failed' : 'not_run',
    lastAttemptAt: entry?.lastAttempt.attemptedAt ?? null,
    lastAttemptStatus: entry?.lastAttempt.status ?? null,
    lastCompletedAt: entry?.lastSuccess?.attemptedAt ?? null,
    resultCount: entry?.lastSuccess?.resultCount ?? null,
  };
}
