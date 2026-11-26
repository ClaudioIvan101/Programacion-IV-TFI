import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

class SmokeFailure extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new SmokeFailure(message);
}

const pythonDir = fileURLToPath(new URL('../../python/', import.meta.url));
const suppliedPython = process.env.T4_SMOKE_PYTHON;
const windows = process.platform === 'win32';

// No se propagan credenciales, configuración de proveedores ni claves del entorno.
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  ['path', 'pathext', 'systemroot', 'windir', 'temp', 'tmp', 'tmpdir', 'home', 'userprofile', 'localappdata', 'homedrive', 'homepath']
    .includes(name.toLowerCase()),
));

function pythonExecutable() {
  const probe = [
    'import importlib.util, sys',
    'print(sys.executable)',
    "print(', '.join(name for name in ('django', 'jwt', 'cryptography', 'jsonschema', 'referencing') if importlib.util.find_spec(name) is None))",
  ].join('; ');
  const launcher = suppliedPython ?? (windows ? 'py' : 'python3');
  const argv = !suppliedPython && windows ? ['-3'] : [];
  const result = spawnSync(launcher, [...argv, '-B', '-c', probe], {
    env: childEnv, windowsHide: true, timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  requireCondition(result.status === 0, 'No se pudo iniciar Python. Use T4_SMOKE_PYTHON para indicar el intérprete.');
  const [executable, missing] = result.stdout.trimEnd().split(/\r?\n/);
  requireCondition(executable && !missing, `Faltan dependencias de Python: ${missing ?? 'intérprete no identificado'}.`);
  // Windows: se inicia el ejecutable real, no el lanzador py, para cerrarlo sin dejar procesos hijos.
  return executable;
}

function listenPort(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const limit = setTimeout(() => finish(undefined, 'Django no publicó el puerto a tiempo.'), 8000);
    const data = (chunk) => {
      output = (output + chunk).slice(-512);
      const match = /Development server listening on port (\d+)\r?\n/.exec(output);
      if (match) finish(Number(match[1]));
    };
    function finish(port, failure) {
      clearTimeout(limit);
      child.stdout.off('data', data);
      if (failure) reject(new SmokeFailure(failure));
      else resolve(port);
    }
    child.stdout.setEncoding('utf8').on('data', data);
    child.once('error', () => finish(undefined, 'No se pudo iniciar el proceso Django.'));
    child.once('close', () => finish(undefined, 'Django terminó antes de anunciar el puerto.'));
  });
}

const loadFixture = async (path) =>
  JSON.parse(await readFile(new URL(`../../contracts/${path}`, import.meta.url), 'utf8'));

