# To-Do App (Web + SQLite Backend)

This repository contains a browser-based To-Do application with a Node.js + SQLite backend.

## Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: SQLite (`server/db.sqlite`)
- Auth: JWT (access + refresh tokens)

## Features
- Signup / login / logout
- Private user tasks (each user sees only their own tasks)
- Due dates, priority, reminders, recurrence
- Search and filter
- Dark mode

## Run locally

Open two terminals.

### 1) Backend

```powershell
cd C:\to-do\server
npm install
node server.js
```

Backend runs at `http://127.0.0.1:3000`.

### 2) Frontend

```powershell
cd C:\to-do
npx http-server -p 8000
```

Open: `http://127.0.0.1:8000`

## Auth API

- `POST /api/auth/signup` body: `{ name, email, password }`
- `POST /api/auth/login` body: `{ email, password }`
- `POST /api/auth/refresh` body: `{ refreshToken }`
- `POST /api/auth/logout` body: `{ refreshToken }`
- `GET /api/auth/me` header: `Authorization: Bearer <accessToken>`

## Task API (authenticated)

All task endpoints require `Authorization: Bearer <accessToken>`.

- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `DELETE /api/tasks`

## Notes
- `server/node_modules` and `server/db.sqlite` should stay ignored in git.
- In production, set strong values for `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET`.
- Calendar sync endpoint is scaffolded: `GET /api/sync/status`.