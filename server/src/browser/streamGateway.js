import { getOrCreateUserSession } from "./sessionManager.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function playwrightKeyName(key) {
  const k = String(key || "");
  if (k === " ") return "Space";
  return k;
}

/**
 * Apply remote pointer / wheel / keyboard to the user's active Playwright tab.
 * Coordinates are in viewport pixels (same space as JPEG screenshots).
 */
export async function applyRemoteBrowserInput(userId, input) {
  const session = await getOrCreateUserSession(userId);
  const active = session.pages.find((tab) => tab.tabId === session.activeTabId);
  if (!active?.page) {
    return { ok: false, reason: "virtual_or_missing" };
  }

  const page = active.page;
  const viewport = page.viewportSize() || { width: 1280, height: 720 };

  try {
    const kind = input?.kind;
    if (kind === "click") {
      const x = clamp(Number(input.x), 0, viewport.width);
      const y = clamp(Number(input.y), 0, viewport.height);
      await page.mouse.click(x, y);
    } else if (kind === "wheel") {
      await page.mouse.wheel(Number(input.deltaX) || 0, Number(input.deltaY) || 0);
    } else if (kind === "keydown") {
      const key = String(input.key || "");
      if (!key) return { ok: false, reason: "no_key" };
      if (key.length === 1) {
        await page.keyboard.type(key);
      } else {
        await page.keyboard.press(playwrightKeyName(key));
      }
    } else {
      return { ok: false, reason: "unknown_kind" };
    }
    return { ok: true };
  } catch (_error) {
    return { ok: false, reason: "playwright_error" };
  }
}

export async function emitActiveTabFrame(io, userId) {
  const session = await getOrCreateUserSession(userId);
  const active = session.pages.find((tab) => tab.tabId === session.activeTabId);
  if (!active) return;

  // Virtual mode has no real Chromium page handle; still emit metadata.
  if (!active.page) {
    io.to(`user:${userId}`).emit("tab-frame", {
      tabId: active.tabId,
      imageBase64: null,
      url: active.url,
      title: active.title || "Virtual Tab",
      viewportWidth: null,
      viewportHeight: null
    });
    return;
  }

  const viewport = active.page.viewportSize();
  const screenshot = await active.page.screenshot({ type: "jpeg", quality: 45 });
  io.to(`user:${userId}`).emit("tab-frame", {
    tabId: active.tabId,
    imageBase64: screenshot.toString("base64"),
    url: active.url,
    title: active.title || (await active.page.title()),
    viewportWidth: viewport?.width ?? null,
    viewportHeight: viewport?.height ?? null
  });
}
