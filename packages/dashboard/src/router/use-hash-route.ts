import { useEffect, useState } from 'react';

import { parseHash, type RouteState } from './hash-router';

function currentHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

/**
 * React binding for the hash router (S4-01): returns the current {@link RouteState} and re-renders
 * on `hashchange`. Navigation is href-driven — nav links set `location.hash`, which fires
 * `hashchange` and re-parses — so no imperative navigate helper is needed here.
 */
export function useHashRoute(): RouteState {
  const [route, setRoute] = useState<RouteState>(() => parseHash(currentHash()));

  useEffect(() => {
    function onHashChange(): void {
      setRoute(parseHash(currentHash()));
    }
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  return route;
}
