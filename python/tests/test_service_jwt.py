"""Pruebas del verificador RS256 del JWT de servicio.

Cada caso firma un token real con una clave efímera y comprueba la decisión del
verificador. No hay secretos compartidos ni servicios externos de por medio.

Los tokens que PyJWT se niega a producir (encabezados fuera de perfil o firma
simétrica con clave pública) se construyen a mano: son justamente los ataques
que el verificador debe rechazar.
"""

import base64
import hashlib
import hmac
import json
import time
import unittest

import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from ai_gateway.infra.service_jwt import make_service_jwt_verifier


def public_pem(private_key):
    """Extrae el PEM público (SPKI) de una clave privada RSA."""
    return private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def service_claims(**overrides):
    """Claims del perfil T4, con la posibilidad de alterar uno por caso."""
    now = int(time.time())
    claims = {
        "iss": "core-api",
        "aud": "ai-gateway",
        "sub": "core-api",
        "scope": "ai:structured-completions",
        "iat": now,
        "nbf": now,
        "exp": now + 60,
    }
    claims.update(overrides)
    return claims


def b64url(data):
    """Codifica en base64url sin relleno, como exige JWS."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def signing_input(header, claims):
    """Arma la cadena que se firma: encabezado y claims en base64url."""
    header_part = b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    claims_part = b64url(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    return f"{header_part}.{claims_part}"


def sign_rs256(header, claims, private_key):
    """Firma RS256 manualmente para controlar el encabezado exacto."""
    message = signing_input(header, claims)
    signature = private_key.sign(
        message.encode("ascii"), padding.PKCS1v15(), hashes.SHA256()
    )
    return f"{message}.{b64url(signature)}"


def sign_hs256(header, claims, secret):
    """Firma simétrica: sirve para demostrar la confusión de algoritmos."""
    message = signing_input(header, claims)
    signature = hmac.new(secret, message.encode("ascii"), hashlib.sha256).digest()
    return f"{message}.{b64url(signature)}"


class ServiceJwtTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Las claves se generan en memoria y se usan solo en esta prueba.
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.verify = staticmethod(make_service_jwt_verifier(public_pem(cls.private_key)))

    def authorization(self, *, key=None, algorithm="RS256", headers=None, **claims):
        """Firma un token y lo devuelve con el prefijo Bearer."""
        if headers is None:
            headers = {"typ": "JWT"}
        token = jwt.encode(
            service_claims(**claims),
            key or self.private_key,
            algorithm=algorithm,
            headers=headers,
        )
        return f"Bearer {token}"

    def test_accepts_the_service_token(self):
        self.assertTrue(self.verify(self.authorization()))

    def test_accepts_a_lowercase_bearer_scheme(self):
        # El esquema HTTP es case-insensitive; el token no cambia.
        token = self.authorization().split(" ", 1)[1]
        self.assertTrue(self.verify(f"bearer {token}"))

    def test_rejects_invalid_service_credentials(self):
        now = int(time.time())
        cases = {
            "ausente": None,
            "vacio": "",
            "esquema incorrecto": self.authorization().replace("Bearer", "Basic"),
            "token malformado": "Bearer no-es-un-jwt",
            "token demasiado largo": "Bearer " + "a" * 9000,
            "vencido": self.authorization(iat=now - 120, nbf=now - 120, exp=now - 60),
            "firma ajena": self.authorization(key=self.other_key),
            "audiencia incorrecta": self.authorization(aud="otro-servicio"),
            "emisor incorrecto": self.authorization(iss="otro-emisor"),
            "sujeto incorrecto": self.authorization(sub="otro-sujeto"),
            "scope incorrecto": self.authorization(scope="ai:otro"),
            "vigencia mayor al perfil": self.authorization(iat=now, nbf=now, exp=now + 61),
            "nbf distinto de iat": self.authorization(iat=now, nbf=now - 1, exp=now + 60),
            "iat no entero": self.authorization(iat=str(now)),
        }
        for name, header in cases.items():
            with self.subTest(name=name):
                self.assertFalse(self.verify(header))

    def test_rejects_a_token_without_the_typ_header(self):
        # PyJWT siempre agrega typ; se firma a mano para omitirlo.
        token = sign_rs256({"alg": "RS256"}, service_claims(), self.private_key)
        self.assertFalse(self.verify(f"Bearer {token}"))

    def test_rejects_algorithm_confusion(self):
        # Ataque clásico: firmar con HS256 usando la clave pública como secreto.
        # El verificador fija RS256, así que el token se rechaza.
        token = sign_hs256(
            {"alg": "HS256", "typ": "JWT"},
            service_claims(),
            public_pem(self.private_key),
        )
        self.assertFalse(self.verify(f"Bearer {token}"))

    def test_rejects_unsigned_tokens(self):
        # alg=none produce una firma vacía; el verificador solo acepta RS256.
        unsigned = jwt.encode(
            service_claims(), None, algorithm="none", headers={"typ": "JWT"}
        )
        self.assertFalse(self.verify(f"Bearer {unsigned}"))

    def test_requires_an_rsa_key_of_at_least_2048_bits(self):
        # Una clave débil no debe habilitar el acceso: falla al construir.
        weak_key = rsa.generate_private_key(public_exponent=65537, key_size=1024)
        with self.assertRaises(ValueError):
            make_service_jwt_verifier(public_pem(weak_key))

    def test_rejects_tokens_signed_for_another_public_key(self):
        # Verificador construido con otra clave pública: no acepta el token.
        other_verify = make_service_jwt_verifier(public_pem(self.other_key))
        self.assertFalse(other_verify(self.authorization()))
