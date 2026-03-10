const NODE_WIDTH = 150;
const NODE_HEIGHT = 56;

const state = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  tool: 'select',
  pendingArrowSourceId: null,
  dragNode: null,
  dragBend: null,
};

const canvas = document.getElementById('canvas');
const edgeLayer = document.getElementById('edgeLayer');
const inspector = document.getElementById('inspector');
const emptySelection = document.getElementById('emptySelection');
const nodeInspector = document.getElementById('nodeInspector');
const edgeInspector = document.getElementById('edgeInspector');
const nodeNameInput = document.getElementById('nodeName');
const nodeTypeInput = document.getElementById('nodeType');
const evidenceSelect = document.getElementById('evidenceSelect');
const cptContainer = document.getElementById('cptContainer');
const statePills = document.getElementById('statePills');
const newStateInput = document.getElementById('newStateInput');
const edgeBendInput = document.getElementById('edgeBendInput');
const inferenceOutput = document.getElementById('inferenceOutput');
const summaryOutput = document.getElementById('summaryOutput');

function setupEvents() {
  document.querySelectorAll('[data-add-node]').forEach((btn) => btn.addEventListener('click', () => addNode(btn.dataset.addNode)));
  document.getElementById('selectToolBtn').addEventListener('click', () => setTool('select'));
  document.getElementById('drawArrowToolBtn').addEventListener('click', () => setTool('drawArrow'));
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelected);

  document.getElementById('runInferenceBtn').addEventListener('click', runInference);
  document.getElementById('addStateBtn').addEventListener('click', addStateFromInput);
  newStateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addStateFromInput();
    }
  });

  nodeNameInput.addEventListener('input', () => {
    const node = getSelectedNode();
    if (!node) return;
    node.name = nodeNameInput.value;
    render();
  });

  evidenceSelect.addEventListener('change', () => {
    const node = getSelectedNode();
    if (!node) return;
    node.evidence = evidenceSelect.value === '__none__' ? null : evidenceSelect.value;
  });

  edgeBendInput.addEventListener('input', () => {
    const edge = getSelectedEdge();
    if (!edge) return;
    edge.bend = Number(edgeBendInput.value);
    renderEdges();
  });

  document.getElementById('saveFileBtn').addEventListener('click', saveToFile);
  document.getElementById('openFileBtn').addEventListener('click', () => document.getElementById('uploadInput').click());
  document.getElementById('uploadInput').addEventListener('change', (e) => importFromFile(e.target.files?.[0]));
  document.getElementById('quickSaveBtn').addEventListener('click', quickSave);
  document.getElementById('quickLoadBtn').addEventListener('click', quickLoad);

  setupDropZone();

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', () => {
    state.dragNode = null;
    state.dragBend = null;
  });

  canvas.addEventListener('click', (e) => {
    if (e.target === canvas) clearSelection();
  });
}

