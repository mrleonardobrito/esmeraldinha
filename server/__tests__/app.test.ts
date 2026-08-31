import { describe, expect, it } from 'vitest';

import { createApp } from '../app';

describe('createApp', () => {
  it('responds to GET /api/health through app.fetch()', async () => {
    const app = createApp();

    const response = await app.fetch(new Request('http://localhost/api/health'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
