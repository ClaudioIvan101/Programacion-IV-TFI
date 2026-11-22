# T7 · Adaptador falso de Python

**Etapa 1 · Integrante C**

**Rama** `codex/t7-adaptador-falso` · **Commit de implementación** `8cfbd3c`

El adaptador permite probar respuestas del contrato T4 en el mismo proceso. La selección del escenario es explícita y cada llamada devuelve el mismo contenido para el escenario elegido. El alcance es la lectura de ejemplos JSON locales. HTTP, JWT, la IA real y las reglas comerciales quedan fuera de T7.

## Archivos y funciones

- [`python/ai_gateway/infra/fake_provider.py`](../../python/ai_gateway/infra/fake_provider.py) contiene `fake_completion()`. Por defecto carga `response-complete.json`. Con `partial=True` carga `response-follow-up.json`, que pregunta si el presupuesto está en ARS o USD. Lee el archivo en UTF-8 y devuelve su contenido como un diccionario de Python.
- [`contracts/tests/test_contract.py`](../../contracts/tests/test_contract.py) prueba el adaptador con los ejemplos y el validador de JSON Schema existentes. El esquema de respuesta y los ejemplos de T4 se reutilizan tal como están.

## Escenarios probados

| Escenario | Qué comprueba la prueba |
| --- | --- |
| Datos completos | La respuesta cumple el esquema T4, coincide con el ejemplo completo y se repite en una segunda llamada. |
| Datos parciales | La respuesta cumple el esquema T4, coincide con el ejemplo de seguimiento y se repite en una segunda llamada. |
| Respuesta inválida | La prueba simula la lectura de `response-budget-type.json` y el validador T4 rechaza el tipo incorrecto en el presupuesto. |
| Proveedor no disponible | La prueba simula que el archivo de respuesta falta y comprueba que `fake_completion()` propaga `FileNotFoundError`. |

## Cómo repetir las pruebas

Desde la raíz del repositorio, con PowerShell. La suite de contrato usa las dependencias de prueba ya declaradas en T4. La suite del backend usa la biblioteca estándar de Python.

```powershell
python -m venv contracts/.venv
.\contracts\.venv\Scripts\python.exe -m pip install -r contracts/requirements-test.txt
.\contracts\.venv\Scripts\python.exe -B -m unittest discover -s contracts/tests -v

Push-Location python
python -B -m unittest discover -s tests -v
Pop-Location
```

**Resultado de la implementación** · 16 pruebas de contrato, incluidas las cuatro de T7, y 15 pruebas del backend aprobadas.