function setupDropZone() {
  const dz = document.getElementById('dropZone');
  ['dragenter', 'dragover'].forEach((eventName) => {
    dz.addEventListener(eventName, (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    dz.addEventListener(eventName, (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
    });
  });
  dz.addEventListener('drop', (e) => importFromFile(e.dataTransfer?.files?.[0]));
}

function setTool(tool) {
  state.tool = tool;
  state.pendingArrowSourceId = null;
  document.getElementById('selectToolBtn').classList.toggle('active-tool', tool === 'select');
  document.getElementById('drawArrowToolBtn').classList.toggle('active-tool', tool === 'drawArrow');
  document.getElementById('drawHint').classList.toggle('hidden', tool !== 'drawArrow');
  renderNodes();
}

function addNode(type) {
  const id = crypto.randomUUID();
  const baseName = type === 'evidence' ? 'Evidence' : 'Hypothesis';
  const node = {
    id,
    type,
    name: `${baseName} ${state.nodes.length + 1}`,
    x: 80 + Math.random() * 320,
    y: 80 + Math.random() * 240,
    states: ['Present', 'Absent'],
    evidence: null,
    cpt: {},
  };
  state.nodes.push(node);
  initializeCpt(node);
  state.selectedNodeId = node.id;
  state.selectedEdgeId = null;
  render();
}

function initializeCpt(node) {
  const combos = parentCombinations(getParents(node.id));
  node.cpt = {};
  combos.forEach((combo) => {
    node.cpt[combo.key] = uniform(node.states.length);
  });
}

function uniform(len) {
  return Array.from({ length: len }, () => Number((1 / len).toFixed(4)));
}

function render() {
  renderNodes();
  renderEdges();
  renderInspector();
}

function renderNodes() {
  canvas.querySelectorAll('.node').forEach((el) => el.remove());
  state.nodes.forEach((node) => {
    const el = document.createElement('div');
    el.className = `node ${node.type}`;
    if (node.id === state.selectedNodeId) el.classList.add('selected');
    if (node.id === state.pendingArrowSourceId) el.classList.add('arrow-source');
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.innerHTML = `<div class="title">${escapeHtml(node.name)}</div><div class="sub">${node.type}</div>`;

    el.addEventListener('mousedown', (event) => {
      if (state.tool === 'drawArrow') {
        handleArrowToolNodeClick(node.id);
        return;
      }
      selectNode(node.id);
      const rect = el.getBoundingClientRect();
      state.dragNode = { id: node.id, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    });

    el.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.tool === 'drawArrow') return;
      selectNode(node.id);
    });

    canvas.appendChild(el);
  });
}

function renderEdges() {
  edgeLayer.innerHTML = `
    <defs>
      <marker id="arrowHead" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,14 L13,7 z" fill="#bdd7ff" />
      </marker>
    </defs>
  `;

  state.edges.forEach((edge) => {
    const parent = state.nodes.find((n) => n.id === edge.parentId);
    const child = state.nodes.find((n) => n.id === edge.childId);
    if (!parent || !child) return;

    const geometry = edgeGeometry(parent, child, edge.bend || 0);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', `edge${edge.id === state.selectedEdgeId ? ' selected' : ''}`);
    path.setAttribute('d', geometry.path);
    path.dataset.edgeId = edge.id;
    path.addEventListener('click', (event) => {
      event.stopPropagation();
      selectEdge(edge.id);
    });
    edgeLayer.appendChild(path);

    if (edge.id === state.selectedEdgeId) {
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('class', 'bend-handle');
      handle.setAttribute('cx', geometry.handleX);
      handle.setAttribute('cy', geometry.handleY);
      handle.setAttribute('r', '7');
      handle.addEventListener('mousedown', (event) => {
        event.stopPropagation();
        state.dragBend = { edgeId: edge.id, startX: event.clientX, startBend: edge.bend || 0 };
      });
      edgeLayer.appendChild(handle);
    }
  });
}

function edgeGeometry(parent, child, bend) {
  const startX = parent.x + NODE_WIDTH;
  const startY = parent.y + NODE_HEIGHT / 2;
  const endX = child.x;
  const endY = child.y + NODE_HEIGHT / 2;
  const midX = (startX + endX) / 2;
  const controlY = (startY + endY) / 2 + bend;
  return {
    path: `M ${startX} ${startY} Q ${midX} ${controlY} ${endX} ${endY}`,
    handleX: midX,
    handleY: controlY,
  };
}

function onMouseMove(event) {
  if (state.dragNode) {
    const node = state.nodes.find((n) => n.id === state.dragNode.id);
    const bounds = canvas.getBoundingClientRect();
    node.x = event.clientX - bounds.left - state.dragNode.offsetX;
    node.y = event.clientY - bounds.top - state.dragNode.offsetY;
    render();
    return;
  }
  if (state.dragBend) {
    const edge = state.edges.find((e) => e.id === state.dragBend.edgeId);
    if (!edge) return;
    const dx = event.clientX - state.dragBend.startX;
    edge.bend = Math.max(-220, Math.min(220, state.dragBend.startBend + dx));
    edgeBendInput.value = String(edge.bend);
    renderEdges();
  }
}

