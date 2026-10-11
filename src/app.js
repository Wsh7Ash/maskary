// DOM glue only. All redaction logic lives in the pure modules
// (detectors/redact/jsonredact/policies/aliases) which are imported here and
// are fully unit-tested under Node. This file touches the DOM and nothing else.

import { DETECTOR_TYPES } from './detectors.js';
import { redact } from './redact.js';
import { redactJsonText } from './jsonredact.js';
import { POLICIES, DEFAULT_POLICIES } from './policies.js';

const TYPE_DISPLAY = {
  email: 'email',
  phone: 'phone',
  ipv4: 'ipv4',
  ipv6: 'ipv6',
  credit_card: 'credit card',
  iban: 'iban',
  url_cred: 'url + secrets',
  token: 'token',
  custom: 'custom terms',
};

const POLICY_HELP = {
  alias: 'EMAIL_1 style alias',
  mask_all: '***',
  keep_last4: '•••• 4242',
  keep_domain: 'j***@example.com',
};

// Synthetic demo text (RFC 2606 domains, 555 ranges) — embedded so the app
// never needs a network request to show itself off.
const SAMPLE_TEXT = `Support ticket #4821 - synthetic demo data

Customer contact: john.doe+support@example.com
Alternate: alice.smith@example.org
Callback: +44 20 7123 4567 (US: (555) 123-4567)

Card charged: 4111 1111 1111 1111
Refund IBAN: GB82 WEST 1234 5698 7654 32

Log: client_ip=192.168.10.42 edge=2001:db8::1
POST https://user:pass@gateway.example.com/v1/pay?token=abc123secret456
auth=ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8

Follow-up from john.doe+support@example.com copied alice.smith@example.org.
Year 2026, zip 90210 and order 1234567 must remain untouched.`;

const els = {};
const state = { mode: 'text', output: '', matches: [], counts: {}, error: null, view: 'highlight' };
let debounceTimer = 0;

function $(id) {
  return document.getElementById(id);
}

function detectMode(text) {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      JSON.parse(t);
      return 'json';
    } catch {
      /* fall through to text mode */
    }
  }
  return 'text';
}

function readPolicies() {
  const policies = {};
  for (const type of DETECTOR_TYPES) {
    const sel = els.policySelects[type];
    if (sel) policies[type] = sel.value;
  }
  return policies;
}

