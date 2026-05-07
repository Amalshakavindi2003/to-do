let tasks = [];
const API_PORT = 3000;
const API_ROOT = `${location.protocol}//${location.hostname}:${API_PORT}/api`;
const TASKS_API = `${API_ROOT}/tasks`;
const AUTH_API = `${API_ROOT}/auth`;

const ACCESS_KEY = "todo_access_token";
const REFRESH_KEY = "todo_refresh_token";
const USER_KEY = "todo_user";
const REMINDER_STORAGE_KEY = "todo_reminders_sent_v1";
const REMINDER_CHECK_INTERVAL = 30 * 1000;

let activeSearch = "";
let activeFilter = "all";
let currentUser = null;

window.addEventListener("DOMContentLoaded", () => {
  loadDarkMode();
  checkAuthState();
  setupEventListeners();
  askNotificationPermission();
  loadTasks();
  startReminderChecker();
});

function checkAuthState() {
  const token = localStorage.getItem(ACCESS_KEY);
  if (!token) {
    window.location.href = "login.html";
    return;
  }
  const userStr = localStorage.getItem(USER_KEY);
  if (userStr) {
    currentUser = JSON.parse(userStr);
    const status = document.getElementById("status");
    if (status) {
      status.textContent = `Logged in as ${currentUser.email}`;
    }
  }
}

function setupEventListeners() {
  const taskInput = document.getElementById("taskInput");
  if (taskInput) {
    taskInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addTask();
    });
  }

  const addTaskBtn = document.getElementById("addTaskBtn");
  if (addTaskBtn) {
    addTaskBtn.addEventListener("click", addTask);
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      activeSearch = searchInput.value.trim().toLowerCase();
      renderTasks();
    });
  }

  const statusFilter = document.getElementById("statusFilter");
  if (statusFilter) {
    statusFilter.addEventListener("change", () => {
      activeFilter = statusFilter.value;
      renderTasks();
    });
  }

  const clearAllBtn = document.getElementById("clearAllBtn");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", clearAll);
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
}

function logout() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = "login.html";
}

async function authFetch(url, options = {}) {
  let token = localStorage.getItem(ACCESS_KEY);

  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401) {
    const refreshed = await refreshToken();
    if (!refreshed) {
      window.location.href = "login.html";
      return null;
    }
    token = localStorage.getItem(ACCESS_KEY);
    return fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  return response;
}

async function refreshToken() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${AUTH_API}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    return true;
  } catch {
    return false;
  }
}

async function addTask() {
  const taskInput = document.getElementById("taskInput");
  const dueDateInput = document.getElementById("dueDateInput");
  const priorityInput = document.getElementById("priorityInput");
  const reminderInput = document.getElementById("reminderInput");
  const recurrenceInput = document.getElementById("recurrenceInput");

  if (!taskInput.value.trim()) return;

  const taskData = {
    description: taskInput.value.trim(),
    complete: false,
    due_date: dueDateInput.value || null,
    priority: priorityInput.value,
    reminder_offset: parseInt(reminderInput.value),
    recurrence: recurrenceInput.value,
  };

  try {
    const response = await authFetch(TASKS_API, {
      method: "POST",
      body: JSON.stringify(taskData),
    });

    if (response && response.ok) {
      const task = await response.json();
      tasks.push(task);
      renderTasks();
      taskInput.value = "";
      dueDateInput.value = "";
      priorityInput.value = "medium";
      reminderInput.value = "0";
      recurrenceInput.value = "none";
    }
  } catch (error) {
    console.error("Error adding task:", error);
  }
}

async function deleteTask(id) {
  try {
    const response = await authFetch(`${TASKS_API}/${id}`, { method: "DELETE" });
    if (response && response.ok) {
      tasks = tasks.filter((task) => task.id !== id);
      renderTasks();
    }
  } catch (error) {
    console.error("Error deleting task:", error);
  }
}

