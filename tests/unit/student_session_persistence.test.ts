import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Phase 2: Student Session Persistence & Storage Isolation Unit Test Suite
 *
 * This test suite validates:
 * 1. Initial login writes studentSessionToken to localStorage and purges sessionStorage.
 * 2. Application startup restores studentSessionToken from localStorage and validates via /api/me.
 * 3. Legacy migration: token found in sessionStorage is automatically migrated to localStorage.
 * 4. Expired / invalid token is cleared from localStorage/sessionStorage and user is logged out.
 * 5. Explicit logout calls POST /api/auth/logout, wipes localStorage & sessionStorage, and clears state.
 * 6. Admin and Shop Admin tokens remain strictly in sessionStorage and are never coupled with student localStorage.
 */

// Simulated storage implementation mirroring browser localStorage / sessionStorage
class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

interface StudentProfile {
  id: string;
  name: string;
  email: string;
  picture: string;
  role: 'student';
}

interface AuthState {
  studentSessionToken: string | null;
  profile: StudentProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
}

// Logic mirror of AuthContext.tsx for unit testing state transitions
class AuthContextManager {
  public state: AuthState;
  private localStorage: Storage;
  private sessionStorage: Storage;
  private fetchMock: typeof fetch;

  constructor(localStorage: Storage, sessionStorage: Storage, fetchMock: typeof fetch) {
    this.localStorage = localStorage;
    this.sessionStorage = sessionStorage;
    this.fetchMock = fetchMock;

    this.state = {
      studentSessionToken: this.localStorage.getItem('studentSessionToken') || this.sessionStorage.getItem('studentSessionToken'),
      profile: null,
      loading: true,
      isAuthenticated: false
    };
  }

