import { getOrCreateUserSession } from "./sessionManager.js";

export async function emitActiveTabFrame(io, userId) {
  const session = await getOrCreateUserSession(userId);
  const active = session.pages.find((tab) => tab.tabId === session.activeTabId);
  if (!active) return;

  const screenshot = await active.page.screenshot({ type: "jpeg", quality: 45 });
  io.to(`user:${userId}`).emit("tab-frame", {
    tabId: active.tabId,
    imageBase64: screenshot.toString("base64"),
    url: active.url
  });
}
