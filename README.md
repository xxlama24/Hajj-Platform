# Hajj Live Operations Platform (1447H)

A web platform used during Hajj 1447H. Field teams submit shift reports, and managers follow operations on live dashboards to make faster decisions.

## Live Demo
**https://USERNAME.github.io/hajj-operations-platform/**

Demo accounts (password for all: `demo123`):

| Username | Role |
|---|---|
| `manager` | Manager: dashboards and daily report |
| `admin` | Supervisor: all sections |
| `user1` … `user7` | Section staff: submit daily reports |

The demo runs fully in the browser with sample data. Everything you enter is saved in your own browser only (no server, no database). Use the "إعادة ضبط" button to reset it.

## Features
- Shift reports across 7 sections for field employees
- Manager dashboards (one per section) and a combined complaints / reports view
- Daily operations report ready to print
- File uploads, role-based login, live dashboard refresh

## Tech Stack
Python (Flask) · PostgreSQL · HTML / CSS / JavaScript · Chart.js

## Project Structure
- `docs/` — the live demo (same screens, with a browser-based data layer in `demo-api.js`)
- `frontend/` — the original frontend used with the real backend
- `backend/` — Flask API (one route file per section)
- `hajdb_new.sql` — database schema

## Run the Full System Locally
1. `cd backend && python -m venv .venv && source .venv/bin/activate`
2. `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and fill in your values
4. Create the database using `hajdb_new.sql`
5. (Optional) `python seed_demo.py` to load demo data
6. `python app.py`

## Note
Built and deployed for live Hajj operations. This repository contains no real operational data or credentials.
