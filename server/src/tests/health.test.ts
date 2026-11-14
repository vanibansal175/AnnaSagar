import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('GET /health', () => {
  it('returns status ok, uptime, and database state without leaking secrets', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeTypeOf('number');
    expect(res.body.database).toBeTypeOf('string');

    // Ensure no secrets or sensitive fields are in the body
    const responseString = JSON.stringify(res.body);
    expect(responseString).not.toContain('mongodb://');
    expect(responseString).not.toContain('password');
    expect(responseString).not.toContain('secret');
  });
});
