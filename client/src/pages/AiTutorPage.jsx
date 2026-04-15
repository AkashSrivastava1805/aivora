import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";

export default function AiTutorPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loaded, setLoaded] = useState(false);
  const src = useMemo(() => params.get("url") || "https://aivorachatfrontend.vercel.app/", [params]);
  const heading = useMemo(() => params.get("title") || "Ai tutor", [params]);

  return (
    <AppLayout title={heading}>
      <div className="ai-tutor-shell">
        <div className="ai-tutor-topbar">
          <button className="ai-tutor-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <p className="ai-tutor-title">{heading}</p>
          <div className="ai-tutor-spacer" />
        </div>

        {!loaded && <div className="ai-tutor-loading">Loading page…</div>}
        <iframe
          className="ai-tutor-frame"
          src={src}
          title={heading}
          onLoad={() => setLoaded(true)}
          referrerPolicy="no-referrer"
          allow="clipboard-read; clipboard-write; microphone; camera"
        />
      </div>
    </AppLayout>
  );
}

