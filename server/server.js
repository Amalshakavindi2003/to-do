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

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS tasks (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    description TEXT,\n    complete INTEGER DEFAULT 0,\n    created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n  )');
});

app.get('/api/tasks', (req, res) => {
  db.all('SELECT * FROM tasks ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const tasks = rows.map(r => ({ id: r.id, description: r.description, complete: !!r.complete, created_at: r.created_at }));
    res.json(tasks);
  });
});

app.post('/api/tasks', (req, res) => {
  const { description, complete } = req.body;
  const completeInt = complete ? 1 : 0;
  db.run('INSERT INTO tasks (description, complete) VALUES (?, ?)', [description, completeInt], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM tasks WHERE id = ?', [this.lastID], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.status(201).json({ id: row.id, description: row.description, complete: !!row.complete, created_at: row.created_at });
    });
  });
});

app.put('/api/tasks/:id', (req, res) => {
  const id = req.params.id;
  const { description, complete } = req.body;
  const updates = [];
  const params = [];
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (complete !== undefined) { updates.push('complete = ?'); params.push(complete ? 1 : 0); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  const sql = 'UPDATE tasks SET ' + updates.join(', ') + ' WHERE id = ?';
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM tasks WHERE id = ?', [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json({ id: row.id, description: row.description, complete: !!row.complete, created_at: row.created_at });
    });
  });
});

app.delete('/api/tasks/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.sendStatus(204);
  });
});

app.delete('/api/tasks', (req, res) => {
  db.run('DELETE FROM tasks', function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.sendStatus(204);
  });
});

app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));