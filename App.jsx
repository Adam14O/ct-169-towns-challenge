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
  const gameOver = started && round >= roundsToPlay;
  const progressPct = started ? (Math.min(round, roundsToPlay) / roundsToPlay) * 100 : 0;

  const startGame = () => {
    if (towns.length < 169) return;
    const indices = towns.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setOrder(indices.slice(0, roundsToPlay));
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
        return (
          <g key={t.id} filter={isCorrect || isClicked ? "url(#town-shadow)" : undefined}>
            {t.paths.map((d, i) => (
              <path key={i} d={d}
                fill={isCorrect ? "#10b981" : isClicked ? "#f43f5e" : "#c7ddf9"}
                stroke={isCorrect ? "#065f46" : isClicked ? "#9f1239" : "#3b6fb5"}
                strokeWidth={isCorrect || isClicked ? "0.35" : "0.2"}
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
      <text x="98.5" y="59" textAnchor="end" fontSize="1.6" fill="#a0b4cc" fontFamily="DM Sans, sans-serif">Game by Adam Osmond</text>
    </svg>
  );

  // ── MOBILE LAYOUT ───────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0f1e3c 0%, #162848 50%, #1a3258 100%)",
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
          padding: "12px 16px 10px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.08)"
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: 0.3 }}>
              CT 169 Towns
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              by Adam Osmond
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {started && !gameOver && (
              <div style={{
                background: "rgba(255,255,255,0.08)", borderRadius: 20,
                padding: "3px 10px", fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600
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
            margin: "10px 16px 0",
            background: revealed ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)",
            border: `1px solid ${revealed ? "rgba(16,185,129,0.3)" : "rgba(59,130,246,0.3)"}`,
            borderRadius: 10, padding: "8px 14px",
            display: "flex", alignItems: "center", gap: 8,
            animation: "fadeSlideUp 0.3s ease both"
          }}>
            {revealed
              ? <CheckCircle2 size={14} color="#10b981" />
              : <MapPin size={14} color="#60a5fa" />
            }
            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>
              {revealed
                ? <><span style={{ color: "#10b981", fontWeight: 700 }}>{roundScore} pts</span> · Clicked: <span style={{ color: "#94a3b8" }}>{lastH?.guessed}</span></>
                : <>Find <span style={{ color: "#60a5fa", fontWeight: 700, textDecoration: "underline" }}>{currentTown?.name}</span></>
              }
            </span>
          </div>
        )}

        {/* Progress bar */}
        {started && (
          <div style={{ margin: "8px 16px 0", height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #3b82f6, #60a5fa)", borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        )}

        {/* MAP */}
        <div style={{
          margin: "10px 16px 0",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "linear-gradient(135deg, #e8f0fb 0%, #dce8f7 100%)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          lineHeight: 0
        }}>
          {mapState.loading ? (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 13 }}>
              Loading map…
            </div>
          ) : mapState.error ? (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626", fontSize: 12, padding: 16, textAlign: "center" }}>
              {mapState.error}
            </div>
          ) : MapSVG}
        </div>

        {/* Score strip (always visible) */}
        <div style={{
          margin: "10px 16px 0",
          display: "flex", gap: 8
        }}>
          <div style={{
            flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.1)", padding: "10px 14px",
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Score</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#fff", fontFamily: "'Playfair Display', serif" }}
              className={scoreAnim ? "score-pop" : ""}>{totalScore}</span>
          </div>
          {gameOver && (
            <div style={{
              flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)", padding: "10px 14px",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: ratingInfo.color }}>{ratingInfo.label}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>out of {roundsToPlay * 100}</span>
            </div>
          )}
        </div>

        {/* Action button */}
        <div style={{ margin: "10px 16px 0" }}>
          {!started && (
            <button onClick={startGame} disabled={mapState.loading || !!mapState.error || towns.length < 169}
              style={{ ...mBtnLarge, width: "100%" }}>
              <Play size={16} /> Start Game
            </button>
          )}
          {started && !gameOver && revealed && (
            <button onClick={nextRound} style={{ ...mBtnLarge, width: "100%", background: "linear-gradient(135deg, #1d4ed8, #2563eb)" }}>
              {round === roundsToPlay - 1 ? "See Results →" : "Next Town →"}
            </button>
          )}
          {started && !gameOver && !revealed && (
            <div style={{ textAlign: "center", padding: "8px 0", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              Tap a town on the map
            </div>
          )}
          {gameOver && (
            <button onClick={startGame} style={{ ...mBtnLarge, width: "100%", background: "linear-gradient(135deg, #065f46, #059669)" }}>
              <RotateCcw size={15} /> Play Again
            </button>
          )}
        </div>

        {/* Round History — compact table */}
        {history.length > 0 && (
          <div style={{
            margin: "10px 16px 16px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "8px 14px 6px", borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase", letterSpacing: "0.1em", display: "flex"
            }}>
              <span style={{ flex: "0 0 38%" }}>Town</span>
              <span style={{ flex: "0 0 40%" }}>Clicked</span>
              <span style={{ flex: "0 0 22%", textAlign: "right" }}>Pts</span>
            </div>
            {history.map((h, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "5px 14px",
                borderBottom: i < history.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                animation: `fadeSlideUp 0.3s ease ${i * 0.04}s both`
              }}>
                <span style={{ flex: "0 0 38%", fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{h.town}</span>
                <span style={{ flex: "0 0 40%", fontSize: 11, color: h.town === h.guessed ? "#10b981" : "rgba(255,255,255,0.4)" }}>
                  {h.guessed}
                </span>
                <span style={{ flex: "0 0 22%", textAlign: "right", fontSize: 13, fontWeight: 700, color: scoreColor(h.score) }}>
                  {h.score}
                </span>
              </div>
            ))}
            {gameOver && (
              <div style={{
                padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Final</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: "'Playfair Display', serif" }}>{totalScore}</span>
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
      background: "linear-gradient(160deg, #0f1e3c 0%, #162848 60%, #1a3258 100%)",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: "20px 24px 32px",
      boxSizing: "border-box",
    }}>
      <style>{`
        @keyframes fadeSlideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes popIn { 0% { transform:scale(0.6); opacity:0; } 70% { transform:scale(1.08); } 100% { transform:scale(1); opacity:1; } }
        .score-pop { animation: popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
        .town-row:hover { background: rgba(255,255,255,0.04) !important; }
        .next-btn:hover { opacity:0.9 !important; transform:translateY(-1px); }
        .next-btn { transition: all 0.2s ease !important; }
        .restart-btn:hover { background: rgba(255,255,255,0.12) !important; }
      `}</style>

      <div style={{ maxWidth: 1140, margin: "0 auto" }}>

        {/* ── Desktop Header ── */}
        <div style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 16
        }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 900, color: "#fff",
              fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.01em"
            }}>CT 169 Towns Challenge</h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Geography Game · Created by Adam Osmond
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {mapState.loading && (
              <span style={{ fontSize: 12, color: "#d97706", display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={13} /> Loading map…
              </span>
            )}
            {mapState.error && (
              <span style={{ fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={13} /> {mapState.error}
              </span>
            )}
            {!mapState.loading && !mapState.error && !started && (
              <span style={{ fontSize: 12, color: "#34d399", display: "flex", alignItems: "center", gap: 4 }}>
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
                ? (revealed ? "linear-gradient(90deg, #064e3b, #065f46)" : "linear-gradient(90deg, #1e3a5f, #1e40af)")
                : "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderBottom: "none",
              padding: "10px 16px",
              minHeight: 44,
              display: "flex", alignItems: "center", gap: 10,
              boxSizing: "border-box"
            }}>
              {!started && (
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Press Start Game to begin</span>
              )}
              {started && !gameOver && !revealed && (
                <>
                  <MapPin size={15} color="#60a5fa" />
                  <span style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>
                    Round {round + 1} of {roundsToPlay} — Find <span style={{ color: "#60a5fa", fontWeight: 700, textDecoration: "underline" }}>{currentTown?.name}</span>
                  </span>
                </>
              )}
              {started && !gameOver && revealed && (
                <>
                  <CheckCircle2 size={15} color="#34d399" />
                  <span style={{ fontSize: 14, color: "#34d399", fontWeight: 700 }}>{roundScore} points</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>
                    · {lastH?.dist?.toFixed(1)} units away · Clicked: <span style={{ color: "rgba(255,255,255,0.65)" }}>{lastH?.guessed}</span>
                  </span>
                </>
              )}
              {gameOver && (
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Game complete — your results are on the right →</span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #3b82f6, #818cf8)", transition: "width 0.4s ease" }} />
            </div>

            {/* Map */}
            <div style={{
              background: "linear-gradient(135deg, #e8f0fb 0%, #dae6f5 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
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
              border: "1px solid rgba(255,255,255,0.08)",
              borderTop: "none",
              background: "rgba(255,255,255,0.03)",
              padding: "12px 16px",
              minHeight: 56,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {!started && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Click Start Game above to begin playing</span>}
              {started && !gameOver && !revealed && (
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Target size={13} /> Click a town on the map above
                </span>
              )}
              {started && !gameOver && revealed && (
                <button className="next-btn" onClick={nextRound} style={{ ...dBtnPrimary, fontSize: 15, padding: "11px 36px" }}>
                  {round === roundsToPlay - 1 ? "See Final Results →" : "Next Town →"}
                </button>
              )}
              {gameOver && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>All rounds complete — view your results →</span>}
            </div>
          </div>

          {/* RIGHT: Sidebar */}
          <div style={{ width: 248, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Score Card */}
            <div style={dPanel}>
              <div style={dPanelHeader}>Score</div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Round {started ? Math.min(round + (revealed ? 1 : 0), roundsToPlay) : 0}/{roundsToPlay}
                  </span>
                  <span style={{
                    fontSize: 38, fontWeight: 800, color: "#fff", lineHeight: 1,
                    fontFamily: "'Playfair Display', serif", letterSpacing: "-0.02em"
                  }}
                    className={scoreAnim ? "score-pop" : ""}
                  >{totalScore}</span>
                </div>
                {/* Score bar */}
                <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${(totalScore / (roundsToPlay * 100)) * 100}%`,
                    background: "linear-gradient(90deg, #3b82f6, #818cf8)",
                    borderRadius: 3, transition: "width 0.5s cubic-bezier(0.34,1.56,0.64,1)"
                  }} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textAlign: "right", marginTop: 3 }}>max {roundsToPlay * 100}</div>
              </div>
            </div>

            {/* Game Info */}
            <div style={dPanel}>
              <div style={dPanelHeader}>How to Play</div>
              <div style={{ padding: "12px 16px", fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                A Connecticut town name is shown above the map. Click where you think it is. Score 0–100 based on proximity — 100 for a direct hit.
                <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                  {towns.length >= 169 ? "✓ All 169 towns loaded" : "Loading towns…"}
                </div>
              </div>
            </div>

            {/* Final Result */}
            {gameOver && (
              <div style={{
                ...dPanel,
                border: "1px solid rgba(99,102,241,0.4)",
                background: "rgba(99,102,241,0.08)",
                animation: "fadeSlideUp 0.4s ease both"
              }}>
                <div style={{ ...dPanelHeader, background: "rgba(99,102,241,0.2)", borderBottom: "1px solid rgba(99,102,241,0.2)" }}>Final Result</div>
                <div style={{ padding: "16px", textAlign: "center" }}>
                  <div style={{ fontSize: 52, fontWeight: 900, color: "#fff", lineHeight: 1, fontFamily: "'Playfair Display', serif" }}>{totalScore}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>out of {roundsToPlay * 100}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ratingInfo.color, marginBottom: 14, letterSpacing: "0.01em" }}>{ratingInfo.label}</div>
                  <button className="next-btn" onClick={startGame} style={{ ...dBtnPrimary, width: "100%", justifyContent: "center", background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
                    <RotateCcw size={13} style={{ marginRight: 5 }} />Play Again
                  </button>
                </div>
              </div>
            )}

            {/* Round History */}
            <div style={dPanel}>
              <div style={dPanelHeader}>Round History</div>
              {history.length === 0 ? (
                <p style={{ margin: 0, padding: "12px 16px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No rounds yet.</p>
              ) : (
                <div style={{ overflowY: "auto", maxHeight: 300 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <th style={dTh}>Town</th>
                        <th style={dTh}>Clicked</th>
                        <th style={{ ...dTh, textAlign: "right" }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={i} className="town-row" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.15s" }}>
                          <td style={dTd}>{h.town}</td>
                          <td style={{ ...dTd, color: h.town === h.guessed ? "#10b981" : "rgba(255,255,255,0.4)" }}>{h.guessed}</td>
                          <td style={{ ...dTd, textAlign: "right", fontWeight: 700, color: scoreColor(h.score) }}>
                            {h.score}
                            <ScoreBar score={h.score} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

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
  border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff"
};
const dPanel = {
  background: "rgba(255,255,255,0.04)", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden"
};
const dPanelHeader = {
  background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)",
  padding: "8px 16px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)",
  textTransform: "uppercase", letterSpacing: "0.1em"
};
const dTh = { padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em" };
const dTd = { padding: "6px 12px", fontSize: 12, color: "rgba(255,255,255,0.75)" };

// ─── Mobile styles ────────────────────────────────────────────────────────────
const mBtnPrimary = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px",
  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: "none", background: "linear-gradient(135deg, #1d4ed8, #2563eb)", color: "#fff"
};
const mBtnOutline = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px",
  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff"
};
const mBtnLarge = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 20px",
  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer",
  border: "none", background: "linear-gradient(135deg, #1d4ed8, #2563eb)", color: "#fff",
  letterSpacing: "0.01em", boxShadow: "0 4px 16px rgba(37,99,235,0.35)"
};
