# Autenticación de captación

Las rutas de canales y formularios requieren un usuario interno activo con rol
`administrador`. En cada solicitud se consulta el rol y estado actuales en la base;
un rol incluido en el token no otorga permisos.

Para habilitarlas, el proceso de Express necesita `JWT_SECRET_HEX`: una clave
aleatoria de 32 bytes, representada por 64 caracteres hexadecimales. En Compose
se puede definir en el entorno o en el archivo `.env` local y se pasa solo a
`core-api`. No se comparte ni se versiona la clave. Sin clave, las rutas quedan
cerradas; una clave con formato inválido impide iniciar Express.

La solicitud debe incluir `Authorization: Bearer <token>`. El token debe venir
de un emisor de confianza, estar firmado con HS256 y esa clave, incluir
`iss=leadqual`, `aud=leadqual-core-api`, una expiración vigente (`exp`) y el
UUID del usuario (`sub`). Si faltan credenciales válidas, la API devuelve
`401`; si el usuario no está activo o no tiene el rol permitido, devuelve `403`.

Los usuarios activos obtienen el token con [`POST /auth/login`](user-auth.md).
