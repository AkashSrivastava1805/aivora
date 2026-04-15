import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";

export default function AiTutorPage() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const src = useMemo(() => "https://aivorachatfrontend.vercel.app/", []);

  return (
    <AppLayout title="Ai tutor">
      <div className="ai-tutor-shell">
        <div className="ai-tutor-topbar">
          <button className="ai-tutor-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <p className="ai-tutor-title">Ai tutor</p>
          <div className="ai-tutor-spacer" />
        </div>

        {!loaded && <div className="ai-tutor-loading">Loading Ai tutor…</div>}
        <iframe
          className="ai-tutor-frame"
          src={src}
          title="Ai tutor"
          onLoad={() => setLoaded(true)}
          referrerPolicy="no-referrer"
          allow="clipboard-read; clipboard-write; microphone; camera"
        />
      </div>
    </AppLayout>
  );
}

