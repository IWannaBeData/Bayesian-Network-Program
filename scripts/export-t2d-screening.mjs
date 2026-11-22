import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { indexCatalog, readCatalogShard } from '../catalog.mjs';
import { createEvidenceReview, evidenceStatus, pubmedQuery } from '../t2d-evidence.mjs';

const root = new URL('../', import.meta.url);
const read = (path, encoding) => readFile(new URL(path, root), encoding);
const [manifestText, reviewText, claimsCsv] = await Promise.all([
  read('data/manifest.json', 'utf8'),
  read('evidence/t2d-review.json', 'utf8'),
  read('evidence/klimek-2015-s2.csv', 'utf8'),
]);
const manifest = JSON.parse(manifestText);
const shards = await Promise.all(manifest.shards.map(async ({ name }) =>
  readCatalogShard(gunzipSync(await read('data/' + name)).toString('utf8'))
));
const records = shards.flat();
const index = indexCatalog(records);
if (records.length !== manifest.entries || index.size !== records.length) {
  throw new Error('The catalog is incomplete or contains duplicate codes.');
}

const review = createEvidenceReview(index, JSON.parse(reviewText), claimsCsv);
for (const record of records) {
  const line = JSON.stringify({
    catalogVersion: manifest.version,
    code: record.code,
    variableName: record.variableName,
    title: record.title,
    reportable: record.reportable,
    evidenceStatus: evidenceStatus(review, record),
    pubmed: pubmedQuery(record),
  });
  if (!process.stdout.write(line + '\n')) await once(process.stdout, 'drain');
}
