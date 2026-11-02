import {
  type FormEvent,
  type PointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { Modal, useToast } from "./ui";

const VIEW = 240;
const OUT = 512;
const MAX_ZOOM = 4;

type Picture = { img: HTMLImageElement; url: string };
type Frame = { zoom: number; x: number; y: number };

function load(url: string, cors: boolean) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** How big the picture is drawn at a zoom: 1 = just covers the circle. */
const scaleOf = (img: HTMLImageElement, zoom: number) =>
  (VIEW / Math.min(img.naturalWidth, img.naturalHeight)) * zoom;

/** The picture never slides off: some of it always fills the circle. */
function clamp(img: HTMLImageElement, frame: Frame): Frame {
  const scale = scaleOf(img, frame.zoom);
  const maxX = Math.max(0, (img.naturalWidth * scale - VIEW) / 2);
  const maxY = Math.max(0, (img.naturalHeight * scale - VIEW) / 2);
  return {
    zoom: frame.zoom,
    x: Math.min(maxX, Math.max(-maxX, frame.x)),
    y: Math.min(maxY, Math.max(-maxY, frame.y)),
  };
}

function render(img: HTMLImageElement, frame: Frame) {
  const canvas = document.createElement("canvas");
  canvas.width = OUT;
  canvas.height = OUT;
  const context = canvas.getContext("2d")!;
  const k = OUT / VIEW;
  const scale = scaleOf(img, frame.zoom);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  context.drawImage(
    img,
    (VIEW / 2 + frame.x - w / 2) * k,
    (VIEW / 2 + frame.y - h / 2) * k,
    w * k,
    h * k,
  );
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("画像を作れませんでした")),
      "image/jpeg",
      0.88,
    ),
  );
}

/**
 * アイコンの変更: choose a photo, then drag to place it and pinch or slide to
 * size it inside the circle. Dock: ‹ · [保存] [削除].
 */
export function AvatarEditor({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const notify = useToast();
  const formId = useId();
  const zoomId = useId();
  const file = useRef<HTMLInputElement>(null);
  const current = auth.user?.avatarUrl ?? null;
  const [picture, setPicture] = useState<Picture | null>(null);
  const [frame, setFrame] = useState<Frame>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  // The account's own uploaded icon can be placed again; a Google photo cannot
  // be read back into a canvas, so it only shows until a new photo is chosen.
  useEffect(() => {
    if (!current?.startsWith("/v1/avatars/")) return;
    let active = true;
    load(current, false)
      .then((img) => {
        if (active) setPicture((shown) => shown ?? { img, url: current });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [current]);
  useEffect(
    () => () => {
      if (picture?.url.startsWith("blob:")) URL.revokeObjectURL(picture.url);
    },
    [picture],
  );
  const choose = async (chosen: File | undefined) => {
    if (!chosen) return;
    const url = URL.createObjectURL(chosen);
    try {
      const img = await load(url, false);
      setPicture({ img, url });
      setFrame({ zoom: 1, x: 0, y: 0 });
    } catch {
      URL.revokeObjectURL(url);
      notify("この画像は開けませんでした");
    }
  };
  const move = (next: Frame) => picture && setFrame(clamp(picture.img, next));
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!picture) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: frame.zoom,
      };
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last || !picture) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const zoom =
        (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
        pinch.current.distance;
      move({ ...frame, zoom: Math.min(MAX_ZOOM, Math.max(1, zoom)) });
    } else if (pointers.current.size === 1) {
      move({
        ...frame,
        x: frame.x + point.x - last.x,
        y: frame.y + point.y - last.y,
      });
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!picture) return;
    setBusy(true);
    try {
      await auth.updateAvatar(await render(picture.img, frame));
      notify("アイコンを変更しました");
      onClose();
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "アイコンを保存できませんでした",
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm("アイコンを削除しますか？")) return;
    setBusy(true);
    try {
      await auth.updateAvatar(null);
      notify("アイコンを削除しました");
      onClose();
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "アイコンを削除できませんでした",
      );
    } finally {
      setBusy(false);
    }
  };
  const scale = picture ? scaleOf(picture.img, frame.zoom) : 1;
  return (
    <Modal
      title="アイコン"
      addPanel
      onClose={onClose}
      dockActions={{
        split: true,
        primary: (
          <button
            type="submit"
            className="prep-primary"
            form={formId}
            disabled={busy || !picture}
          >
            <Check size={20} aria-hidden="true" />
            {busy ? "保存しています…" : "保存"}
          </button>
        ),
        actions: current ? (
          <button
            type="button"
            className="danger"
            aria-label="アイコンを削除"
            disabled={busy}
            onClick={() => void remove()}
          >
            <Trash2 size={20} />
          </button>
        ) : undefined,
      }}
    >
      <form id={formId} className="avatar-editor" onSubmit={submit}>
        <div
          className="avatar-crop"
          data-empty={!picture && !current ? "" : undefined}
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => !picture && !current && file.current?.click()}
        >
          {picture ? (
            <img
              src={picture.url}
              alt=""
              draggable={false}
              style={{
                width: picture.img.naturalWidth * scale,
                height: picture.img.naturalHeight * scale,
                transform: `translate(calc(-50% + ${frame.x}px), calc(-50% + ${frame.y}px))`,
              }}
            />
          ) : current ? (
            <img
              className="avatar-current"
              src={current}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : null}
        </div>
        {picture && (
          <label className="avatar-zoom" htmlFor={zoomId}>
            <span>大きさ</span>
            <input
              id={zoomId}
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={frame.zoom}
              onChange={(event) =>
                move({ ...frame, zoom: Number(event.target.value) })
              }
            />
          </label>
        )}
        <button
          type="button"
          className="avatar-choose"
          onClick={() => file.current?.click()}
        >
          {picture || current ? "別の写真を選ぶ" : "写真を選ぶ"}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </form>
    </Modal>
  );
}
