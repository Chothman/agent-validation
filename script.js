let reviews = [];
let currentDetailsRow = null;
let agentListCache = [];

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  startBackgroundAutoRefresh();
});

// ============ NAV ============
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(item.dataset.view).classList.add('active');
    if (item.dataset.view === 'review-log') loadLog();
    if (item.dataset.view === 'dashboard') loadDashboard();
  });
});

// ============ TOAST ============
let __toastTimer = null;
function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast' + (type ? ' ' + type : '');
  void toast.offsetWidth;
  toast.classList.add('visible');
  if (__toastTimer) clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

// ============ CONFIG (risk levels + agent autocomplete) ============
async function loadConfig() {
  try {
    const res = await fetch(`${GAS_WEB_APP_URL}?action=config`);
    const data = await res.json();
    if (data.success) {
      agentListCache = data.agents || [];
      const datalist = document.getElementById('agent-list');
      datalist.innerHTML = agentListCache.map(a => `<option value="${escapeHtml(a)}">`).join('');
    }
  } catch (err) {
    // Non-critical — form still works without autocomplete
  }
}

// ============ RISK SELECTOR (new review form) ============
let selectedRisk = '';
document.querySelectorAll('#risk-options .risk-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('#risk-options .risk-option').forEach(o => o.className = 'risk-option');
    opt.classList.add('selected-' + opt.dataset.risk);
    selectedRisk = opt.dataset.risk;
  });
});

// ============ SUBMIT NEW REVIEW ============
document.getElementById('review-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('form-msg');
  const btn = document.getElementById('submit-btn');

  if (!selectedRisk) {
    showToast('Select a risk level', 'error');
    return;
  }

  const payload = {
    action: 'create',
    reviewer: document.getElementById('f-reviewer').value.trim(),
    agent: document.getElementById('f-agent').value.trim(),
    ticketId: document.getElementById('f-ticket').value.trim(),
    actionTaken: document.getElementById('f-action').value.trim(),
    riskLevel: selectedRisk,
    feedback: document.getElementById('f-feedback').value.trim()
  };

  btn.disabled = true;
  msg.textContent = '';

  try {
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      showToast('Review submitted', 'success');
      document.getElementById('review-form').reset();
      document.querySelectorAll('#risk-options .risk-option').forEach(o => o.className = 'risk-option');
      selectedRisk = '';
      loadConfig(); // refresh agent autocomplete list
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ============ REVIEW LOG ============
async function loadLog() {
  const wrap = document.getElementById('log-table-wrap');
  wrap.innerHTML = '<div class="empty-state">Loading...</div>';

  const params = new URLSearchParams({ action: 'list' });
  const agent = document.getElementById('filter-agent').value.trim();
  const ticket = document.getElementById('filter-ticket').value.trim();
  const risk = document.getElementById('filter-risk').value;
  if (agent) params.set('agent', agent);
  if (ticket) params.set('ticketId', ticket);
  if (risk) params.set('risk', risk);

  try {
    const res = await fetch(`${GAS_WEB_APP_URL}?${params.toString()}`);
    const data = await res.json();

    if (!data.success) {
      wrap.innerHTML = `<div class="empty-state">Error: ${data.error}</div>`;
      return;
    }
    reviews = data.data || [];
    if (reviews.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No reviews found.</div>';
      return;
    }

    let html = `<table><thead><tr>
      <th>Timestamp</th><th>Reviewer</th><th>Agent</th><th>Ticket ID</th>
      <th>Risk</th><th>Action Taken</th><th>Details</th>
    </tr></thead><tbody>`;

    reviews.forEach((r, i) => {
      const ts = new Date(r.Timestamp);
      html += `<tr data-row="${r.RowIndex}">
        <td>${ts.toLocaleString()}</td>
        <td><input class="cell-input" value="${escapeAttr(r.Reviewer)}" onchange="saveField(${r.RowIndex}, 'reviewer', this.value, this)"></td>
        <td><input class="cell-input" value="${escapeAttr(r.Agent)}" list="agent-list" onchange="saveField(${r.RowIndex}, 'agent', this.value, this)"></td>
        <td><input class="cell-input" value="${escapeAttr(r.TicketID)}" onchange="saveField(${r.RowIndex}, 'ticketId', this.value, this)"></td>
        <td>${riskSelectHtml(r.RowIndex, r.RiskLevel)}</td>
        <td><input class="cell-input" value="${escapeAttr(r.ActionTaken)}" onchange="saveField(${r.RowIndex}, 'actionTaken', this.value, this)"></td>
        <td><button class="btn-mini" onclick="openDetails(${r.RowIndex})">Details</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Network error: ${err.message}</div>`;
  }
}

function riskSelectHtml(rowIndex, current) {
  const levels = ['Risky', 'Medium', 'Normal'];
  const opts = levels.map(l => `<option value="${l}" ${l === current ? 'selected' : ''}>${l}</option>`).join('');
  return `<select class="cell-input cell-select" onchange="saveField(${rowIndex}, 'riskLevel', this.value, this)">${opts}</select>`;
}

async function saveField(rowIndex, field, value, el) {
  el.disabled = true;
  try {
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'update', rowIndex: rowIndex, field: field, value: value })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Saved', 'success');
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    el.disabled = false;
  }
}

document.getElementById('apply-filters').addEventListener('click', loadLog);
document.getElementById('clear-filters').addEventListener('click', () => {
  document.getElementById('filter-agent').value = '';
  document.getElementById('filter-ticket').value = '';
  document.getElementById('filter-risk').value = '';
  loadLog();
});

// ============ DETAILS MODAL ============
function openDetails(rowIndex) {
  const row = reviews.find(r => r.RowIndex === rowIndex);
  if (!row) return;
  currentDetailsRow = row;

  const fields = [
    { label: 'Timestamp', value: new Date(row.Timestamp).toLocaleString(), copy: true },
    { label: 'Reviewer', value: row.Reviewer, copy: true },
    { label: 'Agent', value: row.Agent, copy: true },
    { label: 'Ticket ID', value: row.TicketID, copy: true },
    { label: 'Action Taken', value: row.ActionTaken, copy: true },
    { label: 'Risk Level', value: row.RiskLevel, copy: true }
  ];

  const container = document.getElementById('detailsContent');
  container.innerHTML = '';

  fields.forEach(f => {
    const r = document.createElement('div');
    r.className = 'details-row';
    const l = document.createElement('div');
    l.className = 'details-label';
    l.textContent = f.label + ':';
    const v = document.createElement('div');
    v.className = 'details-value';
    const span = document.createElement('span');
    span.className = 'copy-value';
    span.textContent = f.value || 'N/A';
    span.title = 'Click to copy';
    span.addEventListener('click', () => copyToClipboard(String(f.value || ''), span));
    v.appendChild(span);
    r.appendChild(l);
    r.appendChild(v);
    container.appendChild(r);
  });

  // Feedback — editable, autosaves on blur
  const fbRow = document.createElement('div');
  fbRow.className = 'details-row';
  const fbLabel = document.createElement('div');
  fbLabel.className = 'details-label';
  fbLabel.textContent = 'Feedback:';
  const fbValue = document.createElement('div');
  fbValue.className = 'details-value';
  const fbTextarea = document.createElement('textarea');
  fbTextarea.value = row.Feedback || '';
  fbTextarea.addEventListener('blur', () => {
    if (fbTextarea.value !== row.Feedback) {
      saveFeedbackField(rowIndex, fbTextarea.value, fbTextarea);
    }
  });
  fbValue.appendChild(fbTextarea);
  fbRow.appendChild(fbLabel);
  fbRow.appendChild(fbValue);
  container.appendChild(fbRow);

  document.getElementById('detailsModal').style.display = 'block';
}

async function saveFeedbackField(rowIndex, value, el) {
  el.disabled = true;
  try {
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'update', rowIndex: rowIndex, field: 'feedback', value: value })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Feedback saved', 'success');
      if (currentDetailsRow && currentDetailsRow.RowIndex === rowIndex) currentDetailsRow.Feedback = value;
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    el.disabled = false;
  }
}

