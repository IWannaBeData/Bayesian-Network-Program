const NODE_WIDTH = 154;
const NODE_HEIGHT = 58;

const state = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  tool: 'select',
  pendingArrowSourceId: null,
  dragNode: null,
  dragEdge: null,
  pan: { x: 0, y: 0 },
  zoom: 1,
  panningCanvas: null,
  nodeLight: 48,
  heatEnabled: false,
};

const canvas = document.getElementById('canvas');
const viewport = document.getElementById('viewport');
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
const inferenceOutput = document.getElementById('inferenceOutput');
const summaryOutput = document.getElementById('summaryOutput');

function setupEvents() {
  document.querySelectorAll('[data-add-node]').forEach((btn) => btn.addEventListener('click', () => addNode(btn.dataset.addNode)));
  document.getElementById('selectToolBtn').addEventListener('click', () => setTool('select'));
  document.getElementById('drawArrowToolBtn').addEventListener('click', () => setTool('drawArrow'));
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelected);
  document.getElementById('resetViewBtn').addEventListener('click', resetView);

  nodeNameInput.addEventListener('input', () => {
    const node = getSelectedNode();
    if (!node) return;
    node.name = nodeNameInput.value;
    renderNodes();
    renderEdges();
  });

  evidenceSelect.addEventListener('change', () => {
    const node = getSelectedNode();
    if (!node) return;
    node.evidence = evidenceSelect.value === '__none__' ? null : evidenceSelect.value;
  });

  newStateInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addStateFromInput();
    }
  });
  document.getElementById('addStateBtn').addEventListener('click', addStateFromInput);
  document.getElementById('runInferenceBtn').addEventListener('click', () => runInference(true));

  document.getElementById('uiHueInput').addEventListener('input', (event) => {
    document.documentElement.style.setProperty('--ui-hue', String(event.target.value));
  });
  document.getElementById('nodeLightInput').addEventListener('input', (event) => {
    state.nodeLight = Number(event.target.value);
    renderNodes();
  });
  document.getElementById('applyHeatBtn').addEventListener('click', () => {
    state.heatEnabled = true;
    runInference(false);
    renderNodes();
  });

  document.getElementById('saveFileBtn').addEventListener('click', saveToFile);
  document.getElementById('openFileBtn').addEventListener('click', () => document.getElementById('uploadInput').click());
  document.getElementById('uploadInput').addEventListener('change', (event) => importFromFile(event.target.files?.[0]));
  document.getElementById('quickSaveBtn').addEventListener('click', quickSave);
  document.getElementById('quickLoadBtn').addEventListener('click', quickLoad);

  setupDropZone();

  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
  canvas.addEventListener('mousedown', onCanvasMouseDown);
  canvas.addEventListener('click', (event) => {
    if (event.target === canvas || event.target === viewport || event.target === edgeLayer) clearSelection();
  });

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', () => {
    state.dragNode = null;
    state.dragEdge = null;
    state.panningCanvas = null;
    canvas.classList.remove('panning');
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Backspace') return;
    const tag = event.target?.tagName?.toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || event.target?.isContentEditable;
    if (typing) return;
    event.preventDefault();
    deleteSelected();
  });
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
  const states = type === 'hypothesis' ? ['True', 'False'] : ['Present', 'Absent'];
  state.nodes.push({
    id,
    type,
    name: `${type === 'evidence' ? 'Evidence' : 'Hypothesis'} ${state.nodes.length + 1}`,
    x: 100 + Math.random() * 300,
    y: 100 + Math.random() * 220,
    states,
    evidence: null,
    cpt: {},
    heatProb: null,
  });
  initializeCpt(state.nodes[state.nodes.length - 1]);
  state.selectedNodeId = id;
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
  viewport.querySelectorAll('.node').forEach((el) => el.remove());

  state.nodes.forEach((node) => {
    const el = document.createElement('div');
    el.className = `node ${node.type}`;
    if (node.id === state.selectedNodeId) el.classList.add('selected');
    if (node.id === state.pendingArrowSourceId) el.classList.add('arrow-source');
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.background = nodeBackground(node);
    el.innerHTML = `<div class="title">${escapeHtml(node.name)}</div><div class="sub">${node.type}</div>`;

    el.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      if (state.tool !== 'select') return;
      selectNode(node.id);
      const world = screenToWorld(event.clientX, event.clientY);
      state.dragNode = { id: node.id, offsetX: world.x - node.x, offsetY: world.y - node.y };
    });

    el.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.tool === 'drawArrow') {
        handleArrowToolNodeClick(node.id);
        return;
      }
      selectNode(node.id);
    });

    viewport.appendChild(el);
  });
}

