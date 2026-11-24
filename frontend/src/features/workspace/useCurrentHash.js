import { useSyncExternalStore } from 'react';

function subscribe(callback) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

const snapshot = () => window.location.hash;

export function useCurrentHash() {
  return useSyncExternalStore(subscribe, snapshot);
}
