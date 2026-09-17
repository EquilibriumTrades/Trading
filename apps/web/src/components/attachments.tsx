"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Paperclip, Trash2 } from "lucide-react";
import { HoverHint } from "./ui/tooltip";
import { Button } from "@/components/ui/button";
import { postJson, useApi } from "@/lib/use-api";

export function Attachments({
  type,
  id,
}: {
  type: "trade" | "day" | "note" | "missed" | "prop-account" | "prop-entry";
  id: string;
}) {
  const { data, error, refresh } = useApi<{
    attachments: { id: string; name: string; mime: string; size: number }[];
  }>(`/api/attachments?type=${type}&id=${encodeURIComponent(id)}`);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(true);
      setFailure("");
      try {
        for (const file of files) {
          const body = new FormData();
          body.append("type", type);
          body.append("id", id);
          body.append("file", file);
          const response = await fetch("/api/attachments", { method: "POST", body });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Upload failed.");
        }
      } catch (err) {
        setFailure(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
        if (input.current) input.current.value = "";
        refresh();
      }
    },
    [id, refresh, type],
  );

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Screenshots & attachments</div>
          <div className="text-xs text-muted-foreground">
            PNG, JPEG, WebP or PDF · up to 8 MB each
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Paperclip />
          {busy ? "Uploading…" : "Add files"}
        </Button>
      </div>

      <div
        className={`flex min-h-24 items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors ${dragging ? "bg-accent" : "bg-muted/20"}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadFiles(Array.from(event.dataTransfer.files));
        }}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (files.length) {
            event.preventDefault();
            void uploadFiles(files);
          }
        }}
        tabIndex={0}
        aria-label="Drop or paste screenshots and attachments here"
      >
        <div className="space-y-1 text-xs text-muted-foreground">
          <ImagePlus className="mx-auto h-5 w-5" />
          <div>Drop screenshots here, paste an image, or choose files.</div>
        </div>
      </div>

      <input
        ref={input}
        aria-label="Upload attachment"
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        multiple
        onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))}
      />

      {(failure || error) && (
        <p role="alert" className="text-xs text-destructive">
          {failure || error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data?.attachments.map((attachment) => (
          <div key={attachment.id} className="min-w-0 rounded-md border p-2">
            <HoverHint content={attachment.name}>
              <a
                href={`/api/attachments/${attachment.id}`}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                {attachment.mime.startsWith("image/") && (
                  <img
                    src={`/api/attachments/${attachment.id}`}
                    alt={attachment.name}
                    className="mb-2 h-40 w-full rounded object-contain"
                  />
                )}
                <span className="block truncate text-xs underline">{attachment.name}</span>
              </a>
            </HoverHint>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{Math.round(attachment.size / 1024)} KB</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Remove ${attachment.name}`}
                onClick={async () => {
                  if (!confirm(`Remove ${attachment.name}?`)) return;
                  try {
                    await postJson(`/api/attachments/${attachment.id}`, undefined, "DELETE");
                    refresh();
                  } catch (err) {
                    setFailure(err instanceof Error ? err.message : "Remove failed.");
                  }
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
