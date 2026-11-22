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
docker compose up -d --build --wait
docker compose ps
docker compose exec db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec core-api npm run migrate
curl -fsS http://127.0.0.1:3000/health
docker compose exec ai-gateway python -c "from urllib.request import urlopen; print(urlopen('http://127.0.0.1:3100/health').status, urlopen('http://127.0.0.1:3100/ready').status)"
```

La primera ejecución puede descargar las imágenes. `db` y `ai-gateway` deben
figurar como `healthy`. Ejecutar las migraciones antes de probar las rutas que
usan datos. Express tiene `/health`; su `/ready` sigue pendiente de T5.
La interfaz de Mailpit debe abrir en el puerto 8025. Si un puerto publicado ya
está ocupado, usar otro puerto de host con un archivo Compose local de
sobrescritura. Mantener `--quiet` al compartir la validación de la configuración
para evitar exponer contraseñas.

### Habilitar el turno conversacional T4

El Compose base arranca sin claves de servicio y no habilita el turno. Para
probar la integración real entre Express y el gateway, generar las claves una
sola vez y usar el lanzador del archivo Compose opcional:

```bash
node scripts/generate-service-jwt-keys.mjs
node scripts/compose-t4.mjs config --quiet
node scripts/compose-t4.mjs up -d --build --wait
node scripts/compose-t4.mjs exec core-api npm run migrate
```

El generador no sobrescribe claves. Los archivos en `secrets/` no se versionan.
El lanzador pasa los PEM solo a Compose, que los monta como archivos de solo
lectura: la clave privada en Express y la pública en Django, con el usuario
de cada contenedor. Se requiere soporte de [secretos de origen `environment`](https://docs.docker.com/reference/compose-file/container-spec/#secrets)
en Docker Compose. Para
llamar al turno desde Express se necesita además un JWT de usuario emitido por
`POST /auth/login` para un administrador activo; configurar `JWT_SECRET_HEX`
localmente y crear el primer administrador mediante el procedimiento de
[arranque de autenticación](express/docs/capture-auth.md).

### Detener y conservar los datos

```bash
docker compose down
```

Si se habilitó el turno T4, usar `node scripts/compose-t4.mjs down`.

Detiene y elimina los contenedores y la red, pero conserva el volumen de
PostgreSQL. **No agregar `-v`/`--volumes`** salvo que se quiera borrar la base.
Cambiar `POSTGRES_*` en `.env` no reconfigura una base ya inicializada: conservar
los valores existentes o planificar una migración explícita, sin eliminar datos
para resolver diferencias de credenciales.

Referencia: [inicio con Compose](https://docs.docker.com/reference/cli/docker/compose/up/),
[detención y volúmenes](https://docs.docker.com/reference/cli/docker/compose/down/) e
[interpolación de variables](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

## Backend Express

Requiere Node.js 22.9 o superior. Para ejecutar Express fuera de Docker,
definir `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` para una
instancia PostgreSQL accesible. Desde la raíz del repositorio:

```bash
cd express
npm ci
npm run migrate
npm start
```

La API estará disponible en `http://localhost:3000`; el estado se consulta en
`GET /health`. `HOST`, `PORT` y `NODE_ENV` se pueden configurar en `express/.env`.

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

GitHub Actions ejecuta tres jobs independientes en cada push y pull request.
Los resultados aparecen en la pestaña **Actions** del repositorio.

- **Express y PostgreSQL.** Con el Compose anterior en marcha, ejecutar
  `docker compose exec -T -e RUN_CAPTURE_DB_TESTS=1 -e RUN_USERS_DB_TESTS=1 core-api npm test`.
  Los dos indicadores habilitan las pruebas de base de datos de captación y
  usuarios. Usar una base de prueba. Para probar leads mientras su PR siga
  abierto, ejecutar los pasos de Compose desde un clon temporal de
  `codex/etapa2-esquema-leads` para incluir la migración 005.
- **Django.** Desde `python/`, ejecutar `python -m pip install -r requirements.txt`
  y `python -m unittest discover -s tests -v` con Python 3.13.
- **Contratos T4.** Desde la raíz, ejecutar
  `python -m pip install -r contracts/requirements-test.txt` y
  `python -m unittest discover -s contracts/tests -v` con Python 3.13. Valida
  OpenAPI, esquemas, ejemplos y el adaptador falso en proceso.

## Documentación

- [Estructura y configuración de Express](express/README.md)
- [Uso y límites del backend Python](python/README.md)
- [Controles de seguridad pendientes](express/docs/security.md)
