# Acknowledge

Role-based internal operations and workflow management platform.

## Setup & Run

### Backend
1. Navigate to `backend` directory.
2. Create virtual environment (optional): `python -m venv venv`
3. Install dependencies: `pip install -r requirements.txt`
4. Ensure PostgreSQL is running and update `backend/.env` with correct credentials.
5. Run server: `uvicorn app.main:app --reload`

### Frontend
1. Open the `frontend` folder.
2. Serve using a simple HTTP server (e.g., Live Server in VS Code or `python -m http.server 5500`).
3. Open `http://127.0.0.1:5500/pages/login.html` (port varies).

### Usage
- **Sign Up**: Register a new user (`employee`, `manager`, or `senior` role).
- **Employee**: View tasks, raise concerns.
- **Manager**: View team stats, assign tasks (via API/Postman for now or extended UI), resolve concerns.
- **Senior**: View global stats and audits.
