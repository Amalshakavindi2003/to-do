/* Robust app.js: uses backend when available, otherwise falls back to localStorage.
   Exposes global functions used by inline onclick handlers so buttons work 100%.
*/

let tasks = [];
const API_PORT = 3000;
const API_BASE = `${location.protocol}//${location.hostname}:${API_PORT}/api/tasks`;
const maxTasks = 1000; // effectively unlimited locally
let useServer = false;

window.addEventListener('DOMContentLoaded', () => {
  // expose functions for inline handlers
  window.addTask = addTask;
  window.deleteTask = deleteTask;
  window.editTask = editTask;
  window.toggleComplete = toggleComplete;
  window.clearAll = clearAll;
  window.toggleDarkMode = toggleDarkMode;

  const input = document.getElementById('taskInput');
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });

  checkServer().then(online => {
    useServer = online;
    if (useServer) setStatus('Online — using server storage', true);
    else setStatus('Offline — using local storage', false);
    loadTasks();
  });
  loadDarkMode();
});

function setStatus(text, online) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text;
  el.style.color = online ? 'green' : '#a00';
}

function fetchWithTimeout(url, opts = {}, timeout = 3000) {
  return Promise.race([
    fetch(url, opts),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
  ]);
}

async function checkServer() {
  try {
    const res = await fetchWithTimeout(API_BASE, { method: 'GET' }, 2000);
    if (!res.ok) return false;
    return true;
  } catch (e) {
    return false;
  }
}

// LOAD
async function loadTasks() {
  if (useServer) {
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error('server error');
      tasks = await res.json();
      renderTasks();
      return;
    } catch (e) {
      useServer = false;
      setStatus('Offline — using local storage', false);
    }
  }
  // fallback to local
  loadTasksFromLocal();
}

function loadTasksFromLocal() {
  const stored = localStorage.getItem('todoTasks');
  tasks = stored ? JSON.parse(stored) : [];
  renderTasks();
}

function saveTasksToLocal() {
  localStorage.setItem('todoTasks', JSON.stringify(tasks));
}

// ADD
async function addTask() {
  const input = document.getElementById('taskInput');
  if (!input) return;
  const desc = input.value.trim();
  if (!desc) return alert('Please enter a task description!');
  if (useServer) {
    try {
      const res = await fetch(API_BASE, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ description: desc, complete: false }) });
      if (!res.ok) throw new Error('server error');
      const created = await res.json();
      tasks.unshift(created);
      input.value = '';
      renderTasks();
      return;
    } catch (e) {
      // fallback
      useServer = false;
      setStatus('Offline — using local storage', false);
    }
  }
  // local fallback
  const id = Date.now();
  const t = { id, description: desc, complete: false };
  tasks.unshift(t);
  saveTasksToLocal();
  input.value = '';
  renderTasks();
}

// DELETE
async function deleteTask(id) {
  if (useServer) {
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('server error');
      tasks = tasks.filter(t => t.id !== id);
      renderTasks();
      return;
    } catch (e) {
      useServer = false;
      setStatus('Offline — using local storage', false);
    }
  }
  tasks = tasks.filter(t => t.id !== id);
  saveTasksToLocal();
  renderTasks();
}

// EDIT
async function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const newDesc = prompt('Edit task:', task.description);
  if (!newDesc || !newDesc.trim()) return;
  if (useServer) {
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ description: newDesc.trim() }) });
      if (!res.ok) throw new Error('server error');
      const updated = await res.json();
      const idx = tasks.findIndex(t => t.id === id);
      tasks[idx] = updated;
      renderTasks();
      return;
    } catch (e) {
      useServer = false;
      setStatus('Offline — using local storage', false);
    }
  }
  task.description = newDesc.trim();
  saveTasksToLocal();
  renderTasks();
}

// TOGGLE
async function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  if (useServer) {
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ complete: !task.complete }) });
      if (!res.ok) throw new Error('server error');
      const updated = await res.json();
      const idx = tasks.findIndex(t => t.id === id);
      tasks[idx] = updated;
      renderTasks();
      return;
    } catch (e) {
      useServer = false;
      setStatus('Offline — using local storage', false);
    }
  }
  task.complete = !task.complete;
  saveTasksToLocal();
  renderTasks();
}

// CLEAR
async function clearAll() {
  if (!confirm('Are you sure you want to delete all tasks?')) return;
  if (useServer) {
    try {
      const res = await fetch(API_BASE, { method: 'DELETE' });
      if (!res.ok) throw new Error('server error');
      tasks = [];
      renderTasks();
      return;
    } catch (e) {
      useServer = false;
      setStatus('Offline — using local storage', false);
    }
  }
  tasks = [];
  saveTasksToLocal();
  renderTasks();
}

// RENDER
function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';
  tasks.forEach((task) => {
    const li = document.createElement('li');
    const completeClass = task.complete ? 'complete' : '';
    const checked = task.complete ? 'checked' : '';
    li.innerHTML = '<div class="task-content">' +
      '<input type="checkbox" ' + checked + ' onclick="toggleComplete(' + task.id + ')" />' +
      '<span class="task-text ' + completeClass + '">' + escapeHtml(task.description) + '</span>' +
      '</div>' +
      '<div class="task-buttons">' +
      '<button type="button" class="edit-btn" onclick="editTask(' + task.id + ')">Edit</button>' +
      '<button type="button" class="delete-btn" onclick="deleteTask(' + task.id + ')">Delete</button>' +
      '</div>';
    list.appendChild(li);
  });
  updateStats();
}

function updateStats() {
  const completed = tasks.filter(task => task.complete).length;
  const taskCountEl = document.getElementById('taskCount');
  const completedCountEl = document.getElementById('completedCount');
  if (taskCountEl) taskCountEl.textContent = tasks.length;
  if (completedCountEl) completedCountEl.textContent = completed;
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

function loadDarkMode() {
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
  }
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
