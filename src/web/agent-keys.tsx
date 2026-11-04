import { useEffect, useId, useState, type FormEvent } from "react";
import { Copy } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { Button } from "./obsidian/button";
import { Input } from "./obsidian/input";
import { spring } from "./cartoon";
import {
  copyText,
  ErrorText,
  Field,
  Modal,
  SaveButton,
  useAction,
  useToast,
} from "./ui";

type AgentKey = {
  id: string;
  name: string;
  canWrite: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

const day = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
  });

const AI_ICON = (
  <svg className="settings-row-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"
      fill="currentColor"
    />
  </svg>
);

/**
 * Keys for AI agents (Muse and other MCP clients): one row each, tap to
 * revoke, and a row to make one. The key itself is shown once, when made.
 */
export function AgentKeyRows() {
  const auth = useAuth();
  const notify = useToast();
  const { busy, run } = useAction();
  const [keys, setKeys] = useState<AgentKey[] | null>(null);
  const [making, setMaking] = useState(false);
  const { request } = auth;
  const load = () =>
    request<{ keys: AgentKey[] }>("/v1/agent-keys").then((result) =>
      setKeys(result.keys),
    );
  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  if (auth.isDemo) return null;
  return (
    <div className="settings-group settings-agent-keys">
      {keys?.map((key) => (
        <button
          type="button"
          key={key.id}
          className="settings-row"
          disabled={busy}
          onClick={() => {
            if (!confirm(`「${key.name}」のキーを取り消しますか？`)) return;
            void run(async () => {
              await request(`/v1/agent-keys/${key.id}`, { method: "DELETE" });
              await load();
              notify("キーを取り消しました");
            });
          }}
        >
          {AI_ICON}
          <span>
            <b>{key.name}</b>
            <small>
              {key.canWrite ? "書き込みもできる" : "読むだけ"}・
              {key.lastUsedAt
                ? `${day(key.lastUsedAt)}に使用`
                : `${day(key.createdAt)}に作成`}
            </small>
          </span>
        </button>
      ))}
      <button
        type="button"
        className="settings-row"
        disabled={busy}
        onClick={(event) => {
          void spring(
            event.currentTarget,
            [{ transform: "scale(.97)" }, { transform: "none" }],
            "squish",
          );
          setMaking(true);
        }}
      >
        {AI_ICON}
        <span>
          <b>AI用のキーを作る</b>
        </span>
        <span className="settings-row-end">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      {making && (
        <AgentKeyEditor
          onClose={() => {
            setMaking(false);
            void load().catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}

function AgentKeyEditor({ onClose }: { onClose: () => void }) {
  const { request } = useAuth();
  const notify = useToast();
  const { busy, run } = useAction();
  const formId = useId();
  const [name, setName] = useState("Muse");
  const [canWrite, setCanWrite] = useState(true);
  const [error, setError] = useState("");
  const [made, setMade] = useState<{ token: string; url: string } | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    void run(async () => {
      try {
        setMade(
          await request<{ token: string; url: string }>("/v1/agent-keys", {
            method: "POST",
            body: JSON.stringify({ name: name.trim(), canWrite }),
          }),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
  };
  const copy = (value: string, label: string) =>
    void run(async () => {
      await copyText(value);
      notify(`${label}をコピーしました`);
    });
  return (
    <Modal title="AI用のキー" full onClose={onClose}>
      {made ? (
        <div className="form">
          <Field label="MCPサーバーのURL">
            <Input
              readOnly
              value={made.url}
              onFocus={(event) => event.target.select()}
            />
          </Field>
          <Button
            variant="ghost"
            className="secondary"
            onClick={() => copy(made.url, "URL")}
          >
            <Copy />
            URLをコピー
          </Button>
          <Field label="キー（Authorization: Bearer）">
            <Input
              readOnly
              value={made.token}
              onFocus={(event) => event.target.select()}
            />
          </Field>
          <Button
            variant="ghost"
            className="secondary"
            onClick={() => copy(made.token, "キー")}
          >
            <Copy />
            キーをコピー
          </Button>
          <p className="field-hint">
            キーはこの画面を閉じると二度と表示されません
          </p>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <Field label="名前">
            <Input
              required
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="field">
            <span id={`${formId}-write`}>できること</span>
            <div
              className="prep-cats"
              role="radiogroup"
              aria-labelledby={`${formId}-write`}
            >
              {[
                [false, "読むだけ"],
                [true, "書き込みもできる"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  role="radio"
                  key={String(value)}
                  aria-checked={canWrite === value}
                  onClick={() => setCanWrite(value as boolean)}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </div>
          <ErrorText message={error} />
          <SaveButton busy={busy} blocked={!name.trim()} />
        </form>
      )}
    </Modal>
  );
}
