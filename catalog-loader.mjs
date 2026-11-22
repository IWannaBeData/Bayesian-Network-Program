import { RELEASE, readCatalogShard } from './catalog.mjs';

let catalogRequest;

async function fetchCatalogFile(path) {
  const response = await fetch(new URL('./data/' + path, import.meta.url));
  if (!response.ok) throw new Error('ICD-10-CM request failed for ' + path + ' (' + response.status + ').');
  return response;
}

async function readRelease() {
  const manifest = await (await fetchCatalogFile('manifest.json')).json();
  if (manifest.version !== RELEASE.version || manifest.system !== RELEASE.system) {
    throw new Error('The ICD-10-CM release does not match the application.');
  }
  const parts = await Promise.all(manifest.shards.map(async shard => {
    const response = await fetchCatalogFile(shard.name);
    const text = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
    const rows = readCatalogShard(text);
    if (rows.length !== shard.rows) throw new Error('Incorrect row count for ' + shard.name + '.');
    return rows;
  }));
  const records = parts.flat();
  if (records.length !== manifest.entries ||
      records.filter(record => record.reportable).length !== manifest.reportable) {
    throw new Error('The ICD-10-CM catalog is incomplete.');
  }
  return records;
}

export function loadCatalogRecords() {
  if (!catalogRequest) {
    catalogRequest = readRelease().catch(error => {
      catalogRequest = undefined;
      throw error;
    });
  }
  return catalogRequest;
}
