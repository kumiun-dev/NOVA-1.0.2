"use client";

import { useEffect, useState } from "react";

export default function LoginAddress() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => setUrl(new URL("/login", window.location.origin).href), []);

  return <span className="inline-flex flex-wrap items-center gap-2">
    <a href="/login" target="_blank" rel="noreferrer" className="break-all text-[#5548C8] hover:underline">{url || "/login"}</a>
    <button type="button" disabled={!url} className="text-xs text-[#5548C8]" onClick={async () => {
      try {
        await navigator.clipboard.writeText(url);
        setStatus("已复制");
      } catch {
        setStatus("请手动复制地址");
      }
    }}>复制登录地址</button>
    <span role="status" className="text-xs">{status}</span>
  </span>;
}
