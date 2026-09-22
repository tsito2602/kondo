import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type User = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl?: string | null;
};
const SESSION_KEY = "tabi.session";
const USER_KEY = "tabi.offline-user";
const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const DEMO_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "true";
const readToken = () =>
  localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
function writeToken(token: string | null) {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
  }
  sessionStorage.removeItem(SESSION_KEY);
}
function saveIdentity(user: User) {
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({ user, expiresAt: Date.now() + 30 * 86400000 }),
  );
  if (!localStorage.getItem("tabi.legacy-cache-owner"))
    localStorage.setItem("tabi.legacy-cache-owner", user.id);
}
async function apiResponse(
  path: string,
  init: RequestInit = {},
  token?: string | null,
) {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string")
    headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}
async function api<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const response = await apiResponse(path, init, token);
  if (response.status === 204) return undefined as T;
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw Object.assign(new Error(result.error ?? "通信に失敗しました"), {
      status: response.status,
    });
  return result;
}
function useAuthState() {
  const [isDemo, setIsDemo] = useState(false);
  const [demoName, setDemoName] = useState("あなた");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startDemo = useCallback(() => {
    if (DEMO_ENABLED) {
      localStorage.setItem("tabi.demo-active", "1");
      setIsDemo(true);
    }
  }, []);
  const exitDemo = useCallback(() => {
    localStorage.removeItem("tabi.demo-active");
    setIsDemo(false);
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (DEMO_ENABLED && localStorage.getItem("tabi.demo-active") === "1")
        setIsDemo(true);
      else localStorage.removeItem("tabi.demo-active");
      const token = readToken();
      if (!token) return;
      try {
        const saved = JSON.parse(localStorage.getItem(USER_KEY) ?? "null");
        if (active && saved?.user && saved.expiresAt > Date.now())
          setUser(saved.user);
      } catch {
        /* Validate online below. */
      }
      const result = await api<{ user: User }>("/v1/me", {}, token);
      if (!active) return;
      writeToken(token);
      saveIdentity(result.user);
      setUser(result.user);
    })()
      .catch((cause) => {
        if (active && [401, 403].includes(cause?.status)) {
          writeToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const authenticate = useCallback(async (idToken: string) => {
    setSigningIn(true);
    setError(null);
    try {
      const result = await api<{ token: string; user: User }>(
        "/v1/auth/google",
        { method: "POST", body: JSON.stringify({ idToken }) },
      );
      writeToken(result.token);
      saveIdentity(result.user);
      setUser(result.user);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "ログインに失敗しました",
      );
    } finally {
      setSigningIn(false);
    }
  }, []);
  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      if (isDemo) throw new Error("サンプルでは共有機能を利用できません");
      const token = readToken();
      if (!token) throw new Error("ログインが必要です");
      return api<T>(path, init, token);
    },
    [isDemo],
  );
  const requestRaw = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (isDemo) throw new Error("サンプルでは共有機能を利用できません");
      const token = readToken();
      if (!token) throw new Error("ログインが必要です");
      const response = await apiResponse(path, init, token);
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw Object.assign(new Error(result?.error ?? "通信に失敗しました"), {
          status: response.status,
        });
      }
      return response;
    },
    [isDemo],
  );
  const signOut = useCallback(async () => {
    const token = readToken();
    if (token)
      await api("/v1/auth/logout", { method: "POST" }, token).catch(
        () => undefined,
      );
    writeToken(null);
    setUser(null);
  }, []);
  const updateProfile = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 100)
        throw new Error("表示名は1〜100文字で入力してください");
      if (isDemo) return setDemoName(trimmed);
      const result = await request<{ user: User }>("/v1/me", {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      setUser(result.user);
      saveIdentity(result.user);
    },
    [isDemo, request],
  );
  return useMemo(
    () => ({
      configured: Boolean(CLIENT_ID),
      demoEnabled: DEMO_ENABLED,
      isDemo,
      startDemo,
      exitDemo,
      user: isDemo ? { id: "demo-self", email: "", name: demoName } : user,
      loading,
      signingIn,
      error,
      request,
      requestRaw,
      authenticate,
      signOut,
      updateProfile,
    }),
    [
      isDemo,
      startDemo,
      exitDemo,
      demoName,
      user,
      loading,
      signingIn,
      error,
      request,
      requestRaw,
      authenticate,
      signOut,
      updateProfile,
    ],
  );
}
const AuthContext = createContext<ReturnType<typeof useAuthState> | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  return (
    <AuthContext.Provider value={useAuthState()}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}

type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    callback: (result: { credential: string }) => void;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: Record<string, string | number>,
  ) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}
let googleScript: Promise<GoogleIdentity> | undefined;
function loadGoogle() {
  if (window.google?.accounts.id)
    return Promise.resolve(window.google.accounts.id);
  return (googleScript ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () =>
      window.google?.accounts.id
        ? resolve(window.google.accounts.id)
        : reject(new Error("Googleログインを読み込めませんでした"));
    script.onerror = () => {
      googleScript = undefined;
      script.remove();
      reject(
        new Error(
          "Googleログインを読み込めませんでした。通信を確認して再読み込みしてください",
        ),
      );
    };
    document.head.appendChild(script);
  }));
}
export function GoogleSignIn() {
  const { configured, authenticate, signingIn } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!configured) return;
    let active = true;
    void loadGoogle()
      .then((google) => {
        if (!active || !ref.current) return;
        google.initialize({
          client_id: CLIENT_ID,
          callback: ({ credential }) => void authenticate(credential),
        });
        google.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          locale: "ja",
          width: 280,
        });
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [configured, authenticate]);
  return (
    <div aria-busy={signingIn}>
      <div ref={ref} />
      {signingIn && <p role="status">ログインしています…</p>}
      {error && <p role="alert">{error}</p>}
      {!configured && <p>Googleログインは現在設定されていません。</p>}
    </div>
  );
}
