import { CHAPTERS, RELEASE, readCatalogShard } from './catalog.mjs';

const search = document.querySelector('#catalog-search');
const chapter = document.querySelector('#catalog-chapter');
const type = document.querySelector('#catalog-type');
const status = document.querySelector('#catalog-status');
const table = document.querySelector('#catalog-results');
const previous = document.querySelector('#catalog-prev');
const next = document.querySelector('#catalog-next');
const pageLabel = document.querySelector('#catalog-page');
const download = document.querySelector('#catalog-download');
const retry = document.querySelector('#catalog-retry');

const PAGE_SIZE = 25;
const number = new Intl.NumberFormat('en-US');
const chapterNames = new Map(CHAPTERS.map(item => [item.id, item.label]));
let records = [];
let matches = [];
let page = 0;
let filterTimer;

for (const item of CHAPTERS) {
  const option = document.createElement('option');
  option.value = item.id;
  option.textContent = item.label;
  chapter.append(option);
}

function cell(row, contents, tag = 'td') {
  const element = document.createElement(tag);
  if (tag === 'th') element.scope = 'row';
  if (typeof contents === 'string') element.textContent = contents;
  else element.append(...contents);
  row.append(element);
  return element;
}

function codeText(value) {
  const code = document.createElement('code');
  code.textContent = value;
  return code;
}

function renderPage() {
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, matches.length);
  const fragment = document.createDocumentFragment();

  for (const record of matches.slice(start, end)) {
    const row = document.createElement('tr');
    cell(row, record.code, 'th');
    cell(row, record.title);
    cell(row, [codeText(record.variableName)]);
    cell(row, record.tags.map(codeText));
    const typeCell = cell(row, record.reportable ? 'Reportable code' : 'Hierarchy header');
    if (record.reportable) typeCell.className = 'reportable';
    fragment.append(row);
  }

  table.replaceChildren(fragment);
  if (matches.length) {
    status.textContent = number.format(start + 1) + '–' + number.format(end) +
      ' of ' + number.format(matches.length) + ' matching entries';
    pageLabel.textContent = 'Page ' + number.format(page + 1) + ' of ' +
      number.format(Math.ceil(matches.length / PAGE_SIZE));
  } else {
    status.textContent = 'No matching entries. Try a shorter term or clear a filter.';
    pageLabel.textContent = '';
  }
  previous.disabled = page === 0;
  next.disabled = end >= matches.length;
}

function filterCatalog() {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const chapterId = chapter.value;
  const typeValue = type.value;
  matches = records.filter(record =>
    (!chapterId || record.chapterId === chapterId) &&
    (!typeValue || record.reportable === (typeValue === 'code')) &&
    terms.every(term => record.searchText.includes(term))
  );
  page = 0;
  renderPage();
}

search.addEventListener('input', () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(filterCatalog, 100);
});
chapter.addEventListener('change', filterCatalog);
type.addEventListener('change', filterCatalog);
previous.addEventListener('click', () => {
  page -= 1;
  renderPage();
});
next.addEventListener('click', () => {
  page += 1;
  renderPage();
});

function csvRow(fields) {
  return fields.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',');
}

download.addEventListener('click', () => {
  const header = csvRow([
    'system', 'version', 'effective_from', 'effective_through', 'code', 'title',
    'variable_name', 'tags', 'chapter', 'category', 'reportable',
  ]);
  const lines = records.map(record => csvRow([
    record.system, record.version, record.effectiveFrom, record.effectiveThrough,
    record.code, record.title, record.variableName, record.tags.join('|'),
    chapterNames.get(record.chapterId), record.category, record.reportable,
  ]));
  const csv = new Blob(['\uFEFF', header, '\r\n', lines.join('\r\n'), '\r\n'], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(csv);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'icd10cm-fy2027-catalog.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function fetchCatalogFile(path) {
  const response = await fetch(new URL('./data/' + path, import.meta.url));
  if (!response.ok) throw new Error('Catalog request failed for ' + path + ' (' + response.status + ')');
  return response;
}

async function loadCatalog() {
  retry.hidden = true;
  status.textContent = 'Loading the official catalog…';
  try {
    const manifest = await (await fetchCatalogFile('manifest.json')).json();
    if (manifest.version !== RELEASE.version || manifest.system !== RELEASE.system) {
      throw new Error('The served catalog release does not match the application.');
    }
    const parts = await Promise.all(manifest.shards.map(async shard => {
      const response = await fetchCatalogFile(shard.name);
      const text = await new Response(
        response.body.pipeThrough(new DecompressionStream('gzip'))
      ).text();
      const rows = readCatalogShard(text);
      if (rows.length !== shard.rows) throw new Error('Incorrect row count for ' + shard.name);
      return rows;
    }));
    const loaded = parts.flat();
    if (loaded.length !== manifest.entries ||
        loaded.filter(record => record.reportable).length !== manifest.reportable) {
      throw new Error('The loaded catalog is incomplete.');
    }
    records = loaded.map(record => {
      record.searchText = [
        record.code, record.code.replace('.', ''), record.title, record.variableName,
        chapterNames.get(record.chapterId), ...record.tags,
      ].join(' ').toLowerCase();
      return record;
    });
    for (const control of [search, chapter, type, download]) control.disabled = false;
    filterCatalog();
  } catch (error) {
    console.error(error);
    status.textContent = 'The catalog could not load. Retry or use the official CMS files linked below.';
    retry.hidden = false;
  }
}

retry.addEventListener('click', loadCatalog);
loadCatalog();
