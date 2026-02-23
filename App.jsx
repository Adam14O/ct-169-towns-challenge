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
    const hit =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
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
  features.forEach((f) =>
    flattenCoords(f.geometry).forEach((poly) =>
      poly.forEach((ring) =>
        ring.forEach(([x, y]) => {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        })
      )
    )
  );
  return { minX, minY, maxX, maxY };
}

function normalizeFeaturesToSvg(geojson) {
  const features = (geojson?.features || []).filter((f) =>
    ["Polygon", "MultiPolygon"].includes(f?.geometry?.type)
  );
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
    const rawName =
      f?.properties?.Municipality ||
      f?.properties?.MUNICIPALITY ||
      f?.properties?.NAME ||
      f?.properties?.name ||
      "";

    const polygons = flattenCoords(f.geometry).map((poly) =>
      poly.map((ring) => ring.map(project))
    );

    let sx = 0, sy = 0, n = 0;
    polygons.forEach((poly) =>
      (poly[0] || []).forEach(([x, y]) => {
        sx += x;
        sy += y;
        n += 1;
      })
    );

    const centroid = n ? { x: sx / n, y: sy / n } : { x: 50, y: 50 };

    const paths = polygons.map((poly) =>
      poly
        .map(
          (ring) =>
            `M ${ring.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`
        )
        .join(" ")
    );

    return {
      id: idx + 1,
      name: String(rawName),
      key: normTownName(rawName),
      centroid,
      polygons,
      paths
    };
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
  const mapWrapRef = useRef(null);
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

  const currentTown =
    started && order.length > 0 && round < roundsToPlay ? towns[order[round]] : null;
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

    setGuess({
      x,
      y,
      clickedTownName: clickedTown?.name || null,
      scorePoint: guessedPoint
    });
    setRoundScore(s);
    setRevealed(true);
    setTotalScore((prev) => prev + s);
    setHistory((prev) => [
      ...prev,
      {
        town: currentTown.name,
        guessed: clickedTown?.name || "(outside town)",
        score: s,
        dist: d
      }
    ]);
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
    <div className="min-h-screen bg-gray-100 p-2 sm:p-4">
      {/* ── Constrain max width so it doesn't balloon on wide monitors ── */}
      <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-3">

        {/* ── LEFT COLUMN: main game card ── */}
        <div className="flex-1 min-w-0">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg sm:text-xl">CT 169 Towns Challenge</CardTitle>
                <div>
                  {started ? (
                    <Button size="sm" variant="outline" onClick={startGame}>
                      <RotateCcw className="w-4 h-4 mr-1" /> Restart
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={startGame}
                      disabled={mapState.loading || !!mapState.error || towns.length < 169}
                    >
                      <Play className="w-4 h-4 mr-1" /> Start Game
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Game created by: Adam Osmond</p>
            </CardHeader>

            <CardContent className="space-y-2 pb-3">
              {/* Stats row */}
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">
                  Rounds: {started ? Math.min(round + (revealed ? 1 : 0), roundsToPlay) : 0}/{roundsToPlay}
                </Badge>
                <Badge variant="secondary">Score: {totalScore}</Badge>
                <Badge variant={towns.length >= 169 ? "default" : "outline"}>
                  {towns.length ? `Loaded ${towns.length} towns` : "Loading map"}
                </Badge>
                {currentTown && !gameOver && (
                  <Badge className="bg-blue-600 text-white">
                    Find: {currentTown.name}
                  </Badge>
                )}
              </div>

              {/* Progress bar */}
              <Progress value={progressPct} className="h-1.5" />

              {/* Status line */}
              <div className="text-xs">
                {mapState.loading && (
                  <span className="text-yellow-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Loading real CT map...
                  </span>
                )}
                {!mapState.loading && !mapState.error && (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Ready to play
                  </span>
                )}
                {mapState.error && (
                  <span className="text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {mapState.error}
                  </span>
                )}
              </div>

              {/* ── MAP SVG ──
                  On mobile: full width, natural aspect ratio.
                  On desktop: capped height so it doesn't overflow the viewport.
              */}
              <div
                ref={mapWrapRef}
                className="relative w-full"
                style={{ aspectRatio: "1.7 / 1", maxHeight: "min(55vh, 420px)" }}
              >
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="xMidYMid meet"
                  className="absolute inset-0 w-full h-full rounded border border-gray-200 bg-blue-50 cursor-crosshair"
                  onClick={handleMapClick}
                >
                  {/* Grid lines */}
                  {Array.from({ length: 11 }).map((_, i) => (
                    <g key={i}>
                      <line x1={i * 10} y1={0} x2={i * 10} y2={100} stroke="#dbeafe" strokeWidth="0.3" />
                      <line x1={0} y1={i * 10} x2={100} y2={i * 10} stroke="#dbeafe" strokeWidth="0.3" />
                    </g>
                  ))}

                  {/* Town polygons */}
                  {towns.map((t) => (
                    <g key={t.id}>
                      {t.paths.map((d, i) => {
                        const isCorrect = revealed && currentTown && t.key === currentTown.key;
                        const isClicked =
                          revealed &&
                          guess?.clickedTownName &&
                          normTownName(guess.clickedTownName) === t.key;

                        return (
                          <path
                            key={i}
                            d={d}
                            fill={
                              isCorrect
                                ? "#22c55e"
                                : isClicked
                                ? "#ef4444"
                                : "#bfdbfe"
                            }
                            stroke="#1e40af"
                            strokeWidth="0.3"
                            opacity={0.85}
                          />
                        );
                      })}
                    </g>
                  ))}

                  {/* Guess marker */}
                  {guess && (
                    <g>
                      <circle cx={guess.scorePoint.x} cy={guess.scorePoint.y} r={1.2} fill="#ef4444" />
                      <circle cx={guess.scorePoint.x} cy={guess.scorePoint.y} r={2.2} fill="none" stroke="#ef4444" strokeWidth="0.4" />
                    </g>
                  )}

                  {/* Correct town marker + line */}
                  {revealed && currentTown && guess && (
                    <g>
                      <line
                        x1={guess.scorePoint.x}
                        y1={guess.scorePoint.y}
                        x2={currentTown.centroid.x}
                        y2={currentTown.centroid.y}
                        stroke="#1e40af"
                        strokeWidth="0.5"
                        strokeDasharray="1.5 1"
                      />
                      <circle cx={currentTown.centroid.x} cy={currentTown.centroid.y} r={1.2} fill="#1e40af" />
                    </g>
                  )}
                </svg>

                <p className="absolute bottom-1 right-2 text-gray-400 text-[10px] pointer-events-none select-none">
                  Game created by: Adam Osmond
                </p>
              </div>

              {/* Instruction / result panel */}
              {!started && (
                <p className="text-sm text-gray-500 text-center py-1">
                  {mapState.loading
                    ? "Map is loading..."
                    : mapState.error
                    ? "Map failed to load. Try refreshing."
                    : "Press Start Game to begin. The actual CT town map is loaded and ready."}
                </p>
              )}

              {started && !gameOver && (
                <div className="space-y-1">
                  <div className="text-sm">
                    {!revealed ? (
                      <p className="font-medium text-blue-700">
                        Round {round + 1}: Click the map for <strong>{currentTown?.name}</strong>.
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        <p className="font-semibold text-green-700 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Round score: {roundScore}
                        </p>
                        <p className="text-xs text-gray-500">
                          Distance: {history[history.length - 1]?.dist?.toFixed(1)} &nbsp;|&nbsp;
                          You clicked: {history[history.length - 1]?.guessed}
                        </p>
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    disabled={!revealed}
                    onClick={nextRound}
                    className="w-full"
                  >
                    {round === roundsToPlay - 1 ? "Finish" : "Next Town"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT COLUMN: info + history ── */}
        <div className="w-full lg:w-60 xl:w-72 flex flex-col gap-3 shrink-0">

          {/* Game Info */}
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm">Game Info</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 text-xs space-y-1 text-gray-600">
              <p>Rounds per game: {roundsToPlay}</p>
              <p>Scoring: 0 to 100 per round based on distance</p>
            </CardContent>
          </Card>

          {/* Round History */}
          <Card className="flex-1 overflow-hidden">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm">Round History</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {history.length === 0 ? (
                <p className="text-xs text-gray-400">No rounds played yet.</p>
              ) : (
                <div className="overflow-auto max-h-48 lg:max-h-72">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="pb-1 font-semibold">Town</th>
                        <th className="pb-1 font-semibold">You clicked</th>
                        <th className="pb-1 font-semibold text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-0.5">{h.town}</td>
                          <td className="py-0.5">{h.guessed}</td>
                          <td className="py-0.5 text-right font-medium">{h.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Final Result */}
          {gameOver && (
            <Card className="border-2 border-blue-400">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm">Final Result</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 text-center space-y-1">
                <p className="text-3xl font-bold text-blue-700">
                  {totalScore} <span className="text-base font-normal text-gray-500">/ {roundsToPlay * 100}</span>
                </p>
                <p className="font-semibold text-sm">{rating(totalScore)}</p>
                <p className="text-xs text-gray-500">Try again for a new random set of towns.</p>
                <Button size="sm" className="w-full mt-1" onClick={startGame}>
                  <RotateCcw className="w-3 h-3 mr-1" /> Play Again
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}
