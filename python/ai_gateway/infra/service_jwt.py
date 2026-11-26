"""Verificación del JWT de servicio RS256 que emite core-api (Express).

El gateway no comparte secretos simétricos con Express: verifica la firma con la
clave pública RSA y después exige el perfil del contrato T4 (emisor, audiencia,
sujeto, scope y ventana temporal). Una firma válida por sí sola no alcanza.
"""

from functools import lru_cache
from pathlib import Path

import jwt
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key

# Perfil T4 del token de servicio, acordado con `serviceJwtIssuer.js`.
ISSUER = "core-api"
AUDIENCE = "ai-gateway"
SUBJECT = "core-api"
SCOPE = "ai:structured-completions"
ALGORITHM = "RS256"
REQUIRED_CLAIMS = ("iss", "aud", "sub", "scope", "iat", "nbf", "exp")

# Límites defensivos: un token enorme o una clave corta no se procesan.
MAXIMUM_TOKEN_LENGTH = 8192
MINIMUM_KEY_BITS = 2048
MAXIMUM_LIFETIME_SECONDS = 60


class ServiceJwtConfigurationError(RuntimeError):
    """El verificador no pudo construirse a partir de la clave pública."""


def make_service_jwt_verifier(public_key_pem):
    """Devuelve `verify(authorization) -> bool` a partir de un PEM público RSA.

    La clave se valida una sola vez, al construir el verificador. A partir de
    ahí, cada llamada solo verifica un token.
    """
    key = load_pem_public_key(public_key_pem)
    if not isinstance(key, RSAPublicKey) or key.key_size < MINIMUM_KEY_BITS:
        raise ValueError(
            f"Se requiere una clave pública RSA de al menos {MINIMUM_KEY_BITS} bits."
        )

    def verify(authorization):
        """True solo si el encabezado Bearer trae un JWT de servicio válido."""
        # 1. Lee el token que Express envió en el encabezado Authorization.
        parts = (authorization or "").split()
        if (
            len(parts) != 2
            or parts[0].lower() != "bearer"
            or len(parts[1]) > MAXIMUM_TOKEN_LENGTH
        ):
            return False

        # 2. Express firma con la clave privada. Django verifica con la clave pública.
        try:
            decoded = jwt.decode_complete(
                parts[1],
                key,
                # El token de servicio debe estar firmado con RS256.
                algorithms=[ALGORITHM],
                issuer=ISSUER,
                audience=AUDIENCE,
                subject=SUBJECT,
                options={
                    "require": list(REQUIRED_CLAIMS),
                    # strict_aud exige que la audiencia sea exactamente la
                    # declarada, sin aceptar coincidencias parciales.
                    "strict_aud": True,
                },
            )
        except (jwt.InvalidTokenError, TypeError, ValueError, OverflowError):
            # Firma, vigencia o forma inválidas: se rechaza sin filtrar la causa.
            return False

        claims = decoded["payload"]
        iat, nbf, exp = (claims[name] for name in ("iat", "nbf", "exp"))

        # 3. Comprueba el permiso (scope) y la duración del token de servicio.
        # `type(value) is int` rechaza booleanos, que en Python son int.
        return (
            decoded["header"].get("typ") == "JWT"
            and claims["scope"] == SCOPE
            and all(type(value) is int for value in (iat, nbf, exp))
            and nbf == iat
            and 0 < exp - iat <= MAXIMUM_LIFETIME_SECONDS
        )

    return verify


# Reutiliza el verificador de la clave pública y comprueba un token en cada pedido.
@lru_cache(maxsize=1)
def load_service_jwt_verifier(public_key_file):
    """Carga el PEM público una vez y reutiliza el verificador entre solicitudes.

    La ruta llega desde la configuración de despliegue
    (`AI_GATEWAY_SERVICE_JWT_PUBLIC_KEY_FILE`), nunca desde la solicitud.
    """
    if not public_key_file:
        raise ServiceJwtConfigurationError(
            "No se configuró la ruta del archivo de clave pública del JWT de servicio."
        )

    try:
        # Lee la clave pública generada por scripts/generate-service-jwt-keys.mjs.
        public_key_pem = Path(public_key_file).read_bytes()
        return make_service_jwt_verifier(public_key_pem)
    except (OSError, ValueError, UnsupportedAlgorithm) as exc:
        # Conserva la causa original sin exponer la ruta del archivo al cliente.
        raise ServiceJwtConfigurationError(
            "No se pudo cargar la clave pública del JWT de servicio."
        ) from exc