  async fetchProfile(token: string): Promise<StudentProfile | null> {
    try {
      const res = await this.fetchMock('/api/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // ignore
    }
    return null;
  }

  async initAuth() {
    const token = this.localStorage.getItem('studentSessionToken') || this.sessionStorage.getItem('studentSessionToken');
    if (token) {
      const userProfile = await this.fetchProfile(token);
      if (userProfile) {
        this.localStorage.setItem('studentSessionToken', token);
        this.sessionStorage.removeItem('studentSessionToken');
        this.state.studentSessionToken = token;
        this.state.profile = userProfile;
        this.state.isAuthenticated = true;
      } else {
        this.localStorage.removeItem('studentSessionToken');
        this.sessionStorage.removeItem('studentSessionToken');
        this.state.studentSessionToken = null;
        this.state.profile = null;
        this.state.isAuthenticated = false;
      }
    }
    this.state.loading = false;
  }

  async login(token: string) {
    this.localStorage.setItem('studentSessionToken', token);
    this.sessionStorage.removeItem('studentSessionToken');
    this.state.studentSessionToken = token;
    this.state.loading = true;
    const userProfile = await this.fetchProfile(token);
    if (userProfile) {
      this.state.profile = userProfile;
      this.state.isAuthenticated = true;
    } else {
      this.localStorage.removeItem('studentSessionToken');
      this.sessionStorage.removeItem('studentSessionToken');
      this.state.studentSessionToken = null;
      this.state.profile = null;
      this.state.isAuthenticated = false;
    }
    this.state.loading = false;
  }

  async logout() {
    const token = this.state.studentSessionToken || this.localStorage.getItem('studentSessionToken') || this.sessionStorage.getItem('studentSessionToken');
    if (token) {
      try {
        await this.fetchMock('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        // ignore
      }
    }
    this.localStorage.removeItem('studentSessionToken');
    this.sessionStorage.removeItem('studentSessionToken');
    this.state.studentSessionToken = null;
    this.state.profile = null;
    this.state.isAuthenticated = false;
  }
}

describe('Student Session Persistence & Auth Isolation Contract', () => {
  let mockLocalStorage: MockStorage;
  let mockSessionStorage: MockStorage;

  beforeEach(() => {
    mockLocalStorage = new MockStorage();
    mockSessionStorage = new MockStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Initial Login stores token in localStorage and validates profile', async () => {
    const mockProfile: StudentProfile = {
      id: 'student_123',
      name: 'Basav',
      email: 'basav@university.edu',
      picture: 'https://avatar.url',
      role: 'student'
    };

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/me') {
        return {
          ok: true,
          status: 200,
          json: async () => mockProfile
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const auth = new AuthContextManager(mockLocalStorage, mockSessionStorage, mockFetch as any);
    await auth.login('valid_jwt_token_abc');

    expect(mockLocalStorage.getItem('studentSessionToken')).toBe('valid_jwt_token_abc');
    expect(mockSessionStorage.getItem('studentSessionToken')).toBeNull();
    expect(auth.state.isAuthenticated).toBe(true);
    expect(auth.state.profile?.email).toBe('basav@university.edu');
    expect(auth.state.studentSessionToken).toBe('valid_jwt_token_abc');
  });

  it('2. Session survives browser/tab restart by restoring from localStorage', async () => {
    const mockProfile: StudentProfile = {
      id: 'student_123',
      name: 'Basav',
      email: 'basav@university.edu',
      picture: 'https://avatar.url',
      role: 'student'
    };

    // Pre-populate localStorage as if student had logged in previously
    mockLocalStorage.setItem('studentSessionToken', 'persisted_jwt_token_xyz');
    // sessionStorage is completely empty (simulating newly opened tab/browser)
    expect(mockSessionStorage.getItem('studentSessionToken')).toBeNull();

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/me') {
        return {
          ok: true,
          status: 200,
          json: async () => mockProfile
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const auth = new AuthContextManager(mockLocalStorage, mockSessionStorage, mockFetch as any);
    await auth.initAuth();

    expect(auth.state.isAuthenticated).toBe(true);
    expect(auth.state.studentSessionToken).toBe('persisted_jwt_token_xyz');
    expect(auth.state.profile?.name).toBe('Basav');
    expect(mockLocalStorage.getItem('studentSessionToken')).toBe('persisted_jwt_token_xyz');
  });

  it('3. Legacy migration: token in sessionStorage is migrated to localStorage', async () => {
    const mockProfile: StudentProfile = {
      id: 'student_legacy',
      name: 'Legacy Student',
      email: 'legacy@university.edu',
      picture: 'https://avatar.url',
      role: 'student'
    };

    // Pre-populate sessionStorage only (legacy active session)
    mockSessionStorage.setItem('studentSessionToken', 'legacy_session_token');
    mockLocalStorage.clear();

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/me') {
        return {
          ok: true,
          status: 200,
          json: async () => mockProfile
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const auth = new AuthContextManager(mockLocalStorage, mockSessionStorage, mockFetch as any);
    await auth.initAuth();

    expect(auth.state.isAuthenticated).toBe(true);
    expect(auth.state.studentSessionToken).toBe('legacy_session_token');
    // Verify migration
    expect(mockLocalStorage.getItem('studentSessionToken')).toBe('legacy_session_token');
    expect(mockSessionStorage.getItem('studentSessionToken')).toBeNull();
  });

  it('4. Expired or revoked session token is purged and user is logged out', async () => {
    mockLocalStorage.setItem('studentSessionToken', 'expired_jwt_token');

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/me') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized: Invalid or expired session.' })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const auth = new AuthContextManager(mockLocalStorage, mockSessionStorage, mockFetch as any);
    await auth.initAuth();

    expect(auth.state.isAuthenticated).toBe(false);
    expect(auth.state.studentSessionToken).toBeNull();
    expect(auth.state.profile).toBeNull();
    expect(mockLocalStorage.getItem('studentSessionToken')).toBeNull();
    expect(mockSessionStorage.getItem('studentSessionToken')).toBeNull();
  });

  it('5. Explicit logout calls backend endpoint and wipes persisted student credentials', async () => {
    mockLocalStorage.setItem('studentSessionToken', 'active_token');
    mockSessionStorage.setItem('studentSessionToken', 'active_token');

    let logoutEndpointCalled = false;
    let authHeaderPassed = '';

    const mockFetch = vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (url === '/api/auth/logout') {
        logoutEndpointCalled = true;
        authHeaderPassed = options?.headers?.Authorization || '';
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const auth = new AuthContextManager(mockLocalStorage, mockSessionStorage, mockFetch as any);
    auth.state.studentSessionToken = 'active_token';
    auth.state.isAuthenticated = true;

    await auth.logout();

    expect(logoutEndpointCalled).toBe(true);
    expect(authHeaderPassed).toBe('Bearer active_token');
    expect(mockLocalStorage.getItem('studentSessionToken')).toBeNull();
    expect(mockSessionStorage.getItem('studentSessionToken')).toBeNull();
    expect(auth.state.isAuthenticated).toBe(false);
    expect(auth.state.studentSessionToken).toBeNull();
    expect(auth.state.profile).toBeNull();
  });

  it('6. Admin and Shop Admin sessions remain strictly isolated in sessionStorage', async () => {
    // Admin sets their tokens in sessionStorage
    mockSessionStorage.setItem('adminToken', 'shop_admin_secret_token');
    mockSessionStorage.setItem('role', 'shop_admin');
    mockSessionStorage.setItem('shopId', 'alliance_print');
    mockSessionStorage.setItem('username', 'alliance_admin');

    // Student logs in via localStorage
    const mockProfile: StudentProfile = {
      id: 'student_123',
      name: 'Student',
      email: 'student@university.edu',
      picture: '',
      role: 'student'
    };
    const mockFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => mockProfile
    } as Response));

    const studentAuth = new AuthContextManager(mockLocalStorage, mockSessionStorage, mockFetch as any);
    await studentAuth.login('student_token_123');

    // Verify student token is in localStorage
    expect(mockLocalStorage.getItem('studentSessionToken')).toBe('student_token_123');

    // Verify admin tokens in sessionStorage were completely untouched
    expect(mockSessionStorage.getItem('adminToken')).toBe('shop_admin_secret_token');
    expect(mockSessionStorage.getItem('role')).toBe('shop_admin');
    expect(mockSessionStorage.getItem('shopId')).toBe('alliance_print');
    expect(mockSessionStorage.getItem('username')).toBe('alliance_admin');

    // Verify admin tokens were NOT leaked to localStorage
    expect(mockLocalStorage.getItem('adminToken')).toBeNull();
    expect(mockLocalStorage.getItem('role')).toBeNull();
    expect(mockLocalStorage.getItem('shopId')).toBeNull();
    expect(mockLocalStorage.getItem('username')).toBeNull();

    // Student logs out
    await studentAuth.logout();

    // Verify student token was wiped
    expect(mockLocalStorage.getItem('studentSessionToken')).toBeNull();

    // Verify admin token in sessionStorage is STILL intact
    expect(mockSessionStorage.getItem('adminToken')).toBe('shop_admin_secret_token');
    expect(mockSessionStorage.getItem('role')).toBe('shop_admin');
  });
});
