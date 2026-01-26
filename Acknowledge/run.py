import subprocess
import os
import sys
import time
import signal

# Define paths relative to this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

def run_commands():
    print("Starting Acknowledge Platform...")
    
    # Start Backend (Uvicorn)
    # running on http://localhost:8000
    print(f"🚀 Starting Backend on port 8000...")
    backend_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"],
        cwd=BACKEND_DIR,
        shell=True  # Helpful on Windows for preserving env vars usually, but careful with signals
    )

    # Start Frontend (Simple HTTP Server)
    # running on http://localhost:5500
    print(f"🎨 Starting Frontend on port 5500...")
    frontend_process = subprocess.Popen(
        [sys.executable, "-m", "http.server", "5500"],
        cwd=FRONTEND_DIR,
        shell=True
    )

    print("\n✅ Application works are running!")
    print("   -> Frontend: http://localhost:5500/pages/login.html")
    print("   -> Backend:  http://localhost:8000")
    print("\nPress Ctrl+C to stop both servers.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Stopping servers...")
        # Force kill processes on Windows
        subprocess.run(f"taskkill /F /PID {backend_process.pid}", shell=True, stderr=subprocess.DEVNULL)
        subprocess.run(f"taskkill /F /PID {frontend_process.pid}", shell=True, stderr=subprocess.DEVNULL)
        
        # Also try standard terminate just in case
        backend_process.terminate()
        frontend_process.terminate()
        print("Goodbye!")

if __name__ == "__main__":
    run_commands()
