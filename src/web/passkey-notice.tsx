import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import { useAppUpdate } from "./app-update";
import { anim, RM, spring } from "./cartoon";
import { useToast } from "./ui";

/**
 * Accounts made with Google float this above the dock on every screen until
 * they add a passkey: Google sign-in goes away once every account has one.
 * The update pill wins the spot while a new version is waiting.
 */
export function PasskeyNotice() {
  const auth = useAuth();
  const { waiting } = useAppUpdate();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const pill = useRef<HTMLButtonElement>(null);
  const shown = auth.passkeys === 0 && auth.passkeySupported && !waiting;
  useLayoutEffect(() => {
    if (!shown || !pill.current || RM()) return;
    void anim(
      pill.current,
      [
        { transform: "translateY(18px) scale(.9,1.12)", opacity: 0 },
        { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
        { transform: "translateY(0) scale(1.06,.9)", offset: 0.6 },
        { transform: "translateY(-2px) scale(.99,1.02)", offset: 0.8 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 460, easing: "cubic-bezier(.4,0,.6,1)" },
    );
  }, [shown]);
  useLayoutEffect(() => {
    if (!shown) return;
    // Shares the update pill's room so pages never hide content beneath it.
    const root = document.documentElement;
    root.dataset.appUpdate = "waiting";
    return () => {
      delete root.dataset.appUpdate;
    };
  }, [shown]);
  if (!shown) return null;
  return (
    <button
      type="button"
      ref={pill}
      className="update-notice passkey-notice"
      disabled={busy}
      aria-label="パスキーを登録してください。登録する"
      onClick={async (event) => {
        void spring(
          event.currentTarget,
          [{ transform: "scale(.94)" }, { transform: "none" }],
          "squish",
        );
        setBusy(true);
        try {
          if (await auth.addPasskey()) notify("パスキーを登録しました");
        } catch (cause) {
          notify(
            cause instanceof Error
              ? cause.message
              : "パスキーを登録できませんでした",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="update-notice-spark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle
            cx="8"
            cy="12"
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
          />
          <path
            d="M12 12h9M18 12v3.5M21 12v2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="update-notice-text" aria-hidden="true">
        <b>パスキーを登録してください</b>
        <small>次からはパスキーでログイン</small>
      </span>
      <span className="update-notice-action" aria-hidden="true">
        登録する
      </span>
    </button>
  );
}
