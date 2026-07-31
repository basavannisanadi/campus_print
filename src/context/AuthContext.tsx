import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiUrl } from '../config';

interface StudentProfile {
  id: string;
  name: string;
  email: string;
  picture: string;
  role: 'student';
}

interface AuthContextType {
  studentSessionToken: string | null;
  profile: StudentProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  verifyGoogleToken: (idToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [studentSessionToken, setStudentSessionToken] = useState<string | null>(() => {
    return sessionStorage.getItem('studentSessionToken');
  });
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchProfile = async (token: string): Promise<StudentProfile | null> => {
    try {
      const res = await fetch(getApiUrl('/api/me'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error('Failed to fetch profile info:', err);
    }
    return null;
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = sessionStorage.getItem('studentSessionToken');
      if (token) {
        const userProfile = await fetchProfile(token);
        if (userProfile) {
          setStudentSessionToken(token);
          setProfile(userProfile);
        } else {
          // Token expired or invalid
          sessionStorage.removeItem('studentSessionToken');
          setStudentSessionToken(null);
          setProfile(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (token: string) => {
    sessionStorage.setItem('studentSessionToken', token);
    setStudentSessionToken(token);
    setLoading(true);
    const userProfile = await fetchProfile(token);
    if (userProfile) {
      setProfile(userProfile);
    } else {
      sessionStorage.removeItem('studentSessionToken');
      setStudentSessionToken(null);
      setProfile(null);
    }
    setLoading(false);
  };

  const logout = async () => {
    const token = studentSessionToken || sessionStorage.getItem('studentSessionToken');
    if (token) {
      try {
        await fetch(getApiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (err) {
        console.error('Failed to logout from server:', err);
      }
    }
    sessionStorage.removeItem('studentSessionToken');
    setStudentSessionToken(null);
    setProfile(null);
  };

  const verifyGoogleToken = async (idToken: string) => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/auth/google'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ idToken })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to authenticate with Google ID token');
      }

      const { sessionToken } = await res.json();
      await login(sessionToken);
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const isAuthenticated = !!studentSessionToken && !!profile;

  return (
    <AuthContext.Provider
      value={{
        studentSessionToken,
        profile,
        loading,
        isAuthenticated,
        login,
        logout,
        verifyGoogleToken
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