function nodeBackground(node) {
  if (state.heatEnabled && node.states.length === 2 && Number.isFinite(node.heatProb)) {
    const hue = Math.round(120 * node.heatProb);
    const light = state.nodeLight;
    return `linear-gradient(140deg, hsl(${hue},85%,${Math.min(light + 12, 78)}%), hsl(${hue},78%,${light}%))`;
  }
  const hue = node.type === 'evidence' ? 170 : 250;
  const light = state.nodeLight;
  return `linear-gradient(140deg, hsl(${hue},80%,${Math.min(light + 14, 80)}%), hsl(${hue},74%,${light}%))`;
}

function renderEdges() {
  edgeLayer.innerHTML = `<defs><marker id="arrowHead" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,14 L13,7 z" fill="#5f91db" /></marker></defs>`;

  state.edges.forEach((edge) => {
    const parent = state.nodes.find((n) => n.id === edge.parentId);
    const child = state.nodes.find((n) => n.id === edge.childId);
    if (!parent || !child) return;

    const geometry = edgeGeometry(parent, child, edge.bend || 0);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (edge.id === state.selectedEdgeId) group.setAttribute('class', 'edge-selected');

    const visible = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visible.setAttribute('class', 'edge-visible');
    visible.setAttribute('d', geometry.path);

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('class', 'edge-hit');
    hit.setAttribute('d', geometry.path);

    hit.addEventListener('click', (event) => {
      event.stopPropagation();
      selectEdge(edge.id);
    });

    hit.addEventListener('mousedown', (event) => {
      if (state.tool !== 'select') return;
      event.stopPropagation();
      selectEdge(edge.id);
      state.dragEdge = { edgeId: edge.id, startY: event.clientY, startBend: edge.bend || 0 };
    });

    group.appendChild(visible);
    group.appendChild(hit);
    edgeLayer.appendChild(group);
  });
}

function edgeGeometry(parent, child, bend) {
  const start = anchorPoint(parent, child, true);
  const end = anchorPoint(child, parent, false);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const controlX = midX + nx * bend;
  const controlY = midY + ny * bend;

  return {
    path: `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`,
  };
}

function anchorPoint(fromNode, toNode, isSource) {
  const centerFrom = { x: fromNode.x + NODE_WIDTH / 2, y: fromNode.y + NODE_HEIGHT / 2 };
  const centerTo = { x: toNode.x + NODE_WIDTH / 2, y: toNode.y + NODE_HEIGHT / 2 };
  const dx = centerTo.x - centerFrom.x;
  const dy = centerTo.y - centerFrom.y;

  const candidates = [
    { x: fromNode.x + NODE_WIDTH / 2, y: fromNode.y, side: 'top' },
    { x: fromNode.x + NODE_WIDTH / 2, y: fromNode.y + NODE_HEIGHT, side: 'bottom' },
    { x: fromNode.x, y: fromNode.y + NODE_HEIGHT / 2, side: 'left' },
    { x: fromNode.x + NODE_WIDTH, y: fromNode.y + NODE_HEIGHT / 2, side: 'right' },
    { x: fromNode.x + NODE_WIDTH * 0.25, y: fromNode.y, side: 'top' },
    { x: fromNode.x + NODE_WIDTH * 0.75, y: fromNode.y, side: 'top' },
    { x: fromNode.x + NODE_WIDTH * 0.25, y: fromNode.y + NODE_HEIGHT, side: 'bottom' },
    { x: fromNode.x + NODE_WIDTH * 0.75, y: fromNode.y + NODE_HEIGHT, side: 'bottom' },
    { x: fromNode.x, y: fromNode.y + NODE_HEIGHT * 0.25, side: 'left' },
    { x: fromNode.x, y: fromNode.y + NODE_HEIGHT * 0.75, side: 'left' },
    { x: fromNode.x + NODE_WIDTH, y: fromNode.y + NODE_HEIGHT * 0.25, side: 'right' },
    { x: fromNode.x + NODE_WIDTH, y: fromNode.y + NODE_HEIGHT * 0.75, side: 'right' },
  ];

  let best = candidates[0];
  let bestScore = Infinity;
  candidates.forEach((p) => {
    const vx = p.x - centerFrom.x;
    const vy = p.y - centerFrom.y;
    const outward = isSource ? (vx * dx + vy * dy) : (vx * -dx + vy * -dy);
    const distance = Math.hypot(p.x - centerTo.x, p.y - centerTo.y);
    const score = distance - outward * 0.2;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  });

  return { x: best.x, y: best.y };
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.pan.x) / state.zoom,
    y: (clientY - rect.top - state.pan.y) / state.zoom,
  };
}

