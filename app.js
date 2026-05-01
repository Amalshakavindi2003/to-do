const tasks = [];
const maxTasks = 10;

// Load tasks from localStorage on page load
window.addEventListener('DOMContentLoaded', function() {
  loadTasksFromStorage();
  renderTasks();
  loadDarkMode();
});

function addTask() {
  const input = document.getElementById('taskInput');
  const desc = input.value.trim();
  if (!desc) {
    alert('Please enter a task description!');
    return;
  }
  if (tasks.length >= maxTasks) {
    alert('Maximum ' + maxTasks + ' tasks allowed!');
    return;
  }
  tasks.push({ id: Date.now(), description: desc, complete: false });
  input.value = '';
  renderTasks();
  saveTasksToStorage();
}

function deleteTask(id) {
  tasks = tasks.filter(task => task.id !== id);
  renderTasks();
  saveTasksToStorage();
}

function editTask(id) {
  const task = tasks.find(task => task.id === id);
  if (!task) return;
  
  const newDesc = prompt('Edit task:', task.description);
  if (newDesc && newDesc.trim()) {
    task.description = newDesc.trim();
    renderTasks();
    saveTasksToStorage();
  }
}

function toggleComplete(id) {
  const task = tasks.find(task => task.id === id);
  if (task) {
    task.complete = !task.complete;
    renderTasks();
    saveTasksToStorage();
  }
}

function clearAll() {
  if (confirm('Are you sure you want to delete all tasks?')) {
    tasks = [];
    renderTasks();
    saveTasksToStorage();
  }
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

function saveTasksToStorage() {
  localStorage.setItem('todoTasks', JSON.stringify(tasks));
}

function loadTasksFromStorage() {
  const stored = localStorage.getItem('todoTasks');
  if (stored) {
    try {
      tasks = JSON.parse(stored);
    } catch(e) {
      tasks = [];
    }
  }
}