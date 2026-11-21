"use client";

const TAB_MARKER = "nova-channel-authorization-tab";
export const AUTHORIZATION_RESULT = "nova-channel-authorization-result";

export function createAuthorizationTab() {
  const tab = window.open("about:blank", "_blank");
  if (!tab) throw new Error("浏览器阻止了新标签页，请允许本站打开新标签页后重试。");
  try {
    tab.sessionStorage.setItem(TAB_MARKER, "1");
    tab.opener = null;
    tab.document.title = "正在准备安全授权";
    const message = tab.document.createElement("p");
    message.textContent = "正在准备授权页面，请稍候…";
    message.style.cssText = "font:16px system-ui;padding:48px;color:#5548c8";
    tab.document.body.append(message);
    return tab;
  } catch (error) {
    tab.close();
    throw error;
  }
}

export function isAuthorizationTab() {
  return sessionStorage.getItem(TAB_MARKER) === "1";
}

export function publishAuthorizationResult(status: "ok" | "error", reason = "") {
  if (!isAuthorizationTab()) return false;
  localStorage.setItem(AUTHORIZATION_RESULT, JSON.stringify({ status, reason, at: Date.now() }));
  sessionStorage.removeItem(TAB_MARKER);
  return true;
}