function onCanvasWheel(event) {
  event.preventDefault();
  const before = screenToWorld(event.clientX, event.clientY);
  const factor = event.deltaY < 0 ? 1.08 : 0.92;
  state.zoom = Math.max(0.35, Math.min(2.6, state.zoom * factor));
  const after = screenToWorld(event.clientX, event.clientY);
  state.pan.x += (after.x - before.x) * state.zoom;
  state.pan.y += (after.y - before.y) * state.zoom;
  applyViewportTransform();
}

function onCanvasMouseDown(event) {
  if (event.target !== canvas && event.target !== viewport && event.target !== edgeLayer) return;
  state.panningCanvas = { x: event.clientX, y: event.clientY, panX: state.pan.x, panY: state.pan.y };
  canvas.classList.add('panning');
}

function onMouseMove(event) {
  if (state.dragNode) {
    const node = state.nodes.find((n) => n.id === state.dragNode.id);
    if (!node) return;
    const world = screenToWorld(event.clientX, event.clientY);
    node.x = world.x - state.dragNode.offsetX;
    node.y = world.y - state.dragNode.offsetY;
    render();
    return;
  }

  if (state.dragEdge) {
    const edge = state.edges.find((e) => e.id === state.dragEdge.edgeId);
    if (!edge) return;
    const delta = (event.clientY - state.dragEdge.startY) / Math.max(0.6, state.zoom);
    edge.bend = Math.max(-240, Math.min(240, state.dragEdge.startBend + delta));
    renderEdges();
    return;
  }

  if (state.panningCanvas) {
    state.pan.x = state.panningCanvas.panX + (event.clientX - state.panningCanvas.x);
    state.pan.y = state.panningCanvas.panY + (event.clientY - state.panningCanvas.y);
    applyViewportTransform();
  }
}

function applyViewportTransform() {
  viewport.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
}

