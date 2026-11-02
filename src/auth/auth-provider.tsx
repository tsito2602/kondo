import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";

type User = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl?: string | null;
};
const SESSION_KEY = "tabi.session";
const USER_KEY = "tabi.offline-user";
const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
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
type PasskeyOptions = {
  challengeId: string;
  // Server-made WebAuthn options, passed through to the browser untouched.
  options: Parameters<typeof startAuthentication>[0]["optionsJSON"] &
    Parameters<typeof startRegistration>[0]["optionsJSON"];
};
export type PasskeyRow = {
  id: string;
  device: string;
  createdAt: number;
  lastUsedAt: number | null;
};
/** A message for the person, or null when they simply cancelled the sheet. */
function passkeyError(cause: unknown) {
  if (cause instanceof WebAuthnError) {
    if (cause.code === "ERROR_CEREMONY_ABORTED") return null;
    if (cause.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
      return "この端末のパスキーはもう登録されています";
  }
  if (cause instanceof Error && cause.name === "NotAllowedError") return null;
  return cause instanceof Error && !(cause instanceof WebAuthnError)
    ? cause.message
    : "パスキーを使えませんでした";
}
function useAuthState() {
  const [isDemo, setIsDemo] = useState(false);
  const [demoName, setDemoName] = useState("あなた");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // How many passkeys this account has; null until known (offline, demo).
  const [passkeys, setPasskeys] = useState<number | null>(null);
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
      const result = await api<{ user: User; passkeys?: number }>(
        "/v1/me",
        {},
        token,
      );
      if (!active) return;
      writeToken(token);
      saveIdentity(result.user);
      setUser(result.user);
      setPasskeys(result.passkeys ?? 0);
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
  const signIn = useCallback(
    async (
      run: () => Promise<{ token: string; user: User }>,
      passkeyCount: number,
    ) => {
      setSigningIn(true);
      setError(null);
      try {
        const result = await run();
        writeToken(result.token);
        saveIdentity(result.user);
        setUser(result.user);
        setPasskeys(passkeyCount);
      } catch (cause) {
        const message = passkeyError(cause);
        if (message) setError(message);
      } finally {
        setSigningIn(false);
      }
    },
    [],
  );
  const passkeySignIn = useCallback(
    () =>
      signIn(async () => {
        const { challengeId, options } = await api<PasskeyOptions>(
          "/v1/auth/passkey/login/options",
          { method: "POST" },
        );
        const response = await startAuthentication({ optionsJSON: options });
        return api<{ token: string; user: User }>("/v1/auth/passkey/login", {
          method: "POST",
          body: JSON.stringify({ challengeId, response }),
        });
      }, 1),
    [signIn],
  );
  const passkeySignUp = useCallback(
    (name: string) =>
      signIn(async () => {
        const { challengeId, options } = await api<PasskeyOptions>(
          "/v1/auth/passkey/signup/options",
          { method: "POST", body: JSON.stringify({ name: name.trim() }) },
        );
        const response = await startRegistration({ optionsJSON: options });
        return api<{ token: string; user: User }>("/v1/auth/passkey/signup", {
          method: "POST",
          body: JSON.stringify({ challengeId, response }),
        });
      }, 1),
    [signIn],
  );
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
  /** Adds a passkey to the signed-in account; false when the person backed out. */
  const addPasskey = useCallback(async () => {
    const { challengeId, options } = await request<PasskeyOptions>(
      "/v1/passkeys/options",
      { method: "POST" },
    );
    let response;
    try {
      response = await startRegistration({ optionsJSON: options });
    } catch (cause) {
      const message = passkeyError(cause);
      if (message) throw new Error(message);
      return false;
    }
    const result = await request<{ passkeys: PasskeyRow[] }>("/v1/passkeys", {
      method: "POST",
      body: JSON.stringify({ challengeId, response }),
    });
    setPasskeys(result.passkeys.length);
    return true;
  }, [request]);
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
  /** A new square icon (JPEG), or null to go back to the drawn face. */
  const updateAvatar = useCallback(
    async (image: Blob | null) => {
      const result = await request<{ user: User }>(
        "/v1/me/avatar",
        image
          ? {
              method: "PUT",
              body: image,
              headers: { "content-type": image.type },
            }
          : { method: "DELETE" },
      );
      setUser(result.user);
      saveIdentity(result.user);
    },
    [request],
  );
  return useMemo(
    () => ({
      passkeySupported: browserSupportsWebAuthn(),
      passkeys: isDemo ? null : passkeys,
      passkeySignIn,
      passkeySignUp,
      addPasskey,
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
      signOut,
      updateProfile,
      updateAvatar,
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
      signOut,
      updateProfile,
      updateAvatar,
      passkeys,
      passkeySignIn,
      passkeySignUp,
      addPasskey,
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
