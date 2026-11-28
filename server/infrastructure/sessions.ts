import { randomBytes } from 'node:crypto';

import type { ApplicationSessions, StoredSession } from '../modules/identity';

interface Entry extends StoredSession {
  expiresAt: number;
}

/**
 * Sessões da aplicação live in the API process on purpose: closing the app
 * ends them, which is what an app holding credenciais do professor wants.
 */
export function createMemorySessions(options: { idleMs: number; now?: () => number }): ApplicationSessions {
  const entries = new Map<string, Entry>();
  const now = options.now ?? Date.now;

  function discardExpired(at: number): void {
    for (const [token, entry] of entries) {
      if (entry.expiresAt <= at) entries.delete(token);
    }
  }

  return {
    open(session) {
      const at = now();
      discardExpired(at);
      const token = randomBytes(32).toString('base64url');
      entries.set(token, { ...session, expiresAt: at + options.idleMs });
      return token;
    },

    read(token) {
      const at = now();
      const entry = entries.get(token);
      if (!entry) return null;
      if (entry.expiresAt <= at) {
        entries.delete(token);
        return null;
      }
      entry.expiresAt = at + options.idleMs;
      return { userId: entry.userId, identidade: entry.identidade };
    },

    close(token) {
      entries.delete(token);
    },

    closeForUser(userId, except) {
      for (const [token, entry] of entries) {
        if (entry.userId === userId && token !== except) entries.delete(token);
      }
    },
  };
}