function handleArrowToolNodeClick(nodeId) {
  if (!state.pendingArrowSourceId) {
    state.pendingArrowSourceId = nodeId;
    renderNodes();
    return;
  }
  const parentId = state.pendingArrowSourceId;
  state.pendingArrowSourceId = null;
  if (parentId === nodeId) {
    renderNodes();
    return;
  }
  if (state.edges.some((e) => e.parentId === parentId && e.childId === nodeId)) {
    renderNodes();
    return;
  }
  const edge = { id: crypto.randomUUID(), parentId, childId: nodeId, bend: 0 };
  state.edges.push(edge);
  if (createsCycle()) {
    state.edges.pop();
    renderNodes();
    return;
  }
  const child = state.nodes.find((n) => n.id === nodeId);
  if (child) initializeCpt(child);
  selectEdge(edge.id);
  render();
}

function selectNode(id) {
  state.selectedNodeId = id;
  state.selectedEdgeId = null;
  render();
}

function selectEdge(edgeId) {
  state.selectedEdgeId = edgeId;
  state.selectedNodeId = null;
  renderInspector();
  renderEdges();
}

function clearSelection() {
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  renderInspector();
  render();
}

function renderInspector() {
  const node = getSelectedNode();
  const edge = getSelectedEdge();
  if (!node && !edge) {
    inspector.classList.add('hidden');
    emptySelection.classList.remove('hidden');
    return;
  }

  inspector.classList.remove('hidden');
  emptySelection.classList.add('hidden');
  nodeInspector.classList.toggle('hidden', !node);
  edgeInspector.classList.toggle('hidden', !edge);

  if (node) {
    nodeNameInput.value = node.name;
    nodeTypeInput.value = node.type;
    evidenceSelect.innerHTML = `<option value="__none__">(none)</option>${node.states.map((s) => `<option>${escapeHtml(s)}</option>`).join('')}`;
    evidenceSelect.value = node.evidence || '__none__';
    renderStatePills(node);
    renderCptEditor(node);
  }

  if (edge) {
    edgeBendInput.value = String(edge.bend || 0);
  }
}

function renderStatePills(node) {
  statePills.innerHTML = '';
  node.states.forEach((label, index) => {
    const pill = document.createElement('div');
    pill.className = 'state-pill';
    const text = document.createElement('span');
    text.textContent = label;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.addEventListener('click', () => removeState(index));
    pill.appendChild(text);
    pill.appendChild(remove);
    statePills.appendChild(pill);
  });
}

function addStateFromInput() {
  const node = getSelectedNode();
  if (!node) return;
  const label = newStateInput.value.trim();
  if (!label) return;
  if (node.states.includes(label)) return;
  node.states.push(label);
  newStateInput.value = '';
  normalizeNodeAfterStateChange(node);
}

function removeState(index) {
  const node = getSelectedNode();
  if (!node || node.states.length <= 2) return;
  node.states.splice(index, 1);
  normalizeNodeAfterStateChange(node);
}

function normalizeNodeAfterStateChange(node) {
  if (node.evidence && !node.states.includes(node.evidence)) node.evidence = null;
  initializeCpt(node);
  render();
}

function renderCptEditor(node) {
  const combos = parentCombinations(getParents(node.id));
  if (!Object.keys(node.cpt).length) initializeCpt(node);
  cptContainer.innerHTML = '';
  combos.forEach((combo) => {
    const row = document.createElement('div');
    row.className = 'cpt-row';
    const label = document.createElement('span');
    label.textContent = combo.label || '(no parents)';
    const input = document.createElement('input');
    input.value = (node.cpt[combo.key] || uniform(node.states.length)).join(', ');
    input.addEventListener('change', () => {
      const arr = input.value.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v >= 0);
      if (arr.length !== node.states.length) {
        input.value = (node.cpt[combo.key] || uniform(node.states.length)).join(', ');
        return;
      }
      const sum = arr.reduce((a, b) => a + b, 0) || 1;
      node.cpt[combo.key] = arr.map((v) => Number((v / sum).toFixed(4)));
      input.value = node.cpt[combo.key].join(', ');
    });
    row.appendChild(label);
    row.appendChild(input);
    cptContainer.appendChild(row);
  });
}

