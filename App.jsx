import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Play, MapPin, Target, CheckCircle2, AlertCircle } from "lucide-react";

// Final ready to play version using live CTDOT municipal polygons (169 towns)
// ArcGIS layer field name for town label is "Municipality"
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
  return String(name).toLowerCase().replace(/\b(town|city|borough|municipality)\b/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
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
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function scoreFromDistance(d) {
  const maxD = 70;
  const clamped = Math.min(maxD, d);
  return Math.round(100 * Math.pow(1 - clamped / maxD, 1.6));
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
  features.forEach((f) => flattenCoords(f.geometry).forEach((poly) => poly.forEach((ring) => ring.forEach(([x, y]) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }))));
  return { minX, minY, maxX, maxY };
}
function normalizeFeaturesToSvg(geojson) {
  const features = (geojson?.features || []).filter((f) => ["Polygon", "MultiPolygon"].includes(f?.geometry?.type));
  if (!features.length) return [];
  const bb = bboxFromFeatures(features);
  const w = (bb.maxX - bb.minX) || 1;
  const h = (bb.maxY - bb.minY) || 1;
  const pad = 4;
  const s = Math.min((100 - pad * 2) / w, (100 - pad * 2) / h);
  const xOff = (100 - w * s) / 2;
  const yOff = (100 - h * s) / 2;
  const project = ([x, y]) => [xOff + (x - bb.minX) * s, yOff + (bb.maxY - y) * s];

  return features.map((f, idx) => {
    const rawName = f?.properties?.Municipality || f?.properties?.MUNICIPALITY || f?.properties?.NAME || f?.properties?.name || "";
    const polygons = flattenCoords(f.geometry).map((poly) => poly.map((ring) => ring.map(project)));
    let sx = 0, sy = 0, n = 0;
    polygons.forEach((poly) => (poly[0] || []).forEach(([x, y]) => { sx += x; sy += y; n += 1; }));
    const centroid = n ? { x: sx / n, y: sy / n } : { x: 50, y: 50 };
    const paths = polygons.map((poly) => poly.map((ring) => `M ${ring.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`).join(" "));
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

  const startGame = () => {
    if (towns.length < 169) return;
    const indices = towns.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setOrder(indices.slice(0, roundsToPlay));
    setStarted(true);
    setRound(0);
    setGuess(null);
    setRevealed(false);
    setRoundScore(0);
    setTotalScore(0);
    setHistory([]);
  };

  const handleMapClick = (e) => {
    if (!currentTown || revealed || gameOver) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const clickedTown = findClickedTown(x, y, towns);
    const guessedPoint = clickedTown ? clickedTown.centroid : { x, y };
    const d = distance(guessedPoint, currentTown.centroid);
    const s = scoreFromDistance(d);

    setGuess({ x, y, clickedTownName: clickedTown?.name || null, scorePoint: guessedPoint });
    setRoundScore(s);
    setRevealed(true);
    setTotalScore((prev) => prev + s);
    setHistory((prev) => [...prev, { town: currentTown.name, guessed: clickedTown?.name || "(outside town)", score: s, dist: d }]);
  };

  const nextRound = () => {
    if (!revealed) return;
    setRound((r) => r + 1);
    setGuess(null);
    setRevealed(false);
    setRoundScore(0);
  };

  const progressPct = started ? (Math.min(round, roundsToPlay) / roundsToPlay) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-2xl flex items-center gap-2"><MapPin className="h-6 w-6" /> CT 169 Towns Challenge</CardTitle>
              <Button onClick={startGame} className="rounded-xl" disabled={mapState.loading || towns.length < 169}>
                {started ? <><RotateCcw className="mr-2 h-4 w-4" /> Restart</> : <><Play className="mr-2 h-4 w-4" /> Start Game</>}
              </Button>
            </div>
            <p className="text-sm text-slate-600">Game created by: Adam Osmond</p>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-lg px-3 py-1">Rounds: {started ? Math.min(round + (revealed ? 1 : 0), roundsToPlay) : 0}/{roundsToPlay}</Badge>
              <Badge variant="secondary" className="rounded-lg px-3 py-1">Score: {totalScore}</Badge>
              <Badge className="rounded-lg px-3 py-1 text-xs">{towns.length ? `Loaded ${towns.length} towns` : "Loading map"}</Badge>
              {currentTown && !gameOver && <Badge className="rounded-lg px-3 py-1 text-base">Find: {currentTown.name}</Badge>}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              {mapState.loading && <span className="inline-flex items-center gap-1 text-slate-600"><span className="animate-pulse">●</span> Loading real CT map...</span>}
              {!mapState.loading && !mapState.error && <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" /> Ready to play</span>}
              {mapState.error && <span className="inline-flex items-center gap-1 text-amber-700"><AlertCircle className="h-4 w-4" /> {mapState.error}</span>}
            </div>

            <Progress value={progressPct} className="mb-4" />

            <div className="relative rounded-2xl border bg-white p-2">
              <svg viewBox="0 0 100 100" className="w-full aspect-[1.55/1] cursor-crosshair rounded-xl" onClick={handleMapClick}>
                {Array.from({ length: 11 }).map((_, i) => (
                  <g key={i}>
                    <line x1={i * 10} y1={0} x2={i * 10} y2={100} stroke="#e2e8f0" strokeWidth="0.25" />
                    <line x1={0} y1={i * 10} x2={100} y2={i * 10} stroke="#e2e8f0" strokeWidth="0.25" />
                  </g>
                ))}

                {towns.map((t) => (
                  <g key={t.key}>
                    {t.paths.map((d, i) => {
                      const isCorrect = revealed && currentTown && t.key === currentTown.key;
                      const isClicked = revealed && guess?.clickedTownName && normTownName(guess.clickedTownName) === t.key;
                      return (
                        <path
                          key={i}
                          d={d}
                          fill={isCorrect ? "#dcfce7" : isClicked ? "#fee2e2" : "#f8fafc"}
                          stroke={isCorrect ? "#16a34a" : isClicked ? "#dc2626" : "#94a3b8"}
                          strokeWidth={isCorrect || isClicked ? 0.45 : 0.22}
                          fillRule="evenodd"
                        />
                      );
                    })}
                  </g>
                ))}

                {guess && (
                  <g>
                    <circle cx={guess.x} cy={guess.y} r={1.4} fill="#ef4444" />
                    <circle cx={guess.x} cy={guess.y} r={3} fill="none" stroke="#ef4444" strokeWidth="0.5" opacity={0.7} />
                  </g>
                )}

                {revealed && currentTown && guess && (
                  <g>
                    <line x1={guess.scorePoint.x} y1={guess.scorePoint.y} x2={currentTown.centroid.x} y2={currentTown.centroid.y} stroke="#f59e0b" strokeWidth="0.6" strokeDasharray="1.2 1.2" />
                    <circle cx={currentTown.centroid.x} cy={currentTown.centroid.y} r={1.6} fill="#22c55e" />
                    <circle cx={currentTown.centroid.x} cy={currentTown.centroid.y} r={3.2} fill="none" stroke="#22c55e" strokeWidth="0.5" opacity={0.7} />
                  </g>
                )}
              </svg>
              <div className="pointer-events-none absolute bottom-3 right-4 text-[11px] md:text-xs text-slate-500 bg-white/80 px-2 py-1 rounded-md border">
                Game created by: Adam Osmond
              </div>
            </div>

            {!started && (
              <div className="mt-4 rounded-xl border bg-slate-100 p-4 text-sm text-slate-700">
                {mapState.loading ? "Map is loading..." : mapState.error ? "Map failed to load. Try refreshing." : "Press Start Game to begin. The actual CT town map is loaded and ready."}
              </div>
            )}

            {started && !gameOver && (
              <div className="mt-4 rounded-xl border bg-slate-100 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  {!revealed ? (
                    <>Round {round + 1}: Click the map for <b>{currentTown?.name}</b>.</>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 mr-3"><Target className="h-4 w-4" /> Round score: <b>{roundScore}</b></span>
                      Distance: <b>{history[history.length - 1]?.dist?.toFixed(1)}</b>
                      <span className="ml-3">You clicked: <b>{history[history.length - 1]?.guessed}</b></span>
                    </>
                  )}
                </div>
                <Button onClick={nextRound} disabled={!revealed} className="rounded-xl">{round === roundsToPlay - 1 ? "Finish" : "Next Round"}</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader><CardTitle className="text-lg">Game Info</CardTitle></CardHeader>
            <CardContent className="text-sm text-slate-700 space-y-2">
              <p><b>Map:</b> Live CTDOT municipalities layer</p>
              <p><b>Town pool:</b> All 169 Connecticut towns</p>
              <p><b>Rounds per game:</b> {roundsToPlay}</p>
              <p><b>Scoring:</b> 0 to 100 per round based on distance</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader><CardTitle className="text-lg">Round History</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? <p className="text-sm text-slate-500">No rounds played yet.</p> : (
                <div className="max-h-72 overflow-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100"><tr><th className="px-3 py-2 text-left">Town</th><th className="px-3 py-2 text-left">You clicked</th><th className="px-3 py-2 text-right">Score</th></tr></thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={`${h.town}-${i}`} className="border-t">
                          <td className="px-3 py-2">{h.town}</td>
                          <td className="px-3 py-2">{h.guessed}</td>
                          <td className="px-3 py-2 text-right font-medium">{h.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {gameOver && (
            <Card className="rounded-2xl shadow-sm border-2">
              <CardHeader><CardTitle className="text-lg">Final Result</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-bold">{totalScore} / {roundsToPlay * 100}</div>
                <div className="text-slate-700">{rating(totalScore)}</div>
                <div className="text-sm text-slate-600">Try again for a new random set of towns.</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
