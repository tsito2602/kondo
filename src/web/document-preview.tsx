import { Download } from "lucide-react";
import type { BookingDocument } from "@/data/types";
import { Modal } from "./ui";

export function DocumentPreview({
  url,
  file,
  onClose,
}: {
  url: string;
  file: BookingDocument;
  onClose: () => void;
}) {
  return (
    <Modal
      title={file.filename}
      onClose={onClose}
      fullscreen
      dockActions={{
        primary: (
          <a href={url} download={file.filename} aria-label="端末に保存">
            <Download size={20} aria-hidden="true" />
            端末に保存
          </a>
        ),
      }}
    >
      <div className="document-preview">
        {file.contentType === "application/pdf" ? (
          <iframe title={file.filename} src={`${url}#view=FitH`} />
        ) : ["image/heic", "image/heif"].includes(file.contentType) ? (
          <p>この画像は下の保存ボタンから端末に保存して開けます。</p>
        ) : (
          <img alt={file.filename} src={url} />
        )}
      </div>
    </Modal>
  );
}