async function verify() {
  const executable = pythonExecutable();

  let createServiceTokenProvider;
  let createAiGatewayClient;
  try {
    ({ createServiceTokenProvider } = await import('../src/infra/serviceJwtIssuer.js'));
    ({ createAiGatewayClient } = await import('../src/infra/aiGatewayClient.js'));
  } catch {
    throw new SmokeFailure('No se pudieron cargar los módulos de Express. Verifique npm ci.');
  }

  const schemaNames = { request: 'request', response: 'response', result: 'result', leadData: 'lead-data' };
  const schemas = Object.fromEntries(await Promise.all(Object.entries(schemaNames).map(async ([key, name]) =>
    [key, await loadFixture(`schemas/${name}.schema.json`)])));
  const request = await loadFixture('examples/valid/request-partial.json');
  const expected = await loadFixture('examples/valid/response-follow-up.json');

  // La clave privada es efímera y queda solo en Node. Django recibe un archivo PEM público.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const getServiceToken = await createServiceTokenProvider({ privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const directory = await mkdtemp(join(tmpdir(), 'tfiprog-t4-smoke-'));
  const publicFile = join(directory, 'service-public.pem');
  let child;
  let closed;
  try {
    await writeFile(publicFile, publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx', mode: 0o600 });
    child = spawn(executable, ['-B', '-m', 'backend'], {
      cwd: pythonDir, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...childEnv, DJANGO_SETTINGS_MODULE: 'backend.settings', HOST: '127.0.0.1', PORT: '0',
        AI_GATEWAY_ENV: 'production', AI_GATEWAY_PROVIDER: 'fake', AI_GATEWAY_SERVICE_JWT_PUBLIC_KEY_FILE: publicFile,
      },
    });
    closed = new Promise((resolve) => child.once('close', resolve));
    const port = await listenPort(child);
    requireCondition(port > 0 && port <= 65535, 'Django anunció un puerto inválido.');
    const baseUrl = `http://127.0.0.1:${port}`;
    const metadata = () => ({ idempotencyKey: randomUUID(), requestId: randomUUID(), deadline: new Date(Date.now() + 5000).toISOString() });

    // El único caso que evita el cliente es el que debe omitir Authorization.
    const rejected = metadata();
    const unauthorized = await fetch(`${baseUrl}/v1/structured-completions`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: {
        'Content-Type': 'application/json', 'Idempotency-Key': rejected.idempotencyKey,
        'X-Request-Id': rejected.requestId, 'X-Deadline': rejected.deadline,
      },
      body: JSON.stringify(request),
    });
    requireCondition(unauthorized.status === 401 && unauthorized.headers.get('www-authenticate') === 'Bearer',
      'Django no respondió 401 con desafío Bearer a la solicitud sin credencial.');
    const error = (await unauthorized.json()).error;
    requireCondition(error?.code === 'UNAUTHENTICATED' && error.request_id === rejected.requestId,
      'La respuesta 401 no respetó el contrato T4.');

    const client = createAiGatewayClient({ baseUrl, getServiceToken, schemas, httpAuthorization: { origin: baseUrl, environment: 'test' } });
    const response = await client.structuredCompletion(request, metadata());
    // Django mide latencia en ejecución; el resto debe coincidir con el ejemplo.
    requireCondition(isDeepStrictEqual({ ...response, latency_ms: expected.latency_ms }, expected),
      'La respuesta autorizada no coincidió con el ejemplo parcial T4.');

    // Error real de autenticación: Django rechaza un token firmado con otra
    // clave y el cliente lo clasifica como HTTP 401, sin filtrar detalles.
    const { privateKey: foreignKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const foreignProvider = await createServiceTokenProvider({
      privateKeyPem: foreignKey.export({ type: 'pkcs8', format: 'pem' }),
    });
    const foreignClient = createAiGatewayClient({
      baseUrl, getServiceToken: foreignProvider, schemas,
      httpAuthorization: { origin: baseUrl, environment: 'test' },
    });
    const foreignError = await foreignClient.structuredCompletion(request, metadata()).then(
      () => undefined,
      (error) => error,
    );
    requireCondition(foreignError?.code === 'HTTP_ERROR' && foreignError?.status === 401,
      'Django no rechazó el token de otra clave, o el cliente no lo clasificó como HTTP 401.');

    // Error local de credenciales: si el emisor falla, el cliente no llega a Django.
    const brokenClient = createAiGatewayClient({
      baseUrl, getServiceToken: async () => { throw new Error('sin clave'); }, schemas,
      httpAuthorization: { origin: baseUrl, environment: 'test' },
    });
    const credentialsError = await brokenClient.structuredCompletion(request, metadata()).then(
      () => undefined,
      (error) => error,
    );
    requireCondition(credentialsError?.code === 'CREDENTIALS',
      'El cliente no clasificó el fallo del emisor como CREDENTIALS.');
  } finally {
    try {
      if (child) {
        if (child.exitCode === null && child.signalCode === null) child.kill();
        const exited = await Promise.race([closed.then(() => true), delay(2000, false, { ref: false })]);
        if (!exited) {
          child.kill('SIGKILL');
          const stopped = await Promise.race([closed.then(() => true), delay(2000, false, { ref: false })]);
          requireCondition(stopped, 'No se confirmó el cierre del proceso Django iniciado por la prueba.');
        }
      }
    } finally {
      await unlink(publicFile).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      await rmdir(directory);
    }
  }
}

try {
  await verify();
  console.log('T4 por HTTP real: Django respondió 401 sin token, 200 con un JWT de Express y 401 con una clave ajena.');
} catch (error) {
  const explanation = error instanceof SmokeFailure ? error.message
    : error?.code === 'ENOSPC' ? 'No hay espacio para preparar la clave pública temporal.'
      : 'Falló la verificación local de T4. Revise las dependencias y el arranque del gateway.';
  console.error(explanation);
  process.exitCode = 1;
}
