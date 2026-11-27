# Sistem Monitoring Lembur — PT Cisarua Mountain Dairy

Web portal for overtime request submission, GPS office-geofence session tracking, multi-tier supervisor/manager approval, proof-of-work verification, and Excel/PDF payroll reporting.

## Architecture

- **Frontend** (`frontend/`): Static HTML/JS/CSS portals (`index.html`, `employee.html`, `manager.html`, `reviewer.html`, `admin.html`) powered by Tailwind CDN + shared tokens (`assets/theme.js`, `assets/app.css`, `assets/ui.js`).
- **Backend** (`backend/`): Node.js + Express REST API (`src/index.js`) with JWT authentication, bcrypt password hashing, PostgreSQL persistence (`pg`), and Brevo transactional email notifications (`src/mailer.js`).
- **Database** (`database/`):
  - `database/schema.sql` — clean production schema + initial admin/manager/employee accounts.
  - `database/demo_schema.sql` — idempotent demo schema + sample accounts (`demo123`) & sample overtime records across lifecycle states.

## Roles & Workflow

1. **Employee (`employee.html`)**: Submit overtime requests (auto start time: Mon–Thu `17:00`, Fri `17:30`, Sat–Sun `08:00`, same-day cutoff `18:00` WIB), verify 100 m office GPS radius, start/cancel/finish sessions, upload work proof, and revise rejected/returned items.
2. **Supervisor / Manager (`manager.html`)**: Two-tier hierarchical approval (`Level 3` direct approval → `Level 4+` final approval or jump-in), assign overtime to subordinates, verify proof with 1–5 star ratings, and monitor team history.
3. **Reviewer (`reviewer.html`)**: Read-only audit overview, filtered records, printable PDF proof sheets, and `.xlsx` export with deep-link print URLs.
4. **Admin (`admin.html`)**: User & approver-hierarchy management, system metrics, record audit, Excel export, and bulk multi-page PDF proof bundles.

## Local Development Setup

### Prerequisites
- Node.js >= 20
- PostgreSQL 15+ (or Docker Compose)

### Option 1: Docker Compose (Demo Mode)
```bash
docker compose up --build
```
Open `http://localhost:3000`.

### Option 2: Local Node.js + PostgreSQL
1. Start PostgreSQL and create a database (e.g., `overtime_dev`), then load the schema:
   ```bash
   psql "$DATABASE_URL" -f database/schema.sql
   # Or for sample demo data:
   psql "$DATABASE_URL" -f database/demo_schema.sql
   ```
2. Configure `backend/.env` from `backend/.env.example`:
   ```env
   DATABASE_URL=postgres://postgres:devpassword@127.0.0.1:5432/overtime_dev
   PGSSL=disable
   JWT_SECRET=replace-with-random-string-at-least-32-chars
   SERVE_FRONTEND=1
   PORT=3000
   ```
3. Install dependencies and start the server:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
4. Open `http://localhost:3000`.

## Environment Variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `PGSSL` | Set `disable` for local Postgres without SSL |
| `JWT_SECRET` | Secret used to sign auth & email-action JWTs |
| `PORT` | HTTP server port (default `3000`) |
| `DEMO_MODE` | Set `1` to auto-seed `demo_schema.sql` and serve `frontend/` |
| `SERVE_FRONTEND` | Set `1` to serve `frontend/` from Express (enabled automatically outside `production`) |
| `APP_URL` / `FRONTEND_URL` | Public base URL used in email links & CORS |
| `BACKEND_URL` | Public backend base URL for one-click email approval links |
| `BREVO_API_KEY` | Optional Brevo API key for transactional email delivery |
| `SCHEDULER_SECRET` | Optional secret checked on `POST /api/scheduler/check` (`x-scheduler-secret`) |
