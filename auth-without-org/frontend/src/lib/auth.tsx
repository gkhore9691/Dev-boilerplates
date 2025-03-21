import { createContext, useContext, useState, useEffect, ReactNode, JSX } from 'react';
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  roles: string[];
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Error handling helper
const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    // Handle Axios error responses
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.response?.data?.error) {
      return error.response.data.error;
    }
    if (error.message) {
      return error.message;
    }
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
};

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshPromise, setRefreshPromise] = useState<Promise<string | null> | null>(null);

  const fetchUserData = async (token: string): Promise<User> => {
    try {
      const response = await api.get<User>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Failed to fetch user data:', message);
      toast.error('Failed to fetch user data', {
        description: message,
      });
      throw error;
    }
  };

  const storeTokens = (tokens: AuthTokens) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
  };

  const clearAuthData = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    setIsAuthenticated(false);
  };

  const refreshAuthToken = async (): Promise<string | null> => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) return null;

      const response = await api.get<AuthTokens>('/auth/refresh', {
        headers: { Authorization: `Bearer ${refreshToken}` }
      });

      const tokens: AuthTokens = response.data;
      storeTokens(tokens);
      return tokens.accessToken;
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Token refresh error:', message);
      toast.error('Session expired', {
        description: 'Please log in again to continue.',
      });
      clearAuthData();
      return null;
    }
  };

  // Setup axios interceptors
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: AxiosError) => {
        const message = getErrorMessage(error);
        toast.error('Request failed', {
          description: message,
        });
        return Promise.reject(error);
      }
    );

    const responseInterceptor = api.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        // If error is not 401 or request has already been retried, reject
        if (error.response?.status !== 401 || originalRequest._retry) {
          const message = getErrorMessage(error);
          if (error.response?.status === 403) {
            toast.error('Access denied', {
              description: 'You do not have permission to perform this action.',
            });
          } else if (error.response?.status === 404) {
            toast.error('Not found', {
              description: 'The requested resource was not found.',
            });
          } else if (error.response?.status === 429) {
            toast.error('Too many requests', {
              description: 'Please wait a moment before trying again.',
            });
          } else {
            toast.error('Request failed', {
              description: message,
            });
          }
          return Promise.reject(error);
        }

        originalRequest._retry = true;

        try {
          // If already refreshing, wait for the existing refresh promise
          if (isRefreshing && refreshPromise) {
            const newToken = await refreshPromise;
            if (newToken && originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return api(originalRequest);
            }
            throw new Error('Token refresh failed');
          }

          // Start new refresh process
          setIsRefreshing(true);
          const refreshPromiseInstance = refreshAuthToken();
          setRefreshPromise(refreshPromiseInstance);

          const newToken = await refreshPromiseInstance;
          setIsRefreshing(false);
          setRefreshPromise(null);

          if (newToken && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
          throw new Error('Token refresh failed');
        } catch (refreshError) {
          clearAuthData();
          return Promise.reject(refreshError);
        }
      }
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, [isRefreshing]);

  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      let token = localStorage.getItem('accessToken');
      if (!token) token = await refreshAuthToken();

      if (token) {
        try {
          const userData = await fetchUserData(token);
          setUser(userData);
          setIsAuthenticated(true);
        } catch {
          clearAuthData();
        }
      }
      setIsLoading(false);
    };
    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await api.post<AuthTokens>('/auth/login', { email, password });
      const tokens: AuthTokens = response.data;
      storeTokens(tokens);

      const userData = await fetchUserData(tokens.accessToken);
      setUser(userData);
      setIsAuthenticated(true);
      toast.success('Welcome back!', {
        description: `Logged in as ${userData.email}`,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Login error:', message);
      toast.error('Login failed', {
        description: message,
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await api.post<AuthTokens>('/auth/register', { email, password });
      const tokens: AuthTokens = response.data;
      storeTokens(tokens);

      const userData = await fetchUserData(tokens.accessToken);
      setUser(userData);
      setIsAuthenticated(true);
      toast.success('Registration successful!', {
        description: `Welcome, ${userData.email}`,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Registration error:', message);
      toast.error('Registration failed', {
        description: message,
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        await api.post('/auth/logout');
        toast.success('Logged out successfully');
      }
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Logout error:', message);
      toast.error('Logout failed', {
        description: message,
      });
    } finally {
      clearAuthData();
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AuthContext };
