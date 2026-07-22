# Troubleshooting Guide

## Backend Server Connection Issues

### Problem: "Connection failed for backend server"

This error means the frontend cannot connect to the Flask backend server.

### Solutions:

#### 1. **Check if Backend Server is Running**

Open a terminal and navigate to the backend directory:
```bash
cd backend
```

Start the Flask server:
```bash
python app.py
```

You should see:
```
============================================================
Color Blindness Filter Backend Server
============================================================
Server starting on http://localhost:5000
API Health Check: http://localhost:5000/api/health
============================================================
Press Ctrl+C to stop the server
============================================================
```

#### 2. **Verify Server is Accessible**

Open your browser and visit:
```
http://localhost:5000/api/health
```

You should see a JSON response:
```json
{
  "status": "healthy",
  "message": "Color Blindness Filter API is running"
}
```

#### 3. **Check Port 5000 is Available**

If port 5000 is already in use, you'll see an error like:
```
OSError: [Errno 48] Address already in use
```

**Solution:** 
- Find and stop the process using port 5000, OR
- Change the port in `backend/app.py` (line 375) to a different port (e.g., 5001)
- Update `frontend/src/utils/api.js` to use the new port

#### 4. **Windows: Use the Startup Script**

Double-click `backend/start_server.bat` to start the server easily.

#### 5. **Check Firewall Settings**

Windows Firewall or antivirus software might be blocking the connection.

**Solution:**
- Allow Python through Windows Firewall
- Temporarily disable antivirus to test
- Add an exception for port 5000

#### 6. **Verify Dependencies are Installed**

Make sure all Python packages are installed:
```bash
cd backend
pip install -r requirements.txt
```

#### 7. **Check for Python Errors**

Look at the terminal where you started the Flask server. Any errors will be displayed there.

Common errors:
- **ModuleNotFoundError**: Install missing packages with `pip install <package-name>`
- **Port already in use**: Stop other services using port 5000
- **MongoDB connection errors**: These are OK - MongoDB is optional

### Quick Test

1. Open terminal 1:
   ```bash
   cd backend
   python app.py
   ```

2. Open terminal 2 (or browser):
   ```bash
   curl http://localhost:5000/api/health
   ```
   
   Or visit: http://localhost:5000/api/health

3. If you see the health check response, the backend is working!

### Still Having Issues?

1. **Check the browser console** (F12 → Console tab) for detailed error messages
2. **Check the Flask server terminal** for backend error logs
3. **Verify both servers are running**:
   - Backend: http://localhost:5000
   - Frontend: http://localhost:3000

### Common Error Messages

| Error | Solution |
|-------|----------|
| `ECONNREFUSED` | Backend server is not running |
| `Network Error` | CORS issue or server not accessible |
| `Timeout` | Server is slow or not responding |
| `404 Not Found` | Wrong API endpoint URL |
| `500 Internal Server Error` | Backend code error - check Flask terminal |
