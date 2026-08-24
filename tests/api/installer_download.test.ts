import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../server/index.js';

describe('Desktop Agent Installer Download Endpoints', () => {
  it('GET /download/agent should serve the installer executable', async () => {
    const res = await request(app).get('/download/agent');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment; filename="CampusPrintInstaller.exe"');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it('GET /api/download/agent should serve the installer executable', async () => {
    const res = await request(app).get('/api/download/agent');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment; filename="CampusPrintInstaller.exe"');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it('GET /api/agent/download/installer should serve the installer executable', async () => {
    const res = await request(app).get('/api/agent/download/installer');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment; filename="CampusPrintInstaller.exe"');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it('GET /CampusPrintInstaller.exe should serve the installer executable', async () => {
    const res = await request(app).get('/CampusPrintInstaller.exe');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment; filename="CampusPrintInstaller.exe"');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(1000);
  });
});
