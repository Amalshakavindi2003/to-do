/* app.js — adds Reminders and Recurrence support with localStorage fallback.
   - Schedules reminders via Notification API (asks permission once)
   - Stores reminder offsets and recurrence rules per task
   - On completion, creates next occurrence for recurring tasks
   - Does not automatically commit or push changes
*/

let tasks = [];
const API_PORT = 3000;
const API_BASE = `${location.protocol}//${location.hostname}:${API_PORT}/api/tasks`;
let useServer = false;
let activeSearch = '';
let activeFilter = 'all';
const REMINDER_CHECK_INTERVAL = 30 * 1000; // 30s
const REMINDER_STORAGE_KEY = 'todo_reminders_sent_v1';

window.addEventListener('DOMContentLoaded', () => {
  window.addTask = addTask;
  window.deleteTask = deleteTask;
  window.editTask = editTask;
  window.toggleComplete = toggleComplete;
  window.clearAll = clearAll;
  window.toggleDarkMode = toggleDarkMode;

  const input = document.getElementById('taskInput');
  if (input) input.addEventListener('keydown', (event) => { if (event.key === 'Enter') addTask(); });

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', () => { activeSearch = searchInput.value.trim().toLowerCase(); renderTasks(); });

  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', () => { activeFilter = statusFilter.value; renderTasks(); });

  loadDarkMode();
  askNotificationPermission();
  checkServer().then((online) => {
    useServer = online;
    setStatus(online ? 'Online - using server storage' : 'Offline - using local storage', online);
    loadTasks();
    startReminderChecker();
  });
});

function askNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().then((p) => {
      console.log('Notification permission:', p);
    });
  }
}

function setStatus(text, online) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text;
  el.className = online ? 'status online' : 'status offline';
}

function fetchWithTimeout(url, options = {}, timeout = 3000) {
  return Promise.race([ fetch(url, options), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)) ]);
}

async function checkServer() {
  try {
    const response = await fetchWithTimeout(API_BASE, { method: 'GET' }, 2000);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function loadTasks() {
  if (useServer) {
    try {
      const response = await fetch(API_BASE);
      if (!response.ok) throw new Error('Server unavailable');
      tasks = normalizeTasks(await response.json());
      renderTasks();
      return;
    } catch (error) {
      useServer = false;
      setStatus('Offline - using local storage', false);
    }
  }
  loadTasksFromLocal();
}

function loadTasksFromLocal() {
  const stored = localStorage.getItem('todoTasks');
  tasks = stored ? normalizeTasks(JSON.parse(stored)) : [];
  renderTasks();
}

function saveTasksToLocal() {
  localStorage.setItem('todoTasks', JSON.stringify(tasks));
}

function normalizeTasks(list) {
  return list.map((task) => ({
    id: Number(task.id),
    description: String(task.description || ''),
    complete: Boolean(task.complete),
    dueDate: task.dueDate || task.due_date || '',
    priority: normalizePriority(task.priority || 'medium'),
    reminderOffset: task.reminderOffset !== undefined ? Number(task.reminderOffset) : (task.reminder_offset !== undefined ? Number(task.reminder_offset) : 0),
    recurrence: task.recurrence || task.recurrence_rule || 'none',
    created_at: task.created_at || ''
  }));
}

function normalizePriority(priority) { return ['high','medium','low'].includes(priority) ? priority : 'medium'; }

function getFormValues() {
  const descriptionInput = document.getElementById('taskInput');
  const dueDateInput = document.getElementById('dueDateInput');
  const priorityInput = document.getElementById('priorityInput');
  const reminderInput = document.getElementById('reminderInput');
  const recurrenceInput = document.getElementById('recurrenceInput');
  return {
    description: descriptionInput ? descriptionInput.value.trim() : '',
    dueDate: dueDateInput ? dueDateInput.value : '',
    priority: priorityInput ? normalizePriority(priorityInput.value) : 'medium',
    reminderOffset: reminderInput ? Number(reminderInput.value) : 0,
    recurrence: recurrenceInput ? recurrenceInput.value : 'none'
  };
}

function clearForm() {
  const descriptionInput = document.getElementById('taskInput');
  const dueDateInput = document.getElementById('dueDateInput');
  const priorityInput = document.getElementById('priorityInput');
  const reminderInput = document.getElementById('reminderInput');
  const recurrenceInput = document.getElementById('recurrenceInput');
  if (descriptionInput) descriptionInput.value = '';
  if (dueDateInput) dueDateInput.value = '';
  if (priorityInput) priorityInput.value = 'medium';
  if (reminderInput) reminderInput.value = '0';
  if (recurrenceInput) recurrenceInput.value = 'none';
}

async function addTask() {
  const { description, dueDate, priority, reminderOffset, recurrence } = getFormValues();
  if (!description) return alert('Please enter a task description!');
  const payload = { description, complete: false, dueDate, priority, reminderOffset, recurrence };

  if (useServer) {
    try {
      const response = await fetch(API_BASE, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('Server unavailable');
      const created = normalizeTasks([await response.json()])[0];
      tasks.unshift(created);
      clearForm();
      renderTasks();
      return;
    } catch (error) {
      useServer = false;
      setStatus('Offline - using local storage', false);
    }
  }

  tasks.unshift({ id: Date.now(), description, complete: false, dueDate, priority, reminderOffset, recurrence, created_at: new Date().toISOString() });
  saveTasksToLocal();
  clearForm();
  renderTasks();
}

async function deleteTask(id) {
  if (useServer) {
    try { const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' }); if (!response.ok && response.status !== 204) throw new Error('Server unavailable'); tasks = tasks.filter((t) => t.id !== id); renderTasks(); return; } catch (e) { useServer = false; setStatus('Offline - using local storage', false); }
  }
  tasks = tasks.filter((t) => t.id !== id);
  saveTasksToLocal();
  renderTasks();
}

async function editTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  const newDesc = prompt('Edit task:', task.description);
  if (newDesc === null) return;
  const trimmed = newDesc.trim(); if (!trimmed) return alert('Task description cannot be empty.');
  const newDue = prompt('Edit due date (YYYY-MM-DD) or blank:', task.dueDate || ''); if (newDue === null) return;
  const newRec = prompt('Edit recurrence (none,daily,weekly,monthly):', task.recurrence || 'none'); if (newRec === null) return;
  const updated = { description: trimmed, dueDate: newDue.trim(), recurrence: newRec.trim() };

  if (useServer) {
    try { const response = await fetch(`${API_BASE}/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(updated) }); if (!response.ok) throw new Error('Server unavailable'); const upd = normalizeTasks([await response.json()])[0]; const idx = tasks.findIndex(t=>t.id===id); tasks[idx]=upd; renderTasks(); return; } catch(e){ useServer=false; setStatus('Offline - using local storage', false);} }

  Object.assign(task, updated);
  saveTasksToLocal();
  renderTasks();
}

async function toggleComplete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  const newComplete = !task.complete;

  if (useServer) {
    try {
      const response = await fetch(`${API_BASE}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ complete: newComplete }) });
      if (!response.ok) throw new Error('Server unavailable');
      const updated = normalizeTasks([await response.json()])[0];
      const idx = tasks.findIndex(t => t.id === id); tasks[idx] = updated; renderTasks();
    } catch (error) { useServer = false; setStatus('Offline - using local storage', false); }
  } else {
    task.complete = newComplete;
    saveTasksToLocal();
    renderTasks();
  }

  // handle recurrence: if just completed and recurrence exists, create next occurrence
  if (newComplete && task.recurrence && task.recurrence !== 'none') {
    createNextOccurrence(task);
  }
}

