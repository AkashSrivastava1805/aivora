import { BrowserWindow, app, Menu, ipcMain, session, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let studentSession = null; // { blockedKeywords: [], blockedDomains: [] }

function extractBingQuery(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("bing.com")) return null;
    return parsed.searchParams.get("q") || null;
  } catch (_) { return null; }
}

function isBlockedByPolicy(url) {
  if (!studentSession) return false;
  const { blockedKeywords = [], blockedDomains = [] } = studentSession;
  const lower = url.toLowerCase();
  if (blockedDomains.some((d) => d && lower.includes(d.toLowerCase()))) return true;
  if (blockedKeywords.some((k) => k && lower.includes(k.toLowerCase()))) return true;
  const q = extractBingQuery(url);
  if (q) {
    const ql = q.toLowerCase();
    if (blockedKeywords.some((k) => k && ql.includes(k.toLowerCase()))) return true;
    if (blockedDomains.some((d) => d && ql.includes(d.toLowerCase()))) return true;
  }
  return false;
}

function isBingHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("bing.com") || host.includes("microsoft.com") ||
           host.includes("msn.com") || host.includes("bingapis.com");
  } catch (_) { return false; }
}

function isOwnAppUrl(url) {
  return url.startsWith("file://") || url.startsWith("http://localhost") ||
         url.startsWith("https://localhost") || url.startsWith("devtools://");
}

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 760,
    backgroundColor: "#070913",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.openDevTools(); // Open DevTools automatically
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5173");
    return;
  }
  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  // Strip X-Frame-Options and CSP so all sites load inside webview
  session.defaultSession.webRequest.onHeadersReceived({ urls: ["*://*/*"] }, (details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === "x-frame-options" || lower === "content-security-policy") {
        delete headers[key];
      }
    }
    callback({ responseHeaders: headers });
  });

  createWindow();
});

ipcMain.on("set-student-session", (_e, data) => { studentSession = data; });
ipcMain.on("clear-student-session", () => { studentSession = null; });
ipcMain.on("open-external-url", (_e, url) => {
  if (url && !isBlockedByPolicy(url)) {
    shell.openExternal(url).catch(() => {});
  }
});

