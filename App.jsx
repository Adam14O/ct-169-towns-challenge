import React, { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Play, MapPin, ChevronRight, Trophy, Target, AlertCircle, CheckCircle2 } from "lucide-react";

// ─── Google Fonts injection ───────────────────────────────────────────────────
const injectFonts = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById("ct-game-fonts")) return;
  const link = document.createElement("link");
  link.id = "ct-game-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600;700&display=swap";
  document.head.appendChild(link);
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const CT_MUNI_GEOJSON_URL =
  "https://services1.arcgis.com/FCaUeJ5SOVtImake/arcgis/rest/services/CT_Municipalities/FeatureServer/0/query?where=1%3D1&outFields=Municipality&returnGeometry=true&f=geojson";

const TOWN_NAMES = [
  "Andover","Ansonia","Ashford","Avon","Barkhamsted","Beacon Falls","Berlin","Bethany","Bethel","Bethlehem",
  "Bloomfield","Bolton","Bozrah","Branford","Bridgeport","Bridgewater","Bristol","Brookfield","Brooklyn","Burlington",
  "Canaan","Canterbury","Canton","Chaplin","Cheshire","Chester","Clinton","Colchester","Colebrook","Columbia",
  "Cornwall","Coventry","Cromwell","Danbury","Darien","Deep River","Derby","Durham","East Granby","East Haddam",
  "East Hampton","East Hartford","East Haven","East Lyme","East Windsor","Eastford","Easton","Ellington","Enfield","Essex",
  "Fairfield","Farmington","Franklin","Glastonbury","Goshen","Granby","Greenwich","Griswold","Groton","Guilford",
  "Haddam","Hamden","Hampton","Hartford","Hartland","Harwinton","Hebron","Kent","Killingly","Killingworth",
  "Lebanon","Ledyard","Lisbon","Litchfield","Lyme","Madison","Manchester","Mansfield","Marlborough","Meriden",
  "Middlebury","Middlefield","Middletown","Milford","Monroe","Montville","Morris","Naugatuck","New Britain","New Canaan",
  "New Fairfield","New Hartford","New Haven","New London","New Milford","Newington","Newtown","Norfolk","North Branford","North Canaan",
  "North Haven","North Stonington","Norwalk","Norwich","Old Lyme","Old Saybrook","Orange","Oxford","Plainfield","Plainville",
  "Plymouth","Pomfret","Portland","Preston","Prospect","Putnam","Redding","Ridgefield","Rocky Hill","Roxbury",
  "Salem","Salisbury","Scotland","Seymour","Sharon","Shelton","Sherman","Simsbury","Somers","South Windsor",
  "Southbury","Southington","Sprague","Stafford","Stamford","Sterling","Stonington","Stratford","Suffield","Thomaston",
  "Thompson","Tolland","Torrington","Trumbull","Union","Vernon","Voluntown","Wallingford","Warren","Washington",
  "Waterbury","Waterford","Watertown","West Hartford","West Haven","Westbrook","Weston","Westport","Wethersfield","Willington",
  "Wilton","Winchester","Windham","Windsor","Windsor Locks","Wolcott","Woodbridge","Woodbury","Woodstock"
];

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function normTownName(name = "") {
  return String(name).toLowerCase()
    .replace(/\b(town|city|borough|municipality)\b/g, "")
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const hit = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
function pointInRings(x, y, rings) {
  if (!rings?.length) return false;
  let inOuter = false;
  for (let i = 0; i < rings.length; i++) {
    const inside = pointInPoly(x, y, rings[i]);
    if (i === 0) inOuter = inside;
    else if (inside) return false;
  }
  return inOuter;
}
function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function scoreFromDistance(d) {
  const maxD = 70;
  return Math.round(100 * Math.pow(1 - Math.min(maxD, d) / maxD, 1.6));
}
function rating(total) {
  if (total >= 1000) return { label: "Human GPS", color: "#b45309" };
  if (total >= 900) return { label: "Connecticut Legend", color: "#b45309" };
  if (total >= 750) return { label: "Town Master", color: "#0f766e" };
  if (total >= 600) return { label: "Strong Local", color: "#1d4ed8" };
  if (total >= 450) return { label: "Road Tripper", color: "#7c3aed" };
  return { label: "Getting Started", color: "#64748b" };
}
function flattenCoords(g) {
  if (!g?.coordinates) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}
function bboxFromFeatures(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  features.forEach((f) =>
    flattenCoords(f.geometry).forEach((poly) =>
      poly.forEach((ring) =>
        ring.forEach(([x, y]) => {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        })
      )
    )
  );
  return { minX, minY, maxX, maxY };
}
const VB_W = 100, VB_H = 60;
function normalizeFeaturesToSvg(geojson) {
  const features = (geojson?.features || []).filter((f) =>
    ["Polygon", "MultiPolygon"].includes(f?.geometry?.type)
  );
  if (!features.length) return [];
  const bb = bboxFromFeatures(features);
  const w = (bb.maxX - bb.minX) || 1, h = (bb.maxY - bb.minY) || 1;
  const pad = 2;
  const s = Math.min((VB_W - pad * 2) / w, (VB_H - pad * 2) / h);
  const xOff = (VB_W - w * s) / 2;
  const yOff = (VB_H - h * s) / 2;
  const project = ([x, y]) => [xOff + (x - bb.minX) * s, yOff + (bb.maxY - y) * s];
  return features.map((f, idx) => {
    const rawName = f?.properties?.Municipality || f?.properties?.MUNICIPALITY || f?.properties?.NAME || f?.properties?.name || "";
    const polygons = flattenCoords(f.geometry).map((poly) => poly.map((ring) => ring.map(project)));
    let sx = 0, sy = 0, n = 0;
    polygons.forEach((poly) => (poly[0] || []).forEach(([x, y]) => { sx += x; sy += y; n++; }));
    const centroid = n ? { x: sx / n, y: sy / n } : { x: VB_W / 2, y: VB_H / 2 };
    const paths = polygons.map((poly) =>
      poly.map((ring) => `M ${ring.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`).join(" ")
    );
    return { id: idx + 1, name: String(rawName), key: normTownName(rawName), centroid, polygons, paths };
  });
}
function findClickedTown(x, y, towns) {
  for (const t of towns) {
    for (const poly of t.polygons || []) {
      if (pointInRings(x, y, poly)) return t;
    }
  }
  return null;
}

// ─── Score color ──────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 80) return "#059669";
  if (s >= 60) return "#d97706";
  if (s >= 40) return "#ea580c";
  return "#dc2626";
}