function closeModal() {
  document.getElementById('detailsModal').style.display = 'none';
  currentDetailsRow = null;
}

window.addEventListener('click', (e) => {
  const modal = document.getElementById('detailsModal');
  if (e.target === modal) closeModal();
});

// ============ COPY TO CLIPBOARD ============
function copyToClipboard(text, el) {
  if (el) {
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 800);
  }
  showToast('Copied', 'success');

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  } else {
    legacyCopy(text);
  }
}

function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e) {
    window.prompt('Copy this value:', text);
  }
}

// ============ DASHBOARD ============
async function loadDashboard() {
  const agentWrap = document.getElementById('agent-table-wrap');
  agentWrap.innerHTML = '<div class="empty-state">Loading...</div>';

  try {
    const res = await fetch(`${GAS_WEB_APP_URL}?action=summary`);
    const data = await res.json();

    if (!data.success) {
      agentWrap.innerHTML = `<div class="empty-state">Error: ${data.error}</div>`;
      return;
    }

    document.getElementById('count-risky').textContent = data.byRisk.Risky;
    document.getElementById('count-medium').textContent = data.byRisk.Medium;
    document.getElementById('count-normal').textContent = data.byRisk.Normal;

    const agents = Object.keys(data.byAgent);
    if (agents.length === 0) {
      agentWrap.innerHTML = '<div class="empty-state">No data yet.</div>';
      return;
    }

    let html = `<table><thead><tr>
      <th>Agent</th><th>Risky</th><th>Medium</th><th>Normal</th><th>Total</th>
    </tr></thead><tbody>`;
    agents.forEach(a => {
      const s = data.byAgent[a];
      html += `<tr>
        <td>${escapeHtml(a)}</td>
        <td>${s.Risky || 0}</td>
        <td>${s.Medium || 0}</td>
        <td>${s.Normal || 0}</td>
        <td>${s.total}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    agentWrap.innerHTML = html;
  } catch (err) {
    agentWrap.innerHTML = `<div class="empty-state">Network error: ${err.message}</div>`;
  }
}

// ============ BACKGROUND AUTO-REFRESH ============
function startBackgroundAutoRefresh() {
  setInterval(() => {
    const activeInput = document.activeElement;
    const isTypingInLog = activeInput && activeInput.closest && activeInput.closest('#review-log') &&
      (activeInput.tagName === 'INPUT' || activeInput.tagName === 'SELECT' || activeInput.tagName === 'TEXTAREA');

    if (document.getElementById('review-log').classList.contains('active') && !isTypingInLog) {
      loadLog();
    }
    if (document.getElementById('dashboard').classList.contains('active')) {
      loadDashboard();
    }
  }, 180000); // 3 minutes
}

// ============ UTIL ============
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
