import { useState, useEffect, useRef, useCallback } from "react";

// ─── NOSTR RELAY CONNECTION ───────────────────────────────────────────────────
const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

function useNostrProfile(npub) {
  const [profile, setProfile] = useState(null);
  const [zaps, setZaps] = useState([]);
  const [posts, setPosts] = useState([]);
  const [interests, setInterests] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | connecting | loading | done | error
  const wsRefs = useRef([]);

  const disconnect = useCallback(() => {
    wsRefs.current.forEach(ws => { try { ws.close(); } catch {} });
    wsRefs.current = [];
  }, []);

  const connect = useCallback((pubkeyHex) => {
    disconnect();
    setStatus("connecting");
    setProfile(null); setZaps([]); setPosts([]); setInterests([]);

    const profileData = {};
    const zapList = [];
    const postList = [];
    const tagMap = {};
    let connected = 0;
    let profileDone = false;

    const subId = Math.random().toString(36).slice(2, 8);

    RELAYS.forEach((url, ri) => {
      let ws;
      try { ws = new WebSocket(url); } catch { return; }
      wsRefs.current.push(ws);

      ws.onopen = () => {
        connected++;
        setStatus("loading");
        // Request profile (kind 0) + recent notes (kind 1) + zap receipts (kind 9735)
        ws.send(JSON.stringify(["REQ", subId + ri, {
          authors: [pubkeyHex],
          kinds: [0, 1],
          limit: 60,
        }]));
        ws.send(JSON.stringify(["REQ", subId + ri + "z", {
          "#p": [pubkeyHex],
          kinds: [9735],
          limit: 50,
        }]));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg[0] !== "EVENT") return;
          const ev = msg[2];
          if (!ev) return;

          if (ev.kind === 0 && !profileData.name) {
            try {
              const p = JSON.parse(ev.content);
              Object.assign(profileData, p);
              setProfile({ ...p, pubkey: pubkeyHex });
              profileDone = true;
            } catch {}
          }

          if (ev.kind === 1) {
            postList.push(ev);
            // Extract hashtags for interest detection
            const tags = ev.tags?.filter(t => t[0] === "t").map(t => t[1]?.toLowerCase()).filter(Boolean) || [];
            const contentTags = (ev.content?.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase());
            [...tags, ...contentTags].forEach(tag => {
              if (tag.length > 2 && tag.length < 30) {
                tagMap[tag] = (tagMap[tag] || 0) + 1;
              }
            });
            setPosts([...postList].slice(0, 50));

            // Derive interests from top tags
            const sorted = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 12);
            setInterests(sorted.map(([tag, count]) => ({ tag, count })));
          }

          if (ev.kind === 9735) {
            // Parse zap amount from bolt11 or description
            let sats = 0;
            const bolt11 = ev.tags?.find(t => t[0] === "bolt11")?.[1];
            if (bolt11) {
              const match = bolt11.match(/lnbc(\d+)([munp])/i);
              if (match) {
                const amount = parseInt(match[1]);
                const unit = match[2].toLowerCase();
                const multipliers = { m: 100000, u: 100, n: 0.1, p: 0.0001 };
                sats = Math.round(amount * (multipliers[unit] || 1));
              }
            }
            zapList.push({ id: ev.id, created_at: ev.created_at, sats, tags: ev.tags });
            setZaps([...zapList]);
          }
        } catch {}
      };

      ws.onerror = () => {
        connected = Math.max(0, connected - 1);
        if (connected === 0 && !profileDone) setStatus("error");
      };

      ws.onclose = () => {};
    });

    setTimeout(() => setStatus(s => s === "loading" ? "done" : s), 8000);
  }, [disconnect]);

  useEffect(() => () => disconnect(), [disconnect]);

  return { profile, zaps, posts, interests, status, connect, disconnect };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function hexFromNpub(npub) {
  // Simple bech32 decoder for npub
  try {
    const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const clean = npub.toLowerCase();
    if (!clean.startsWith("npub1")) return null;
    const data = clean.slice(5).split("").map(c => CHARSET.indexOf(c));
    if (data.includes(-1)) return null;
    // Convert from 5-bit groups to 8-bit bytes
    let acc = 0, bits = 0;
    const bytes = [];
    for (let i = 0; i < data.length - 6; i++) {
      acc = (acc << 5) | data[i];
      bits += 5;
      if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
    }
    return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

function energyColor(v) {
  if (v <= 3) return "#ff3b5c";
  if (v <= 6) return "#f0a500";
  return "#00e8a2";
}
function energyLabel(v) {
  if (v <= 3) return "DRAINING";
  if (v <= 6) return "NEUTRAL";
  return "ENERGIZING";
}

const FEEDS = ["Home", "Global", "Notifications", "Profiles", "Topics", "Search"];
const COMMON_INTERESTS = ["bitcoin","nostr","freedom","privacy","lightning","art","music","philosophy","tech","health","nature","food","travel","books","ai","coding"];

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function EnergyGauge({ value, size = 120 }) {
  const r = size / 2 - 14;
  const circ = 2 * Math.PI * r;
  const dash = (value / 10) * circ * 0.75;
  const color = energyColor(value);
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a1f2e" strokeWidth="12"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={0}
        transform={`rotate(-225 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.34,1.56,0.64,1), stroke 0.5s" }}
      />
      <text x={size/2} y={size/2+7} textAnchor="middle" fill={color} fontFamily="'DM Mono',monospace" fontSize="26" fontWeight="700">{value}</text>
      <text x={size/2} y={size/2+22} textAnchor="middle" fill={color} fontFamily="'DM Mono',monospace" fontSize="7" opacity="0.7" letterSpacing="2">{energyLabel(value)}</text>
    </svg>
  );
}

function Tag({ label, count, color = "#00e8a2", onClick, selected }) {
  return (
    <button onClick={onClick} style={{
      background: selected ? `${color}22` : "#0d1120",
      border: `1px solid ${selected ? color : "#1e2a40"}`,
      color: selected ? color : "#4a5a7a",
      borderRadius: 20,
      padding: "4px 12px",
      fontFamily: "'DM Mono', monospace",
      fontSize: 11,
      cursor: onClick ? "pointer" : "default",
      display: "inline-flex", alignItems: "center", gap: 6,
      transition: "all 0.15s",
      whiteSpace: "nowrap",
      boxShadow: selected ? `0 0 8px ${color}33` : "none",
    }}>
      #{label}
      {count && <span style={{ opacity: 0.5, fontSize: 9 }}>{count}</span>}
    </button>
  );
}

function PulseBar({ label, value, max, color, sub }) {
  const pct = Math.min(100, ((value || 0) / (max || 1)) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#5a6a8a" }}>{label}</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color }}>{sub}</span>
      </div>
      <div style={{ height: 7, background: "#131823", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}66, ${color})`,
          borderRadius: 4,
          boxShadow: `0 0 10px ${color}55`,
          transition: "width 0.9s cubic-bezier(0.34,1.56,0.64,1)"
        }}/>
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  const cfg = {
    idle: { color: "#3a4a6a", label: "NOT CONNECTED" },
    connecting: { color: "#f0a500", label: "CONNECTING..." },
    loading: { color: "#7b8fff", label: "FETCHING DATA..." },
    done: { color: "#00e8a2", label: "LIVE" },
    error: { color: "#ff3b5c", label: "CONNECTION FAILED" },
  }[status] || { color: "#3a4a6a", label: status.toUpperCase() };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Mono',monospace", fontSize: 10, color: cfg.color, letterSpacing: 1 }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: cfg.color, display: "inline-block",
        boxShadow: `0 0 6px ${cfg.color}`,
        animation: status === "connecting" || status === "loading" ? "pulse 1s infinite" : "none"
      }}/>
      {cfg.label}
    </span>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("connect"); // connect | dashboard | log | report
  const [npubInput, setNpubInput] = useState("");
  const [pubkeyHex, setPubkeyHex] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [form, setForm] = useState({ feed: "Home", timeSpent: "", zapsSent: "", zapsReceived: "", emotion: 5, notes: "", topics: [] });
  const [customTopic, setCustomTopic] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { profile, zaps, posts, interests, status, connect, disconnect } = useNostrProfile(pubkeyHex);

  // Derived
  const totalTime = sessions.reduce((a, s) => a + (s.timeSpent || 0), 0);
  const totalZapsSent = sessions.reduce((a, s) => a + (s.zapsSent || 0), 0);
  const totalZapsRec = sessions.reduce((a, s) => a + (s.zapsReceived || 0), 0);
  const avgEnergy = sessions.length ? Math.round(sessions.reduce((a, s) => a + s.emotion, 0) / sessions.length * 10) / 10 : 5;

  // Per-feed stats
  const feedStats = FEEDS.map(feed => {
    const s = sessions.filter(x => x.feed === feed);
    const time = s.reduce((a, x) => a + x.timeSpent, 0);
    const avgEmo = s.length ? s.reduce((a, x) => a + x.emotion, 0) / s.length : null;
    return { feed, time, avgEmo, count: s.length };
  }).filter(f => f.count > 0).sort((a, b) => b.time - a.time);

  // Per-topic stats
  const topicStats = (() => {
    const map = {};
    sessions.forEach(s => {
      (s.topics || []).forEach(t => {
        if (!map[t]) map[t] = { count: 0, totalEmo: 0, time: 0 };
        map[t].count++;
        map[t].totalEmo += s.emotion;
        map[t].time += s.timeSpent;
      });
    });
    return Object.entries(map).map(([tag, d]) => ({
      tag, count: d.count, avgEmo: d.totalEmo / d.count, time: d.time
    })).sort((a, b) => b.time - a.time);
  })();

  const drainFeed = feedStats.filter(f => f.avgEmo !== null).sort((a, b) => a.avgEmo - b.avgEmo)[0];
  const gainFeed = feedStats.filter(f => f.avgEmo !== null).sort((a, b) => b.avgEmo - a.avgEmo)[0];
  const drainTopic = topicStats.sort((a, b) => a.avgEmo - b.avgEmo)[0];
  const gainTopic = topicStats.sort((a, b) => b.avgEmo - a.avgEmo)[0];

  // Nostr-derived stats
  const postCount = posts.length;
  const nostrZapTotal = zaps.reduce((a, z) => a + (z.sats || 0), 0);
  const topInterests = interests.slice(0, 10);

  function handleConnect() {
    const hex = hexFromNpub(npubInput.trim());
    if (!hex) { alert("Invalid npub. Make sure it starts with npub1..."); return; }
    setPubkeyHex(hex);
    connect(hex);
    setView("dashboard");
  }

  function toggleTopic(t) {
    setForm(f => ({
      ...f,
      topics: f.topics.includes(t) ? f.topics.filter(x => x !== t) : [...f.topics, t]
    }));
  }

  function addCustomTopic() {
    const t = customTopic.trim().toLowerCase().replace(/^#/, "");
    if (t && !form.topics.includes(t)) {
      setForm(f => ({ ...f, topics: [...f.topics, t] }));
    }
    setCustomTopic("");
  }

  function addSession() {
    if (!form.timeSpent) return;
    setSessions(prev => [...prev, {
      id: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      feed: form.feed,
      timeSpent: Number(form.timeSpent),
      zapsSent: Number(form.zapsSent) || 0,
      zapsReceived: Number(form.zapsReceived) || 0,
      emotion: form.emotion,
      notes: form.notes,
      topics: form.topics,
    }]);
    setForm({ feed: "Home", timeSpent: "", zapsSent: "", zapsReceived: "", emotion: 5, notes: "", topics: [] });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2500);
    setView("dashboard");
  }

  // Suggest topics from interests if none selected
  const suggestedTopics = topInterests.map(i => i.tag).filter(t => !form.topics.includes(t));

  const navItems = [
    { id: "dashboard", label: "SIGNAL" },
    { id: "log", label: "LOG" },
    { id: "report", label: "REPORT" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080b12", color: "#c8d4f0", fontFamily: "'DM Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px;background:#080b12}
        ::-webkit-scrollbar-thumb{background:#1e2a40;border-radius:2px}
        input,textarea,select{background:#0d1120;border:1px solid #1e2a40;color:#c8d4f0;border-radius:8px;padding:10px 14px;font-family:'DM Mono',monospace;font-size:13px;outline:none;width:100%;transition:border-color 0.2s,box-shadow 0.2s}
        input:focus,textarea:focus,select:focus{border-color:#00e8a2;box-shadow:0 0 0 2px #00e8a218}
        select option{background:#0d1120}
        .card{background:#0d1120;border:1px solid #151e30;border-radius:14px;padding:22px}
        .nav-btn{background:none;border:none;cursor:pointer;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;padding:8px 16px;border-radius:6px;transition:all 0.2s;color:#3a4a6a}
        .nav-btn.active{color:#00e8a2;background:#00e8a211;box-shadow:0 0 14px #00e8a222}
        .nav-btn:hover{color:#c8d4f0}
        .cta{background:linear-gradient(135deg,#00e8a2,#00bfff);color:#080b12;border:none;border-radius:10px;padding:14px 28px;font-family:'DM Mono',monospace;font-weight:500;font-size:13px;letter-spacing:2px;cursor:pointer;width:100%;transition:all 0.2s;box-shadow:0 0 28px #00e8a244;margin-top:4px}
        .cta:hover{opacity:0.9;transform:translateY(-1px);box-shadow:0 4px 32px #00e8a266}
        .cta:active{transform:scale(0.98)}
        .fade-in{animation:fadeIn 0.35s ease}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .blink{animation:pulse 1.1s infinite}
        .insight{border-left:3px solid;padding:14px 18px;border-radius:0 10px 10px 0;background:#0a0e1a;margin-bottom:12px;font-size:12px;line-height:1.8}
        .emo-btn{flex:1;padding:9px 0;border-radius:7px;border:2px solid #1a2030;background:#0d1120;font-family:'DM Mono',monospace;font-size:12px;cursor:pointer;transition:all 0.15s;color:#3a4a6a}
        .emo-btn.sel{font-weight:700}
        .profile-chip{display:flex;align-items:center;gap:10px;background:#0a0e1a;border:1px solid #1a2030;border-radius:10px;padding:12px 16px}
        .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        @media(max-width:560px){.grid-4{grid-template-columns:repeat(2,1fr)}.grid-2{grid-template-columns:1fr}}
      `}</style>

      {/* Header */}
      <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, color: "#fff", lineHeight: 1 }}>
            NOSTR <span style={{ color: "#00e8a2" }}>ENERGY</span> TRACKER
          </div>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "#2a3a5a", marginTop: 3 }}>
            SIGNAL · INTENTION · CLARITY &nbsp;·&nbsp; <StatusDot status={status} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, background: "#0a0e1a", borderRadius: 8, padding: 4, border: "1px solid #151e30", flexWrap: "wrap" }}>
          <button className={`nav-btn${view === "connect" ? " active" : ""}`} onClick={() => setView("connect")}>CONNECT</button>
          {navItems.map(n => (
            <button key={n.id} className={`nav-btn${view === n.id ? " active" : ""}`} onClick={() => setView(n.id)}>{n.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px 60px" }}>

        {/* ── CONNECT VIEW ─────────────────────────────────────────── */}
        {view === "connect" && (
          <div className="fade-in">
            <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: "#00e8a2", letterSpacing: 2 }}>CONNECT YOUR NOSTR</div>
                <div style={{ fontSize: 12, color: "#3a4a6a", lineHeight: 1.8, marginTop: 8 }}>
                  Enter your npub to pull your real activity — posts, zaps,<br />and interests — directly from relays.
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#3a4a6a", marginBottom: 8 }}>YOUR NPUB</div>
                <input
                  placeholder="npub1..."
                  value={npubInput}
                  onChange={e => setNpubInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConnect()}
                  style={{ fontSize: 13, letterSpacing: 0.5 }}
                />
                <div style={{ fontSize: 10, color: "#2a3a5a", marginTop: 6 }}>
                  Read-only. We never ask for your private key.
                </div>
              </div>

              <button className="cta" onClick={handleConnect}>CONNECT TO RELAYS →</button>

              <div style={{ marginTop: 20, padding: "14px 0 0", borderTop: "1px solid #151e30", fontSize: 11, color: "#2a3a5a", lineHeight: 1.8 }}>
                <div style={{ marginBottom: 6, color: "#3a4a6a" }}>WHAT WE FETCH:</div>
                {["✦ Your recent posts (to detect interests & hashtags)", "⚡ Zap receipts sent to you", "◎ Profile name & picture", "→ All read-only via public Nostr relays"].map(l => (
                  <div key={l} style={{ fontSize: 11 }}>{l}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── DASHBOARD VIEW ──────────────────────────────────────── */}
        {view === "dashboard" && (
          <div className="fade-in">
            {/* Profile bar */}
            {profile && (
              <div className="profile-chip" style={{ marginBottom: 16 }}>
                {profile.picture && <img src={profile.picture} alt="" style={{ width: 38, height: 38, borderRadius: "50%", border: "2px solid #00e8a244" }} onError={e => e.target.style.display="none"} />}
                <div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "#fff", letterSpacing: 1 }}>{profile.name || profile.display_name || "Anon"}</div>
                  {profile.about && <div style={{ fontSize: 10, color: "#3a4a6a", marginTop: 1, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.about}</div>}
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
             
