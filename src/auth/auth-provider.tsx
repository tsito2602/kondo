import * as Google from 'expo-auth-session/providers/google';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

type User = { id: string; email: string; name: string | null };
type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  signingIn: boolean;
  user: User | null;
  error: string | null;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  requestRaw: (path: string, init?: RequestInit) => Promise<Response>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SESSION_KEY = 'tabi.session';
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
const AuthContext = createContext<AuthContextValue | null>(null);

async function readToken() {
  if (Platform.OS === 'web') return globalThis.sessionStorage?.getItem(SESSION_KEY) ?? null;
  return SecureStore.getItemAsync(SESSION_KEY);
}

async function writeToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (token) globalThis.sessionStorage?.setItem(SESSION_KEY, token);
    else globalThis.sessionStorage?.removeItem(SESSION_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(SESSION_KEY, token);
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

async function api<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await apiResponse(path, init, token);
  if (response.status === 204) return undefined as T;
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(result.error ?? '通信に失敗しました'), { status: response.status });
  return result;
}

async function apiResponse(path: string, init: RequestInit = {}, token?: string | null) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const configured = Boolean(API_URL && iosClientId && androidClientId && webClientId);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    {
      iosClientId: iosClientId ?? 'not-configured',
      androidClientId: androidClientId ?? 'not-configured',
      webClientId: webClientId ?? 'not-configured',
      scopes: ['openid', 'profile', 'email'],
      selectAccount: true,
    },
    { scheme: 'tabi', path: 'oauth' },
  );

  useEffect(() => {
    let active = true;
    void readToken()
      .then(async (token) => {
        if (!token) return;
        const result = await api<{ user: User }>('/v1/me', {}, token);
        if (active) setUser(result.user);
      })
      .catch(() => writeToken(null))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!response) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (response.type !== 'success') {
        if (response.type === 'error') setError('Googleログインを完了できませんでした');
        setSigningIn(false);
        return;
      }
      const idToken = response.params.id_token ?? response.authentication?.idToken;
      if (!idToken) {
        setError('GoogleからIDトークンを受け取れませんでした');
        setSigningIn(false);
        return;
      }
      void api<{ token: string; user: User }>('/v1/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      })
        .then(async (result) => {
          await writeToken(result.token);
          if (!active) return;
          setUser(result.user);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : 'ログインに失敗しました');
        })
        .finally(() => {
          if (active) setSigningIn(false);
        });
    });
    return () => {
      active = false;
    };
  }, [response]);

  const signIn = useCallback(async () => {
    if (!configured || !request) {
      setError('Google OAuthの設定がまだ完了していません');
      return;
    }
    setSigningIn(true);
    setError(null);
    await promptAsync();
  }, [configured, promptAsync, request]);

  const signOut = useCallback(async () => {
    const token = await readToken();
    if (token) await api('/v1/auth/logout', { method: 'POST' }, token).catch(() => undefined);
    await writeToken(null);
    setUser(null);
  }, []);

  const requestApi = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const token = await readToken();
    if (!token) throw new Error('ログインが必要です');
    return api<T>(path, init, token);
  }, []);

  const requestRaw = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await readToken();
    if (!token) throw new Error('ログインが必要です');
    const response = await apiResponse(path, init, token);
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error ?? '通信に失敗しました');
    }
    return response;
  }, []);

  const value = useMemo(
    () => ({ configured, loading, signingIn, user, error, request: requestApi, requestRaw, signIn, signOut }),
    [configured, error, loading, requestApi, requestRaw, signIn, signOut, signingIn, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