function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function addMonths(dateStr, months) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear(), m = d.getMonth() + months; d.setMonth(m);
  return d.toISOString().slice(0,10);
}

async function createNextOccurrence(task) {
  let nextDate = '';
  if (!task.dueDate) return; // nothing to schedule
  if (task.recurrence === 'daily') nextDate = addDays(task.dueDate, 1);
  else if (task.recurrence === 'weekly') nextDate = addDays(task.dueDate, 7);
  else if (task.recurrence === 'monthly') nextDate = addMonths(task.dueDate, 1);
  else return;

  const payload = { description: task.description, complete: false, dueDate: nextDate, priority: task.priority, reminderOffset: task.reminderOffset, recurrence: task.recurrence };

  if (useServer) {
    try { const response = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); if (!response.ok) throw new Error('Server unavailable'); const created = normalizeTasks([await response.json()])[0]; tasks.unshift(created); saveTasksToLocal(); renderTasks(); return; } catch(e) { useServer=false; setStatus('Offline - using local storage', false); }
  }

  // local fallback
  const newTask = { id: Date.now(), description: task.description, complete: false, dueDate: nextDate, priority: task.priority, reminderOffset: task.reminderOffset, recurrence: task.recurrence, created_at: new Date().toISOString() };
  tasks.unshift(newTask);
  saveTasksToLocal();
  renderTasks();
}

async function clearAll() {
  if (!confirm('Are you sure you want to delete all tasks?')) return;
  if (useServer) {
    try { const response = await fetch(API_BASE, { method:'DELETE' }); if (!response.ok && response.status !== 204) throw new Error('Server unavailable'); tasks = []; renderTasks(); return; } catch(e) { useServer=false; setStatus('Offline - using local storage', false);} }
  tasks = [];
  saveTasksToLocal();
  renderTasks();
}

function getFilteredTasks() {
  const search = activeSearch;
  return tasks.filter((task) => {
    const matchesSearch = !search || task.description.toLowerCase().includes(search);
    const matchesStatus = activeFilter === 'all' || (activeFilter === 'active' && !task.complete) || (activeFilter === 'completed' && task.complete) || (['high','medium','low'].includes(activeFilter) && task.priority === activeFilter);
    return matchesSearch && matchesStatus;
  }).sort(compareTasks);
}

