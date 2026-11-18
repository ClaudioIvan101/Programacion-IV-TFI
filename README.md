# Proyecto inmobiliario — Programación IV

Express gestiona la persistencia comercial en PostgreSQL. El gateway Python
usa Django y responde con el adaptador falso en las pruebas.

## Entorno local con Docker

Requiere **Docker Desktop instalado y en ejecución**, con contenedores Linux y
Docker Compose disponible (`docker compose version`). Ejecutar los comandos de
esta sección desde la raíz del repositorio.

[compose.yaml](compose.yaml) inicia los backends y la infraestructura local.

| Servicio | Uso y acceso |
| --- | --- |
| PostgreSQL 16 (`db`) | Base de datos, accesible como `db:5432` dentro de la red Docker `backend`. Sus datos persisten en el volumen nombrado `postgres_data`. |
| Mailpit (`mailpit`) | Captura correos de prueba, sin enviarlos a destinatarios externos. SMTP interno en `mailpit:1025`; interfaz web en [http://localhost:8025](http://localhost:8025), publicada solo en `127.0.0.1`. |
| Express (`core-api`) | API principal, publicada en `127.0.0.1:3000`. |
| Django (`ai-gateway`) | Gateway con adaptador falso, accesible en `ai-gateway:3100` dentro de la red `backend`. |

PostgreSQL, SMTP y el gateway usan puertos internos de Docker.

### Preparar e iniciar

Si todavía no existe `.env`, copiar [.env.example](.env.example) a `.env` en la
raíz (en PowerShell: `Copy-Item .env.example .env`). **No sobrescribir un `.env`
existente** ni reutilizar credenciales de otros entornos.

Las tres variables son obligatorias y no pueden quedar vacías:

| Variable | Propósito |
| --- | --- |
| `POSTGRES_DB` | Nombre de la base inicial. |
| `POSTGRES_USER` | Usuario de inicialización de PostgreSQL; solo para desarrollo. |
| `POSTGRES_PASSWORD` | Contraseña local: reemplazar el marcador del ejemplo antes de iniciar. |

El archivo de ejemplo contiene únicamente valores ficticios. Mantener `.env`
y cualquier credencial fuera de Git. Las variables del entorno de la terminal
tienen prioridad sobre `.env`. Mailpit no requiere variables en este Compose.

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose exec db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

La primera ejecución puede descargar las imágenes. Esperar a que `db` aparezca
como `healthy` y Mailpit como iniciado; `pg_isready` debe indicar que acepta
conexiones. Abrir la interfaz de Mailpit para verificarla: esta comprobación no
demuestra todavía un envío desde las APIs. Evitar publicar la salida de
`docker compose config` sin `--quiet`, porque puede mostrar contraseñas.

### Detener y conservar los datos

```bash
docker compose down
```

Detiene y elimina los contenedores y la red, pero conserva el volumen de
PostgreSQL. **No agregar `-v`/`--volumes`** salvo que se quiera borrar la base.
Cambiar `POSTGRES_*` en `.env` no reconfigura una base ya inicializada: conservar
los valores existentes o planificar una migración explícita, sin eliminar datos
para resolver diferencias de credenciales.

Referencia: [inicio con Compose](https://docs.docker.com/reference/cli/docker/compose/up/),
[detención y volúmenes](https://docs.docker.com/reference/cli/docker/compose/down/) e
[interpolación de variables](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

## Backend Express

Requiere Node.js 22.9 o superior. Desde la raíz del repositorio:

```bash
cd express
npm ci
npm start
```

La API estará disponible en `http://localhost:3000`; el estado se consulta en
`GET /health`. Opcionalmente, copiar `express/.env.example` a `express/.env`
antes de iniciarla para configurar `HOST`, `PORT` y `NODE_ENV`.

Pruebas: ejecutar `npm test` desde `express/`.

## Backend Python

Gateway Django verificado con Python 3.13. Desde la raíz:

```bash
cd python
python -m pip install -r requirements.txt
python -m backend
```

El proceso responde en `http://127.0.0.1:8000/health`. La ruta `/ready`
comprueba la disponibilidad del adaptador falso.
Pruebas: ejecutar `python -m unittest discover -s tests -v` desde `python/`.
Este backend toma `HOST` y `PORT` del entorno del proceso; no carga `.env`.

Detener cualquiera de los servidores con Ctrl+C.

## Pruebas automáticas

GitHub Actions ejecuta las pruebas de Express y Python en cada push y pull
request. Los resultados aparecen en la pestaña **Actions** del repositorio.

## Documentación

- [Estructura y configuración de Express](express/README.md)
- [Uso y límites del backend Python](python/README.md)
- [Controles de seguridad pendientes](express/docs/security.md)
