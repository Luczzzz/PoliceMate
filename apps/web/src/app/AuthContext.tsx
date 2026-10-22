import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  claimIdentity,
  getSavedToken,
  getSavedUserId,
  getSavedUsername,
  clearSavedIdentity,
} from "../api/calendar";

interface AuthContextValue {
  isAuthenticated: boolean;
  userId: string | null;
  username: string | null;
  token: string | null;
  login: (username: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // 初始化：从localStorage恢复身份
  useEffect(() => {
    const savedToken = getSavedToken();
    const savedUserId = getSavedUserId();
    const savedUsername = getSavedUsername();

    if (savedToken && savedUserId && savedUsername) {
      setToken(savedToken);
      setUserId(savedUserId);
      setUsername(savedUsername);
    }
  }, []);

  const login = async (usernameInput: string) => {
    const response = await claimIdentity(usernameInput);
    setToken(response.token);
    setUserId(response.userId);
    setUsername(usernameInput);
  };

  const logout = () => {
    clearSavedIdentity();
    setToken(null);
    setUserId(null);
    setUsername(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!token,
        userId,
        username,
        token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
