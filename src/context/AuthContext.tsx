import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { setTokens, clearTokens, getRefreshToken, setOnTokenRefreshFailed, toBase64 } from '../services/api';
import { loginUser, registerUser, logoutUser } from '../services/auth';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{success: boolean; error?: string}>;
  register: (email: string, password: string) => Promise<{success: boolean; error?: string}>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Generate placeholder key params for registration.
// In a full implementation, the client would derive these from the user's
// password using Argon2 and generate a real master key. For now we send
// placeholder values so the server schema is satisfied.
function generatePlaceholderKeyParams() {
  const randomB64 = () => {
    const bytes = [];
    for (let i = 0; i < 32; i++) {
      bytes.push(Math.floor(Math.random() * 256));
    }
    return toBase64(String.fromCharCode(...bytes));
  };

  return {
    salt: randomB64(),
    iterations: 3,
    memory: 65536,
    encryptedMasterKey: randomB64(),
    iv: randomB64(),
  };
}

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setOnTokenRefreshFailed(() => {
      setUser(null);
      clearTokens();
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await loginUser(email, password);
      if (result.success && result.data) {
        setTokens(result.data.tokens.accessToken, result.data.tokens.refreshToken);
        setUser(result.data.user);
        return {success: true};
      }
      return {success: false, error: result.error || 'Login failed'};
    } catch (err: any) {
      return {success: false, error: err.message || 'Login failed'};
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const keyParams = generatePlaceholderKeyParams();
      const result = await registerUser(email, password, keyParams);
      if (result.success && result.data) {
        setTokens(result.data.tokens.accessToken, result.data.tokens.refreshToken);
        setUser(result.data.user);
        return {success: true};
      }
      return {success: false, error: result.error || 'Registration failed'};
    } catch (err: any) {
      return {success: false, error: err.message || 'Registration failed'};
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const rt = getRefreshToken();
      if (rt) {
        await logoutUser(rt);
      }
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{user, isLoading, login, register, logout}}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
