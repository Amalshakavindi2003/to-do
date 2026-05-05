/* To-do app with server + localStorage fallback, due dates, priorities, search and filters. */

let tasks = [];
const API_PORT = 3000;
const API_BASE = `${location.protocol}//${location.hostname}:${API_PORT}/api/tasks`;
let useServer = false;
let activeSearch = '';
let activeFilter = 'all';

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
  if (searchInput) searchInput.addEventListener('input', () => {
    activeSearch = searchInput.value.trim().toLowerCase();
    renderTasks();
  });

  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', () => {
    activeFilter = statusFilter.value;
    renderTasks();
  });

  loadDarkMode();
  checkServer().then((online) => {
    useServer = online;
    setStatus(online ? 'Online - using server storage' : 'Offline - using local storage', online);
    loadTasks();
  });
});

function setStatus(text, online) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text;
  el.className = online ? 'status online' : 'status offline';
}

function fetchWithTimeout(url, options = {}, timeout = 3000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
  ]);
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
    created_at: task.created_at || ''
  }));
}

function normalizePriority(priority) {
  return ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';
}

function getFormValues() {
  const descriptionInput = document.getElementById('taskInput');
  const dueDateInput = document.getElementById('dueDateInput');
  const priorityInput = document.getElementById('priorityInput');
  return {
    description: descriptionInput ? descriptionInput.value.trim() : '',
    dueDate: dueDateInput ? dueDateInput.value : '',
    priority: priorityInput ? normalizePriority(priorityInput.value) : 'medium'
  };
}

function clearForm() {
  const descriptionInput = document.getElementById('taskInput');
  const dueDateInput = document.getElementById('dueDateInput');
  const priorityInput = document.getElementById('priorityInput');
  if (descriptionInput) descriptionInput.value = '';
  if (dueDateInput) dueDateInput.value = '';
  if (priorityInput) priorityInput.value = 'medium';
}

async function addTask() {
  const { description, dueDate, priority } = getFormValues();
  if (!description) return alert('Please enter a task description!');

  const payload = { description, complete: false, dueDate, priority };

  if (useServer) {
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
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

  tasks.unshift({
    id: Date.now(),
    description,
    complete: false,
    dueDate,
    priority,
    created_at: new Date().toISOString()
  });
  saveTasksToLocal();
  clearForm();
  renderTasks();
}

async function deleteTask(id) {
  if (useServer) {
    try {
      const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) throw new Error('Server unavailable');
      tasks = tasks.filter((task) => task.id !== id);
      renderTasks();
      return;
    } catch (error) {
      useServer = false;
      setStatus('Offline - using local storage', false);
    }
  }
  tasks = tasks.filter((task) => task.id !== id);
  saveTasksToLocal();
  renderTasks();
}

async function editTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  const newDescription = prompt('Edit task description:', task.description);
  if (newDescription === null) return;
  const trimmedDescription = newDescription.trim();
  if (!trimmedDescription) return alert('Task description cannot be empty.');

  const newDueDate = prompt('Edit due date (YYYY-MM-DD) or leave blank:', task.dueDate || '');
  if (newDueDate === null) return;
  const newPriority = prompt('Edit priority (high, medium, low):', task.priority || 'medium');
  if (newPriority === null) return;

  const updatedFields = {
    description: trimmedDescription,
    dueDate: newDueDate.trim(),
    priority: normalizePriority(newPriority.trim().toLowerCase())
  };

  if (useServer) {
    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });
      if (!response.ok) throw new Error('Server unavailable');
      const updated = normalizeTasks([await response.json()])[0];
      const index = tasks.findIndex((item) => item.id === id);
      tasks[index] = updated;
      renderTasks();
      return;
    } catch (error) {
      useServer = false;
      setStatus('Offline - using local storage', false);
    }
  }

  Object.assign(task, updatedFields);
  saveTasksToLocal();
  renderTasks();
}

async function toggleComplete(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  if (useServer) {
    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complete: !task.complete })
      });
      if (!response.ok) throw new Error('Server unavailable');
      const updated = normalizeTasks([await response.json()])[0];
      const index = tasks.findIndex((item) => item.id === id);
      tasks[index] = updated;
      renderTasks();
      return;
    } catch (error) {
      useServer = false;
      setStatus('Offline - using local storage', false);
    }
  }

  task.complete = !task.complete;
  saveTasksToLocal();
  renderTasks();
}

async function clearAll() {
  if (!confirm('Are you sure you want to delete all tasks?')) return;

  if (useServer) {
    try {
      const response = await fetch(API_BASE, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) throw new Error('Server unavailable');
      tasks = [];
      renderTasks();
      return;
    } catch (error) {
      useServer = false;
      setStatus('Offline - using local storage', false);
    }
  }

  tasks = [];
  saveTasksToLocal();
  renderTasks();
}

function getFilteredTasks() {
  const search = activeSearch;
  return tasks
    .filter((task) => {
      const matchesSearch = !search || task.description.toLowerCase().includes(search);
      const matchesStatus = activeFilter === 'all' ||
        (activeFilter === 'active' && !task.complete) ||
        (activeFilter === 'completed' && task.complete) ||
        (['high', 'medium', 'low'].includes(activeFilter) && task.priority === activeFilter);
      return matchesSearch && matchesStatus;
    })
    .sort(compareTasks);
}

function compareTasks(a, b) {
  if (a.complete !== b.complete) return a.complete ? 1 : -1;
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  const aDue = a.dueDate || '9999-12-31';
  const bDue = b.dueDate || '9999-12-31';
  if (aDue !== bDue) return aDue.localeCompare(bDue);
  return b.id - a.id;
}

function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';

  const visibleTasks = getFilteredTasks();

  visibleTasks.forEach((task) => {
    const li = document.createElement('li');
    li.className = 'task-card' + (task.complete ? ' complete-card' : '');

    const dueText = task.dueDate ? `Due ${task.dueDate}` : 'No due date';
    const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);

    li.innerHTML = `
      <div class="task-content">
        <input type="checkbox" ${task.complete ? 'checked' : ''} onclick="toggleComplete(${task.id})" />
        <div class="task-main">
          <span class="task-text ${task.complete ? 'complete' : ''}">${escapeHtml(task.description)}</span>
          <div class="task-meta">
            <span class="badge badge-${task.priority}">${priorityLabel}</span>
            <span class="badge badge-neutral">${escapeHtml(dueText)}</span>
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

  updateStats(visibleTasks);
}

function updateStats(visibleTasks) {
  const completed = tasks.filter((task) => task.complete).length;
  const highPriority = tasks.filter((task) => task.priority === 'high').length;
  const taskCountEl = document.getElementById('taskCount');
  const completedCountEl = document.getElementById('completedCount');
  const highPriorityCountEl = document.getElementById('highPriorityCount');
  if (taskCountEl) taskCountEl.textContent = String(tasks.length);
  if (completedCountEl) completedCountEl.textContent = String(completed);
  if (highPriorityCountEl) highPriorityCountEl.textContent = String(highPriority);
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
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}