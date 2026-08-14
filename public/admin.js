'use strict';

let students = [];
let logs = [];
let pendingConfirm = null;
let activeStudentId = null;

const prizeCatalog = [
  ['珊瑚信号', '#ff705f'], ['晴空飞船', '#58b9ff'], ['柠檬唱片', '#d9e83e'], ['莓果轨迹', '#ed79b2'],
  ['薄荷方程', '#43d7b6'], ['橘子频道', '#ffad4d'], ['银色月球', '#b7c2d5']
];

const rows = document.querySelector('#studentRows');
const searchInput = document.querySelector('#searchInput');
const classFilter = document.querySelector('#classFilter');
const statusFilter = document.querySelector('#statusFilter');
const actionMenu = document.querySelector('#actionMenu');
const loginGate = document.querySelector('#adminLoginGate');

function showAdmin(admin) {
  document.querySelector('#adminDisplayName').textContent = admin.name;
  document.querySelector('#adminAccount').textContent = `账号：${admin.username}`;
  document.querySelector('#adminAvatar').textContent = admin.name.slice(0, 1);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || '服务器请求失败，请稍后重试。');
    error.status = response.status;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date).replaceAll('/', '-');
}

function statusLabel(student) {
  if (!student.isActive) return ['disabled', '已停用'];
  if (student.redeemed) return ['redeemed', '已兑换'];
  if (student.prizeId !== null && student.prizeId !== undefined) return ['drawn', '已抽取'];
  return ['ready', '未抽取'];
}

function filteredStudents() {
  const query = searchInput.value.trim().toLowerCase();
  return students.filter(student => {
    const matchesQuery = !query || `${student.name} ${student.id}`.toLowerCase().includes(query);
    const matchesClass = classFilter.value === 'all' || (student.className || '') === classFilter.value;
    const matchesStatus = statusFilter.value === 'all' || statusLabel(student)[0] === statusFilter.value;
    return matchesQuery && matchesClass && matchesStatus;
  });
}

async function loadDashboard() {
  const [studentResponse, logResponse] = await Promise.all([api('/api/admin/students'), api('/api/admin/logs')]);
  students = studentResponse.students;
  logs = logResponse.logs;
  render();
}

function render() {
  renderFilters();
  renderStats();
  renderRows();
  renderPrizes();
  renderLogs();
  document.querySelector('#studentNavCount').textContent = students.length;
}

function renderFilters() {
  const current = classFilter.value || 'all';
  const classes = [...new Set(students.map(student => student.className).filter(Boolean))].sort();
  classFilter.innerHTML = '<option value="all">全部班级</option>' + classes.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  classFilter.value = classes.includes(current) ? current : 'all';
}

function renderStats() {
  const active = students.filter(student => student.isActive);
  document.querySelector('#statTotal').firstChild.textContent = active.length;
  document.querySelector('#statReady').firstChild.textContent = active.filter(student => student.prizeId === null).length;
  document.querySelector('#statDrawn').firstChild.textContent = active.filter(student => student.prizeId !== null).length;
  document.querySelector('#statPending').firstChild.textContent = active.filter(student => student.prizeId !== null && !student.redeemed).length;
}

function renderRows() {
  const list = filteredStudents();
  document.querySelector('#resultCount').textContent = `共 ${list.length} 条`;
  document.querySelector('#emptyState').hidden = list.length > 0;
  rows.innerHTML = list.map(student => {
    const [statusClass, statusText] = statusLabel(student);
    return `<tr>
      <td class="checkbox-col"><input type="checkbox" aria-label="选择 ${escapeHtml(student.name)}"></td>
      <td><div class="student-cell"><span class="student-avatar">${escapeHtml(student.name.slice(0, 1))}</span><span><span class="student-name">${escapeHtml(student.name)}</span><span class="student-class">${escapeHtml(student.className || '未分班')}</span></span></div></td>
      <td><span class="id-code">${escapeHtml(student.id)}</span></td>
      <td><span class="badge ${statusClass}">${statusText}</span></td>
      <td>${student.prizeName ? `<span class="prize-name">${escapeHtml(student.prizeName)}</span>` : '<span class="prize-empty">尚未抽取</span>'}</td>
      <td><span class="time">${formatTime(student.drawnAt)}</span></td>
      <td><div class="row-actions">${student.prizeName ? `<button class="button small" data-receipt="${student.id}">查看记录</button>` : ''}<button class="button icon-only" data-menu="${student.id}" aria-label="更多操作" title="更多操作">···</button></div></td>
    </tr>`;
  }).join('');
}

