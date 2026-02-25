/* Backend-free sampler:
   - Fetch a page of recent matches
   - Pick random candidates
   - Validate constraints locally
   - Fetch match detail for seeds/timelines/vod
*/

const BASES = [
  "https://api.mcsrranked.com",
  "https://mcsrranked.com/api"
];

const els = {
  apiDot: document.getElementById("apiDot"),
  apiText: document.getElementById("apiText"),
  status: document.getElementById("status"),

  toggleFilters: document.getElementById("toggleFilters"),
  filters: document.getElementById("filters"),

  maxMinutes: document.getElementById("maxMinutes"),
  matchType: document.getElementById("matchType"),
  requireVod: document.getElementById("requireVod"),
  excludeForfeitDecay: document.getElementById("excludeForfeitDecay"),

  btnGetSeed: document.getElementById("btnGetSeed"),
  btnCompleted: document.getElementById("btnCompleted"),
  btnReset: document.getElementById("btnReset"),

  seedEmpty: document.getElementById("seedEmpty"),
  seedVals: document.getElementById("seedVals"),
  seedOverworld: document.getElementById("seedOverworld"),
  seedNether: document.getElementById("seedNether"),
  seedEnd: document.getElementById("seedEnd"),
  seedRng: document.getElementById("seedRng"),

  revealCard: document.getElementById("revealCard"),
  matchId: document.getElementById("matchId"),
  players: document.getElementById("players"),
  winTime: document.getElementById("winTime"),
  matchDate: document.getElementById("matchDate"),
  splitsTableBody: document.querySelector("#splitsTable tbody"),

  vodMeta: document.getElementById("vodMeta"),
  vodFrame: document.getElementById("vodFrame"),
};

let state = {
  baseUrl: null,
  chosenMatch: null,    // match detail object (kept hidden until Completed)
  chosenMatchId: null,
};

function setApiBadge(kind, text){
  els.apiDot.classList.remove("good","warn","bad");
  if(kind) els.apiDot.classList.add(kind);
  els.apiText.textContent = text;
}

function setStatus(msg){
  els.status.textContent = msg || "";
}

function msToClock(ms){
  if(ms == null || !Number.isFinite(ms)) return "—";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2,"0")}.${String(cs).padStart(2,"0")}`;
}

function epochToIso(sec){
  if(sec == null || !Number.isFinite(sec)) return "—";
  return new Date(sec * 1000).toISOString().replace("T"," ").replace("Z"," UTC");
}

function twitchTimeParam(seconds){
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}h${m}m${r}s`;
}

function parseTwitchVideoId(url){
  try{
    const u = new URL(url);
    if(!u.hostname.includes("twitch.tv")) return null;

    // examples:
    // https://www.twitch.tv/videos/1234567890
    // https://m.twitch.tv/videos/1234567890
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("videos");
    if(idx !== -1 && parts[idx+1]) return parts[idx+1];

    // If it is already an embed URL with ?video=v...
    if(u.searchParams.get("video")){
      const v = u.searchParams.get("video");
      return v.startsWith("v") ? v.slice(1) : v;
    }

    return null;
  }catch{
    return null;
  }
}