app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() !== "webview") return;

  // Inject content filtering script into pages (only for student mode)
  contents.on("did-finish-load", () => {
    console.log("[Main] Webview did-finish-load");
    if (!studentSession) return; // Only inject for students with active restrictions
    const { blockedKeywords = [], blockedDomains = [] } = studentSession;
    
    const filterScript = `
      (function() {
        const blockedKeywords = ${JSON.stringify(blockedKeywords)};
        const blockedDomains = ${JSON.stringify(blockedDomains)};
        
        function isBlocked(url, text) {
          if (!url) return false;
          const urlLower = url.toLowerCase();
          const textLower = (text || '').toLowerCase();
          
          for (const domain of blockedDomains) {
            if (domain && (urlLower.includes(domain.toLowerCase()) || textLower.includes(domain.toLowerCase()))) {
              return { blocked: true, reason: 'Domain "' + domain + '" is blocked' };
            }
          }
          
          for (const keyword of blockedKeywords) {
            if (keyword && (urlLower.includes(keyword.toLowerCase()) || textLower.includes(keyword.toLowerCase()))) {
              return { blocked: true, reason: 'Keyword "' + keyword + '" is blocked' };
            }
          }
          
          return { blocked: false };
        }
        
        if (window.location.hostname.includes('bing.com')) {
          const indicator = document.createElement('div');
          indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(239,68,68,0.9);color:white;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:bold;z-index:999999;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
          indicator.textContent = '🛡️ Parental Controls Active';
          document.body.appendChild(indicator);
        }
        
        document.addEventListener('click', function(e) {
          let target = e.target;
          while (target && target.tagName !== 'A') {
            target = target.parentElement;
          }
          
          if (target && target.href) {
            const text = target.textContent || target.innerText || '';
            const result = isBlocked(target.href, text);
            
            if (result.blocked) {
              e.preventDefault();
              e.stopPropagation();
              alert('🚫 Access Blocked: ' + result.reason);
              return false;
            }
            
            // Allow navigation to search results within the webview
            // (removed external browser redirect)
          }
        }, true);
        
        document.addEventListener('submit', function(e) {
          const form = e.target;
          const searchInput = form.querySelector('input[name="q"]') || 
                             form.querySelector('#sb_form_q') ||
                             form.querySelector('.b_searchbox');
          
          if (searchInput && searchInput.value) {
            const result = isBlocked(searchInput.value, searchInput.value);
            if (result.blocked) {
              e.preventDefault();
              e.stopPropagation();
              alert('🚫 Search Blocked: ' + result.reason);
              searchInput.value = '';
              return false;
            }
          }
        }, true);
        
        function filterSearchResults() {
          const results = document.querySelectorAll('li.b_algo, .b_ans');
          results.forEach(function(result) {
            const links = result.querySelectorAll('a');
            let shouldHide = false;
            
            links.forEach(function(link) {
              const text = result.textContent || '';
              const check = isBlocked(link.href, text);
              if (check.blocked) {
                shouldHide = true;
              }
            });
            
            if (shouldHide) {
              result.style.display = 'none';
            }
          });
        }
        
        filterSearchResults();
        const observer = new MutationObserver(filterSearchResults);
        observer.observe(document.body, { childList: true, subtree: true });
      })();
    `;
    
    contents.executeJavaScript(filterScript).catch(() => {});
  });

  contents.setWindowOpenHandler(({ url }) => {
    console.log("[Webview] setWindowOpenHandler:", url);
    // Deny new windows - links should navigate in the same webview
    return { action: "deny" };
  });

  contents.on("will-navigate", async (e, url) => {
    console.log("[Main] will-navigate:", url, "studentSession:", !!studentSession);
    
    if (!url || !mainWindow || isOwnAppUrl(url)) return;

    // For normal users (no studentSession), allow all navigation
    if (!studentSession) {
      console.log("[Main] Normal user - allowing navigation to:", url);
      return; // Allow navigation
    }

    // Student mode: check restrictions
    const { blockedKeywords = [], blockedDomains = [] } = studentSession;
    
    // Check if it's a Bing search URL with query parameter
    const bingQuery = extractBingQuery(url);
    if (bingQuery) {
      const queryLower = bingQuery.toLowerCase();
      const blockedKeyword = blockedKeywords.find((k) => k && queryLower.includes(k.toLowerCase()));
      const blockedDomain = blockedDomains.find((d) => d && queryLower.includes(d.toLowerCase()));
      
      if (blockedKeyword || blockedDomain) {
        console.log("[Main] Blocking Bing search:", bingQuery);
        e.preventDefault();
        mainWindow.webContents.send("webview-blocked", { 
          url, 
          query: bingQuery,
          reason: blockedKeyword ? `Keyword "${blockedKeyword}" is blocked` : `Domain "${blockedDomain}" is blocked`
        });
        return;
      }
    }

    // Check if URL contains blocked domain or keyword
    const urlLower = url.toLowerCase();
    
    const blockedDomain = blockedDomains.find((d) => d && urlLower.includes(d.toLowerCase()));
    if (blockedDomain) {
      console.log("[Main] Blocking domain:", blockedDomain);
      e.preventDefault();
      mainWindow.webContents.send("webview-blocked", { 
        url,
        reason: `Domain "${blockedDomain}" is blocked by parental policy`
      });
      return;
    }
    
    const blockedKeyword = blockedKeywords.find((k) => k && urlLower.includes(k.toLowerCase()));
    if (blockedKeyword) {
      console.log("[Main] Blocking keyword:", blockedKeyword);
      e.preventDefault();
      mainWindow.webContents.send("webview-blocked", { 
        url,
        reason: `Keyword "${blockedKeyword}" is blocked by parental policy`
      });
      return;
    }

    // Allow navigation if not blocked
    console.log("[Main] Student user - allowing navigation to:", url);
  });
});
