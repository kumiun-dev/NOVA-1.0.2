import { withAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(async function GET(req: NextRequest) {
  const version = db.prepare(`
    SELECT (SELECT COALESCE(MAX(id),0) FROM inbox) AS message,
      (SELECT COALESCE(MAX(id),0) FROM inbox_replies) AS reply,
      (SELECT COALESCE(MAX(rowid),0) FROM whatsapp_account_history) AS identity,
      (SELECT COUNT(*) FROM channel_connections WHERE kind='whatsapp') AS connections,
      (SELECT MAX(json_extract(data, '$.changedAt')) FROM channel_connections WHERE kind IN ('zernio_facebook', 'zernio_instagram')) AS zernio
  `).raw();
  const snapshot = () => JSON.stringify(version.get());
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let previous = snapshot();
      let closed = false;
      const emit = (value: string) => controller.enqueue(encoder.encode(value));
      const interval = setInterval(() => {
        try {
          const current = snapshot();
          if (current !== previous) {
            previous = current;
            emit("event: inbox\ndata: changed\n\n");
          }
        } catch { stop(); }
      }, 600);
      const heartbeat = setInterval(() => emit(": heartbeat\n\n"), 15_000);
      const renewal = setTimeout(() => stop(), 60_000);
      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        clearTimeout(renewal);
        req.signal.removeEventListener("abort", stop);
        try { controller.close(); } catch { /* The client already closed. */ }
      };
      req.signal.addEventListener("abort", stop, { once: true });
      if (req.signal.aborted) stop();
      else emit("retry: 1000\nevent: ready\ndata: connected\n\n");
    },
    cancel() { stop(); },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
