# To-Do App (Web + SQLite Backend)

This repository contains a simple browser-based To-Do application with a local Node.js + SQLite backend for persistence.

## Contents
- `index.html` — Frontend UI
- `style.css` — Styles
- `app.js` — Frontend logic (calls REST API)
- `server/server.js` — Express API using SQLite
- `server/package.json` — Backend dependencies and start script

## Run locally (A–Z)

1. Open two terminals (or tabs).

### Backend (API)

```powershell
cd C:\to-do\server
npm install    # first time only
node server.js # starts API on http://localhost:3000
# or: npm start
```

API endpoints:
- `GET /api/tasks` — list tasks
- `POST /api/tasks` — create task `{ description, complete }`
- `PUT /api/tasks/:id` — update task
- `DELETE /api/tasks/:id` — delete task
- `DELETE /api/tasks` — delete all tasks

### Frontend (static)

```powershell
cd C:\to-do
npx http-server -p 8000
# or
python -m http.server 8000
```

Open: `http://127.0.0.1:8000` in your browser.

## Notes
- The backend creates `server/db.sqlite` at runtime (it is ignored by Git).
- `server/node_modules/` is ignored and should not be committed.
- The frontend currently calls the API at `http://127.0.0.1:3000/api/tasks`. If you run the API on a different host/port, update `API_BASE` in `app.js`.

## Git / Pull Request
- I pushed these changes to the branch `feature/add-sqlite-backend`.
- To merge: open a PR from `feature/add-sqlite-backend` → `main` on GitHub, review, and merge.

## Deploy / Next steps
- Add Dockerfile or deploy the server to a small VM/container for remote access.
- Add authentication if you want per-user lists.

'