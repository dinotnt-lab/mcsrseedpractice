import random
import time
import requests

BASES = [
    "https://api.mcsrranked.com",
    "https://mcsrranked.com/api",
]

DEFAULTS = {
    "max_minutes": 10,
    "match_type": 2,              # 2 = ranked; set None for any
    "require_vod": True,
    "exclude_forfeit_decay": True,
    "pages_to_try": 50,
    "count_per_page": 100,
    "candidates_per_page": 100,
    "timeout_s": 15,
}

def _get_working_base():
    for b in BASES:
        try:
            r = requests.get(f"{b}/matches?filter=2&count=1&page=1", timeout=DEFAULTS["timeout_s"])
            r.raise_for_status()
            return b
        except Exception:
            pass
    raise RuntimeError("No working API base (network/CORS not relevant in Python).")

def _passes_list_level(m, *, max_ms, match_type, require_vod, exclude_forfeit_decay):
    if match_type is not None and m.get("type") != match_type:
        return False

    if exclude_forfeit_decay:
        if m.get("forfeited") is True:
            return False
        if m.get("decayed") is True:
            return False

    rt = (m.get("result") or {}).get("time")
    if not isinstance(rt, (int, float)):
        return False
    if rt > max_ms:
        return False

    if require_vod:
        vods = m.get("vod")
        if not isinstance(vods, list) or len(vods) < 1:
            return False
        if not any(isinstance(v.get("url"), str) and v.get("url") for v in vods if isinstance(v, dict)):
            return False

    return True

def _extract_seeds(detail):
    # Try likely shapes; if missing, keep it blank.
    s = detail.get("seed") if isinstance(detail, dict) else None
    if not isinstance(s, dict):
        return {"overworld": None, "nether": None, "end": None, "rng": None, "fallback": None}

    overworld = s.get("overworld")
    nether = s.get("nether")
    the_end = s.get("theEnd") or s.get("end")
    rng = s.get("rng")

    fallback = s.get("id")  # not necessarily a world seed, but better than nothing

    def norm(x):
        return x if isinstance(x, str) and x.strip() else None

    return {
        "overworld": norm(overworld),
        "nether": norm(nether),
        "end": norm(the_end),
        "rng": norm(rng),
        "fallback": norm(fallback),
    }

def find_random_seed(
    *,
    max_minutes=DEFAULTS["max_minutes"],
    match_type=DEFAULTS["match_type"],
    require_vod=DEFAULTS["require_vod"],
    exclude_forfeit_decay=DEFAULTS["exclude_forfeit_decay"],
    pages_to_try=DEFAULTS["pages_to_try"],
    count_per_page=DEFAULTS["count_per_page"],
    candidates_per_page=DEFAULTS["candidates_per_page"],
):
    base = _get_working_base()
    max_ms = int(max_minutes * 60 * 1000)

    for page in range(1, pages_to_try + 1):
        r = requests.get(
            f"{base}/matches",
            params={"filter": 2, "count": count_per_page, "page": page},
            timeout=DEFAULTS["timeout_s"],
        )
        r.raise_for_status()
        payload = r.json()

        data = payload.get("data") if isinstance(payload, dict) else payload
        if not isinstance(data, list) or not data:
            continue

        random.shuffle(data)
        for m in data[: min(candidates_per_page, len(data))]:
            if not isinstance(m, dict):
                continue
            if not _passes_list_level(
                m,
                max_ms=max_ms,
                match_type=match_type,
                require_vod=require_vod,
                exclude_forfeit_decay=exclude_forfeit_decay,
            ):
                continue

            mid = m.get("id")
            if not mid:
                continue

            d = requests.get(f"{base}/matches/{mid}", timeout=DEFAULTS["timeout_s"])
            d.raise_for_status()
            detail = d.json()
            if not isinstance(detail, dict):
                continue

            # Re-check at detail level (sometimes list payload differs)
            if exclude_forfeit_decay and (detail.get("forfeited") or detail.get("decayed")):
                continue
            rt = (detail.get("result") or {}).get("time")
            if not isinstance(rt, (int, float)) or rt > max_ms:
                continue
            if require_vod:
                vods = detail.get("vod")
                if not isinstance(vods, list) or not vods:
                    continue
                if not any(isinstance(v.get("url"), str) and v.get("url") for v in vods if isinstance(v, dict)):
                    continue

            seeds = _extract_seeds(detail)
            return {
                "base": base,
                "match_id": mid,     # keep for your testing; don’t print if you want zero spoilers
                "seeds": seeds,
            }

    raise RuntimeError("No matching match found in sampled pages. Loosen filters or increase pages_to_try.")

if __name__ == "__main__":
    out = find_random_seed()

    # Print ONLY seed info (no runner/time/rank).
    s = out["seeds"]
    print("Overworld:", s["overworld"] or "—")
    print("Nether:   ", s["nether"] or "—")
    print("End:      ", s["end"] or "—")
    print("RNG:      ", s["rng"] or "—")
    if not any([s["overworld"], s["nether"], s["end"], s["rng"]]):
        print("Fallback: ", s["fallback"] or "—")