function deleteSelected() {
  if (state.selectedNodeId) {
    const id = state.selectedNodeId;
    state.nodes = state.nodes.filter((n) => n.id !== id);
    state.edges = state.edges.filter((e) => e.parentId !== id && e.childId !== id);
    state.selectedNodeId = null;
    render();
    return;
  }
  if (state.selectedEdgeId) {
    state.edges = state.edges.filter((e) => e.id !== state.selectedEdgeId);
    state.selectedEdgeId = null;
    render();
  }
}

function getSelectedNode() {
  return state.nodes.find((n) => n.id === state.selectedNodeId) || null;
}

function getSelectedEdge() {
  return state.edges.find((e) => e.id === state.selectedEdgeId) || null;
}

function createsCycle() {
  const children = new Map(state.nodes.map((n) => [n.id, []]));
  state.edges.forEach((e) => children.get(e.parentId)?.push(e.childId));
  const visiting = new Set();
  const visited = new Set();
  function dfs(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const c of children.get(id) || []) if (dfs(c)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return state.nodes.some((n) => dfs(n.id));
}

function getParents(nodeId) {
  return state.edges
    .filter((e) => e.childId === nodeId)
    .map((e) => state.nodes.find((n) => n.id === e.parentId))
    .filter(Boolean);
}

function parentCombinations(parents) {
  if (!parents.length) return [{ key: '__root__', values: [], label: '' }];
  const combos = [];
  function build(i, vals, labels) {
    if (i >= parents.length) {
      combos.push({ key: vals.join('|'), values: [...vals], label: labels.join(', ') });
      return;
    }
    parents[i].states.forEach((s) => {
      vals.push(s);
      labels.push(`${parents[i].name}=${s}`);
      build(i + 1, vals, labels);
      vals.pop();
      labels.pop();
    });
  }
  build(0, [], []);
  return combos;
}

function runInference() {
  const ordered = topoOrder();
  if (!ordered) {
    inferenceOutput.innerHTML = 'Cannot infer: graph has a cycle.';
    summaryOutput.innerHTML = '';
    return;
  }
  const hypothesisNodes = state.nodes.filter((n) => n.type === 'hypothesis');
  if (!hypothesisNodes.length) {
    inferenceOutput.innerHTML = 'Add at least one Hypothesis node.';
    summaryOutput.innerHTML = '';
    return;
  }

  const rows = [];
  const summary = [];
  hypothesisNodes.forEach((node) => {
    const probs = node.states.map((s) => enumeratePosterior(node, s, ordered));
    const z = probs.reduce((a, b) => a + b, 0) || 1;
    const nProbs = probs.map((p) => p / z);
    rows.push(`<div><strong>${escapeHtml(node.name)}</strong><br/>${node.states.map((s, i) => `${escapeHtml(s)}: ${(nProbs[i] * 100).toFixed(2)}%`).join(' | ')}</div><hr/>`);

    const best = nProbs.reduce((bi, p, i, arr) => (p > arr[bi] ? i : bi), 0);
    const parents = getParents(node.id).filter((p) => p.type === 'evidence').map((p) => p.name);
    const given = parents.length ? parents.join(' and ') : 'available evidence';
    summary.push(`The probability of ${node.name} being ${node.states[best]} given ${given} is ${(nProbs[best] * 100).toFixed(2)}%.`);
  });

  inferenceOutput.innerHTML = rows.join('');
  summaryOutput.innerHTML = summary.map((s) => `<div>${escapeHtml(s)}</div>`).join('');
}

function enumeratePosterior(queryNode, queryState, ordered) {
  const evidence = {};
  state.nodes.forEach((n) => {
    if (n.evidence) evidence[n.id] = n.evidence;
  });
  evidence[queryNode.id] = queryState;
  return enumerateAll(ordered, evidence);
}

function enumerateAll(vars, evidence) {
  if (!vars.length) return 1;
  const [first, ...rest] = vars;
  if (evidence[first.id]) return probGivenParents(first, evidence[first.id], evidence) * enumerateAll(rest, evidence);
  return first.states.reduce((sum, st) => sum + probGivenParents(first, st, { ...evidence, [first.id]: st }) * enumerateAll(rest, { ...evidence, [first.id]: st }), 0);
}

function probGivenParents(node, stateName, evidence) {
  const parents = getParents(node.id);
  const key = parents.length ? parents.map((p) => evidence[p.id] || p.states[0]).join('|') : '__root__';
  const dist = node.cpt[key] || uniform(node.states.length);
  return dist[node.states.indexOf(stateName)] ?? 0;
}

function topoOrder() {
  const indeg = new Map(state.nodes.map((n) => [n.id, 0]));
  const kids = new Map(state.nodes.map((n) => [n.id, []]));
  state.edges.forEach((e) => {
    indeg.set(e.childId, (indeg.get(e.childId) || 0) + 1);
    kids.get(e.parentId)?.push(e.childId);
  });
  const queue = state.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const out = [];
  while (queue.length) {
    const id = queue.shift();
    const node = state.nodes.find((n) => n.id === id);
    if (!node) continue;
    out.push(node);
    (kids.get(id) || []).forEach((c) => {
      indeg.set(c, (indeg.get(c) || 0) - 1);
      if (indeg.get(c) === 0) queue.push(c);
    });
  }
  return out.length === state.nodes.length ? out : null;
}

function saveModelObject() {
  return { version: 3, nodes: state.nodes, edges: state.edges };
}

function saveToFile() {
  const blob = new Blob([JSON.stringify(saveModelObject(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `bayesian-network-save-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      loadModelObject(parsed);
      document.getElementById('uploadInput').value = '';
    } catch {
      alert('Could not read the save file. Please upload a valid JSON save.');
    }
  };
  reader.readAsText(file);
}

function loadModelObject(model) {
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) throw new Error('Invalid save format');
  const migratedNodes = model.nodes.map((n, i) => ({
    id: n.id || crypto.randomUUID(),
    type: n.type === 'hypothesis' ? 'hypothesis' : 'evidence',
    name: n.name || `Node ${i + 1}`,
    x: Number.isFinite(n.x) ? n.x : 80,
    y: Number.isFinite(n.y) ? n.y : 80,
    states: Array.isArray(n.states) && n.states.length > 1 ? n.states : ['Present', 'Absent'],
    evidence: n.evidence || null,
    cpt: n.cpt && typeof n.cpt === 'object' ? n.cpt : {},
  }));
  const idSet = new Set(migratedNodes.map((n) => n.id));
  const migratedEdges = model.edges
    .map((e) => ({
      id: e.id || crypto.randomUUID(),
      parentId: e.parentId,
      childId: e.childId,
      bend: Number.isFinite(e.bend) ? e.bend : 0,
    }))
    .filter((e) => idSet.has(e.parentId) && idSet.has(e.childId));

  state.nodes = migratedNodes;
  state.edges = migratedEdges;
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.pendingArrowSourceId = null;
  render();
}

function quickSave() {
  localStorage.setItem('bnStudioQuickSave', JSON.stringify(saveModelObject()));
}

function quickLoad() {
  const raw = localStorage.getItem('bnStudioQuickSave');
  if (!raw) return;
  try {
    loadModelObject(JSON.parse(raw));
  } catch {
    alert('Quick save data is invalid.');
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

setupEvents();
setTool('select');
render();