function resetView() {
  state.pan = { x: 0, y: 0 };
  state.zoom = 1;
  applyViewportTransform();
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

function selectEdge(id) {
  state.selectedEdgeId = id;
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

function getSelectedNode() {
  return state.nodes.find((n) => n.id === state.selectedNodeId) || null;
}

function getSelectedEdge() {
  return state.edges.find((e) => e.id === state.selectedEdgeId) || null;
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
}

function renderStatePills(node) {
  statePills.innerHTML = '';
  node.states.forEach((label, index) => {
    const pill = document.createElement('div');
    pill.className = 'state-pill';
    pill.innerHTML = `<span>${escapeHtml(label)}</span>`;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.addEventListener('click', () => removeState(index));
    pill.appendChild(remove);
    statePills.appendChild(pill);
  });
}

function addStateFromInput() {
  const node = getSelectedNode();
  if (!node) return;
  const label = newStateInput.value.trim();
  if (!label || node.states.includes(label)) return;
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

function getParents(nodeId) {
  return state.edges
    .filter((e) => e.childId === nodeId)
    .map((e) => state.nodes.find((n) => n.id === e.parentId))
    .filter(Boolean);
}

function parentCombinations(parents) {
  if (!parents.length) return [{ key: '__root__', values: [], label: '' }];
  const combos = [];

  function build(idx, vals, labels) {
    if (idx >= parents.length) {
      combos.push({ key: vals.join('|'), values: [...vals], label: labels.join(', ') });
      return;
    }

    parents[idx].states.forEach((s) => {
      vals.push(s);
      labels.push(`${parents[idx].name}=${s}`);
      build(idx + 1, vals, labels);
      vals.pop();
      labels.pop();
    });
  }

  build(0, [], []);
  return combos;
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
    for (const c of children.get(id) || []) {
      if (dfs(c)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return state.nodes.some((n) => dfs(n.id));
}

function runInference(showOutputs) {
  const ordered = topoOrder();
  if (!ordered) {
    if (showOutputs) {
      inferenceOutput.innerHTML = 'Cannot infer: graph has a cycle.';
      summaryOutput.innerHTML = '';
    }
    return;
  }

  const hypotheses = state.nodes.filter((n) => n.type === 'hypothesis');
  const rows = [];
  const summary = [];

  state.nodes.forEach((n) => {
    n.heatProb = null;
  });

  state.nodes.filter((n) => n.states.length === 2).forEach((node) => {
    const p = enumeratePosterior(node, node.states[0], ordered);
    const q = enumeratePosterior(node, node.states[1], ordered);
    const z = p + q || 1;
    node.heatProb = p / z;
  });

  hypotheses.forEach((node) => {
    const probs = node.states.map((s) => enumeratePosterior(node, s, ordered));
    const z = probs.reduce((a, b) => a + b, 0) || 1;
    const norm = probs.map((v) => v / z);
    rows.push(`<div><strong>${escapeHtml(node.name)}</strong><br/>${node.states.map((s, i) => `${escapeHtml(s)}: ${(norm[i] * 100).toFixed(2)}%`).join(' | ')}</div><hr/>`);

    const best = norm.reduce((bi, p, i, arr) => (p > arr[bi] ? i : bi), 0);
    const parents = getParents(node.id).filter((p) => p.type === 'evidence').map((p) => p.name);
    summary.push(`The probability of ${node.name} being ${node.states[best]} given ${parents.length ? parents.join(' and ') : 'available evidence'} is ${(norm[best] * 100).toFixed(2)}%.`);
  });

  if (showOutputs) {
    inferenceOutput.innerHTML = rows.join('') || 'No hypothesis nodes available.';
    summaryOutput.innerHTML = summary.map((s) => `<div>${escapeHtml(s)}</div>`).join('');
  }

  if (state.heatEnabled) renderNodes();
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
  return first.states.reduce((sum, st) => {
    const next = { ...evidence, [first.id]: st };
    return sum + probGivenParents(first, st, next) * enumerateAll(rest, next);
  }, 0);
}

function probGivenParents(node, stateName, evidence) {
  const parents = getParents(node.id);
  const key = parents.length ? parents.map((p) => evidence[p.id] || p.states[0]).join('|') : '__root__';
  const dist = node.cpt[key] || uniform(node.states.length);
  const idx = node.states.indexOf(stateName);
  return dist[idx] ?? 0;
}

function topoOrder() {
  const indeg = new Map(state.nodes.map((n) => [n.id, 0]));
  const kids = new Map(state.nodes.map((n) => [n.id, []]));
  state.edges.forEach((e) => {
    indeg.set(e.childId, indeg.get(e.childId) + 1);
    kids.get(e.parentId).push(e.childId);
  });

  const queue = state.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const out = [];
  while (queue.length) {
    const id = queue.shift();
    const node = state.nodes.find((n) => n.id === id);
    if (!node) continue;
    out.push(node);
    (kids.get(id) || []).forEach((c) => {
      indeg.set(c, indeg.get(c) - 1);
      if (indeg.get(c) === 0) queue.push(c);
    });
  }

  return out.length === state.nodes.length ? out : null;
}

function setupDropZone() {
  const dz = document.getElementById('dropZone');
  ['dragenter', 'dragover'].forEach((name) => dz.addEventListener(name, (e) => {
    e.preventDefault();
    dz.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((name) => dz.addEventListener(name, (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', (e) => importFromFile(e.dataTransfer?.files?.[0]));
}

function saveModelObject() {
  return { version: 5, nodes: state.nodes, edges: state.edges, pan: state.pan, zoom: state.zoom };
}

function saveToFile() {
  const blob = new Blob([JSON.stringify(saveModelObject(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bayesian-network-save-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadModelObject(JSON.parse(String(reader.result)));
      document.getElementById('uploadInput').value = '';
    } catch {
      alert('Could not read save file. Please use a valid JSON save.');
    }
  };
  reader.readAsText(file);
}

function defaultStatesByType(type) {
  return type === 'hypothesis' ? ['True', 'False'] : ['Present', 'Absent'];
}

function loadModelObject(model) {
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) throw new Error('Invalid save format');

  state.nodes = model.nodes.map((n, i) => {
    const type = n.type === 'hypothesis' ? 'hypothesis' : 'evidence';
    const fallbackStates = defaultStatesByType(type);
    return {
      id: n.id || crypto.randomUUID(),
      type,
      name: n.name || `Node ${i + 1}`,
      x: Number.isFinite(n.x) ? n.x : 90,
      y: Number.isFinite(n.y) ? n.y : 90,
      states: Array.isArray(n.states) && n.states.length > 1 ? n.states : fallbackStates,
      evidence: n.evidence || null,
      cpt: n.cpt && typeof n.cpt === 'object' ? n.cpt : {},
      heatProb: null,
    };
  });

  const ids = new Set(state.nodes.map((n) => n.id));
  state.edges = model.edges
    .map((e) => ({
      id: e.id || crypto.randomUUID(),
      parentId: e.parentId,
      childId: e.childId,
      bend: Number.isFinite(e.bend) ? e.bend : 0,
    }))
    .filter((e) => ids.has(e.parentId) && ids.has(e.childId));

  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.pendingArrowSourceId = null;
  state.pan = model.pan && Number.isFinite(model.pan.x) && Number.isFinite(model.pan.y) ? model.pan : { x: 0, y: 0 };
  state.zoom = Number.isFinite(model.zoom) ? Math.max(0.35, Math.min(2.6, model.zoom)) : 1;
  applyViewportTransform();
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
applyViewportTransform();
render();
