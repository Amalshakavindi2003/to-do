let tasks = [];
const API_BASE = 'http://127.0.0.1:3000/api/tasks';
const maxTasks = 10;

window.addEventListener('DOMContentLoaded', function() {
  renderTasks();
  loadTasksFromServer();
  loadDarkMode();
});

async function loadTasksFromServer() {
  try {
    const res = await fetch(API_BASE);
    tasks = await res.json();
    renderTasks();
  } catch (e) {
    console.error('Failed to load tasks from server', e);
  }
}

async function addTask() {
  const input = document.getElementById('taskInput');
  const desc = input.value.trim();
  if (!desc) { alert('Please enter a task description!'); return; }
  if (tasks.length >= maxTasks) { alert('Maximum ' + maxTasks + ' tasks allowed!'); return; }
  try {
    const res = await fetch(API_BASE, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ description: desc, complete: false }) });
    const created = await res.json();
    tasks.unshift(created);
    input.value = '';
    renderTasks();
  } catch (e) { console.error('Failed to add task', e); }
}

async function deleteTask(id) {
  try {
    await fetch(API_BASE + '/' + id, { method: 'DELETE' });
    tasks = tasks.filter(t => t.id !== id);
    renderTasks();
  } catch (e) { console.error('Failed to delete', e); }
}

async function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const newDesc = prompt('Edit task:', task.description);
  if (newDesc && newDesc.trim()) {
    try {
      const res = await fetch(API_BASE + '/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ description: newDesc.trim() }) });
      const updated = await res.json();
      const idx = tasks.findIndex(t => t.id === id);
      tasks[idx] = updated;
      renderTasks();
    } catch (e) { console.error('Failed to edit', e); }
  }
}

async function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  try {
    const res = await fetch(API_BASE + '/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ complete: !task.complete }) });
    const updated = await res.json();
    const idx = tasks.findIndex(t => t.id === id);
    tasks[idx] = updated;
    renderTasks();
  } catch (e) { console.error('Failed to toggle', e); }
}

async function clearAll() {
  if (!confirm('Are you sure you want to delete all tasks?')) return;
  try {
    await fetch(API_BASE, { method: 'DELETE' });
    tasks = [];
    renderTasks();
  } catch (e) { console.error('Failed to clear', e); }
}

function renderTasks() {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  tasks.forEach((task) => {
    const li = document.createElement('li');
    const completeClass = task.complete ? 'complete' : '';
    const checked = task.complete ? 'checked' : '';
    li.innerHTML = '<div class="task-content">' +
      '<input type="checkbox" ' + checked + ' onclick="toggleComplete(' + task.id + ')" />' +
      '<span class="task-text ' + completeClass + '">' + task.description + '</span>' +
      '</div>' +
      '<div class="task-buttons">' +
      '<button class="edit-btn" onclick="editTask(' + task.id + ')">Edit</button>' +
      '<button class="delete-btn" onclick="deleteTask(' + task.id + ')">Delete</button>' +
      '</div>';
    list.appendChild(li);
  });
  updateStats();
}

function updateStats() {
  const completed = tasks.filter(task => task.complete).length;
  document.getElementById('taskCount').textContent = tasks.length;
  document.getElementById('completedCount').textContent = completed;
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