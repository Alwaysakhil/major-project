# How to Start the Servers

## Quick Start Guide

You need **TWO terminals** running simultaneously:

### Terminal 1: Backend Server (Flask)

1. Open Command Prompt or PowerShell
2. Navigate to backend folder:
   ```bash
   cd "c:\Users\akhil teja\major project\backend"
   ```
3. Start the Flask server:
   ```bash
   python app.py
   ```

**You should see:**
```
============================================================
Color Blindness Filter Backend Server
============================================================
Server starting on http://localhost:5000
API Health Check: http://localhost:5000/api/health
============================================================
Press Ctrl+C to stop the server
============================================================
 * Running on http://0.0.0.0:5000
```

**Keep this terminal open!** The server must stay running.

### Terminal 2: Frontend Server (React)

1. Open a **NEW** Command Prompt or PowerShell
2. Navigate to frontend folder:
   ```bash
   cd "c:\Users\akhil teja\major project\frontend"
   ```
3. Install dependencies (first time only):
   ```bash
   npm install
   ```
4. Start the React server:
   ```bash
   npm start
   ```

**You should see:**
```
Compiled successfully!

You can now view colorblind-filter-frontend in the browser.

  Local:            http://localhost:3000
```

## Alternative: Use Startup Scripts

### Windows:

**Backend:**
- Double-click: `backend/start_server.bat`

**Frontend:**
- Double-click: `frontend/start_frontend.bat`

## Verify Everything is Working

1. **Backend Health Check:**
   - Open browser: http://localhost:5000/api/health
   - Should show: `{"status":"healthy","message":"Color Blindness Filter API is running"}`

2. **Frontend:**
   - Open browser: http://localhost:3000
   - Header should show: "✓ Backend server connected"

## Troubleshooting

### "Port 5000 already in use"
- Another process is using port 5000
- Solution: Close other applications or change port in `backend/app.py` line 439

### "Module not found"
- Missing Python packages
- Solution: Run `pip install -r requirements.txt` in backend folder

### "Cannot connect to backend"
- Backend server is not running
- Solution: Make sure Terminal 1 is running `python app.py`

### "npm: command not found"
- Node.js not installed
- Solution: Install Node.js from https://nodejs.org/

## Important Notes

- **Both servers must run at the same time**
- **Keep both terminals open** while using the app
- Backend runs on port 5000
- Frontend runs on port 3000
- MongoDB is optional - app works without it