function renderPrizes() {
  document.querySelector('#prizeGrid').innerHTML = prizeCatalog.map(([name, color]) => {
    const total = students.filter(student => student.prizeName === name).length;
    const pending = students.filter(student => student.prizeName === name && !student.redeemed).length;
    return `<article class="prize-item" style="--prize-color:${color}"><div class="prize-swatch"></div><div class="prize-title">${name}</div><div class="prize-meta">当前活动礼物</div><div class="prize-total"><strong>${total}</strong><span class="badge ${pending ? 'drawn' : 'redeemed'}">${pending} 待兑换</span></div></article>`;
  }).join('');
}

function renderLogs() {
  document.querySelector('#logList').innerHTML = logs.length ? logs.map(log => `<div class="log-row"><span class="log-time">${formatTime(log.createdAt)}</span><span class="log-action">${escapeHtml(log.action)}</span><span class="log-detail">${escapeHtml([log.studentId, log.detail].filter(Boolean).join(' · '))}</span><span>${escapeHtml(log.admin)}</span></div>`).join('') : '<div class="empty"><strong>暂无操作日志</strong>管理员操作会显示在这里。</div>';
}

function showMenu(button, id) {
  activeStudentId = id;
  const student = students.find(item => item.id === id);
  const rect = button.getBoundingClientRect();
  actionMenu.innerHTML = `
    ${student.prizeName ? `<button data-action="redeem">${student.redeemed ? '取消兑换标记' : '标记为已兑换'}</button>` : ''}
    <button data-action="toggle">${student.isActive ? '停用 ID' : '重新启用 ID'}</button>
    ${student.prizeName ? '<button data-action="reset">重置抽奖资格</button>' : ''}
    <div class="menu-separator"></div><button class="danger-text" data-action="delete">删除 ID</button>`;
  actionMenu.style.left = `${Math.min(rect.right - 166, innerWidth - 178)}px`;
  actionMenu.style.top = `${Math.min(rect.bottom + 4, innerHeight - 190)}px`;
  actionMenu.classList.add('is-open');
}

async function refreshWithToast(title, message) {
  await loadDashboard();
  showToast(title, message);
}

function performAction(action) {
  const student = students.find(item => item.id === activeStudentId);
  if (!student) return;
  actionMenu.classList.remove('is-open');

  if (action === 'redeem') {
    api(`/api/admin/students/${encodeURIComponent(student.id)}/redeem`, { method: 'PATCH', body: JSON.stringify({ redeemed: !student.redeemed }) })
      .then(() => refreshWithToast('兑换状态已更新', student.redeemed ? '礼物已恢复为待兑换状态。' : '该礼物已标记为完成兑换。')).catch(showApiError);
  }

  if (action === 'toggle') {
    api(`/api/admin/students/${encodeURIComponent(student.id)}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !student.isActive }) })
      .then(() => refreshWithToast('资格状态已更新', student.isActive ? '该 ID 已停用。' : '该 ID 已重新启用。')).catch(showApiError);
  }

  if (action === 'reset') {
    openConfirm('重置抽奖资格', `将清除 ${student.name}（${student.id}）的中奖与兑换记录。此后该 ID 可以重新抽取一次。`, async () => {
      await api(`/api/admin/students/${encodeURIComponent(student.id)}/reset`, { method: 'POST', body: '{}' });
      await refreshWithToast('抽奖资格已重置', '该学员现在可以重新抽取一次。');
    });
  }

  if (action === 'delete') {
    openConfirm('删除学员 ID', `将软删除 ${student.name}（${student.id}），其历史记录仍保留在 MySQL 中。`, async () => {
      await api(`/api/admin/students/${encodeURIComponent(student.id)}`, { method: 'DELETE' });
      await refreshWithToast('学员 ID 已删除', '该 ID 已从当前活动中移除。');
    });
  }
}

function openReceipt(id) {
  const student = students.find(item => item.id === id);
  if (!student) return;
  document.querySelector('#receiptBody').innerHTML = `<div style="display:grid;gap:12px;font-size:11px"><div><span style="color:#7b858e">学员</span><strong style="float:right">${escapeHtml(student.name)} · ${escapeHtml(student.id)}</strong></div><div><span style="color:#7b858e">中奖礼物</span><strong style="float:right;color:var(--accent)">${escapeHtml(student.prizeName || '尚未抽取')}</strong></div><div><span style="color:#7b858e">抽取时间</span><strong style="float:right">${formatTime(student.drawnAt)}</strong></div><div><span style="color:#7b858e">兑换状态</span><strong style="float:right">${student.redeemed ? '已兑换' : '待兑换'}</strong></div></div>`;
  openModal('receiptModal');
}

function openConfirm(title, message, callback) {
  document.querySelector('#confirmTitle').textContent = title;
  document.querySelector('#confirmMessage').textContent = message;
  pendingConfirm = callback;
  openModal('confirmModal');
}

function openModal(id) {
  const modal = document.querySelector(`#${id}`);
  modal.classList.add('is-visible');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
  const modal = document.querySelector(`#${id}`);
  modal.classList.remove('is-visible');
  modal.setAttribute('aria-hidden', 'true');
}

let toastTimer;
function showToast(title, message) {
  clearTimeout(toastTimer);
  document.querySelector('#toastTitle').textContent = title;
  document.querySelector('#toastMessage').textContent = message;
  document.querySelector('#toast').classList.add('is-visible');
  toastTimer = setTimeout(() => document.querySelector('#toast').classList.remove('is-visible'), 2800);
}

function showApiError(error) {
  if (error.status === 401) {
    loginGate.classList.add('is-visible');
    loginGate.setAttribute('aria-hidden', 'false');
  }
  showToast('操作失败', error.message);
}

document.querySelector('#adminLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#adminLoginButton');
  const errorElement = document.querySelector('#adminLoginError');
  button.disabled = true;
  errorElement.textContent = '';
  try {
    const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({
      username: document.querySelector('#adminUsername').value,
      password: document.querySelector('#adminPassword').value
    }) });
    showAdmin(result.admin);
    await loadDashboard();
    event.target.reset();
    loginGate.classList.remove('is-visible');
    loginGate.setAttribute('aria-hidden', 'true');
  } catch (error) {
    errorElement.textContent = error.message;
  } finally { button.disabled = false; }
});

