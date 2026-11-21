import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { catalogRecord, RELEASE } from '../catalog.mjs';

const SOURCE = 'https://www.cms.gov/files/zip/2027-code-descriptions-tabular-order.zip';
const EXPECTED = { entries: 98403, reportable: 74879 };
const SHARD_SIZE = 12000;
const output = fileURLToPath(new URL('../data/', import.meta.url));

const [orderPath, codesPath] = process.argv.slice(2);
if (!orderPath || !codesPath) {
  console.error('Usage: node scripts/build-catalog.mjs icd10cm_order_2027.txt icd10cm_codes_2027.txt');
  process.exit(1);
}

const [orderBytes, codesBytes] = await Promise.all([readFile(orderPath), readFile(codesPath)]);
const decoder = new TextDecoder('utf-8', { fatal: true });
const orderLines = decoder.decode(orderBytes).trimEnd().split(/\r?\n/);
const codesLines = decoder.decode(codesBytes).trimEnd().split(/\r?\n/);
const reportedTitles = new Map(codesLines.map(line => [line.slice(0, 7).trim(), line.slice(8).trim()]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = {
  order: { file: 'icd10cm_order_2027.txt', sha256: hash(orderBytes) },
  codes: { file: 'icd10cm_codes_2027.txt', sha256: hash(codesBytes) },
};

const variables = new Set();
let valid = 0;
const rows = orderLines.map((line, index) => {
  // Positions are defined in icd10OrderFiles.pdf in the CMS archive.
  const order = Number(line.slice(0, 5));
  const rawCode = line.slice(6, 13).trim();
  const flag = line[14];
  const title = line.slice(77).trim();
  if (order !== index + 1 || !['0', '1'].includes(flag) || !title || /[\t\r\n]/.test(title)) {
    throw new Error(`Malformed order record at line ${index + 1}`);
  }

  const record = catalogRecord(rawCode, title, flag === '1');
  if (variables.has(record.variableName)) throw new Error(`Repeated code ${record.code}`);
  variables.add(record.variableName);
  if (record.reportable) {
    if (reportedTitles.get(rawCode) !== title) throw new Error(`Code list mismatch for ${record.code}`);
    valid += 1;
  } else if (reportedTitles.has(rawCode)) {
    throw new Error(`Header ${record.code} appears in the reportable code list`);
  }

  return `${rawCode}\t${flag}\t${title}`;
});

if (rows.length !== EXPECTED.entries || valid !== EXPECTED.reportable ||
    valid !== codesLines.length || valid !== reportedTitles.size) {
  throw new Error(`Unexpected release size: ${rows.length} entries, ${valid} reportable`);
}

await mkdir(output, { recursive: true });
const shards = [];
for (let start = 0; start < rows.length; start += SHARD_SIZE) {
  const position = String(shards.length + 1).padStart(2, '0');
  const name = `icd10cm-2027-${position}.tsv.gz`;
  const contents = rows.slice(start, start + SHARD_SIZE).join('\n') + '\n';
  const bytes = gzipSync(contents, { level: 9 });
  await writeFile(join(output, name), bytes);
  shards.push({ name, rows: Math.min(SHARD_SIZE, rows.length - start), sha256: hash(bytes) });
}

const manifest = {
  ...RELEASE,
  source: SOURCE,
  sourceFiles,
  entries: rows.length,
  reportable: valid,
  headers: rows.length - valid,
  rowSchema: ['undottedCode', 'reportableFlag', 'longTitle'],
  shards,
};
const manifestPath = join(output, 'manifest.json');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Verified ${rows.length} entries, including ${valid} reportable codes. Wrote ${shards.length} shards to ${dirname(manifestPath)}.`);
