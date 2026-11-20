# Verificación de leads, autenticación y gateway Django

**20/11/2026** · **Base** `main` en `3aa22d7`

GitHub confirmó que los PR [#18](https://github.com/ClaudioIvan101/Programacion-IV-TFI/pull/18), [#19](https://github.com/ClaudioIvan101/Programacion-IV-TFI/pull/19) y [#20](https://github.com/ClaudioIvan101/Programacion-IV-TFI/pull/20) están integrados. La revisión usa también los cambios posteriores presentes en ese commit de `main`.

## Corrección de mi módulo

El comando `admin:create-first` figuraba en `package.json`, pero el Dockerfile de Express no copiaba `express/scripts/` y su lista de archivos permitidos excluía `create-first-admin.js`. Se agregó la ruta a la lista y la copia a la imagen. El cambio es de empaquetado.

## Alcance de la prueba

Se preparó un proyecto Compose separado con PostgreSQL 16, un volumen temporal, una clave JWT de usuario de prueba y datos sintéticos. Los servicios se consultaron por la red local de Docker. El volumen de prueba se eliminó al terminar.

### T10 y el clon limpio

El [PR #16](https://github.com/ClaudioIvan101/Programacion-IV-TFI/pull/16) registra una prueba de T10 desde un clon limpio de la Etapa 1. Para verificar leads se usó el commit `598b640` del PR #15, con PostgreSQL 16.13 y migraciones `001` a `005`. En esa prueba, `/ready` de Express devolvió `404`.

La verificación de este informe usó el repositorio local actualizado a `main` y una base nueva. Queda pendiente repetir desde un clon limpio con los PR #18, #19 y #20 ya integrados y completar el registro individual de cada integrante.

## Resultados

| Verificación | Resultado |
| --- | --- |
| Arranque de Compose | Arrancaron Express, Django, PostgreSQL y Mailpit. Django y PostgreSQL quedaron `healthy`. |
| Migraciones | Se aplicaron `001` a `006` sobre una base vacía. La segunda ejecución informó que no quedaban migraciones pendientes. |
| Leads y mensajes | Se creó y consultó un lead, se abrió una conversación, y se guardó y consultó un mensaje. Un mensaje de solo espacios devolvió `400`. |
| Primer administrador | El comando dentro de Express pidió las credenciales en una terminal interactiva, ocultó la contraseña y creó la cuenta. Un segundo intento con otro email terminó con código 1 y el mensaje «Ya existe un administrador». La suite de Express confirmó que dos altas simultáneas crean una sola cuenta. |
| Login y permisos | Los tres roles activos iniciaron sesión. En `/users`, el administrador pudo crear y listar usuarios. Supervisor y vendedor recibieron `403`. La contraseña incorrecta y la consulta sin token recibieron `401`. |
| Endpoints de estado | Express `/health` devolvió `200` y `/ready` devolvió `404`. Django devolvió `200` en ambos. |
| Endpoint T4 interno | Con `AI_GATEWAY_ENV=development`, una solicitud parcial desde el contenedor Express devolvió `200` y reflejó `X-Request-Id`. El procesador de Express conservó el nuevo monto de 100000 con `moneda: null` y marcó que hace falta aclararla. |
| JWT de servicio | Con la configuración predeterminada del gateway, el POST T4 devolvió `401 UNAUTHENTICATED` con un JWT RS256 emitido por Express con una clave de prueba. |
| Suites completas | Express **87/87**, Django **26/26**, contratos T4 **16/16**. `django check` completó sin observaciones. |

## Pendientes de coordinación

- **Disponibilidad de Express.** `GET /ready` aún no está registrada. Queda por acordar la comprobación de PostgreSQL y del esquema con quien mantiene el arranque de Express.
- **JWT entre servicios.** Express ya puede emitir un JWT RS256 y el cliente HTTP aislado pasa sus pruebas. Django todavía aplica el bloqueo temporal fuera de desarrollo. Claudio debe conectar el verificador y coordinar con Facu la configuración de las claves y del cliente.
- **Turno conversacional.** La prueba de T4 invocó Django desde el contenedor Express y procesó su respuesta por separado. Queda pendiente conectar ese recorrido a la orquestación del turno y acordar la deduplicación por `Idempotency-Key`.

## Comandos de referencia

Desde la raíz, con el Compose de desarrollo y PostgreSQL configurados:

```sh
docker compose up --build --wait
docker compose exec core-api npm run migrate
docker compose exec core-api npm run admin:create-first
docker compose exec -T -e RUN_USERS_DB_TESTS=1 -e RUN_CAPTURE_DB_TESTS=1 core-api npm test
```

En un entorno Python con las dependencias de `python/requirements.txt` y `contracts/requirements-test.txt`:

```sh
cd python
python -B -m unittest discover -s tests
python -B -m django check --settings=backend.settings
cd ..
python -B -m unittest discover -s contracts/tests
```
