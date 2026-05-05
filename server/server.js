const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

function normalizeTask(row) {
  return {
    id: row.id,
    description: row.description,
    complete: !!row.complete,
    dueDate: row.due_date || '',
    priority: row.priority || 'medium',
    created_at: row.created_at
  };
}

async function ensureSchema() {
  await runAsync(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT,
    complete INTEGER DEFAULT 0,
    due_date TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const columns = await allAsync('PRAGMA table_info(tasks)');
  const names = columns.map((column) => column.name);
  if (!names.includes('due_date')) {
    await runAsync("ALTER TABLE tasks ADD COLUMN due_date TEXT DEFAULT ''");
  }
  if (!names.includes('priority')) {
    await runAsync("ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium'");
  }
}

ensureSchema().then(() => {
  app.get('/api/tasks', async (req, res) => {
    try {
      const rows = await allAsync('SELECT * FROM tasks ORDER BY id DESC');
      res.json(rows.map(normalizeTask));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/tasks', async (req, res) => {
    try {
      const description = String(req.body.description || '').trim();
      const complete = req.body.complete ? 1 : 0;
      const dueDate = String(req.body.dueDate || '').trim();
      const priority = normalizePriority(String(req.body.priority || 'medium').trim().toLowerCase());

      if (!description) {
        return res.status(400).json({ error: 'Description is required' });
      }

      await runAsync('INSERT INTO tasks (description, complete, due_date, priority) VALUES (?, ?, ?, ?)', [description, complete, dueDate, priority]);
      const row = await getAsync('SELECT * FROM tasks WHERE id = last_insert_rowid()');
      res.status(201).json(normalizeTask(row));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/tasks/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const current = await getAsync('SELECT * FROM tasks WHERE id = ?', [id]);
      if (!current) return res.status(404).json({ error: 'Not found' });

      const description = req.body.description !== undefined ? String(req.body.description || '').trim() : current.description;
      const complete = req.body.complete !== undefined ? (req.body.complete ? 1 : 0) : current.complete;
      const dueDate = req.body.dueDate !== undefined ? String(req.body.dueDate || '').trim() : (current.due_date || '');
      const priority = req.body.priority !== undefined ? normalizePriority(String(req.body.priority || 'medium').trim().toLowerCase()) : (current.priority || 'medium');

      if (!description) {
        return res.status(400).json({ error: 'Description is required' });
      }

      await runAsync('UPDATE tasks SET description = ?, complete = ?, due_date = ?, priority = ? WHERE id = ?', [description, complete, dueDate, priority, id]);
      const updated = await getAsync('SELECT * FROM tasks WHERE id = ?', [id]);
      res.json(normalizeTask(updated));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      await runAsync('DELETE FROM tasks WHERE id = ?', [req.params.id]);
      res.sendStatus(204);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/tasks', async (req, res) => {
    try {
      await runAsync('DELETE FROM tasks');
      res.sendStatus(204);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
}).catch((error) => {
  console.error('Failed to initialize schema:', error);
  process.exit(1);
});