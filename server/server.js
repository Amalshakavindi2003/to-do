const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "dev_access_secret_change_me";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "dev_refresh_secret_change_me";
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_DAYS = 7;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'todo.html')));

const dbPath = path.join(__dirname, "db.sqlite");
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

function normalizeTask(row) {
  return {
    id: row.id,
    userId: row.user_id,
    description: row.description,
    notes: row.notes || "",
    complete: !!row.complete,
    dueDate: row.due_date || "",
    priority: row.priority || "medium",
    reminderOffset: row.reminder_offset || 0,
    recurrence: row.recurrence || "none",
    created_at: row.created_at
  };
}

async function initDb() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      notes TEXT DEFAULT "",
      complete BOOLEAN DEFAULT 0,
      due_date TEXT,
      priority TEXT DEFAULT "medium",
      reminder_offset INTEGER DEFAULT 0,
      recurrence TEXT DEFAULT "none",
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      revoked BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  try {
    await getAsync("SELECT notes FROM tasks LIMIT 1");
  } catch {
    await runAsync("ALTER TABLE tasks ADD COLUMN notes TEXT DEFAULT ''");
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signAccessToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, name: user.name }, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function signRefreshToken(user) {
  return jwt.sign({ userId: user.id, type: "refresh" }, REFRESH_TOKEN_SECRET, { expiresIn: `${REFRESH_TOKEN_DAYS}d` });
}

async function persistRefreshToken(userId, refreshToken) {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tokenHash = hashToken(refreshToken);
  await runAsync(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked, created_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)",
    [userId, tokenHash, expiresAt]
  );
}

async function revokeRefreshToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  await runAsync("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?", [tokenHash]);
}

async function rotateRefreshToken(userId, oldRefreshToken, newRefreshToken) {
  await revokeRefreshToken(oldRefreshToken);
  await persistRefreshToken(userId, newRefreshToken);
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
  } catch {
    return null;
  }
}

async function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET);
    const tokenHash = hashToken(token);
    const row = await getAsync("SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > CURRENT_TIMESTAMP", [tokenHash]);
    return row ? decoded : null;
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = { id: decoded.userId, email: decoded.email, name: decoded.name };
  next();
}

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existingUser = await getAsync("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await runAsync("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", [name, email, passwordHash]);

    const user = { id: result.lastID, name, email };
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await persistRefreshToken(user.id, refreshToken);

    res.json({ user, accessToken, refreshToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await getAsync("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const safeUser = { id: user.id, name: user.name, email: user.email };
    const accessToken = signAccessToken(safeUser);
    const refreshToken = signRefreshToken(safeUser);
    await persistRefreshToken(user.id, refreshToken);

    res.json({ user: safeUser, accessToken, refreshToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    const decoded = await verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const user = await getAsync("SELECT id, name, email FROM users WHERE id = ?", [decoded.userId]);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const accessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);
    await rotateRefreshToken(decoded.userId, refreshToken, newRefreshToken);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/tasks", authMiddleware, async (req, res) => {
  try {
    const tasks = await allAsync("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    res.json(tasks.map(normalizeTask));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tasks", authMiddleware, async (req, res) => {
  try {
    const { description, notes, complete, due_date, priority, reminder_offset, recurrence } = req.body;

    if (!description) {
      return res.status(400).json({ error: "Description required" });
    }

    const result = await runAsync(
      "INSERT INTO tasks (user_id, description, notes, complete, due_date, priority, reminder_offset, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [req.user.id, description, notes || "", complete ? 1 : 0, due_date || null, priority || "medium", reminder_offset || 0, recurrence || "none"]
    );

    res.json(normalizeTask({ id: result.lastID, user_id: req.user.id, description, notes: notes || "", complete: complete ? 1 : 0, due_date, priority, reminder_offset, recurrence, created_at: new Date().toISOString() }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const { description, notes, complete, due_date, priority, reminder_offset, recurrence } = req.body;
    const task = await getAsync("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const updated = {
      description: description !== undefined ? description : task.description,
      notes: notes !== undefined ? notes : (task.notes || ""),
      complete: complete !== undefined ? complete : task.complete,
      due_date: due_date !== undefined ? due_date : task.due_date,
      priority: priority !== undefined ? priority : task.priority,
      reminder_offset: reminder_offset !== undefined ? reminder_offset : task.reminder_offset,
      recurrence: recurrence !== undefined ? recurrence : task.recurrence
    };

    await runAsync(
      "UPDATE tasks SET description = ?, notes = ?, complete = ?, due_date = ?, priority = ?, reminder_offset = ?, recurrence = ? WHERE id = ?",
      [updated.description, updated.notes, updated.complete ? 1 : 0, updated.due_date, updated.priority, updated.reminder_offset, updated.recurrence, req.params.id]
    );

    res.json(normalizeTask({ id: task.id, user_id: req.user.id, ...updated, created_at: task.created_at }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const task = await getAsync("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    await runAsync("DELETE FROM tasks WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
}).catch(err => console.error("DB init failed:", err));