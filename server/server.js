const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'dev_access_secret_change_me';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'dev_refresh_secret_change_me';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_DAYS = 7;

app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(dbPath);

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function normalizePriority(priority) {
  return ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';
}

function normalizeRecurrence(value) {
  return ['none', 'daily', 'weekly', 'monthly'].includes(value) ? value : 'none';
}

function normalizeTask(row) {
  return {
    id: row.id,
    userId: row.user_id,
    description: row.description,
    complete: !!row.complete,
    dueDate: row.due_date || '',
    priority: row.priority || 'medium',
    reminderOffset: row.reminder_offset || 0,
    recurrence: row.recurrence || 'none',
    created_at: row.created_at
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, name: user.name }, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function signRefreshToken(user) {
  return jwt.sign({ userId: user.id, type: 'refresh' }, REFRESH_TOKEN_SECRET, { expiresIn: `${REFRESH_TOKEN_DAYS}d` });
}

async function persistRefreshToken(userId, refreshToken) {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tokenHash = hashToken(refreshToken);
  await runAsync(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked, created_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)',
    [userId, tokenHash, expiresAt]
  );
}

async function revokeRefreshToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  await runAsync('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [tokenHash]);
}

async function rotateRefreshToken(userId, oldRefreshToken, newRefreshToken) {
  await revokeRefreshToken(oldRefreshToken);
  await persistRefreshToken(userId, newRefreshToken);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing access token' });

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    req.user = { id: decoded.userId, email: decoded.email, name: decoded.name };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

function sanitizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validatePassword(value) {
  return typeof value === 'string' && value.length >= 6;
}

async function ensureSchema() {
  await runAsync(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runAsync(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  await runAsync(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    description TEXT,
    complete INTEGER DEFAULT 0,
    due_date TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    reminder_offset INTEGER DEFAULT 0,
    recurrence TEXT DEFAULT 'none',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  const columns = await allAsync('PRAGMA table_info(tasks)');
  const names = columns.map((c) => c.name);
  if (!names.includes('user_id')) await runAsync('ALTER TABLE tasks ADD COLUMN user_id INTEGER');
  if (!names.includes('due_date')) await runAsync("ALTER TABLE tasks ADD COLUMN due_date TEXT DEFAULT ''");
  if (!names.includes('priority')) await runAsync("ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium'");
  if (!names.includes('reminder_offset')) await runAsync('ALTER TABLE tasks ADD COLUMN reminder_offset INTEGER DEFAULT 0');
  if (!names.includes('recurrence')) await runAsync("ALTER TABLE tasks ADD COLUMN recurrence TEXT DEFAULT 'none'");
}

ensureSchema().then(() => {
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const name = String(req.body.name || '').trim();
      const email = sanitizeEmail(req.body.email);
      const password = String(req.body.password || '');

      if (!name) return res.status(400).json({ error: 'Name is required' });
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' });
      if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      const existing = await getAsync('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const passwordHash = await bcrypt.hash(password, 10);
      await runAsync('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, passwordHash]);
      const user = await getAsync('SELECT id, name, email FROM users WHERE id = last_insert_rowid()');

      const accessToken = signAccessToken(user);
      const refreshToken = signRefreshToken(user);
      await persistRefreshToken(user.id, refreshToken);

      res.status(201).json({ user, accessToken, refreshToken });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = sanitizeEmail(req.body.email);
      const password = String(req.body.password || '');

      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

      const userRow = await getAsync('SELECT * FROM users WHERE email = ?', [email]);
      if (!userRow) return res.status(401).json({ error: 'Invalid credentials' });

      const passwordOk = await bcrypt.compare(password, userRow.password_hash);
      if (!passwordOk) return res.status(401).json({ error: 'Invalid credentials' });

      const user = { id: userRow.id, name: userRow.name, email: userRow.email };
      const accessToken = signAccessToken(user);
      const refreshToken = signRefreshToken(user);
      await persistRefreshToken(user.id, refreshToken);

      res.json({ user, accessToken, refreshToken });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const refreshToken = String(req.body.refreshToken || '');
      if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

      let decoded;
      try {
        decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
      } catch (error) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      const tokenHash = hashToken(refreshToken);
      const tokenRow = await getAsync('SELECT * FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
      if (!tokenRow || tokenRow.revoked) return res.status(401).json({ error: 'Refresh token revoked' });
      if (new Date(tokenRow.expires_at).getTime() < Date.now()) return res.status(401).json({ error: 'Refresh token expired' });

      const user = await getAsync('SELECT id, name, email FROM users WHERE id = ?', [decoded.userId]);
      if (!user) return res.status(401).json({ error: 'User not found' });

      const newAccessToken = signAccessToken(user);
      const newRefreshToken = signRefreshToken(user);
      await rotateRefreshToken(user.id, refreshToken, newRefreshToken);

      res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken, user });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const refreshToken = String(req.body.refreshToken || '');
      if (refreshToken) await revokeRefreshToken(refreshToken);
      res.sendStatus(204);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
      const user = await getAsync('SELECT id, name, email FROM users WHERE id = ?', [req.user.id]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/tasks', authMiddleware, async (req, res) => {
    try {
      const rows = await allAsync('SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
      res.json(rows.map(normalizeTask));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/tasks', authMiddleware, async (req, res) => {
    try {
      const description = String(req.body.description || '').trim();
      const complete = req.body.complete ? 1 : 0;
      const dueDate = String(req.body.dueDate || '').trim();
      const priority = normalizePriority(String(req.body.priority || 'medium').trim().toLowerCase());
      const reminderOffset = Number(req.body.reminderOffset || 0);
      const recurrence = normalizeRecurrence(String(req.body.recurrence || 'none').trim());

      if (!description) return res.status(400).json({ error: 'Description is required' });

      await runAsync(
        'INSERT INTO tasks (user_id, description, complete, due_date, priority, reminder_offset, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, description, complete, dueDate, priority, reminderOffset, recurrence]
      );
      const row = await getAsync('SELECT * FROM tasks WHERE id = last_insert_rowid()');
      res.status(201).json(normalizeTask(row));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const current = await getAsync('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [id, req.user.id]);
      if (!current) return res.status(404).json({ error: 'Not found' });

      const description = req.body.description !== undefined ? String(req.body.description || '').trim() : current.description;
      const complete = req.body.complete !== undefined ? (req.body.complete ? 1 : 0) : current.complete;
      const dueDate = req.body.dueDate !== undefined ? String(req.body.dueDate || '').trim() : (current.due_date || '');
      const priority = req.body.priority !== undefined ? normalizePriority(String(req.body.priority || 'medium').trim().toLowerCase()) : (current.priority || 'medium');
      const reminderOffset = req.body.reminderOffset !== undefined ? Number(req.body.reminderOffset) : (current.reminder_offset || 0);
      const recurrence = req.body.recurrence !== undefined ? normalizeRecurrence(String(req.body.recurrence || 'none').trim()) : (current.recurrence || 'none');

      if (!description) return res.status(400).json({ error: 'Description is required' });

      await runAsync(
        'UPDATE tasks SET description = ?, complete = ?, due_date = ?, priority = ?, reminder_offset = ?, recurrence = ? WHERE id = ? AND user_id = ?',
        [description, complete, dueDate, priority, reminderOffset, recurrence, id, req.user.id]
      );
      const updated = await getAsync('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [id, req.user.id]);
      res.json(normalizeTask(updated));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
    try {
      await runAsync('DELETE FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.sendStatus(204);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/tasks', authMiddleware, async (req, res) => {
    try {
      await runAsync('DELETE FROM tasks WHERE user_id = ?', [req.user.id]);
      res.sendStatus(204);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/sync/status', authMiddleware, (req, res) => {
    res.json({ calendarSync: false, message: 'Configure Google OAuth to enable calendar sync' });
  });

  app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
}).catch((error) => {
  console.error('Failed to initialize schema:', error);
  process.exit(1);
});