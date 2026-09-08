import * as React from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** Quem pediu menos movimento ao sistema operacional recebe as telas prontas. */
export function usePrefersReducedMotion() {
  return React.useSyncExternalStore(subscribe, getSnapshot);
}

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}
