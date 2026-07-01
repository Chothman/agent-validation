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

// ============ RISK SELECTOR ============
let selectedRisk = '';
document.querySelectorAll('.risk-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.risk-option').forEach(o => o.className = 'risk-option');
    opt.classList.add('selected-' + opt.dataset.risk);
    selectedRisk = opt.dataset.risk;
  });
});

// ============ SUBMIT REVIEW ============
document.getElementById('review-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('form-msg');
  const btn = document.getElementById('submit-btn');

  if (!selectedRisk) {
    msg.textContent = 'Select a risk level.';
    msg.className = 'msg error';
    return;
  }

  const payload = {
    reviewer: document.getElementById('f-reviewer').value.trim(),
    agent: document.getElementById('f-agent').value.trim(),
    ticketId: document.getElementById('f-ticket').value.trim(),
    actionTaken: document.getElementById('f-action').value.trim(),
    riskLevel: selectedRisk,
    feedback: document.getElementById('f-feedback').value.trim()
  };

  btn.disabled = true;
  msg.textContent = 'Submitting...';
  msg.className = 'msg';

  try {
    // Sent as text/plain to avoid CORS preflight — GAS parses JSON server-side
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      msg.textContent = 'Review submitted.';
      msg.className = 'msg success';
      document.getElementById('review-form').reset();
      document.querySelectorAll('.risk-option').forEach(o => o.className = 'risk-option');
      selectedRisk = '';
    } else {
      msg.textContent = 'Error: ' + data.error;
      msg.className = 'msg error';
    }
  } catch (err) {
    msg.textContent = 'Network error: ' + err.message;
    msg.className = 'msg error';
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
    if (data.data.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No reviews found.</div>';
      return;
    }

    let html = `<table><thead><tr>
      <th>Timestamp</th><th>Reviewer</th><th>Agent</th><th>Ticket ID</th>
      <th>Risk</th><th>Action Taken</th><th>Feedback</th>
    </tr></thead><tbody>`;

    data.data.forEach(r => {
      const ts = new Date(r.Timestamp);
      html += `<tr>
        <td>${ts.toLocaleString()}</td>
        <td>${escapeHtml(r.Reviewer)}</td>
        <td>${escapeHtml(r.Agent)}</td>
        <td>${escapeHtml(r.TicketID)}</td>
        <td><span class="badge badge-${r.RiskLevel}">${r.RiskLevel}</span></td>
        <td>${escapeHtml(r.ActionTaken)}</td>
        <td>${escapeHtml(r.Feedback)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Network error: ${err.message}</div>`;
  }
}

document.getElementById('apply-filters').addEventListener('click', loadLog);
document.getElementById('clear-filters').addEventListener('click', () => {
  document.getElementById('filter-agent').value = '';
  document.getElementById('filter-ticket').value = '';
  document.getElementById('filter-risk').value = '';
  loadLog();
});

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

// ============ UTIL ============
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
