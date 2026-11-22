const svgNamespace = 'http://www.w3.org/2000/svg';

function textElement(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function provenanceLink(label, href) {
  const link = textElement('a', label);
  link.href = href;
  return link;
}

function svgElement(tag, attributes) {
  const element = document.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

const relationship = {
  conditional: 'Diabetes given the finding',
  bayes: 'Finding given diabetes status',
  reference: 'Descriptive evidence',
};

export function createDiabetesGraph(panel, network, endpointValue) {
  const scope = panel.querySelector('#graph-scope');
  const findings = panel.querySelector('#graph-findings');
  const endpoints = panel.querySelector('#graph-endpoints');
  const inspector = panel.querySelector('#graph-selection');
  const canvas = panel.querySelector('.graph-nodes');
  const lines = panel.querySelector('.graph-edges');
  const modelsByOutcome = new Map([...network.models.values()].map(model => [model.outcomeId, model]));
  const buttons = new Map();
  let observations;
  let caseCohort;
  let visibleEdges;
  let selected;
  let frame;

  scope.add(new Option('All studies', 'all'));
  for (const model of network.models.values()) scope.add(new Option(model.cohort.cohortLabel, model.id));

  const defs = svgElement('defs', {});
  for (const [id, color] of [['graph-arrow', '#58746b'], ['graph-arrow-active', '#0d584b']]) {
    const marker = svgElement('marker', {
      id, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', refX: 7, refY: 4, orient: 'auto',
    });
    marker.append(svgElement('path', { d: 'M0 0 L8 4 L0 8 Z', fill: color }));
    defs.append(marker);
  }

  function drawConnections() {
    if (!visibleEdges || panel.hidden) return;
    const origin = canvas.getBoundingClientRect();
    const rectangles = new Map([...buttons].map(([id, button]) => [id, button.getBoundingClientRect()]));
    const active = [];
    const other = [];
    for (const edge of visibleEdges) {
      const from = rectangles.get(edge.from);
      const to = rectangles.get(edge.to);
      const forward = from.left < to.left;
      const start = (forward ? from.right + 2 : from.left - 2) - origin.left;
      const end = (forward ? to.left - 5 : to.right + 5) - origin.left;
      const fromY = from.top + from.height / 2 - origin.top;
      const toY = to.top + to.height / 2 - origin.top;
      const bend = (end - start) * 0.52;
      const focused = edge.from === selected || edge.to === selected;
      const line = svgElement('path', {
        d: `M ${start} ${fromY} C ${start + bend} ${fromY} ${end - bend} ${toY} ${end} ${toY}`,
        class: ['relationship', edge.mode === 'reference' ? 'descriptive' : '', focused ? 'connected' : 'muted'].join(' '),
        'marker-end': focused ? 'url(#graph-arrow-active)' : 'url(#graph-arrow)',
      });
      (focused ? active : other).push(line);
    }
    lines.replaceChildren(defs, ...other, ...active);
  }

  function scheduleConnections() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(drawConnections);
  }

  new ResizeObserver(scheduleConnections).observe(canvas);

  function descriptor(id) {
    const model = modelsByOutcome.get(id);
    if (model) return { title: model.cohort.cohortLabel, value: endpointValue(model), model };
    const node = network.nodes.get(id);
    const state = observations.get(id) ?? 'unknown';
    const title = scope.value === 'all' ? node.label :
      network.models.get(scope.value).variables.get(id) ?? node.label;
    const value = { present: 'Yes', absent: 'No', unknown: 'Unknown' }[state] ?? String(state);
    return { title, value, state, code: node.code };
  }

  function showSelection(id) {
    selected = id;
    for (const [nodeId, button] of buttons) button.setAttribute('aria-pressed', String(id === nodeId));
    const { title, value, model, code } = descriptor(id);
    const valueText = (code ? code + ' · ' : '') + value;
    inspector.replaceChildren(textElement('strong', title), textElement('p', valueText));
    if (model) {
      inspector.append(
        textElement('p', model.cohort.timeWindow),
        provenanceLink('Calculation and sources', '#estimate-' + model.id),
      );
    } else {
      inspector.append(provenanceLink('Finding value and sources', '#node-' + id));
    }
    const connections = document.createElement('ul');
    for (const edge of visibleEdges) {
      if (edge.from !== id && edge.to !== id) continue;
      const other = descriptor(edge.from === id ? edge.to : edge.from);
      const item = textElement('li', other.title + ' · ' + relationship[edge.mode]);
      connections.append(item);
    }
    if (connections.children.length) {
      inspector.append(textElement('p', 'Connections in this view'), connections);
    }
    scheduleConnections();
  }

  function createNode(id) {
    const { title, value, state, code } = descriptor(id);
    const button = textElement('button', title);
    button.type = 'button';
    button.className = 'graph-node';
    button.dataset.nodeId = id;
    const badge = textElement('small', (code ? code + ' · ' : '') + value);
    if (state) badge.dataset.state = state;
    button.append(badge);
    button.addEventListener('click', () => showSelection(id));
    buttons.set(id, button);
    return button;
  }

  function render() {
    const scopedModel = network.models.get(scope.value);
    visibleEdges = scopedModel ? network.edges.filter(edge => edge.cohortId === scopedModel.id) : network.edges;
    const findingIds = new Set();
    const outcomeIds = new Set(scopedModel ? [scopedModel.outcomeId] : modelsByOutcome.keys());
    for (const edge of visibleEdges) {
      for (const id of [edge.from, edge.to]) {
        if (!modelsByOutcome.has(id)) findingIds.add(id);
      }
    }
    const orderedFindings = [...findingIds];
    if (scopedModel) {
      orderedFindings.sort((a, b) => descriptor(a).title.localeCompare(descriptor(b).title));
    }
    buttons.clear();
    findings.replaceChildren(...orderedFindings.map(createNode));
    endpoints.replaceChildren(...[...outcomeIds].map(createNode));
    const fallback = scopedModel?.outcomeId ?? network.models.get(caseCohort).outcomeId;
    showSelection(buttons.has(selected) ? selected : fallback);
    panel.querySelector('#graph-count').textContent = findingIds.size + ' study-connected ' +
      (findingIds.size === 1 ? 'finding' : 'findings') + ' · ' + outcomeIds.size +
      (outcomeIds.size === 1 ? ' endpoint' : ' endpoints');
  }

  scope.addEventListener('change', () => {
    selected = undefined;
    panel.querySelector('.graph-scroll').scrollTo(0, 0);
    render();
  });

  return {
    update(modelId, currentObservations) {
      observations = currentObservations;
      if (!caseCohort || scope.value === caseCohort) scope.value = modelId;
      caseCohort = modelId;
      render();
    },
  };
}
