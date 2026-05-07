const API_PORT = 3000;
const API_ROOT = `${location.protocol}//${location.hostname}:${API_PORT}/api`;
const AUTH_API = `${API_ROOT}/auth`;

const ACCESS_KEY = "todo_access_token";
const REFRESH_KEY = "todo_refresh_token";
const USER_KEY = "todo_user";

window.addEventListener("DOMContentLoaded", () => {
  loadDarkMode();
  setupAuthPage();
  bindAuthUI();
  ensureUnauthenticatedRedirect();
  askNotificationPermission();
});

function setupAuthPage() {
  const mode = document.body.dataset.authMode === "signup" ? "signup" : "login";
  document.body.dataset.authMode = mode;

  const title = document.querySelector(".auth-header h1");
  const subtitle = document.querySelector(".auth-subtitle");
  const submitBtn = document.getElementById("authSubmitBtn");
  const nameGroup = document.querySelector(".signup-only");

  if (mode === "signup") {
    if (title) title.textContent = "Create Account";
    if (subtitle) subtitle.textContent = "Set up your account to sync tasks securely";
    if (submitBtn) submitBtn.textContent = "Create Account";
    if (nameGroup) nameGroup.hidden = false;
  } else {
    if (title) title.textContent = "To-Do List";
    if (subtitle) subtitle.textContent = "Sign in to continue to your tasks";
    if (submitBtn) submitBtn.textContent = "Sign In";
  }
}

function bindAuthUI() {
  const form = document.getElementById("authForm");
  if (form) {
    form.addEventListener("submit", onAuthSubmit);
  }

  const darkModeBtn = document.getElementById("darkModeBtn");
  if (darkModeBtn) {
    darkModeBtn.addEventListener("click", toggleDarkMode);
  }
}

function ensureUnauthenticatedRedirect() {
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) {
    window.location.replace("todo.html");
  }
}

async function onAuthSubmit(event) {
  event.preventDefault();
  const mode = document.body.dataset.authMode === "signup" ? "signup" : "login";
  const status = document.getElementById("status");
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();
  const nameInput = document.getElementById("nameInput");
  const name = nameInput ? nameInput.value.trim() : "";

  if (!email || !password) {
    setStatus(status, "Email and password are required.", "error");
    return;
  }

  if (mode === "signup" && !name) {
    setStatus(status, "Full name is required for sign up.", "error");
    return;
  }

  if (mode === "signup" && password.length < 6) {
    setStatus(status, "Password must be at least 6 characters.", "error");
    return;
  }

  const endpoint = mode === "signup" ? "signup" : "login";
  const payload = mode === "signup" ? { name, email, password } : { email, password };

  try {
    const response = await fetch(`${AUTH_API}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(status, data.error || "Authentication failed.", "error");
      return;
    }

    localStorage.setItem(ACCESS_KEY, data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setStatus(status, mode === "signup" ? "Account created. Redirecting..." : "Signed in. Redirecting...", "success");
    window.location.replace("todo.html");
  } catch (error) {
    setStatus(status, `Authentication error: ${error.message}`, "error");
  }
}

function setStatus(element, message, kind) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("error", "success");
  if (kind) {
    element.classList.add(kind);
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", String(isDark));
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