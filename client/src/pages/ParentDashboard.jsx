import { useEffect, useState } from "react";
import GlassCard from "../components/GlassCard";
import NeonButton from "../components/NeonButton";
import AppLayout from "../layouts/AppLayout";
import api from "../services/api";
import { socket } from "../services/socket";
import { useNavigate } from "react-router-dom";

export default function ParentDashboard({ session, onLogout }) {
  const navigate = useNavigate();
  const [studentEmail, setStudentEmail] = useState("");
  const [keyword, setKeyword] = useState("");
  const [domain, setDomain] = useState("");
  const [history, setHistory] = useState([]);
  const [live, setLive] = useState([]);
  const [status, setStatus] = useState("");
  const [restrictions, setRestrictions] = useState({ blockedKeywords: [], blockedDomains: [] });
  const [editingKeyword, setEditingKeyword] = useState({ old: "", next: "" });
  const [editingDomain, setEditingDomain] = useState({ old: "", next: "" });

  useEffect(() => {
    socket.connect();
    if (session?.user?.id) {
      socket.emit("join-parent-room", { parentId: session.user.id });
    }
    socket.on("student-live-event", (payload) => {
      setLive((prev) => [payload, ...prev].slice(0, 30));
    });
    return () => {
      socket.off("student-live-event");
      socket.disconnect();
    };
  }, [session?.user?.id]);

  useEffect(() => {
    loadRestrictions();
  }, []);

  async function loadHistory() {
    const { data } = await api.get("/parent/get-student-history");
    setHistory(data);
  }

  async function loadRestrictions() {
    const { data } = await api.get("/parent/restrictions");
    setRestrictions({
      blockedKeywords: data.blockedKeywords || [],
      blockedDomains: data.blockedDomains || []
    });
  }

  function handleLogout() {
    if (onLogout) onLogout();
    navigate("/");
  }

  return (
    <AppLayout title="Parent Control Center">
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="space-y-3">
          <h2 className="text-xl font-semibold">Student Linking & Policy</h2>
          <input className="field" placeholder="Student email" onChange={(e) => setStudentEmail(e.target.value)} />
          <NeonButton
            onClick={async () => {
              const { data } = await api.post("/parent/link-student", { studentEmail });
              setStatus(data.message || "Student linked");
            }}
          >
            Link Student
          </NeonButton>
          <input className="field" placeholder="Blocked keyword" onChange={(e) => setKeyword(e.target.value)} />
          <NeonButton
            onClick={async () => {
              await api.post("/parent/add-keyword", { keyword });
              setStatus(`Keyword "${keyword}" blocked`);
              setKeyword("");
              await loadRestrictions();
            }}
          >
            Add Keyword
          </NeonButton>
          <input className="field" placeholder="Blocked domain" onChange={(e) => setDomain(e.target.value)} />
          <NeonButton
            onClick={async () => {
              await api.post("/parent/block-domain", { domain });
              setStatus(`Domain "${domain}" blocked`);
              setDomain("");
              await loadRestrictions();
            }}
          >
            Block Domain
          </NeonButton>
          <p className="text-sm text-neon-cyan">{status}</p>
          <button
            onClick={handleLogout}
            className="w-full rounded-xl bg-red-500/80 px-4 py-2 text-sm font-semibold text-white"
          >
            Logout
          </button>
        </GlassCard>

        <GlassCard className="space-y-3">
          <h2 className="text-xl font-semibold">Restrictions Summary</h2>
          <NeonButton onClick={loadRestrictions}>Refresh Restrictions</NeonButton>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-white/90">Blocked Keywords</p>
            <div className="max-h-32 space-y-2 overflow-auto">
              {restrictions.blockedKeywords.length === 0 && (
                <p className="text-xs text-white/60">No blocked keywords yet</p>
              )}
              {restrictions.blockedKeywords.map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">{item}</p>
                    <div className="flex gap-2">
                      <button
                        className="rounded bg-white/10 px-2 py-1 text-xs"
                        onClick={() => setEditingKeyword({ old: item, next: item })}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded bg-red-500/70 px-2 py-1 text-xs"
                        onClick={async () => {
                          await api.post("/parent/remove-keyword", { keyword: item });
                          setStatus(`Keyword "${item}" removed`);
                          await loadRestrictions();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editingKeyword.old && (
            <div className="rounded-lg border border-white/15 bg-white/5 p-3">
              <p className="mb-2 text-xs text-white/70">Editing keyword: {editingKeyword.old}</p>
              <div className="flex gap-2">
                <input
                  className="field"
                  value={editingKeyword.next}
                  onChange={(e) => setEditingKeyword((prev) => ({ ...prev, next: e.target.value }))}
                />
                <button
                  className="rounded bg-emerald-500 px-3 py-2 text-xs font-semibold text-black"
                  onClick={async () => {
                    await api.patch("/parent/update-keyword", {
                      oldKeyword: editingKeyword.old,
                      newKeyword: editingKeyword.next
                    });
                    setStatus(`Keyword "${editingKeyword.old}" updated`);
                    setEditingKeyword({ old: "", next: "" });
                    await loadRestrictions();
                  }}
                >
                  Save
                </button>
                <button
                  className="rounded bg-white/10 px-3 py-2 text-xs"
                  onClick={() => setEditingKeyword({ old: "", next: "" })}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-white/90">Blocked Domains</p>
            <div className="max-h-32 space-y-2 overflow-auto">
              {restrictions.blockedDomains.length === 0 && (
                <p className="text-xs text-white/60">No blocked domains yet</p>
              )}
              {restrictions.blockedDomains.map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">{item}</p>
                    <div className="flex gap-2">
                      <button
                        className="rounded bg-white/10 px-2 py-1 text-xs"
                        onClick={() => setEditingDomain({ old: item, next: item })}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded bg-red-500/70 px-2 py-1 text-xs"
                        onClick={async () => {
                          await api.post("/parent/remove-domain", { domain: item });
                          setStatus(`Domain "${item}" removed`);
                          await loadRestrictions();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editingDomain.old && (
            <div className="rounded-lg border border-white/15 bg-white/5 p-3">
              <p className="mb-2 text-xs text-white/70">Editing domain: {editingDomain.old}</p>
              <div className="flex gap-2">
                <input
                  className="field"
                  value={editingDomain.next}
                  onChange={(e) => setEditingDomain((prev) => ({ ...prev, next: e.target.value }))}
                />
                <button
                  className="rounded bg-emerald-500 px-3 py-2 text-xs font-semibold text-black"
                  onClick={async () => {
                    await api.patch("/parent/update-domain", {
                      oldDomain: editingDomain.old,
                      newDomain: editingDomain.next
                    });
                    setStatus(`Domain "${editingDomain.old}" updated`);
                    setEditingDomain({ old: "", next: "" });
                    await loadRestrictions();
                  }}
                >
                  Save
                </button>
                <button
                  className="rounded bg-white/10 px-3 py-2 text-xs"
                  onClick={() => setEditingDomain({ old: "", next: "" })}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-3">
          <h2 className="text-xl font-semibold">Monitoring</h2>
          <NeonButton onClick={loadHistory}>Load Student History</NeonButton>
          <div className="max-h-32 space-y-2 overflow-auto rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            {live.length === 0 && <p>No live student events yet</p>}
            {live.map((entry, idx) => (
              <p key={`${entry.studentId}-${entry.createdAt}-${idx}`}>
                [{new Date(entry.createdAt).toLocaleTimeString()}] {entry.studentEmail} - {entry.type} ({entry.status}) :{" "}
                {entry.details}
              </p>
            ))}
          </div>
          <div className="max-h-80 space-y-2 overflow-auto text-sm">
            {history.map((entry) => (
              <div key={entry._id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                <p className="font-medium">{entry.userId?.email}</p>
                <p className="text-white/70">Searches: {entry.searches.length}</p>
                <p className="text-white/70">Visited URLs: {entry.visitedUrls.length}</p>
                <p className="text-white/70">Live events: {entry.liveEvents?.length || 0}</p>
                <div className="mt-2 max-h-28 space-y-1 overflow-auto text-xs text-white/75">
                  {(entry.liveEvents || [])
                    .slice()
                    .reverse()
                    .slice(0, 10)
                    .map((event, idx) => (
                      <p key={`${event.createdAt}-${idx}`}>
                        {new Date(event.createdAt).toLocaleString()} - {event.type} ({event.status}) - {event.details}
                      </p>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </AppLayout>
  );
}
