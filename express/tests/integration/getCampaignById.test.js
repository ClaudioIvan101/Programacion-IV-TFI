import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../../src/app.js";

const id = "11111111-1111-4111-8111-111111111111";
const missingId = "22222222-2222-4222-8222-222222222222";
const campaign = { id, name: "Departamentos en Resistencia" };

let server;
let baseUrl;

before(async () => {
  const app = createApp({
    campaigns: {
      // Sustituimos el caso de uso para probar únicamente el contrato HTTP.
      async getById(receivedId) {
        return receivedId === id ? campaign : null;
      },
    },
  });

  // Puerto libre asignado por el sistema, sin ocupar el 3000.
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  // Esperamos el cierre del servidor utilizado por estas pruebas.
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
});

test("Una campaña encontrada responde 200 con sus datos", async () => {
  const response = await fetch(`${baseUrl}/campaigns/${id}`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), campaign);
});

test("Un identificador inválido responde 400", async () => {
  const response = await fetch(`${baseUrl}/campaigns/no-es-un-uuid`);

  assert.equal(response.status, 400);
  await response.json();
});

test("Una campaña inexistente responde 404", async () => {
  const response = await fetch(`${baseUrl}/campaigns/${missingId}`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Campaña no encontrada.",
  });
});

test("La consulta rechaza parámetros adicionales", async () => {
  const response = await fetch(`${baseUrl}/campaigns/${id}?extra=1`);

  assert.equal(response.status, 400);
  await response.json();
});