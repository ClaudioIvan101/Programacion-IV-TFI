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

Para el primer administrador, la propuesta es un comando de mantenimiento de
una sola vez, ejecutado por quien administra el despliegue. El comando recibe
el nombre y el correo, pide una contraseña sin eco y llama al caso de uso
existente `createUser` con rol `administrador`. Ese caso genera el hash scrypt
y escribe en PostgreSQL. El comando debe rechazar el alta si ya existe un
administrador y evitar guardar la contraseña en el historial o en el código.