// ─── Score bar width ──────────────────────────────────────────────────────────
function ScoreBar({ score }) {
  return (
    <div style={{ height: 3, background: "#e2e8f0", borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
      <div style={{
        height: "100%", width: `${score}%`,
        background: score >= 80 ? "#059669" : score >= 60 ? "#d97706" : score >= 40 ? "#ea580c" : "#dc2626",
        borderRadius: 2, transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)"
      }} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CTGame() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    injectFonts();
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [mapState, setMapState] = useState({ loading: true, error: "", towns: [] });
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const [order, setOrder] = useState([]);
  const [guess, setGuess] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [roundScore, setRoundScore] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [history, setHistory] = useState([]);
  const [scoreAnim, setScoreAnim] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [timeTaken, setTimeTaken] = useState(0);
  const remainingPool = useRef([]);

  const roundsToPlay = 10;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(CT_MUNI_GEOJSON_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const gj = await res.json();
        const parsed = normalizeFeaturesToSvg(gj);
        if (!alive) return;
        if (!parsed.length) throw new Error("No town polygons returned");
        setMapState({ loading: false, error: "", towns: parsed });
      } catch (e) {
        if (!alive) return;
        setMapState({ loading: false, error: `Map load failed: ${e.message}`, towns: [] });
      }
    })();
    return () => { alive = false; };
  }, []);

  const towns = useMemo(() => {
    if (!mapState.towns.length) return [];
    return TOWN_NAMES.map((name, i) => {
      const m = mapState.towns.find((t) => t.key === normTownName(name));
      return m ? { ...m, id: i + 1, name } : null;
    }).filter(Boolean);
  }, [mapState.towns]);

  const currentTown = started && order.length > 0 && round < roundsToPlay ? towns[order[round]] : null;
  const gameOver = started && (round >= roundsToPlay || timeLeft <= 0);
  const progressPct = started ? (Math.min(round, roundsToPlay) / roundsToPlay) * 100 : 0;

  // ── Countdown timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || gameOver) return;
    const id = setInterval(() => setTimeLeft((t) => {
      if (t <= 1) { setTimeTaken(60); return 0; }
      return t - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [started, gameOver]);

  // Capture time taken when all rounds complete before timer runs out
  useEffect(() => {
    if (gameOver && timeTaken === 0 && timeLeft > 0) {
      setTimeTaken(60 - timeLeft);
    }
  }, [gameOver]);

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const startGame = () => {
    if (towns.length < 169) return;
    // ── No-repeat pool: refill when fewer than 10 towns remain ──────────────
    if (remainingPool.current.length < roundsToPlay) {
      const all = towns.map((_, i) => i);
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      remainingPool.current = all;
    }
    const picked = remainingPool.current.splice(0, roundsToPlay);
    setOrder(picked);
    setTimeLeft(60);
    setTimeTaken(0);
    setStarted(true); setRound(0); setGuess(null);
    setRevealed(false); setRoundScore(0); setTotalScore(0); setHistory([]);
  };

  const handleMapClick = (e) => {
    if (!currentTown || revealed || gameOver) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VB_W;
    const y = ((e.clientY - rect.top) / rect.height) * VB_H;
    const clickedTown = findClickedTown(x, y, towns);
    const guessedPoint = clickedTown ? clickedTown.centroid : { x, y };
    const d = distance(guessedPoint, currentTown.centroid);
    const s = scoreFromDistance(d);
    setGuess({ x, y, clickedTownName: clickedTown?.name || null, scorePoint: guessedPoint });
    setRoundScore(s);
    setRevealed(true);
    setTotalScore((prev) => prev + s);
    setHistory((prev) => [
      ...prev,
      { town: currentTown.name, guessed: clickedTown?.name || "(outside)", score: s, dist: d }
    ]);
    setScoreAnim(true);
    setTimeout(() => setScoreAnim(false), 600);
  };

  const nextRound = () => {
    if (!revealed) return;
    setRound((r) => r + 1);
    setGuess(null); setRevealed(false); setRoundScore(0);
  };

  const ratingInfo = rating(totalScore);
  const lastH = history[history.length - 1];

  // ── Shared map SVG ──────────────────────────────────────────────────────────
  const MapSVG = (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", display: "block", cursor: currentTown && !revealed ? "crosshair" : "default" }}
      onClick={handleMapClick}
    >
      <defs>
        <filter id="town-shadow">
          <feDropShadow dx="0" dy="0.3" stdDeviation="0.4" floodColor="#1e3a5f" floodOpacity="0.15" />
        </filter>
      </defs>
      {/* subtle grid */}
      {Array.from({ length: 11 }).map((_, i) => (
        <g key={i}>
          <line x1={i * 10} y1={0} x2={i * 10} y2={VB_H} stroke="#dde8f5" strokeWidth="0.18" />
          <line x1={0} y1={i * 6} x2={VB_W} y2={i * 6} stroke="#dde8f5" strokeWidth="0.18" />
        </g>
      ))}
      {/* towns */}
      {towns.map((t) => {
        const isCorrect = revealed && currentTown && t.key === currentTown.key;
        const isClicked = revealed && guess?.clickedTownName && normTownName(guess.clickedTownName) === t.key;
        const wasCorrectAnswer = gameOver && history.some(h => normTownName(h.town) === t.key);
        const wasCorrectGuess = gameOver && history.some(h => h.town === h.guessed && normTownName(h.town) === t.key);
        const wasWrongClick = gameOver && history.some(h => h.town !== h.guessed && normTownName(h.guessed) === t.key);
        const gameOverGreen = wasCorrectAnswer;
        const gameOverRed = wasWrongClick && !wasCorrectAnswer;
        return (
          <g key={t.id} filter={isCorrect || isClicked || gameOverGreen || gameOverRed ? "url(#town-shadow)" : undefined}>
            {t.paths.map((d, i) => (
              <path key={i} d={d}
                fill={isCorrect || gameOverGreen ? "#10b981" : isClicked || gameOverRed ? "#f43f5e" : "#c7ddf9"}
                stroke={isCorrect || gameOverGreen ? "#065f46" : isClicked || gameOverRed ? "#9f1239" : "#3b6fb5"}
                strokeWidth={isCorrect || isClicked || gameOverGreen || gameOverRed ? "0.35" : "0.2"}
                style={{ transition: "fill 0.25s ease" }}
              />
            ))}
          </g>
        );
      })}
      {/* guess pin */}
      {guess && (
        <g>
          <circle cx={guess.scorePoint.x} cy={guess.scorePoint.y} r={1.2} fill="#f43f5e" opacity={0.9} />
          <circle cx={guess.scorePoint.x} cy={guess.scorePoint.y} r={2.2} fill="none" stroke="#f43f5e" strokeWidth="0.35" opacity={0.5} />
        </g>
      )}
      {/* correct marker + line */}
      {revealed && currentTown && guess && (
        <g>
          <line x1={guess.scorePoint.x} y1={guess.scorePoint.y} x2={currentTown.centroid.x} y2={currentTown.centroid.y}
            stroke="#1e3a5f" strokeWidth="0.5" strokeDasharray="1.2 0.8" opacity={0.7} />
          <circle cx={currentTown.centroid.x} cy={currentTown.centroid.y} r={1} fill="#1e3a5f" />
          <circle cx={currentTown.centroid.x} cy={currentTown.centroid.y} r={1.8} fill="none" stroke="#1e3a5f" strokeWidth="0.3" opacity={0.4} />
        </g>
      )}
      {/* Town name labels shown after game over */}
      {gameOver && history.map((h, i) => {
        const t = towns.find(t => normTownName(t.name) === normTownName(h.town));
        if (!t) return null;
        const score = h.score;
        const labelColor = score >= 80 ? "#065f46" : score >= 50 ? "#92400e" : "#9f1239";
        const bgColor = score >= 80 ? "#d1fae5" : score >= 50 ? "#fef3c7" : "#ffe4e6";
        return (
          <g key={i}>
            {/* dot marker */}
            <circle cx={t.centroid.x} cy={t.centroid.y} r={0.9} fill={labelColor} opacity={0.9} />
            {/* label background */}
            <rect
              x={t.centroid.x + 1.2}
              y={t.centroid.y - 2.2}
              width={t.name.length * 1.05 + 1.2}
              height={2.8}
              rx={0.5}
              fill={bgColor}
              opacity={0.92}
            />
            {/* label text */}
            <text
              x={t.centroid.x + 1.8}
              y={t.centroid.y - 0.5}
              fontSize="1.85"
              fontWeight="700"
              fill={labelColor}
              fontFamily="DM Sans, system-ui, sans-serif"
            >{t.name}</text>
          </g>
        );
      })}
      <text x="98.5" y="59" textAnchor="end" fontSize="1.6" fill="#a0b4cc" fontFamily="DM Sans, sans-serif">Game by Adam Osmond</text>
    </svg>
  );

  // ── MOBILE LAYOUT ───────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#f0f4fa",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        padding: "0",
        boxSizing: "border-box",
      }}>
        <style>{`
          @keyframes fadeSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
          @keyframes popIn { 0% { transform:scale(0.7); opacity:0; } 70% { transform:scale(1.1); } 100% { transform:scale(1); opacity:1; } }
          @keyframes pulse-ring { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
          .score-pop { animation: popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
        `}</style>

        {/* Mobile Header */}
        <div style={{
          padding: "8px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #d1daea",
          background: "#0f2d5e"
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: 0.3 }}>
              CT 169 Towns
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              by Adam Osmond
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {started && !gameOver && (
              <div style={{
                background: "rgba(255,255,255,0.15)", borderRadius: 20,
                padding: "3px 10px", fontSize: 12, color: "#fff", fontWeight: 600
              }}>
                {Math.min(round + (revealed ? 1 : 0), roundsToPlay)}/{roundsToPlay}
              </div>
            )}
            {started
              ? <button onClick={startGame} style={mBtnOutline}><RotateCcw size={12} /> Restart</button>
              : <button onClick={startGame} disabled={mapState.loading || !!mapState.error || towns.length < 169} style={mBtnPrimary}>
                  <Play size={12} /> Start
                </button>
            }
          </div>
        </div>

        {/* Prompt pill */}
        {started && !gameOver && (
          <div style={{
            margin: "6px 12px 0",
            background: revealed ? "#ecfdf5" : "#eff6ff",
            border: `1px solid ${revealed ? "#6ee7b7" : "#93c5fd"}`,
            borderRadius: 8, padding: "6px 12px",
            display: "flex", alignItems: "center", gap: 8,
            animation: "fadeSlideUp 0.3s ease both"
          }}>
            {revealed
              ? <CheckCircle2 size={14} color="#059669" />
              : <MapPin size={14} color="#2563eb" />
            }
            <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500 }}>
              {revealed
                ? <><span style={{ color: "#047857", fontWeight: 700 }}>{roundScore} pts</span> · Clicked: <span style={{ color: "#475569" }}>{lastH?.guessed}</span></>
                : <>Find <span style={{ color: "#2563eb", fontWeight: 700, textDecoration: "underline" }}>{currentTown?.name}</span></>
              }
            </span>
          </div>
        )}

        {/* Progress bar */}
        {started && (
          <div style={{ margin: "5px 12px 0", height: 3, background: "#d1daea", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #2563eb, #7c3aed)", borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        )}

        {/* MAP */}
        <div style={{
          margin: "6px 12px 0",
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid #c8d9ee",
          background: "linear-gradient(135deg, #e8f0fb 0%, #dce8f7 100%)",
          boxShadow: "0 2px 8px rgba(15,45,94,0.08)",
          lineHeight: 0
        }}>
          {mapState.loading ? (
            <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 13 }}>
              Loading map…
            </div>
          ) : mapState.error ? (
            <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626", fontSize: 12, padding: 16, textAlign: "center" }}>
              {mapState.error}
            </div>
          ) : MapSVG}
        </div>

        {/* Score strip — two separate boxes */}
        <div style={{ margin: "6px 12px 0", display: "flex", gap: 6 }}>
          <div style={{
            flex: 1, background: "#fff", borderRadius: 8,
            border: "1px solid #dce8f5", padding: "7px 12px",
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Score</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#0f2d5e", fontFamily: "'Playfair Display', serif" }}
              className={scoreAnim ? "score-pop" : ""}>{totalScore}</span>
          </div>
          {!gameOver ? (
            <div style={{
              flex: "0 0 80px", background: "#fff", borderRadius: 8,
              border: `1px solid ${timeLeft <= 10 ? "#fecaca" : timeLeft <= 20 ? "#fed7aa" : "#dce8f5"}`,
              padding: "7px 10px",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
            }}>
              <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>Time</span>
              <span style={{
                fontSize: 18, fontWeight: 800, fontFamily: "monospace",
                color: timeLeft <= 10 ? "#dc2626" : timeLeft <= 20 ? "#ea580c" : "#0f2d5e"
              }}>{started ? fmtTime(timeLeft) : "1:00"}</span>
            </div>
          ) : (
            <div style={{
              flex: 1, background: "#fff", borderRadius: 8,
              border: "1px solid #dce8f5", padding: "7px 12px",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: ratingInfo.color }}>{ratingInfo.label}</span>
              <span style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>⏱ {fmtTime(timeTaken)}</span>
            </div>
          )}
        </div>

        {/* Action button */}
        <div style={{ margin: "6px 12px 0" }}>
          {!started && (
            <button onClick={startGame} disabled={mapState.loading || !!mapState.error || towns.length < 169}
              style={{ ...mBtnLarge, width: "100%" }}>
              <Play size={15} /> Start Game
            </button>
          )}
          {started && !gameOver && revealed && (
            <button onClick={nextRound} style={{ ...mBtnLarge, width: "100%", background: "linear-gradient(135deg, #1d4ed8, #2563eb)" }}>
              {round === roundsToPlay - 1 ? "See Results →" : "Next Town →"}
            </button>
          )}
          {started && !gameOver && !revealed && (
            <div style={{ textAlign: "center", padding: "6px 0", fontSize: 12, color: "#64748b" }}>
              Tap a town on the map
            </div>
          )}
          {gameOver && (
            <button onClick={startGame} style={{ ...mBtnLarge, width: "100%", background: "linear-gradient(135deg, #065f46, #059669)" }}>
              <RotateCcw size={14} /> Play Again
            </button>
          )}
        </div>

        {/* How to Play — only before game starts on mobile */}
        {!started && (
          <div style={{
            margin: "6px 12px 10px",
            background: "#fff", borderRadius: 10,
            border: "1px solid #dce8f5", overflow: "hidden"
          }}>
            <div style={{
              padding: "5px 12px", borderBottom: "1px solid #e8f0fb",
              fontSize: 9, fontWeight: 700, color: "#5a7a9e",
              textTransform: "uppercase", letterSpacing: "0.1em"
            }}>How to Play</div>
            <div style={{ padding: "8px 12px", fontSize: 12, color: "#475569", lineHeight: 1.6, fontWeight: 600 }}>
              A Connecticut town name appears at the top. Tap where you think it is on the map. Score 0–100 per town based on how close you are — 100 for a direct hit!
              <div style={{ marginTop: 5, fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
                {towns.length >= 169 ? "✓ All 169 towns loaded" : "Loading towns…"}
              </div>
            </div>
          </div>
        )}

        {/* Round History — compact table */}
        {history.length > 0 && (
          <div style={{
            margin: "6px 12px 10px",
            background: "#fff",
            borderRadius: 10, border: "1px solid #dce8f5",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "5px 12px", borderBottom: "1px solid #e8f0fb",
              fontSize: 9, fontWeight: 700, color: "#5a7a9e",
              textTransform: "uppercase", letterSpacing: "0.1em", display: "flex"
            }}>
              <span style={{ flex: "0 0 38%" }}>Town</span>
              <span style={{ flex: "0 0 40%" }}>Clicked</span>
              <span style={{ flex: "0 0 22%", textAlign: "right" }}>Pts</span>
            </div>
            {history.map((h, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "3px 12px",
                borderBottom: i < history.length - 1 ? "1px solid #f1f5f9" : "none",
                animation: `fadeSlideUp 0.3s ease ${i * 0.04}s both`
              }}>
                <span style={{ flex: "0 0 38%", fontSize: 12, color: "#1e293b", fontWeight: 600 }}>{h.town}</span>
                <span style={{ flex: "0 0 40%", fontSize: 11, color: h.town === h.guessed ? "#059669" : "#64748b" }}>
                  {h.guessed}
                </span>
                <span style={{ flex: "0 0 22%", textAlign: "right", fontSize: 13, fontWeight: 700, color: scoreColor(h.score) }}>
                  {h.score}
                </span>
              </div>
            ))}
            {gameOver && (
              <div style={{
                padding: "5px 12px", borderTop: "1px solid #e2e8f0",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#f8fafc"
              }}>
                <div>
                  <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Final</span>
                  <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 8 }}>⏱ {fmtTime(timeTaken)}</span>
                </div>
                <span style={{ fontSize: 17, fontWeight: 800, color: "#0f2d5e", fontFamily: "'Playfair Display', serif" }}>{totalScore}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── DESKTOP LAYOUT ──────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "#f0f4fa",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: "16px 24px 24px",
      boxSizing: "border-box",
    }}>
      <style>{`
        @keyframes fadeSlideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes popIn { 0% { transform:scale(0.6); opacity:0; } 70% { transform:scale(1.08); } 100% { transform:scale(1); opacity:1; } }
        .score-pop { animation: popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
        .town-row:hover { background: #f0f6ff !important; }
        .next-btn:hover { opacity:0.9 !important; transform:translateY(-1px); }
        .next-btn { transition: all 0.2s ease !important; }
        .restart-btn:hover { background: #e8edf5 !important; }
      `}</style>

      <div style={{ maxWidth: 1140, margin: "0 auto" }}>

        {/* ── Desktop Header ── */}
        <div style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          marginBottom: 14, borderBottom: "1px solid #d1daea", paddingBottom: 12
        }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 900, color: "#0f2d5e",
              fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.01em"
            }}>CT 169 Towns Challenge</h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6b7f9e", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Geography Game · Created by Adam Osmond
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {mapState.loading && (
              <span style={{ fontSize: 12, color: "#b45309", display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={13} /> Loading map…
              </span>
            )}
            {mapState.error && (
              <span style={{ fontSize: 12, color: "#b91c1c", display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={13} /> {mapState.error}
              </span>
            )}
            {!mapState.loading && !mapState.error && !started && (
              <span style={{ fontSize: 12, color: "#047857", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={13} /> 169 towns ready
              </span>
            )}
            {started
              ? <button className="restart-btn" onClick={startGame} style={dBtnOutline}><RotateCcw size={13} style={{ marginRight: 5 }} />Restart</button>
              : <button onClick={startGame} disabled={mapState.loading || !!mapState.error || towns.length < 169} style={dBtnPrimary}>
                  <Play size={13} style={{ marginRight: 5 }} />Start Game
                </button>
            }
          </div>
        </div>

        {/* ── Body: map + sidebar ── */}
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>

          {/* LEFT: Map column */}
          <div style={{ flex: "1 1 0", minWidth: 0 }}>

            {/* Prompt bar */}
            <div style={{
              borderRadius: "10px 10px 0 0",
              background: started && !gameOver
                ? (revealed ? "#ecfdf5" : "#eff6ff")
                : "#fff",
              border: `1px solid ${started && !gameOver ? (revealed ? "#6ee7b7" : "#93c5fd") : "#d1daea"}`,
              borderBottom: "none",
              padding: "10px 16px",
              minHeight: 44,
              display: "flex", alignItems: "center", gap: 10,
              boxSizing: "border-box"
            }}>
              {!started && (
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Press Start Game to begin</span>
              )}
              {started && !gameOver && !revealed && (
                <>
                  <MapPin size={15} color="#2563eb" />
                  <span style={{ fontSize: 14, color: "#1e3a5f", fontWeight: 500 }}>
                    Round {round + 1} of {roundsToPlay} — Find <span style={{ color: "#2563eb", fontWeight: 700, textDecoration: "underline" }}>{currentTown?.name}</span>
                  </span>
                </>
              )}
              {started && !gameOver && revealed && (
                <>
                  <CheckCircle2 size={15} color="#059669" />
                  <span style={{ fontSize: 14, color: "#047857", fontWeight: 700 }}>{roundScore} points</span>
                  <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>
                    · {lastH?.dist?.toFixed(1)} units away · Clicked: <span style={{ color: "#1e3a5f" }}>{lastH?.guessed}</span>
                  </span>
                </>
              )}
              {gameOver && (
                <span style={{ fontSize: 14, color: "#475569" }}>Game complete — your results are on the right →</span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: "#dce8f5" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #2563eb, #7c3aed)", transition: "width 0.4s ease" }} />
            </div>

            {/* Map */}
            <div style={{
              background: "linear-gradient(135deg, #e8f0fb 0%, #dae6f5 100%)",
              border: "1px solid #c8d9ee",
              borderTop: "none", borderBottom: "none", lineHeight: 0,
            }}>
              {mapState.loading ? (
                <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>Loading map…</div>
              ) : mapState.error ? (
                <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626", fontSize: 13, padding: 20, textAlign: "center" }}>{mapState.error}</div>
              ) : MapSVG}
            </div>

            {/* Next button strip */}
            <div style={{
              borderRadius: "0 0 10px 10px",
              border: "1px solid #c8d9ee",
              borderTop: "none",
              background: "#ffffff",
              padding: "12px 16px",
              minHeight: 56,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {!started && <span style={{ fontSize: 13, color: "#94a3b8" }}>Click Start Game above to begin playing</span>}
              {started && !gameOver && !revealed && (
                <span style={{ fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
                  <Target size={13} /> Click a town on the map above
                </span>
              )}
              {started && !gameOver && revealed && (
                <button className="next-btn" onClick={nextRound} style={{ ...dBtnPrimary, fontSize: 15, padding: "11px 36px" }}>
                  {round === roundsToPlay - 1 ? "See Final Results →" : "Next Town →"}
                </button>
              )}
              {gameOver && <span style={{ fontSize: 13, color: "#64748b" }}>All rounds complete — view your results →</span>}
            </div>
          </div>

          {/* RIGHT: Sidebar — compact, fits entire game in one viewport */}
          <div style={{ width: 268, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>

            {/* Score + Final Result row — side by side when game over, or just score */}
            {!gameOver ? (
              /* Two boxes: Score | Timer */
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ ...dPanel, flex: 1 }}>
                  <div style={dPanelHeader}>Score</div>
                  <div style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                      <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Round {started ? Math.min(round + (revealed ? 1 : 0), roundsToPlay) : 0}/{roundsToPlay}
                      </span>
                      <span style={{
                        fontSize: 32, fontWeight: 800, color: "#0f2d5e", lineHeight: 1,
                        fontFamily: "'Playfair Display', serif", letterSpacing: "-0.02em"
                      }} className={scoreAnim ? "score-pop" : ""}>{totalScore}</span>
                    </div>
                    <div style={{ height: 5, background: "#dce8f5", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(totalScore / (roundsToPlay * 100)) * 100}%`, background: "linear-gradient(90deg, #2563eb, #7c3aed)", borderRadius: 3, transition: "width 0.5s cubic-bezier(0.34,1.56,0.64,1)" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "right", marginTop: 2 }}>max {roundsToPlay * 100}</div>
                  </div>
                </div>
                <div style={{ ...dPanel, flex: "0 0 90px", textAlign: "center" }}>
                  <div style={dPanelHeader}>Time</div>
                  <div style={{ padding: "10px 8px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{
                      fontSize: 28, fontWeight: 800, lineHeight: 1, fontFamily: "monospace",
                      color: timeLeft <= 10 ? "#dc2626" : timeLeft <= 20 ? "#ea580c" : "#0f2d5e"
                    }}>{fmtTime(timeLeft)}</span>
                    <div style={{ height: 4, background: "#dce8f5", borderRadius: 2, overflow: "hidden", marginTop: 7, width: "100%" }}>
                      <div style={{ height: "100%", width: `${(timeLeft / 60) * 100}%`, background: timeLeft <= 10 ? "#dc2626" : timeLeft <= 20 ? "#ea580c" : "linear-gradient(90deg, #2563eb, #7c3aed)", borderRadius: 2, transition: "width 1s linear" }} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Final Result (game over) — compact horizontal card */
              <div style={{
                ...dPanel, border: "1px solid #c7d2fe",
                background: "#eef2ff", animation: "fadeSlideUp 0.4s ease both"
              }}>
                <div style={{ ...dPanelHeader, background: "#e0e7ff", borderBottom: "1px solid #c7d2fe", color: "#4338ca" }}>
                  Final Result
                </div>
                <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ textAlign: "center", minWidth: 64 }}>
                    <div style={{ fontSize: 40, fontWeight: 900, color: "#1e1b4b", lineHeight: 1, fontFamily: "'Playfair Display', serif" }}>{totalScore}</div>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>/ {roundsToPlay * 100}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: ratingInfo.color, marginBottom: 4 }}>{ratingInfo.label}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                      ⏱ Finished in <span style={{ fontWeight: 700, color: "#1e3a5f" }}>{fmtTime(timeTaken)}</span>
                    </div>
                    <button className="next-btn" onClick={startGame} style={{ ...dBtnPrimary, width: "100%", justifyContent: "center", fontSize: 12, padding: "7px 10px", background: "linear-gradient(135deg, #4f46e5, #6366f1)" }}>
                      <RotateCcw size={12} style={{ marginRight: 4 }} />Play Again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* How to Play — only show when game hasn't started or is mid-game with no history */}
            {(!started || (started && !gameOver && history.length === 0)) && (
              <div style={dPanel}>
                <div style={dPanelHeader}>How to Play</div>
                <div style={{ padding: "10px 14px", fontSize: 12, color: "#475569", lineHeight: 1.65, fontWeight: 600 }}>
                  A CT town name appears above. Click where you think it is. Score 0–100 based on proximity.
                  <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
                    {towns.length >= 169 ? "✓ All 169 towns loaded" : "Loading towns…"}
                  </div>
                </div>
              </div>
            )}

            {/* Round History — no maxHeight, all 10 rows always visible */}
            {history.length > 0 && (
              <div style={dPanel}>
                <div style={dPanelHeader}>Round History</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={dTh}>Town</th>
                      <th style={dTh}>Clicked</th>
                      <th style={{ ...dTh, textAlign: "right" }}>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i} className="town-row" style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.15s" }}>
                        <td style={dTdCompact}>{h.town}</td>
                        <td style={{ ...dTdCompact, color: h.town === h.guessed ? "#059669" : "#64748b" }}>{h.guessed}</td>
                        <td style={{ ...dTdCompact, textAlign: "right", fontWeight: 700, color: scoreColor(h.score) }}>
                          {h.score}
                          <ScoreBar score={h.score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {gameOver && (
                  <div style={{ padding: "6px 12px 8px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>Total</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: "#0f2d5e", fontFamily: "'Playfair Display', serif" }}>{totalScore}</span>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Desktop styles ───────────────────────────────────────────────────────────
const dBtnPrimary = {
  display: "inline-flex", alignItems: "center", padding: "9px 18px",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
  border: "none", background: "linear-gradient(135deg, #1d4ed8, #2563eb)", color: "#fff",
  letterSpacing: "0.01em"
};
const dBtnOutline = {
  display: "inline-flex", alignItems: "center", padding: "9px 16px",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
  border: "1px solid #c8d9ee", background: "#fff", color: "#1e3a5f"
};
const dPanel = {
  background: "#ffffff", borderRadius: 10,
  border: "1px solid #dce8f5", overflow: "hidden"
};
const dPanelHeader = {
  background: "#f4f8fd", borderBottom: "1px solid #dce8f5",
  padding: "8px 16px", fontSize: 10, fontWeight: 700, color: "#5a7a9e",
  textTransform: "uppercase", letterSpacing: "0.1em"
};
const dTh = { padding: "5px 12px", fontSize: 10, fontWeight: 700, color: "#5a7a9e", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em" };
const dTd = { padding: "6px 12px", fontSize: 12, color: "#334155" };
const dTdCompact = { padding: "4px 12px", fontSize: 12, color: "#334155" };

// ─── Mobile styles ────────────────────────────────────────────────────────────
const mBtnPrimary = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px",
  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: "none", background: "linear-gradient(135deg, #1d4ed8, #2563eb)", color: "#fff"
};
const mBtnOutline = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px",
  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.15)", color: "#fff"
};
const mBtnLarge = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 20px",
  borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: "pointer",
  border: "none", background: "linear-gradient(135deg, #1d4ed8, #2563eb)", color: "#fff",
  letterSpacing: "0.01em", boxShadow: "0 3px 12px rgba(37,99,235,0.25)"
};
