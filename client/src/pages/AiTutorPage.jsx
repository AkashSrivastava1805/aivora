import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";

export default function AiTutorPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const webviewRef = useRef(null);
  const src = useMemo(() => params.get("url") || "https://aivorachatfrontend.vercel.app/", [params]);
  const heading = useMemo(() => params.get("title") || "Ai tutor", [params]);
  const isElectron = Boolean(window.aivora?.platform);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!isElectron) return undefined;
    const node = webviewRef.current;
    if (!node) return undefined;

    const onReady = () => setLoaded(true);
    const onFail = () => setFailed(true);
    const onNavigate = () => {
      setLoaded(true);
      setFailed(false);
    };
    const onNewWindow = (event) => {
      // Force target=_blank/window.open navigations to stay inside the same webview.
      if (event?.preventDefault) event.preventDefault();
      const nextUrl = event?.url;
      if (nextUrl && node?.loadURL) node.loadURL(nextUrl);
    };

    node.addEventListener("dom-ready", onReady);
    node.addEventListener("did-fail-load", onFail);
    node.addEventListener("did-navigate", onNavigate);
    node.addEventListener("did-navigate-in-page", onNavigate);
    node.addEventListener("new-window", onNewWindow);
    return () => {
      node.removeEventListener("dom-ready", onReady);
      node.removeEventListener("did-fail-load", onFail);
      node.removeEventListener("did-navigate", onNavigate);
      node.removeEventListener("did-navigate-in-page", onNavigate);
      node.removeEventListener("new-window", onNewWindow);
    };
  }, [isElectron, src]);

  return (
    <AppLayout title={heading}>
      <div className="ai-tutor-shell">
        <div className="ai-tutor-topbar">
          <button className="ai-tutor-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <p className="ai-tutor-title">{heading}</p>
          <button
            className="ai-tutor-back"
            onClick={() => {
              if (window.aivora?.openExternal) window.aivora.openExternal(src);
              else window.open(src, "_blank", "noopener,noreferrer");
            }}
          >
            Open in Browser
          </button>
        </div>

        {!loaded && !failed && <div className="ai-tutor-loading">Loading page…</div>}
        {failed && (
          <div className="ai-tutor-loading">
            Page blocked in-app by remote site policy. Use <strong>Open in Browser</strong>.
          </div>
        )}
        {isElectron ? (
          <webview
            ref={webviewRef}
            className="ai-tutor-frame"
            src={src}
            allowpopups="false"
          />
        ) : (
          <iframe
            className="ai-tutor-frame"
            src={src}
            title={heading}
            onLoad={() => setLoaded(true)}
            referrerPolicy="no-referrer"
            allow="clipboard-read; clipboard-write; microphone; camera"
          />
        )}
      </div>
    </AppLayout>
  );
}

