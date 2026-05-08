const qs = s => document.querySelector(s);

function apiFetch(path, opts = {}) {
  opts.headers = opts.headers || {};
  opts.headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem('accessToken');
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  return fetch(path, opts).then(async res => {
    const text = await res.text();
    let data = text ? JSON.parse(text) : {};
    if (!res.ok) throw data;
    return data;
  });
}

async function signup() {
  try {
    const name = qs('#signup-name').value.trim();
    const email = qs('#signup-email').value.trim();
    const password = qs('#signup-password').value;
    const res = await apiFetch('/api/auth/signup', { method: 'POST', body: { name, email, password } });
    localStorage.setItem('accessToken', res.accessToken);
    enterApp(res.user.name);
  } catch (e) { alert(e.error || e.message || 'Signup failed'); }
}

async function login() {
  try {
    const email = qs('#login-email').value.trim();
    const password = qs('#login-password').value;
    const res = await apiFetch('/api/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('accessToken', res.accessToken);
    enterApp(res.user.name);
  } catch (e) { alert(e.error || e.message || 'Login failed'); }
}

function show(el, show = true) { el.classList.toggle('hidden', !show); }

function enterApp(name) {
  show(qs('#auth'), false);
  show(qs('#app'), true);
  loadTasks();
}

function logout() {
  localStorage.removeItem('accessToken');
  show(qs('#auth'), true);
  show(qs('#app'), false);
}

async function addTask() {
  try {
    const description = qs('#task-desc').value.trim();
    const due_date = qs('#task-due').value || null;
    const priority = qs('#task-priority').value;
    if (!description) return alert('Please enter a description');
    await apiFetch('/api/tasks', { method: 'POST', body: { description, due_date, priority } });
    qs('#task-desc').value = '';
    loadTasks();
  } catch (e) { alert(e.error || e.message || 'Add task failed'); }
}

async function loadTasks() {
  try {
    const tasks = await apiFetch('/api/tasks');
    const ul = qs('#tasks-list');
    ul.innerHTML = '';
    tasks.forEach(t => {
      const li = document.createElement('li');
      li.textContent = `${t.description} ${t.dueDate ? '('+t.dueDate+')' : ''} [${t.priority}]`;
      const del = document.createElement('button'); del.textContent = 'Delete'; del.className='small';
      del.onclick = async () => { await apiFetch('/api/tasks/'+t.id, { method: 'DELETE' }); loadTasks(); };
      const toggle = document.createElement('button'); toggle.textContent = t.complete ? 'Mark Incomplete' : 'Mark Complete'; toggle.className='small';
      toggle.onclick = async () => { await apiFetch('/api/tasks/'+t.id, { method: 'PUT', body: { complete: !t.complete } }); loadTasks(); };
      li.appendChild(document.createTextNode(' '));
      li.appendChild(toggle);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(del);
      ul.appendChild(li);
    });
  } catch (e) { console.error(e); if (e.error && (e.error === 'No token provided' || e.error === 'Invalid or expired token' || e.error === 'Invalid credentials')) { logout(); } }
}

document.getElementById('signup-btn').addEventListener('click', signup);
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('add-task-btn').addEventListener('click', addTask);
document.getElementById('logout-btn').addEventListener('click', logout);

// If token already present, show app
if (localStorage.getItem('accessToken')) enterApp();