"""Dev server: python3 serve.py [port] — serves the repo directory."""
import os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
import http.server, socketserver

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8741
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", port), http.server.SimpleHTTPRequestHandler) as httpd:
    print(f"serving on http://localhost:{port}")
    httpd.serve_forever()
