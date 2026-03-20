#!/bin/bash
# Run the app on localhost and point to production API.
# Open: http://localhost:8080/pages/login.html?api=https://acknowledge.panscience.ai/api
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
echo "Serving at http://localhost:$PORT"
echo "Open: http://localhost:$PORT/pages/login.html?api=https://acknowledge.panscience.ai/api"
python3 -m http.server "$PORT"
