import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from './sessionStore.js';

function setup() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let now = 1_000;
  return { values, create: () => createSessionStore(() => storage, () => now), setNow: (value) => { now = value; } };
}

test('restores only the token and original expiration after a reload', () => {
  const { create, values } = setup();
  create().save({ accessToken: 'demo-access-token', expiresAt: 2_000, password: 'never-store' });
  assert.deepEqual(create().current, { accessToken: 'demo-access-token', expiresAt: 2_000 });
  assert.doesNotMatch([...values.values()][0], /never-store/);
});

test('does not restore expired or malformed storage', () => {
  const { create, values, setNow } = setup();
  create().save({ accessToken: 'demo-access-token', expiresAt: 2_000 });
  const [key] = values.keys();
  setNow(2_000);
  assert.equal(create().current, null);
  assert.equal(values.has(key), false);
  for (const raw of ['{', '{}', '{"accessToken":" ","expiresAt":3000}', '{"accessToken":"token","expiresAt":"3000"}']) {
    values.set(key, raw);
    assert.equal(create().current, null);
    assert.equal(values.has(key), false);
  }
});

test('clears the stored session without letting an older request clear a new login', () => {
  const { create } = setup();
  const store = create();
  const payload = { accessToken: 'demo-access-token', expiresAt: 2_000 };
  const old = store.save(payload);
  const current = store.save(payload);
  assert.equal(store.clear(old), false);
  assert.deepEqual(create().current, payload);
  assert.equal(store.clear(current), true);
  assert.equal(store.current, null);
  assert.equal(create().current, null);
});

test('keeps login usable in memory when browser storage is blocked', () => {
  const store = createSessionStore(() => { throw new Error('storage disabled'); }, () => 1_000);
  const session = store.save({ accessToken: 'demo-access-token', expiresAt: 2_000 });
  assert.equal(store.current, session);
  assert.equal(store.clear(session), true);
  assert.equal(store.current, null);
});