function compareTasks(a,b) {
  if (a.complete !== b.complete) return a.complete ? 1 : -1;
  const rank = { high:0, medium:1, low:2 };
  const pr = rank[a.priority] - rank[b.priority]; if (pr !== 0) return pr;
  const aDue = a.dueDate || '9999-12-31'; const bDue = b.dueDate || '9999-12-31'; if (aDue !== bDue) return aDue.localeCompare(bDue);
  return b.id - a.id;
}

function renderTasks() {
  const list = document.getElementById('taskList'); if (!list) return; list.innerHTML = '';
  const visible = getFilteredTasks();
  visible.forEach((task) => {
    const li = document.createElement('li'); li.className = 'task-card' + (task.complete ? ' complete-card' : '');
    const dueText = task.dueDate ? `Due ${task.dueDate}` : 'No due date';
    const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
    const recText = task.recurrence && task.recurrence !== 'none' ? ` • ${task.recurrence}` : '';
    li.innerHTML = `
      <div class="task-content">
        <input type="checkbox" ${task.complete ? 'checked' : ''} onclick="toggleComplete(${task.id})" />
        <div class="task-main">
          <span class="task-text ${task.complete ? 'complete' : ''}">${escapeHtml(task.description)}</span>
          <div class="task-meta">
            <span class="badge badge-${task.priority}">${priorityLabel}</span>
            <span class="badge badge-neutral">${escapeHtml(dueText)}</span>
            ${task.reminderOffset ? `<span class="badge badge-neutral">Reminder ${task.reminderOffset}m</span>` : ''}
            ${task.recurrence && task.recurrence !== 'none' ? `<span class="badge badge-neutral">${escapeHtml(task.recurrence)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="task-buttons">
        <button type="button" class="edit-btn" onclick="editTask(${task.id})">Edit</button>
        <button type="button" class="delete-btn" onclick="deleteTask(${task.id})">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });
  updateStats();
}

function updateStats() {
  const completed = tasks.filter(t=>t.complete).length;
  const high = tasks.filter(t=>t.priority==='high').length;
  const taskCountEl = document.getElementById('taskCount'); const completedEl = document.getElementById('completedCount'); const highEl = document.getElementById('highPriorityCount');
  if (taskCountEl) taskCountEl.textContent = String(tasks.length);
  if (completedEl) completedEl.textContent = String(completed);
  if (highEl) highEl.textContent = String(high);
}

function toggleDarkMode(){ document.body.classList.toggle('dark-mode'); localStorage.setItem('darkMode', document.body.classList.contains('dark-mode')); }
function loadDarkMode(){ if (localStorage.getItem('darkMode')==='true') document.body.classList.add('dark-mode'); }
function escapeHtml(text){ if (typeof text!=='string') return ''; return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Reminder system
function startReminderChecker(){
  checkReminders();
  setInterval(checkReminders, REMINDER_CHECK_INTERVAL);
}

function getSentReminders(){
  try { return JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || '[]'); } catch(e){ return []; }
}
function setSentReminders(arr){ localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(arr)); }

function markReminderSent(taskId){ const arr=getSentReminders(); if (!arr.includes(taskId)) { arr.push(taskId); setSentReminders(arr); } }

function shouldSendReminder(task){ if (!task.dueDate) return false; if (!task.reminderOffset || task.reminderOffset <=0) return false; if (task.complete) return false; const sent = getSentReminders(); if (sent.includes(task.id)) return false; const dueTs = new Date(task.dueDate + 'T23:59:59').getTime(); // treat date as end of day if only date
  const reminderTs = dueTs - task.reminderOffset * 60 * 1000; return Date.now() >= reminderTs; }

function notifyTask(task){ const title = 'Task reminder'; const body = `${task.description} ${task.dueDate ? ' — due ' + task.dueDate : ''}`; if (window.Notification && Notification.permission === 'granted') { try { new Notification(title, { body }); } catch(e) { showInAppAlert(title + ': ' + body); } } else { showInAppAlert(title + ': ' + body); } markReminderSent(task.id); }

function showInAppAlert(text){ // small temporary banner
  const el = document.createElement('div'); el.textContent = text; el.style.position='fixed'; el.style.right='12px'; el.style.bottom='12px'; el.style.background='#222'; el.style.color='white'; el.style.padding='10px 12px'; el.style.borderRadius='8px'; el.style.zIndex='9999'; document.body.appendChild(el); setTimeout(()=>el.remove(),7000);
}

function checkReminders(){ try { tasks.forEach((task) => { if (shouldSendReminder(task)) notifyTask(task); }); } catch(e) { console.error('Reminder check failed', e); } }

// Calendar Sync scaffold: create client hook endpoints (requires OAuth credentials to fully enable).
// Files and server endpoints are added in server/server.js as scaffolding; follow README instructions to configure.
