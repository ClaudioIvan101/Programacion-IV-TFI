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

## Demo inmobiliaria para el profesor

Desde la raíz, en PowerShell. Se usa un proyecto Compose separado para levantar
solo `ai-gateway`. El puerto 3100 queda dentro de Docker.

```powershell
$env:AI_GATEWAY_ENV = 'development'
docker compose --env-file .env.example -p leadqual-demo up --build --wait --no-deps ai-gateway

foreach ($scenario in 'complete', 'partial') {
    Write-Host "Escenario: $scenario"
    docker compose --env-file .env.example -p leadqual-demo exec -T ai-gateway python -c "import json; from urllib.request import urlopen; print(json.dumps(json.load(urlopen('http://ai-gateway:3100/demo/$scenario', timeout=5)), indent=2, ensure_ascii=False))"
}
```

- **Completo** (`GET /demo/complete`). `missing_fields` es `[]` y
  `next_question_key` es `null`.
- **Parcial** (`GET /demo/partial`). El adaptador carga
  [`response-follow-up.json`](../contracts/examples/valid/response-follow-up.json).
  La respuesta conserva el monto de 100000 con moneda `null`.
  `next_question_key` indica `presupuesto` y `assistant_message` pregunta si son ARS o USD.

Django recibe el GET, comprueba que el modo sea `development` y devuelve como
JSON el ejemplo T4 elegido por el adaptador falso T7. Los dos casos usan datos
sintéticos. En el modo predeterminado `production`, las rutas de demo
responden 404.

### Cerrar la demo

```powershell
docker compose --env-file .env.example -p leadqual-demo down
Remove-Item Env:AI_GATEWAY_ENV
```