async function editTask(id) {
  const newDescription = prompt("Edit task:", tasks.find((t) => t.id === id)?.description);
  if (newDescription === null) return;

  try {
    const response = await authFetch(`${TASKS_API}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ description: newDescription }),
    });

    if (response && response.ok) {
      const updated = await response.json();
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx >= 0) tasks[idx] = updated;
      renderTasks();
    }
  } catch (error) {
    console.error("Error editing task:", error);
  }
}

async function toggleComplete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  try {
    const response = await authFetch(`${TASKS_API}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ complete: !task.complete }),
    });

    if (response && response.ok) {
      const updated = await response.json();
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx >= 0) tasks[idx] = updated;
      renderTasks();
    }
  } catch (error) {
    console.error("Error toggling task:", error);
  }
}

async function clearAll() {
  if (!confirm("Are you sure you want to delete all tasks?")) return;

  try {
    for (const task of tasks) {
      await authFetch(`${TASKS_API}/${task.id}`, { method: "DELETE" });
    }
    tasks = [];
    renderTasks();
  } catch (error) {
    console.error("Error clearing tasks:", error);
  }
}

async function loadTasks() {
  try {
    const response = await authFetch(TASKS_API);
    if (response && response.ok) {
      tasks = await response.json();
      renderTasks();
    }
  } catch (error) {
    console.error("Error loading tasks:", error);
  }
}

function renderTasks() {
  const taskList = document.getElementById("taskList");
  const filteredTasks = filterAndSearchTasks(tasks);

  taskList.innerHTML = filteredTasks
    .map(
      (task) => `
    <li class="task-item ${task.complete ? "completed" : ""} priority-${task.priority}">
      <span class="task-checkbox">
        <input type="checkbox" ${task.complete ? "checked" : ""} onchange="toggleComplete(${task.id})">
      </span>
      <div class="task-content">
        <span class="task-description">${task.description}</span>
        ${task.due_date ? `<span class="task-due-date">📅 ${task.due_date}</span>` : ""}
        ${task.priority !== "medium" ? `<span class="priority-${task.priority}">${task.priority}</span>` : ""}
      </div>
      <div class="task-actions">
        <button class="task-btn" onclick="editTask(${task.id})">✏️</button>
        <button class="task-btn delete-btn" onclick="deleteTask(${task.id})">🗑️</button>
      </div>
    </li>
  `
    )
    .join("");

  updateStats(tasks);
}

function filterAndSearchTasks(taskList) {
  return taskList.filter((task) => {
    if (activeSearch && !task.description.toLowerCase().includes(activeSearch)) {
      return false;
    }
    if (activeFilter === "active") return !task.complete;
    if (activeFilter === "completed") return task.complete;
    if (activeFilter === "high") return task.priority === "high";
    if (activeFilter === "medium") return task.priority === "medium";
    if (activeFilter === "low") return task.priority === "low";
    return true;
  });
}

function updateStats(taskList) {
  const totalTasks = taskList.length;
  const completedTasks = taskList.filter((t) => t.complete).length;
  const highPriorityTasks = taskList.filter((t) => t.priority === "high").length;

  document.getElementById("taskCount").textContent = totalTasks;
  document.getElementById("completedCount").textContent = completedTasks;
  document.getElementById("highPriorityCount").textContent = highPriorityTasks;
}

function startReminderChecker() {
  setInterval(() => {
    checkReminders();
  }, REMINDER_CHECK_INTERVAL);
}

function checkReminders() {
  const now = new Date();
  const sentReminders = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || "{}");

  tasks.forEach((task) => {
    if (task.complete || !task.due_date || !task.reminder_offset) return;

    const dueDate = new Date(task.due_date);
    const reminderTime = new Date(dueDate.getTime() - task.reminder_offset * 60000);

    if (now >= reminderTime && now < new Date(reminderTime.getTime() + 60000)) {
      const reminderId = `task_${task.id}`;
      if (!sentReminders[reminderId]) {
        sendNotification(`Reminder: ${task.description}`, `Due at ${task.due_date}`);
        sentReminders[reminderId] = true;
        localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(sentReminders));
      }
    }
  });
}

function sendNotification(title, options) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, options);
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", isDark);
}

function loadDarkMode() {
  if (localStorage.getItem("darkMode") === "true") {
    document.body.classList.add("dark-mode");
  }
}

function askNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}