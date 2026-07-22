import sys
import socket

def check_port(port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', port))
    sock.close()
    return result == 0

if __name__ == '__main__':
    port = 5000
    if check_port(port):
        print(f"✓ Port {port} is in use - server might be running")
        print(f"  Try: http://localhost:{port}/api/health")
    else:
        print(f"✗ Port {port} is not in use - server is not running")
        print(f"  Start the server with: python app.py")
