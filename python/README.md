# Gateway Django

Aplicación WSGI mínima para Python 3.13. Express y PostgreSQL administran los datos
del negocio; este servicio valida y responde solicitudes del gateway de IA.

## Ejecutar y verificar

Desde este directorio:

```sh
python -m pip install -r requirements.txt
python -m backend
python -m unittest discover -s tests -v
python -m django check --settings=backend.settings
```

`GET /health` en `http://127.0.0.1:8000` devuelve `{"status": "ok"}` si el proceso
responde. `GET /ready` comprueba que Gemini tenga una clave configurada, sin llamar
a Google. Con el proveedor falso, comprueba que se puedan cargar los dos ejemplos
T4. Devuelve 503 si el proveedor no está configurado o el falso no puede cargar
los ejemplos. Detener el servidor con Ctrl+C.
`HOST` usa `127.0.0.1` por defecto; `PORT` usa `8000` y admite enteros entre 0 y
65535. El puerto 0 se asigna automáticamente y se informa al iniciar. Las
variables se leen del entorno del proceso, no de un archivo `.env`. Si la
configuración no es válida o el puerto no está disponible, el proceso sale con
código 1 y un mensaje breve.

## Proyecto y aplicación

| Módulo | Responsabilidad |
| --- | --- |
| `backend/settings.py`, `backend/urls.py` | Configurar el proyecto Django y delegar las rutas en la aplicación. |
| `backend/app.py`, `backend/__main__.py` | Cargar Django como WSGI e iniciar el servidor con `python -m backend`. |
| `backend/config.py`, `backend/request_handler.py` | Validar parámetros de arranque y omitir trazas HTTP con datos del cliente. |
| `ai_gateway/urls.py` | Vincular cada URL con su vista Django. |
| `ai_gateway/views.py` | Adaptador fino: precondiciones, caso de uso y respuesta. |
| `ai_gateway/http/` | Precondiciones del contrato T4, respuestas JSON y sobre de error. |
| `ai_gateway/services/` | Coordinar la respuesta estructurada de T4 sin depender de HTTP. |
| `ai_gateway/validators/` | Cargar los esquemas T4 y validar solicitudes y respuestas. |
| `ai_gateway/infra/` | Adaptadores Gemini y falso, y verificador RS256 del JWT de servicio. |
| `tests/` | Pruebas de configuración, respuestas, rutas, JWT y HTTP real en un puerto temporal. |

La ruta `POST /v1/structured-completions` exige un JWT de servicio RS256 emitido
por `core-api`, con independencia de `AI_GATEWAY_ENV`. Sin credenciales responde
`401` con `WWW-Authenticate: Bearer`; si la clave pública no está configurada,
responde `503`. `AI_GATEWAY_ENV` solo habilita las rutas de demo.

## Proveedor Gemini

El gateway usa Gemini 3.1 Flash-Lite por defecto. Configure `GEMINI_API_KEY` solo
en el entorno del gateway; no la guarde en Git ni la exponga a Express o al
frontend. Para levantar el chat con la integración T4 existente desde PowerShell:

```powershell
$secret = Read-Host "Gemini API key" -AsSecureString
try {
    $env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new("", $secret).Password
    $env:AI_GATEWAY_PROVIDER = "gemini"
    node scripts/compose-t4.mjs up --build -d
} finally {
    Remove-Item Env:GEMINI_API_KEY,Env:AI_GATEWAY_PROVIDER -ErrorAction SilentlyContinue
    $secret.Dispose()
}
```

Ejecute el lanzador desde la raíz, con las claves JWT de servicio ya generadas.
Use datos sintéticos para la prueba de extremo a extremo: Gemini recibe el
mensaje y contexto del turno. Pruebe «Quiero comprar, tengo 500 mil dólares»:
el chat debería proponer USD 500.000 sin inventar ubicación ni plazo.

Django solicita JSON y valida el T4 localmente. Solo reintenta una respuesta
inválida y comparte el plazo de la solicitud entre ambos intentos. Un fallo
agotado se devuelve a Express; Gemini nunca se reemplaza silenciosamente por una
respuesta ficticia. Use `AI_GATEWAY_PROVIDER=fake` únicamente para pruebas o demos
con datos sintéticos.

## Prueba HTTP Express → Django

Desde la raíz, con las dependencias instaladas (`npm ci --prefix express` y
`python -m pip install -r python/requirements.txt`):

```sh
node express/scripts/smoke-t4.mjs
```

La prueba inicia Django en un puerto local temporal. Verifica el `401` sin
credenciales y el `200` con un JWT emitido por Express y una respuesta T4 del
proveedor falso. No inicia Express, PostgreSQL ni Mailpit. Genera una clave RSA
por ejecución y elimina el PEM público temporal al finalizar; la clave privada
queda en la memoria de Node. Si necesita usar otro intérprete, indique su
ejecutable con `T4_SMOKE_PYTHON`.

## Docker

Compose ejecuta el gateway en `http://ai-gateway:3100` dentro de su red y usa
`/ready` como comprobación de salud. Docker y el entorno local conservan el
servidor WSGI de desarrollo con un solo hilo.

## Demo inmobiliaria para el profesor

Desde la raíz, en PowerShell. Se usa un proyecto Compose separado para levantar
solo `ai-gateway`. El puerto 3100 queda dentro de Docker.

```powershell
$env:AI_GATEWAY_ENV = 'development'
$env:AI_GATEWAY_PROVIDER = 'fake'
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
Remove-Item Env:AI_GATEWAY_ENV,Env:AI_GATEWAY_PROVIDER
```
