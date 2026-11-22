"use client";
import { useEffect, useState } from "react";
import { THEMES, validTheme, type ThemeId } from "@/lib/appearance";

export function ThemeMenu({ accountId, initial }: { accountId: string; initial?: string }) {
  const [theme, setTheme] = useState<ThemeId>("orange");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const next = validTheme(initial) ? initial : "orange";
    setTheme(next); document.documentElement.dataset.theme = next;
  }, [accountId, initial]);
  async function select(next: ThemeId) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "appearance", theme: next }) });
      if (!response.ok) throw new Error("主题保存失败，请重试");
      setTheme(next); document.documentElement.dataset.theme = next;
      window.dispatchEvent(new CustomEvent("nova-appearance", { detail: { theme: next } }));
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }
  return <details className="nova-theme-menu"><summary aria-label="主题颜色切换"><span style={{ background: THEMES.find(t => t.id === theme)?.color }} className="nova-theme-dot" />{THEMES.find(t => t.id === theme)?.name}<span aria-hidden>⌄</span></summary><div className="nova-theme-options" role="group" aria-label="外观主题">{THEMES.map(t => <button type="button" key={t.id} aria-pressed={theme === t.id} disabled={saving} onClick={() => void select(t.id)}><span className="nova-theme-dot" style={{ background: t.color }} />{t.name}<span className="ml-auto">{theme === t.id ? "✓" : ""}</span></button>)}{error ? <p role="status">{error}</p> : null}</div></details>;
}

export function ProfileAppearance() {
  const [avatar, setAvatar] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/profile").then(r => r.json()).then(d => setAvatar(d.avatar || "")).catch(() => {}); }, []);
  async function save(value: string) {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "appearance", avatar: value }) });
      if (!r.ok) throw new Error("头像保存失败");
      setAvatar(value); window.dispatchEvent(new CustomEvent("nova-appearance", { detail: { avatar: value } })); setMessage("头像已保存");
    } catch(e) { setMessage(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage("请选择 5 MB 以内的 PNG、JPG 或 WebP 图片"); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 192;
      const ctx = canvas.getContext("2d")!; const size = Math.min(bitmap.width, bitmap.height);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 192, 192);
      ctx.drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0, 0, 192, 192); bitmap.close();
      await save(canvas.toDataURL("image/jpeg", .85));
    } catch { setMessage("无法读取这张图片，请换一张重试"); }
  }
  return <section className="nova-profile-card"><h2>个人头像</h2><div className="mt-4 flex items-center gap-4">{avatar ? <img src={avatar} alt="我的头像" className="h-16 w-16 rounded-full object-cover" /> : <span className="nova-avatar h-16 w-16">N</span>}<label className="nova-upload-label">上传头像<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => void upload(e.target.files?.[0])} /></label>{avatar ? <button type="button" disabled={busy} onClick={() => void save("")}>移除头像</button> : null}</div><p className="mt-3 text-sm text-muted">支持 PNG、JPG、WebP，自动裁切为方形头像。</p><p role="status">{message}</p></section>;
}
