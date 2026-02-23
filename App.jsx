import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./card.jsx";
import { Button } from "./button.jsx";
import { Progress } from "./progress.jsx";
import { Badge } from "./badge.jsx";
import { RotateCcw, Play, MapPin, Target, CheckCircle2, AlertCircle } from "lucide-react";

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

function normTownName(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/\b(town|city|borough|municipality)\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
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
  if (total >= 900) return "Connecticut Legend";
  if (total >= 750) return "Town Master";
  if (total >= 600) return "Strong Local";
  if (total >= 450) return "Road Tripper";
  return "Getting Started";
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

// viewBox is 100 wide × 60 tall — matches CT's ~5:3 aspect ratio
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

export default function CTGame() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
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
    // Map pixel click → viewBox coordinates
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
      { town: currentTown.name, guessed: clickedTown?.name || "(outside town)", score: s, dist: d }
    ]);
  };

  const nextRound = () => {
    if (!revealed) return;
    setRound((r) => r + 1);
    setGuess(null); setRevealed(false); setRoundScore(0);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "12px", boxSizing: "border-box", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e3a5f" }}>CT 169 Towns Challenge</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Game created by: Adam Osmond</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {mapState.loading && <span style={{ fontSize: 11, color: "#d97706", display: "flex", alignItems: "center", gap: 3 }}><AlertCircle size={12} /> Loading…</span>}
            {mapState.error && <span style={{ fontSize: 11, color: "#dc2626", display: "flex", alignItems: "center", gap: 3 }}><AlertCircle size={12} /> {mapState.error}</span>}
            {!mapState.loading && !mapState.error && !started && <span style={{ fontSize: 11, color: "#16a34a", display: "flex", alignItems: "center", gap: 3 }}><CheckCircle2 size={12} /> Ready</span>}
            {started
              ? <button onClick={startGame} style={btnStyle("outline")}><RotateCcw size={12} style={{ marginRight: 4 }} />Restart</button>
              : <button onClick={startGame} disabled={mapState.loading || !!mapState.error || towns.length < 169} style={btnStyle("primary")}><Play size={12} style={{ marginRight: 4 }} />Start Game</button>
            }
          </div>
        </div>

        {/* ── BODY: map + sidebar ── */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, alignItems: "flex-start" }}>

          {/* LEFT: map column */}
          <div style={{ flex: "1 1 0", minWidth: 0, width: "100%" }}>

            {/* Prompt bar — ABOVE the map */}
            <div style={{
              background: started && !gameOver ? "#1e3a5f" : "#e2e8f0",
              color: started && !gameOver ? "#fff" : "#64748b",
              borderRadius: "8px 8px 0 0",
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 600,
              minHeight: 38,
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxSizing: "border-box"
            }}>
              {!started && <span style={{ fontSize: 13 }}>Press Start Game to begin</span>}
              {started && !gameOver && !revealed && (
                <><MapPin size={14} /> Round {round + 1} of {roundsToPlay}: Find&nbsp;<span style={{ textDecoration: "underline" }}>{currentTown?.name}</span></>
              )}
              {started && !gameOver && revealed && (
                <>
                  <CheckCircle2 size={14} style={{ color: "#4ade80", flexShrink: 0 }} />
                  <span style={{ color: "#4ade80" }}>Round score: {roundScore}</span>
                  <span style={{ fontWeight: 400, fontSize: 12, color: "#94a3b8", marginLeft: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    | Dist: {history[history.length - 1]?.dist?.toFixed(1)} | Clicked: {history[history.length - 1]?.guessed}
                  </span>
                </>
              )}
              {gameOver && <span style={{ color: "#1e3a5f" }}>Game over — see your results →</span>}
            </div>

            {/* Progress bar */}
            <div style={{ height: 4, background: "#e2e8f0" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: "#2563eb", transition: "width 0.4s ease" }} />
            </div>

            {/* MAP — viewBox 100×60 fills the container perfectly */}
            <div style={{ lineHeight: 0, border: "1px solid #cbd5e1", borderTop: "none", background: "#eff6ff" }}>
              <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ width: "100%", display: "block", cursor: currentTown && !revealed ? "crosshair" : "default" }}
                onClick={handleMapClick}
              >
                {/* grid */}
                {Array.from({ length: 11 }).map((_, i) => (
                  <g key={i}>
                    <line x1={i * 10} y1={0} x2={i * 10} y2={VB_H} stroke="#dbeafe" strokeWidth="0.2" />
                    <line x1={0} y1={i * 6} x2={VB_W} y2={i * 6} stroke="#dbeafe" strokeWidth="0.2" />
                  </g>
                ))}

                {/* towns */}
                {towns.map((t) => (
                  <g key={t.id}>
                    {t.paths.map((d, i) => {
                      const isCorrect = revealed && currentTown && t.key === currentTown.key;
                      const isClicked = revealed && guess?.clickedTownName && normTownName(guess.clickedTownName) === t.key;
                      return (
                        <path key={i} d={d}
                          fill={isCorrect ? "#22c55e" : isClicked ? "#ef4444" : "#bfdbfe"}
                          stroke="#1e40af" strokeWidth="0.22" opacity={0.9}
                        />
                      );
                    })}
                  </g>
                ))}

                {/* guess pin */}
                {guess && (
                  <g>
                    <circle cx={guess.scorePoint.x} cy={guess.scorePoint.y} r={0.8} fill="#ef4444" />
                    <circle cx={guess.scorePoint.x} cy={guess.scorePoint.y} r={1.6} fill="none" stroke="#ef4444" strokeWidth="0.3" />
                  </g>
                )}

                {/* correct marker + line */}
                {revealed && currentTown && guess && (
                  <g>
                    <line x1={guess.scorePoint.x} y1={guess.scorePoint.y} x2={currentTown.centroid.x} y2={currentTown.centroid.y}
                      stroke="#1e40af" strokeWidth="0.4" strokeDasharray="1 0.8" />
                    <circle cx={currentTown.centroid.x} cy={currentTown.centroid.y} r={0.8} fill="#1e40af" />
                  </g>
                )}

                <text x="98" y="58.5" textAnchor="end" fontSize="2" fill="#c0cfe0">Game by Adam Osmond</text>
              </svg>
            </div>

            {/* Next button — BELOW the map, never overlapping */}
            <div style={{
              borderRadius: "0 0 8px 8px",
              border: "1px solid #cbd5e1",
              borderTop: "none",
              background: "#fff",
              padding: "10px 12px",
              minHeight: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              {!started && <span style={{ fontSize: 12, color: "#94a3b8" }}>Click Start Game to play</span>}
              {started && !gameOver && !revealed && <span style={{ fontSize: 12, color: "#64748b" }}>Click a town on the map above</span>}
              {started && !gameOver && revealed && (
                <button onClick={nextRound} style={{ ...btnStyle("primary"), fontSize: 14, padding: "9px 32px" }}>
                  {round === roundsToPlay - 1 ? "See Final Results →" : "Next Town →"}
                </button>
              )}
              {gameOver && <span style={{ fontSize: 13, color: "#64748b" }}>Game complete! Check your score →</span>}
            </div>
          </div>

          {/* RIGHT: sidebar */}
          <div style={{ width: isMobile ? "100%" : 230, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Score + Game Info: side-by-side on mobile, stacked on desktop */}
            <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 10 }}>

              {/* Score */}
              <div style={{ ...panelStyle, flex: isMobile ? "0 0 auto" : undefined, width: isMobile ? "45%" : undefined }}>
                <div style={panelHeaderStyle}>Score</div>
                <div style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Round</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1e3a5f" }}>
                      {started ? Math.min(round + (revealed ? 1 : 0), roundsToPlay) : 0} / {roundsToPlay}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Total Score</span>
                    <span style={{ fontSize: 26, fontWeight: 800, color: "#1e3a5f", lineHeight: 1 }}>{totalScore}</span>
                  </div>
                  <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(totalScore / (roundsToPlay * 100)) * 100}%`, background: "#2563eb", transition: "width 0.4s" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "right", marginTop: 2 }}>max {roundsToPlay * 100}</div>
                </div>
              </div>

              {/* Game Info */}
              <div style={{ ...panelStyle, flex: isMobile ? "1 1 0" : undefined }}>
                <div style={panelHeaderStyle}>Game Info</div>
                <div style={{ padding: "10px 14px", fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
                  <div>Towns per game: {roundsToPlay}</div>
                  <div>Scoring is between 0 and 100 per town, based on how close you click to the target location, with 100 points awarded for an exact match.</div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>
                    {towns.length >= 169 ? "✓ All 169 towns loaded" : "Loading towns…"}
                  </div>
                </div>
              </div>

            </div>

            {/* Final Result */}
            {gameOver && (
              <div style={{ ...panelStyle, border: "2px solid #2563eb" }}>
                <div style={{ ...panelHeaderStyle, background: "#2563eb", color: "#fff" }}>Final Result</div>
                <div style={{ padding: "14px", textAlign: "center" }}>
                  <div style={{ fontSize: 40, fontWeight: 800, color: "#1e3a5f", lineHeight: 1 }}>{totalScore}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>out of {roundsToPlay * 100}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#2563eb", marginBottom: 12 }}>{rating(totalScore)}</div>
                  <button onClick={startGame} style={{ ...btnStyle("primary"), width: "100%", justifyContent: "center" }}>
                    <RotateCcw size={12} style={{ marginRight: 4 }} /> Play Again
                  </button>
                </div>
              </div>
            )}

            {/* Round History */}
            <div style={{ ...panelStyle, overflow: "hidden" }}>
              <div style={panelHeaderStyle}>Round History</div>
              <div style={{ overflowY: "auto", maxHeight: 260 }}>
                {history.length === 0 ? (
                  <p style={{ margin: 0, padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>No rounds played yet.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                        <th style={thStyle}>Town</th>
                        <th style={thStyle}>Clicked</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={tdStyle}>{h.town}</td>
                          <td style={{ ...tdStyle, color: h.town === h.guessed ? "#16a34a" : "#64748b" }}>{h.guessed}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: h.score >= 80 ? "#16a34a" : h.score >= 50 ? "#d97706" : "#dc2626" }}>{h.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(variant) {
  const base = {
    display: "inline-flex", alignItems: "center", padding: "7px 14px",
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "none", transition: "opacity 0.15s"
  };
  return variant === "primary"
    ? { ...base, background: "#1e3a5f", color: "#fff" }
    : { ...base, background: "transparent", color: "#1e3a5f", border: "1.5px solid #1e3a5f" };
}

const panelStyle = { background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" };

const panelHeaderStyle = {
  background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
  padding: "7px 14px", fontSize: 11, fontWeight: 700,
  color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em"
};

const thStyle = { padding: "4px 10px", fontWeight: 700, color: "#374151", textAlign: "left" };
const tdStyle = { padding: "4px 10px", color: "#374151" };
