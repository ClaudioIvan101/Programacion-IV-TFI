# Autenticación y permisos de usuarios

`POST /auth/login` recibe un cuerpo JSON con `email` y `password`. Si las
credenciales corresponden a un usuario activo, devuelve `200` con
`{ "accessToken": "…", "tokenType": "Bearer", "expiresIn": 900 }`.
Un correo desconocido, una contraseña incorrecta y una cuenta inactiva reciben
el mismo `401`.

1. Express valida el cuerpo y normaliza el correo. Entrega la contraseña tal
   como llegó a la función de verificación.
2. El repositorio consulta en PostgreSQL por `lower(email)` con un parámetro.
   Lee el identificador, el estado y el hash de scrypt.
3. Si scrypt verifica la contraseña y el usuario está activo, `jose` firma un
   JWT HS256 de 15 minutos con el UUID del usuario como `sub`.
4. El cliente manda `Authorization: Bearer <accessToken>` a `/users`.
   Express verifica el JWT y vuelve a consultar el estado y el rol por UUID.

| Usuario | `POST /auth/login` con credenciales válidas | Crear, listar o consultar en `/users` |
| --- | --- | --- |
| Administrador activo | 200 | Permitido |
| Supervisor activo | 200 | 403 |
| Vendedor activo | 200 | 403 |
| Usuario inactivo | 401 | 403 con un token todavía vigente |

En `/users`, un token ausente, inválido o vencido recibe `401` con
`WWW-Authenticate: Bearer`.

## Configuración y primer administrador

Generá 32 bytes aleatorios y guardalos como 64 caracteres hexadecimales en
`JWT_SECRET_HEX`, en el entorno de Express o el `.env` local de Compose.
Esta clave es para los JWT HS256 de usuario. La comunicación Express–Django
utiliza su propio par de claves RS256. Si falta la clave de usuario, el login
responde `503`.

### Alta inicial desde la terminal

Ejecutá el comando con las migraciones aplicadas y las variables `PG*`
configuradas para la base del despliegue. Desde `express/`:

```sh
npm run admin:create-first
```

Con Docker Compose, desde la raíz y con `core-api` reconstruido y en ejecución:

```sh
docker compose exec core-api npm run admin:create-first
```

Ingresá el nombre, el email y una contraseña de 12 a 1024 caracteres. Escribí
la contraseña cuando aparezca su turno. La terminal la mantiene oculta.
El comando usa `createUser` con rol `administrador` y guarda el hash scrypt.

PostgreSQL comprueba si ya hay un administrador y realiza el alta en una sola
transacción. Si ya existe uno, aun si está inactivo, el comando termina con
código 1. Ante dos ejecuciones simultáneas, solo una puede dar de alta la
primera cuenta.
