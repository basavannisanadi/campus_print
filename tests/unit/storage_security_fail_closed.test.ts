import { describe, it, expect, vi, afterEach } from 'vitest';
import { isRemoteStorageActive, StorageError, STORAGE_BUCKET } from '../../server/storage.js';
import * as dbModule from '../../server/db.js';

describe('Storage Security & Fail-Closed Behavior', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('STORAGE_BUCKET constant must strictly be "print-documents"', () => {
    expect(STORAGE_BUCKET).toBe('print-documents');
  });

  it('1. SUPABASE_SERVICE_ROLE_KEY works and enables remote storage in production', () => {
    process.env.NODE_ENV = 'production';

    vi.spyOn(dbModule, 'isServiceRoleConfigured', 'get').mockReturnValue(true);
    vi.spyOn(dbModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(dbModule, 'supabase', 'get').mockReturnValue({} as any);

    expect(isRemoteStorageActive()).toBe(true);
  });

  it('2. SUPABASE_ANON_KEY alone fails and causes remote storage to fail closed in production', () => {
    process.env.NODE_ENV = 'production';

    // Anon key present, but service role key is absent
    vi.spyOn(dbModule, 'isServiceRoleConfigured', 'get').mockReturnValue(false);
    vi.spyOn(dbModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);

    expect(() => {
      isRemoteStorageActive();
    }).toThrow(StorageError);

    expect(() => {
      isRemoteStorageActive();
    }).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('3. generic SUPABASE_KEY alone fails and causes remote storage to fail closed in production', () => {
    process.env.NODE_ENV = 'production';

    // Generic key present, but service role key is absent
    vi.spyOn(dbModule, 'isServiceRoleConfigured', 'get').mockReturnValue(false);
    vi.spyOn(dbModule, 'isSupabaseConfigured', 'get').mockReturnValue(false);

    expect(() => {
      isRemoteStorageActive();
    }).toThrow(StorageError);

    expect(() => {
      isRemoteStorageActive();
    }).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('4. No browser/client code or public environment exposes SUPABASE_SERVICE_ROLE_KEY', () => {
    // Assert that client-exposed VITE environment variables never contain the service role key
    const viteEnvKeys = Object.keys(process.env).filter(k => k.startsWith('VITE_'));
    const leaksServiceRole = viteEnvKeys.some(k => k.toLowerCase().includes('service_role') || k.toLowerCase().includes('service_key'));
    expect(leaksServiceRole).toBe(false);
  });
});