document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-button').forEach(item => item.classList.toggle('is-active', item === button));
  document.querySelectorAll('.view').forEach(view => view.classList.remove('is-active'));
  document.querySelector(`#${button.dataset.view}View`).classList.add('is-active');
  document.querySelector('#breadcrumb').textContent = button.querySelector('span:nth-child(2)').textContent;
}));

[searchInput, classFilter, statusFilter].forEach(control => control.addEventListener('input', renderRows));
document.querySelector('#addButton').addEventListener('click', () => openModal('formModal'));
document.querySelector('#importButton').addEventListener('click', () => openModal('importModal'));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));

rows.addEventListener('click', event => {
  const menuButton = event.target.closest('[data-menu]');
  const receiptButton = event.target.closest('[data-receipt]');
  if (menuButton) showMenu(menuButton, menuButton.dataset.menu);
  if (receiptButton) openReceipt(receiptButton.dataset.receipt);
});

actionMenu.addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) performAction(button.dataset.action); });
document.addEventListener('click', event => { if (!event.target.closest('[data-menu]') && !event.target.closest('#actionMenu')) actionMenu.classList.remove('is-open'); });

document.querySelector('#studentForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/admin/students', { method: 'POST', body: JSON.stringify({ studentId: document.querySelector('#studentId').value, studentName: document.querySelector('#studentName').value, className: document.querySelector('#studentClass').value }) });
    event.target.reset(); closeModal('formModal'); await refreshWithToast('学员已新增', '该 ID 现在拥有一次抽奖资格。');
  } catch (error) { showApiError(error); }
});

document.querySelector('#importForm').addEventListener('submit', async event => {
  event.preventDefault();
  const records = document.querySelector('#importText').value.split(/\r?\n/).map(line => {
    const [studentId, studentName, className] = line.split(',').map(value => value?.trim());
    return { studentId, studentName, className };
  }).filter(record => record.studentId || record.studentName);
  try {
    const result = await api('/api/admin/students/import', { method: 'POST', body: JSON.stringify({ records }) });
    event.target.reset(); closeModal('importModal'); await refreshWithToast('导入完成', `新增 ${result.added} 条，跳过 ${result.skipped} 条。`);
  } catch (error) { showApiError(error); }
});

document.querySelector('#confirmAction').addEventListener('click', async () => {
  const callback = pendingConfirm;
  pendingConfirm = null;
  closeModal('confirmModal');
  try { await callback?.(); } catch (error) { showApiError(error); }
});

document.querySelector('#exportButton').addEventListener('click', () => {
  const csv = ['student_id,name,class,status,prize,drawn_at,redeemed', ...students.map(student => [student.id, student.name, student.className || '', statusLabel(student)[1], student.prizeName || '', formatTime(student.drawnAt), student.redeemed ? 'yes' : 'no'].map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
  link.download = 'blind-box-results.csv';
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector('#selectAll').addEventListener('change', event => rows.querySelectorAll('input[type="checkbox"]').forEach(box => { box.checked = event.target.checked; }));

api('/api/admin/session').then(session => {
  showAdmin(session);
  return loadDashboard();
}).then(() => {
  loginGate.classList.remove('is-visible');
  loginGate.setAttribute('aria-hidden', 'true');
}).catch(() => {});
