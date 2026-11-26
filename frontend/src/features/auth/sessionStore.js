const sessionKey = 'leadqual.auth.session';

export function createSessionStore(getStorage = () => globalThis.sessionStorage, now = Date.now) {
  function useStorage(operation) {
    try {
      return operation(getStorage());
    } catch {
      // Storage may be blocked by the browser; the active tab can still sign in.
      return null;
    }
  }

  let current = null;
  const raw = useStorage((storage) => storage.getItem(sessionKey));
  if (raw !== null) {
    try {
      const { accessToken, expiresAt } = JSON.parse(raw);
      if (typeof accessToken === 'string' && /^\S+$/.test(accessToken) &&
          Number.isSafeInteger(expiresAt) && expiresAt > now()) {
        current = { accessToken, expiresAt };
      }
    } catch {
      // Invalid stored JSON is treated as a signed-out session.
    }
    if (!current) useStorage((storage) => storage.removeItem(sessionKey));
  }

  return {
    get current() { return current; },
    save({ accessToken, expiresAt }) {
      current = { accessToken, expiresAt };
      useStorage((storage) => storage.setItem(sessionKey, JSON.stringify(current)));
      return current;
    },
    clear(expectedSession) {
      // A request from an older login must not invalidate its replacement.
      if (!current || current !== expectedSession) return false;
      current = null;
      useStorage((storage) => storage.removeItem(sessionKey));
      return true;
    },
  };
}