async function fetchJson(baseUrl, path){
  const url = `${baseUrl}${path}`;
  const r = await fetch(url, { headers: { "accept":"application/json" } });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

async function pickWorkingBase(){
  setApiBadge("warn","API: probing…");
  for(const b of BASES){
    try{
      // light probe: matches endpoint with minimum payload.
      // docs confirm both base endpoints exist. :contentReference[oaicite:4]{index=4}
      await fetchJson(b, "/matches?filter=2&count=1&page=1");
      setApiBadge("good",`API: ${new URL(b).host}`);
      return b;
    }catch{
      // continue
    }
  }
  setApiBadge("bad","API: unreachable");
  throw new Error("No working API base (CORS/network).");
}

function getFilters(){
  const maxMin = Number(els.maxMinutes.value);
  const maxMs = Math.max(1, maxMin) * 60 * 1000;

  const mt = els.matchType.value; // "2" or "any"
  const matchType = (mt === "any") ? null : Number(mt);

  return {
    maxMs,
    matchType,
    requireVod: els.requireVod.checked,
    excludeForfeitDecay: els.excludeForfeitDecay.checked,
  };
}

function matchPassesListLevel(m, f){
  // MatchInfo: forfeited/decayed, result.time, vod[] (url/startsAt). :contentReference[oaicite:5]{index=5}
  if(f.matchType != null && m.type !== f.matchType) return false;

  if(f.excludeForfeitDecay){
    if(m.forfeited) return false;
    if(m.decayed) return false;
  }

  const rt = m?.result?.time;
  if(!Number.isFinite(rt)) return false;
  if(rt > f.maxMs) return false;

  if(f.requireVod){
    if(!Array.isArray(m.vod) || m.vod.length < 1) return false;
    const ok = m.vod.some(v => typeof v?.url === "string" && v.url.length > 0);
    if(!ok) return false;
  }

  return true;
}

function extractSeeds(matchDetail){
  // The docs indicate seed fields may exist; at minimum match has a seed object,
  // and match detail includes advanced fields. :contentReference[oaicite:6]{index=6}
  // Try common shapes:
  // - matchDetail.seed.overworld / nether / theEnd / rng (from docs snippet) :contentReference[oaicite:7]{index=7}
  // - fallback to matchDetail.seed.id (non-real seed id) :contentReference[oaicite:8]{index=8}
  const s = matchDetail?.seed || null;

  const overworld = s?.overworld ?? null;
  const nether = s?.nether ?? null;
  const theEnd = s?.theEnd ?? null;
  const rng = s?.rng ?? null;

  const anyReal = [overworld, nether, theEnd, rng].some(v => typeof v === "string" && v.length);

  if(anyReal){
    return {
      overworld: overworld || "—",
      nether: nether || "—",
      end: theEnd || "—",
      rng: rng || "—",
    };
  }

  const fallback = (s?.id && typeof s.id === "string") ? s.id : "—";
  return { overworld: fallback, nether: "—", end: "—", rng: "—" };
}

async function sampleRandomMatch(){
  const f = getFilters();
  const base = state.baseUrl ?? (state.baseUrl = await pickWorkingBase());

  setStatus("Sampling…");
  els.btnGetSeed.disabled = true;
  els.btnCompleted.disabled = true;
  els.btnReset.disabled = true;

  // Strategy: sample up to N pages, pick random items each page, validate locally, then pull details.
  const COUNT = 50;   // keep requests low
  const PAGES_TO_TRY = 50;
  const CANDIDATES_PER_PAGE = 100;

  for(let page=1; page<=PAGES_TO_TRY; page++){
    let list;
    try{
      // /matches supports pagination; docs mention count 1..100 and cursor concept. :contentReference[oaicite:9]{index=9}
      list = await fetchJson(base, `/matches?filter=2&count=${COUNT}&page=${page}`);
    }catch(err){
      console.warn(`sampleRandomMatch: matches list fetch failed for page ${page}:`, err);
      // try next page or base already chosen; fail later
      continue;
    }

    const data = Array.isArray(list?.data) ? list.data : (Array.isArray(list) ? list : null);
    if(!data || data.length === 0) continue;

    // Shuffle indexes and test a subset
    const idxs = [...Array(data.length).keys()];
    for(let i=idxs.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [idxs[i],idxs[j]] = [idxs[j],idxs[i]];
    }

    const subset = idxs.slice(0, Math.min(CANDIDATES_PER_PAGE, idxs.length));
    for(const idx of subset){
      const m = data[idx];
      if(!matchPassesListLevel(m, f)) continue;

      // Pull detail for seeds/timelines/completions (advanced) :contentReference[oaicite:10]{index=10}
      try{
        const detail = await fetchJson(base, `/matches/${encodeURIComponent(m.id)}`);
        // Ensure it still matches constraints with detail present
        if(f.excludeForfeitDecay){
          if(detail.forfeited || detail.decayed) continue;
        }
        const rt = detail?.result?.time;
        if(!Number.isFinite(rt) || rt > f.maxMs) continue;
        if(f.requireVod){
          if(!Array.isArray(detail.vod) || detail.vod.length < 1) continue;
        }

        return detail;
      }catch(err){
        console.warn(`sampleRandomMatch: match detail fetch failed for id ${m?.id}:`, err);
        continue;
      }
    }
  }

  console.error("sampleRandomMatch: no matching seed found.", {
    filters: f,
    base,
    COUNT,
    PAGES_TO_TRY,
    CANDIDATES_PER_PAGE
  });

  throw new Error("No matching seed found in sampled window. Increase max time or disable VOD requirement.");
}

function showSeedOnly(matchDetail){
  const seeds = extractSeeds(matchDetail);

  els.seedEmpty.classList.add("hidden");
  els.seedVals.classList.remove("hidden");

  els.seedOverworld.textContent = seeds.overworld;
  els.seedNether.textContent = seeds.nether;
  els.seedEnd.textContent = seeds.end;
  els.seedRng.textContent = seeds.rng;

  // Do not show: players, time, date, rank, etc.
  els.revealCard.classList.add("hidden");

  els.btnCompleted.disabled = false;
  els.btnReset.disabled = false;
}

function renderReveal(matchDetail){
  els.revealCard.classList.remove("hidden");

  els.matchId.textContent = matchDetail?.id ?? "—";

  const p = Array.isArray(matchDetail?.players) ? matchDetail.players : [];
  const names = p.map(x => x?.nickname).filter(Boolean);
  els.players.textContent = names.length ? names.join(" vs ") : "—";

  els.winTime.textContent = msToClock(matchDetail?.result?.time);
  els.matchDate.textContent = epochToIso(matchDetail?.date);

  // Splits / timelines table
  const tbody = els.splitsTableBody;
  tbody.innerHTML = "";
  const timelines = Array.isArray(matchDetail?.timelines) ? matchDetail.timelines : [];
  timelines
    .slice()
    .sort((a,b) => (a?.time ?? 0) - (b?.time ?? 0))
    .forEach(tl => {
      const tr = document.createElement("tr");
      const uuid = tl?.uuid;

      const playerName =
        p.find(pp => pp?.uuid === uuid)?.nickname
        || (uuid ? uuid.slice(0,8) : "—");

      const type = tl?.type ?? "—";
      const time = msToClock(tl?.time);

      tr.innerHTML = `<td>${escapeHtml(playerName)}</td><td>${escapeHtml(type)}</td><td>${escapeHtml(time)}</td>`;
      tbody.appendChild(tr);
    });

  // VOD embed (pick first valid vod)
  const vods = Array.isArray(matchDetail?.vod) ? matchDetail.vod : [];
  const v = vods.find(x => typeof x?.url === "string" && x.url.length);
  if(!v){
    els.vodMeta.textContent = "No VOD on this match.";
    els.vodFrame.innerHTML = `<div class="vodEmpty">No VOD available for this match.</div>`;
    return;
  }

  const videoId = parseTwitchVideoId(v.url);
  const owner = p.find(pp => pp?.uuid === v.uuid)?.nickname || v.uuid?.slice(0,8) || "unknown";
  const matchEpoch = Number(matchDetail?.date);
  const vodStartEpoch = Number(v?.startsAt);

  // docs: startsAt is epoch seconds; match.date is epoch seconds. :contentReference[oaicite:11]{index=11}
  const offset = (Number.isFinite(matchEpoch) && Number.isFinite(vodStartEpoch))
    ? (matchEpoch - vodStartEpoch)
    : 0;

  const parent = location.hostname || "localhost";
  const time = twitchTimeParam(offset);

  els.vodMeta.textContent = `Owner: ${owner} • Offset: ${time} • Source: Twitch`;

  if(!videoId){
    // Still show link, but no embed
    els.vodFrame.innerHTML = `
      <div class="vodEmpty">
        Could not parse Twitch video id from URL. Open manually:
        <div style="margin-top:10px"><a href="${escapeAttr(v.url)}" target="_blank" rel="noreferrer">${escapeHtml(v.url)}</a></div>
      </div>`;
    return;
  }

  // Twitch embed iframe requires parent; video must have "v" prefix. :contentReference[oaicite:12]{index=12}
  const src = `https://player.twitch.tv/?video=v${encodeURIComponent(videoId)}&parent=${encodeURIComponent(parent)}&time=${encodeURIComponent(time)}&autoplay=false`;

  els.vodFrame.innerHTML = `
    <iframe
      src="${src}"
      height="420"
      width="100%"
      frameborder="0"
      scrolling="no"
      allowfullscreen="true">
    </iframe>
  `;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(s){ return escapeHtml(s); }

function resetAll(){
  state.chosenMatch = null;
  state.chosenMatchId = null;

  els.seedVals.classList.add("hidden");
  els.seedEmpty.classList.remove("hidden");
  els.seedOverworld.textContent = "—";
  els.seedNether.textContent = "—";
  els.seedEnd.textContent = "—";
  els.seedRng.textContent = "—";

  els.revealCard.classList.add("hidden");
  els.btnCompleted.disabled = true;
  els.btnReset.disabled = true;
  setStatus("");
}

async function onGetSeed(){
  resetAll();
  try{
    const detail = await sampleRandomMatch();
    state.chosenMatch = detail;
    state.chosenMatchId = detail?.id ?? null;

    showSeedOnly(detail);
    setStatus("Seed loaded. Run it, then press Completed.");
  }catch(e){
    console.error("onGetSeed error:", e, e?.stack);
    setStatus(String(e?.message || e));
  }finally{
    els.btnGetSeed.disabled = false;
  }
}

function onCompleted(){
  if(!state.chosenMatch) return;
  renderReveal(state.chosenMatch);
  setStatus("Revealed.");
}

function wireCopyButtons(){
  document.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const sel = btn.getAttribute("data-copy");
      const el = document.querySelector(sel);
      if(!el) return;
      const text = el.textContent.trim();
      try{
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 800);
      }catch{
        // no extra UI
      }
    });
  });
}

function wireUi(){
  els.btnGetSeed.addEventListener("click", onGetSeed);
  els.btnCompleted.addEventListener("click", onCompleted);
  els.btnReset.addEventListener("click", resetAll);

  els.toggleFilters.addEventListener("click", () => {
    const hidden = els.filters.classList.toggle("hidden");
    els.toggleFilters.textContent = hidden ? "Show" : "Hide";
  });

  wireCopyButtons();
}

(async function init(){
  wireUi();
  setApiBadge(null,"API: idle");
})();