import http.server
import socket

class DualStackServer(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except Exception:
            pass
        super().server_bind()

if __name__ == '__main__':
    port = 8123
    handler = http.server.SimpleHTTPRequestHandler
    with DualStackServer(('::', port), handler) as httpd:
        print(f"Serving HTTP on port {port} (http://localhost:{port}/)...")
        httpd.serve_forever()
