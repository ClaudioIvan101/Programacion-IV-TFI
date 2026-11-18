# Django gateway

A minimal Django WSGI application for Python 3.13. Express and PostgreSQL
handle business data.

## Run and test

From this directory:

```sh
python -m pip install -r requirements.txt
python -m backend
python -m unittest discover -s tests -v
```

`GET /health` on `http://127.0.0.1:8000` returns `{"status": "ok"}` while
the server is running. `GET /ready` checks that the fake provider can load both
T4 responses and returns 503 if it cannot. Stop the server with Ctrl+C.
`HOST` defaults to `127.0.0.1`; `PORT` defaults to `8000` and accepts decimal
integers from 0 to 65535. Port 0 selects an available port, printed at startup.
Set variables in the process environment; `.env` files are not loaded.
Invalid settings or an unavailable listening socket exit with code 1 and a short
message instead of a traceback.

## Responsibilities

| File | Responsibility |
| --- | --- |
| `backend/config.py` | Validate settings before opening a listening socket. |
| `backend/responses.py` | Encode JSON as UTF-8 bytes with correct length and safe headers. |
| `backend/app.py` | Load the Django WSGI application. |
| `backend/settings.py` | Configure allowed hosts and routing. |
| `backend/urls.py` | Handle GET/HEAD probes, JSON 404 and 405 with `Allow`. |
| `backend/fake_provider.py` | Return local T4 examples. |
| `backend/__main__.py` | Start and close the development server. |
| `backend/request_handler.py` | Omit request and HTTP parser logs containing client data. |
| `tests/` | Cover configuration, responses, routing and real HTTP on a temporary port. |

## Docker

Compose serves the gateway internally at `http://ai-gateway:3100` and uses
`/ready` as its health check. Local and Compose runs use the same single-threaded
development server.