function readCustomTerms() {
  return els.customTerms.value
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function run() {
  const text = els.input.value;
  state.mode = detectMode(text);
  const opts = { policies: readPolicies(), customTerms: readCustomTerms() };
  state.error = null;
  try {
    if (state.mode === 'json') {
      const r = redactJsonText(text, opts);
      state.output = r.text;
      state.matches = r.matches;
      state.counts = r.counts;
    } else {
      const r = redact(text, opts);
      state.output = r.text;
      state.matches = r.matches;
      state.counts = r.counts;
    }
  } catch (err) {
    state.error = String(err && err.message ? err.message : err);
    state.output = '';
    state.matches = [];
    state.counts = {};
  }
  render();
}

function setStatus(msg) {
  els.status.textContent = msg;
}

function renderModeNote() {
  if (state.error) {
    els.modeNote.textContent = `error: ${state.error}`;
    els.modeNote.classList.add('is-error');
    return;
  }
  els.modeNote.classList.remove('is-error');
  if (!els.input.value) {
    els.modeNote.textContent = 'Mode: waiting for input';
    return;
  }
  els.modeNote.textContent =
    state.mode === 'json'
      ? 'Mode: JSON (structural walk — output is re-formatted with 2-space indent)'
      : 'Mode: text (regex detection, in-place replacement)';
}

function renderCounts() {
  els.counts.replaceChildren();
  const order = DETECTOR_TYPES;
  let shown = 0;
  for (const type of order) {
    const n = state.counts[type] ?? 0;
    if (n === 0) continue;
    shown++;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${TYPE_DISPLAY[type]} ×${n}`;
    els.counts.appendChild(chip);
  }
  if (shown === 0) {
    const chip = document.createElement('span');
    chip.className = 'chip chip-empty';
    chip.textContent = els.input.value ? 'no sensitive values detected' : 'nothing to redact yet';
    els.counts.appendChild(chip);
  }
}

function renderHighlight() {
  const frag = document.createDocumentFragment();
  if (state.mode === 'json') {
    // Match offsets are per-string in JSON mode, so inline marks cannot be
    // placed in the raw document text; show the redacted output instead.
    const pre = document.createElement('pre');
    pre.className = 'output-pre';
    pre.textContent = state.output;
    frag.appendChild(pre);
    return frag;
  }
  const text = els.input.value;
  let cursor = 0;
  for (const m of state.matches) {
    frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));
    const mark = document.createElement('mark');
    mark.textContent = m.replacement;
    mark.title = `${TYPE_DISPLAY[m.type]}: ${m.value}`;
    mark.className = `mk mk-${m.type.replace(/_/g, '-')}`;
    frag.appendChild(mark);
    cursor = m.end;
  }
  frag.appendChild(document.createTextNode(text.slice(cursor)));
  return frag;
}

function renderDiff() {
  const frag = document.createDocumentFragment();
  if (state.matches.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No changes.';
    frag.appendChild(p);
    return frag;
  }
  const list = document.createElement('ol');
  list.className = 'diff-list';
  let i = 0;
  for (const m of state.matches) {
    i++;
    const li = document.createElement('li');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = TYPE_DISPLAY[m.type];
    const oldSpan = document.createElement('s');
    oldSpan.className = 'diff-old';
    oldSpan.textContent = m.value;
    const arrow = document.createElement('span');
    arrow.className = 'diff-arrow';
    arrow.textContent = ' → ';
    const newSpan = document.createElement('span');
    newSpan.className = 'diff-new';
    newSpan.textContent = m.replacement;
    const alias = document.createElement('span');
    alias.className = 'diff-alias';
    alias.textContent = m.policy === 'alias' ? '' : ` (${m.alias})`;
    li.append(badge, oldSpan, arrow, newSpan, alias);
    list.appendChild(li);
  }
  frag.appendChild(list);
  return frag;
}

function renderPreview() {
  els.preview.replaceChildren(state.view === 'diff' ? renderDiff() : renderHighlight());
}

function renderExport() {
  const hasOutput = state.output.length > 0;
  els.btnCopy.disabled = !hasOutput;
  els.btnTxt.disabled = !hasOutput;
  els.btnJson.disabled = !hasOutput || state.mode !== 'json';
}

function render() {
  renderModeNote();
  renderCounts();
  renderPreview();
  renderExport();
}

async function copyOutput() {
  const text = state.output;
  if (!text) return;
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
  }
  setStatus(ok ? `copied ${text.length} characters` : 'copy failed — select the preview manually');
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function scheduleRun() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(run, 150);
}

async function loadFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    els.input.value = text;
    els.fileName.textContent = `loaded: ${file.name} (${file.size} bytes)`;
    run();
    setStatus(`loaded ${file.name}`);
  } catch (err) {
    setStatus(`could not read file: ${err && err.message ? err.message : err}`);
  }
}

function buildPolicyControls() {
  for (const type of DETECTOR_TYPES) {
    const row = document.createElement('label');
    row.className = 'policy-row';
    row.htmlFor = `policy-${type}`;
    const name = document.createElement('span');
    name.className = 'policy-name';
    name.textContent = TYPE_DISPLAY[type];
    const sel = document.createElement('select');
    sel.id = `policy-${type}`;
    for (const p of POLICIES) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = `${p} (${POLICY_HELP[p]})`;
      sel.appendChild(opt);
    }
    sel.value = DEFAULT_POLICIES[type];
    sel.addEventListener('change', run);
    row.append(name, sel);
    els.policyList.appendChild(row);
    els.policySelects[type] = sel;
  }
}

function init() {
  els.input = $('input');
  els.customTerms = $('custom-terms');
  els.policyList = $('policy-list');
  els.policySelects = {};
  els.modeNote = $('mode-note');
  els.counts = $('counts');
  els.preview = $('preview');
  els.status = $('status');
  els.fileName = $('file-name');
  els.btnCopy = $('btn-copy');
  els.btnTxt = $('btn-txt');
  els.btnJson = $('btn-json');
  els.dropZone = $('drop-zone');
  els.fileInput = $('file-input');

  buildPolicyControls();

  els.input.addEventListener('input', scheduleRun);
  els.customTerms.addEventListener('input', scheduleRun);

  $('btn-sample').addEventListener('click', () => {
    els.input.value = SAMPLE_TEXT;
    els.fileName.textContent = '';
    run();
    setStatus('loaded built-in sample');
  });
  $('btn-clear').addEventListener('click', () => {
    els.input.value = '';
    els.customTerms.value = '';
    els.fileName.textContent = '';
    setStatus('cleared');
    run();
  });

  els.fileInput.addEventListener('change', () => loadFile(els.fileInput.files[0]));

  els.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.dropZone.classList.add('is-drag');
  });
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('is-drag'));
  els.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('is-drag');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  for (const radio of document.querySelectorAll('input[name="view"]')) {
    radio.addEventListener('change', () => {
      state.view = radio.value;
      renderPreview();
    });
  }

  els.btnCopy.addEventListener('click', copyOutput);
  els.btnTxt.addEventListener('click', () => {
    download('redacted.txt', state.output, 'text/plain;charset=utf-8');
    setStatus('downloaded redacted.txt');
  });
  els.btnJson.addEventListener('click', () => {
    download('redacted.json', state.output, 'application/json;charset=utf-8');
    setStatus('downloaded redacted.json');
  });

  run();
  document.documentElement.dataset.ready = '1';
}

init();
