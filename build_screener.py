"""
CEDEAR Screener for BYMA — Build script
Reads from data/screener_raw.json (produced by the fetch step) and generates cedear_screener.html
"""

import json
import math
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Sector fallback map (from knowledge, as stable reference)
# ---------------------------------------------------------------------------

SECTOR_MAP = {
    "AAPL": ("Technology", "Consumer Electronics"),
    "MSFT": ("Technology", "Software—Infrastructure"),
    "GOOGL": ("Communication Services", "Internet Content & Information"),
    "AMZN": ("Consumer Cyclical", "Internet Retail"),
    "META": ("Communication Services", "Internet Content & Information"),
    "NVDA": ("Technology", "Semiconductors"),
    "TSLA": ("Consumer Cyclical", "Auto Manufacturers"),
    "NFLX": ("Communication Services", "Entertainment"),
    "AMD": ("Technology", "Semiconductors"),
    "INTC": ("Technology", "Semiconductors"),
    "QCOM": ("Technology", "Semiconductors"),
    "AVGO": ("Technology", "Semiconductors"),
    "TSM": ("Technology", "Semiconductors"),
    "MU": ("Technology", "Semiconductors"),
    "ARM": ("Technology", "Semiconductors"),
    "MRVL": ("Technology", "Semiconductors"),
    "CRM": ("Technology", "Software—Application"),
    "ORCL": ("Technology", "Software—Infrastructure"),
    "SAP": ("Technology", "Software—Application"),
    "NOW": ("Technology", "Software—Application"),
    "ADBE": ("Technology", "Software—Application"),
    "SNOW": ("Technology", "Software—Application"),
    "PLTR": ("Technology", "Software—Application"),
    "JPM": ("Financial Services", "Banks—Diversified"),
    "BAC": ("Financial Services", "Banks—Diversified"),
    "GS": ("Financial Services", "Capital Markets"),
    "MS": ("Financial Services", "Capital Markets"),
    "V": ("Financial Services", "Credit Services"),
    "MA": ("Financial Services", "Credit Services"),
    "PYPL": ("Financial Services", "Credit Services"),
    "XOM": ("Energy", "Oil & Gas Integrated"),
    "CVX": ("Energy", "Oil & Gas Integrated"),
    "CEG": ("Utilities", "Utilities—Regulated Electric"),
    "VST": ("Utilities", "Utilities—Independent Power"),
    "NEE": ("Utilities", "Utilities—Regulated Electric"),
    "SLB": ("Energy", "Oil & Gas Equipment & Services"),
    "LLY": ("Healthcare", "Drug Manufacturers—General"),
    "JNJ": ("Healthcare", "Drug Manufacturers—General"),
    "PFE": ("Healthcare", "Drug Manufacturers—General"),
    "MRNA": ("Healthcare", "Biotechnology"),
    "ABBV": ("Healthcare", "Drug Manufacturers—General"),
    "BA": ("Industrials", "Aerospace & Defense"),
    "CAT": ("Industrials", "Farm & Heavy Construction Machinery"),
    "DE": ("Industrials", "Farm & Heavy Construction Machinery"),
    "HON": ("Industrials", "Conglomerates"),
    "GE": ("Industrials", "Aerospace & Defense"),
    "MELI": ("Consumer Cyclical", "Internet Retail"),
    "SE": ("Consumer Cyclical", "Internet Retail"),
    "BABA": ("Consumer Cyclical", "Internet Retail"),
    "PDD": ("Consumer Cyclical", "Internet Retail"),
    "SHOP": ("Technology", "Software—Application"),
    "COIN": ("Financial Services", "Capital Markets"),
    "SOFI": ("Financial Services", "Banks—Regional"),
    "DIS": ("Communication Services", "Entertainment"),
    "SPOT": ("Communication Services", "Entertainment"),
    "UBER": ("Technology", "Software—Application"),
    "ABNB": ("Consumer Cyclical", "Travel Services"),
    "BKNG": ("Consumer Cyclical", "Travel Services"),
    "NKE": ("Consumer Cyclical", "Footwear & Accessories"),
    "SBUX": ("Consumer Cyclical", "Restaurants"),
    "MCD": ("Consumer Cyclical", "Restaurants"),
    "IBM": ("Technology", "Information Technology Services"),
    "CSCO": ("Technology", "Computer Hardware"),
    "ASML": ("Technology", "Semiconductor Equipment & Materials"),
    "AMAT": ("Technology", "Semiconductor Equipment & Materials"),
    "KLAC": ("Technology", "Semiconductor Equipment & Materials"),
    "WMT": ("Consumer Defensive", "Discount Stores"),
    "COST": ("Consumer Defensive", "Discount Stores"),
    "TSEM": ("Technology", "Semiconductors"),
    "COHR": ("Technology", "Electronic Components"),
    "RGTI": ("Technology", "Computer Hardware"),
    "PATH": ("Technology", "Software—Application"),
    "TEAM": ("Technology", "Software—Application"),
    "DDOG": ("Technology", "Software—Application"),
    "SMCI": ("Technology", "Computer Hardware"),
    "DELL": ("Technology", "Computer Hardware"),
    "BRK-B": ("Financial Services", "Insurance—Diversified"),
}

NAME_MAP = {
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon.com Inc.",
    "META": "Meta Platforms Inc.",
    "NVDA": "NVIDIA Corporation",
    "TSLA": "Tesla Inc.",
    "NFLX": "Netflix Inc.",
    "AMD": "Advanced Micro Devices",
    "INTC": "Intel Corporation",
    "QCOM": "QUALCOMM Inc.",
    "AVGO": "Broadcom Inc.",
    "TSM": "Taiwan Semiconductor",
    "MU": "Micron Technology",
    "ARM": "Arm Holdings PLC",
    "MRVL": "Marvell Technology",
    "CRM": "Salesforce Inc.",
    "ORCL": "Oracle Corporation",
    "SAP": "SAP SE",
    "NOW": "ServiceNow Inc.",
    "ADBE": "Adobe Inc.",
    "SNOW": "Snowflake Inc.",
    "PLTR": "Palantir Technologies",
    "JPM": "JPMorgan Chase & Co.",
    "BAC": "Bank of America Corp.",
    "GS": "The Goldman Sachs Group",
    "MS": "Morgan Stanley",
    "V": "Visa Inc.",
    "MA": "Mastercard Inc.",
    "PYPL": "PayPal Holdings Inc.",
    "XOM": "Exxon Mobil Corporation",
    "CVX": "Chevron Corporation",
    "CEG": "Constellation Energy",
    "VST": "Vistra Corp.",
    "NEE": "NextEra Energy Inc.",
    "SLB": "SLB (Schlumberger)",
    "LLY": "Eli Lilly and Company",
    "JNJ": "Johnson & Johnson",
    "PFE": "Pfizer Inc.",
    "MRNA": "Moderna Inc.",
    "ABBV": "AbbVie Inc.",
    "BA": "The Boeing Company",
    "CAT": "Caterpillar Inc.",
    "DE": "Deere & Company",
    "HON": "Honeywell International",
    "GE": "GE Aerospace",
    "MELI": "MercadoLibre Inc.",
    "SE": "Sea Limited",
    "BABA": "Alibaba Group",
    "PDD": "PDD Holdings",
    "SHOP": "Shopify Inc.",
    "COIN": "Coinbase Global Inc.",
    "SOFI": "SoFi Technologies Inc.",
    "DIS": "The Walt Disney Company",
    "SPOT": "Spotify Technology",
    "UBER": "Uber Technologies Inc.",
    "ABNB": "Airbnb Inc.",
    "BKNG": "Booking Holdings Inc.",
    "NKE": "Nike Inc.",
    "SBUX": "Starbucks Corporation",
    "MCD": "McDonald's Corporation",
    "IBM": "International Business Machines",
    "CSCO": "Cisco Systems Inc.",
    "ASML": "ASML Holding N.V.",
    "AMAT": "Applied Materials Inc.",
    "KLAC": "KLA Corporation",
    "WMT": "Walmart Inc.",
    "COST": "Costco Wholesale Corp.",
    "TSEM": "Tower Semiconductor",
    "COHR": "Coherent Corp.",
    "RGTI": "Rigetti Computing Inc.",
    "PATH": "UiPath Inc.",
    "TEAM": "Atlassian Corporation",
    "DDOG": "Datadog Inc.",
    "SMCI": "Super Micro Computer",
    "DELL": "Dell Technologies",
    "BRK-B": "Berkshire Hathaway Inc.",
}

TICKERS = list(SECTOR_MAP.keys())


# ---------------------------------------------------------------------------
# Scoring functions
# ---------------------------------------------------------------------------

def safe_float(val):
    try:
        v = float(val)
        return None if (math.isnan(v) or math.isinf(v)) else v
    except (TypeError, ValueError):
        return None


def score_peg(peg):
    if peg is None: return None
    if peg <= 0: return None
    if peg <= 0.5: return 100
    if peg <= 1.0: return 90
    if peg <= 1.5: return 75
    if peg <= 2.0: return 55
    if peg <= 3.0: return 35
    if peg <= 5.0: return 15
    return 5


def score_upside(upside_pct):
    if upside_pct is None: return None
    if upside_pct >= 50: return 100
    if upside_pct >= 30: return 85
    if upside_pct >= 20: return 70
    if upside_pct >= 10: return 55
    if upside_pct >= 0:  return 40
    if upside_pct >= -10: return 25
    return 10


def score_forward_pe_vs_sector(fpe, sector_median):
    if fpe is None or sector_median is None: return None
    if fpe <= 0 or sector_median <= 0: return None
    r = fpe / sector_median
    if r <= 0.5: return 100
    if r <= 0.7: return 90
    if r <= 0.85: return 75
    if r <= 1.0: return 60
    if r <= 1.15: return 45
    if r <= 1.3: return 30
    if r <= 1.5: return 15
    return 5


def score_eps_revision(eps_growth):
    if eps_growth is None: return None
    if eps_growth >= 0.20: return 100
    if eps_growth >= 0.10: return 85
    if eps_growth >= 0.05: return 70
    if eps_growth >= 0:    return 55
    if eps_growth >= -0.05: return 40
    if eps_growth >= -0.15: return 25
    return 10


def score_52w_position(pos):
    if pos is None: return None
    p = pos * 100
    if p < 5:   return 20
    if p < 20:  return 50
    if p <= 60: return 100
    if p <= 75: return 75
    if p <= 90: return 50
    return 25


def eps_rev_label(growth):
    if growth is None: return "—"
    if growth >= 0.05: return "↑"
    if growth <= -0.05: return "↓"
    return "→"


def compute_score(s_peg, s_upside, s_fpe, s_eps, s_52w):
    weights = [(0.30, s_peg), (0.25, s_upside), (0.20, s_fpe), (0.15, s_eps), (0.10, s_52w)]
    total_w = sum(w for w, s in weights if s is not None)
    if total_w == 0:
        return None
    raw = sum(w * s for w, s in weights if s is not None) / total_w
    return round(raw)


# ---------------------------------------------------------------------------
# Build dataset
# ---------------------------------------------------------------------------

def build_rows(raw):
    quotes = raw.get("quotes", {})
    targets = raw.get("targets", {})
    profiles = raw.get("profiles", {})
    estimates = raw.get("estimates", {})
    eps_growth_map = raw.get("epsGrowth", {})

    rows = []
    for sym in TICKERS:
        q = quotes.get(sym, {})
        t = targets.get(sym, {})
        p = profiles.get(sym, {})
        ests = estimates.get(sym, [])

        # --- Price ---
        price = safe_float(q.get("price")) or safe_float(q.get("previousClose"))

        # --- 52w range ---
        high52 = safe_float(q.get("yearHigh"))
        low52  = safe_float(q.get("yearLow"))
        pos_52w = None
        if price and high52 and low52 and (high52 - low52) > 0:
            pos_52w = (price - low52) / (high52 - low52)

        # --- Analyst target → upside ---
        target_price = safe_float(t.get("targetConsensus")) or safe_float(t.get("targetMedian"))
        upside = None
        if price and target_price and price > 0:
            upside = (target_price - price) / price

        # --- Trailing PE (from quote) ---
        trailing_pe = safe_float(q.get("pe"))

        # --- Forward PE: price / next-year EPS estimate ---
        forward_pe = None
        future_ests = sorted(
            [e for e in ests if e.get("date", "") > "2026-06-01" and safe_float(e.get("epsAvg"))],
            key=lambda x: x["date"]
        )
        if price and future_ests:
            next_eps = safe_float(future_ests[0].get("epsAvg"))
            if next_eps and next_eps > 0:
                forward_pe = price / next_eps

        # --- PEG: forward PE / EPS growth rate ---
        peg = None
        if forward_pe and len(future_ests) >= 2:
            eps_now = safe_float(future_ests[0].get("epsAvg"))
            eps_nxt = safe_float(future_ests[1].get("epsAvg"))
            if eps_now and eps_nxt and eps_now > 0:
                growth_rate = (eps_nxt - eps_now) / eps_now
                if growth_rate > 0:
                    peg = forward_pe / (growth_rate * 100)

        # Fallback PEG from trailing PE if available
        if peg is None and trailing_pe:
            eps_growth = safe_float(eps_growth_map.get(sym))
            if eps_growth and eps_growth > 0:
                peg = trailing_pe / (eps_growth * 100)

        # --- EPS revision proxy ---
        eps_growth = safe_float(eps_growth_map.get(sym))

        # Compute from estimates if available (QoQ change in epsAvg)
        if eps_growth is None and len(future_ests) >= 2:
            e1 = safe_float(future_ests[0].get("epsAvg"))
            e2 = safe_float(future_ests[1].get("epsAvg"))
            if e1 and e2 and e2 > 0:
                eps_growth = (e1 - e2) / abs(e2)

        # --- Sector ---
        sector_from_profile = p.get("sector") or ""
        sector_tup = SECTOR_MAP.get(sym, ("Unknown", "Unknown"))
        sector = sector_from_profile if sector_from_profile else sector_tup[0]

        # --- Name ---
        name = (p.get("companyName") or q.get("name") or NAME_MAP.get(sym, sym))

        rows.append({
            "ticker": sym,
            "name": name,
            "sector": sector,
            "price": price,
            "target_price": target_price,
            "upside": upside,
            "trailing_pe": trailing_pe,
            "forward_pe": forward_pe,
            "peg": peg,
            "pos_52w": pos_52w,
            "low52": low52,
            "high52": high52,
            "eps_growth": eps_growth,
        })

    return rows


def compute_scores(rows):
    import statistics
    sector_fpes = {}
    for r in rows:
        fpe = r["forward_pe"] or r["trailing_pe"]
        if r["sector"] and fpe:
            sector_fpes.setdefault(r["sector"], []).append(fpe)
    sector_median = {s: statistics.median(vals) for s, vals in sector_fpes.items() if vals}

    scored = []
    for r in rows:
        fpe = r["forward_pe"] or r["trailing_pe"]
        sm = sector_median.get(r["sector"])

        s_peg    = score_peg(r["peg"])
        s_up     = score_upside(r["upside"] * 100 if r["upside"] is not None else None)
        s_fpe    = score_forward_pe_vs_sector(fpe, sm)
        s_eps    = score_eps_revision(r["eps_growth"])
        s_52w    = score_52w_position(r["pos_52w"])
        score    = compute_score(s_peg, s_up, s_fpe, s_eps, s_52w)

        scored.append({**r,
            "score": score,
            "s_peg": s_peg,
            "s_upside": s_up,
            "s_fpe": s_fpe,
            "s_eps": s_eps,
            "s_52w": s_52w,
            "sector_median_fpe": sm,
            "eps_label": eps_rev_label(r["eps_growth"]),
            "use_pe": fpe,
        })

    scored.sort(key=lambda x: (x["score"] is None, -(x["score"] or 0)))
    for i, r in enumerate(scored, 1):
        r["rank"] = i
    return scored


# ---------------------------------------------------------------------------
# HTML helpers
# ---------------------------------------------------------------------------

def fmt_price(v): return f"${v:,.2f}" if v else "—"
def fmt_pct(v):
    if v is None: return "—"
    s = "+" if v >= 0 else ""
    return f"{s}{v:.1f}%"
def fmt_pe(v): return f"{v:.1f}x" if v else "—"
def fmt_peg(v): return f"{v:.2f}" if v else "—"

def score_css(s):
    if s is None: return "sna"
    if s >= 70: return "sgr"
    if s >= 50: return "syl"
    return "srd"

def bar_52w(pos_52w):
    if pos_52w is None:
        return '<span class="na">—</span>'
    pct = min(max(pos_52w * 100, 0), 100)
    color = "#00d4aa"
    if pct > 90 or pct < 5: color = "#ff4d6d"
    elif pct > 75: color = "#ffc300"
    return (f'<div class="bw"><div class="bf" style="width:{pct:.1f}%;background:{color}"></div>'
            f'<span class="bl">{pct:.0f}%</span></div>')

def upside_css(v):
    if v is None: return "na"
    if v > 5: return "up"
    if v < -5: return "dn"
    return "nu"

def eps_html(lbl):
    cls = {"↑": "eu", "↓": "ed", "→": "ef"}.get(lbl, "na")
    return f'<span class="{cls}">{lbl}</span>'


def build_json_payload(scored):
    out = []
    for r in scored:
        out.append({
            "rank": r["rank"],
            "score": r["score"],
            "sc": score_css(r["score"]),
            "ticker": r["ticker"],
            "name": r["name"],
            "sector": r["sector"],
            "price": fmt_price(r["price"]),
            "upside": fmt_pct(r["upside"] * 100 if r["upside"] is not None else None),
            "uv": round(r["upside"] * 100, 1) if r["upside"] is not None else None,
            "peg": fmt_peg(r["peg"]),
            "fpe": fmt_pe(r["use_pe"]),
            "fwd": fmt_pe(r["forward_pe"]),
            "smfpe": fmt_pe(r["sector_median_fpe"]),
            "eps": r["eps_label"],
            "p52": round(r["pos_52w"] * 100, 1) if r["pos_52w"] is not None else None,
        })
    return json.dumps(out, ensure_ascii=False)


# ---------------------------------------------------------------------------
# HTML template
# ---------------------------------------------------------------------------

def generate_html(scored, timestamp):
    data_json = build_json_payload(scored)
    sectors = sorted(set(r["sector"] for r in scored if r["sector"] and r["sector"] != "Unknown"))
    sector_opts = "\n".join(f'<option value="{s}">{s}</option>' for s in sectors)
    total = len(scored)

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>CEDEAR Screener — BYMA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{
  --bg:#0a0c0f;--sf:#111418;--s2:#1a1f27;--bd:#252c38;
  --tx:#e8ecf0;--mt:#6b7a8d;--ac:#00d4aa;--a2:#0095ff;
  --gr:#00d4aa;--yl:#ffc300;--rd:#ff4d6d;
}}
body{{background:var(--bg);color:var(--tx);font-family:'JetBrains Mono',monospace;font-size:13px;min-height:100vh}}

/* Header */
.hdr{{padding:28px 36px 20px;border-bottom:1px solid var(--bd);display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap}}
.htitle{{font-family:'Syne',sans-serif;font-size:26px;font-weight:800;letter-spacing:-.5px}}
.htitle span{{color:var(--ac)}}
.hsub{{color:var(--mt);font-size:11px;margin-top:3px}}
.hts{{color:var(--mt);font-size:11px;margin-left:auto}}

/* Controls */
.ctrl{{padding:16px 36px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--bd);background:var(--sf)}}
.ctrl input,.ctrl select{{background:var(--bg);border:1px solid var(--bd);color:var(--tx);padding:7px 12px;border-radius:7px;font-family:'JetBrains Mono',monospace;font-size:12px;outline:none;transition:border .15s}}
.ctrl input:focus,.ctrl select:focus{{border-color:var(--ac)}}
.ctrl input{{width:190px}}
.ctrl select{{cursor:pointer}}
.ctrl label{{color:var(--mt);font-size:11px;display:flex;flex-direction:column;gap:3px}}
.cnt{{margin-left:auto;color:var(--mt);font-size:11px}}.cnt span{{color:var(--ac);font-weight:600}}

/* Legend */
.leg{{padding:12px 36px 0;display:flex;gap:18px;flex-wrap:wrap;font-size:10px;color:var(--mt)}}
.li{{display:flex;align-items:center;gap:5px}}
.ld{{width:8px;height:8px;border-radius:50%}}
.lw{{margin-left:16px}}

/* Table */
.tw{{padding:18px 36px 60px;overflow-x:auto}}
table{{width:100%;border-collapse:collapse;min-width:1060px}}
thead tr{{border-bottom:2px solid var(--bd)}}
th{{font-family:'Syne',sans-serif;font-size:10px;font-weight:600;color:var(--mt);text-transform:uppercase;letter-spacing:.8px;padding:9px 12px;text-align:left;cursor:pointer;user-select:none;white-space:nowrap}}
th:hover{{color:var(--tx)}}
th .si{{margin-left:3px;opacity:.4}}
th.sa .si::after{{content:'▲';opacity:1}}
th.sd .si::after{{content:'▼';opacity:1}}
th:not(.sa):not(.sd) .si::after{{content:'⇅'}}
tbody tr{{border-bottom:1px solid var(--bd);transition:background .12s}}
tbody tr:hover{{background:var(--s2)}}
td{{padding:12px 12px;vertical-align:middle;white-space:nowrap}}
.rk{{color:var(--mt);font-size:11px;width:32px;text-align:center}}

/* Score pill */
.sp{{display:inline-flex;align-items:center;justify-content:center;width:44px;height:24px;border-radius:12px;font-family:'Syne',sans-serif;font-weight:700;font-size:13px}}
.sgr{{background:rgba(0,212,170,.14);color:var(--gr)}}
.syl{{background:rgba(255,195,0,.14);color:var(--yl)}}
.srd{{background:rgba(255,77,109,.14);color:var(--rd)}}
.sna{{background:var(--s2);color:var(--mt);font-size:10px}}

/* Ticker cell */
.tc .sym{{font-family:'Syne',sans-serif;font-weight:700;font-size:13px;color:var(--ac)}}
.tc .cn{{color:var(--mt);font-size:10px;margin-top:2px;max-width:155px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}

/* Sector badge */
.sb{{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;background:var(--s2);color:var(--mt);border:1px solid var(--bd);max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}

/* Upside */
.up{{color:var(--gr)}}.dn{{color:var(--rd)}}.nu{{color:var(--mt)}}

/* EPS arrows */
.eu{{color:var(--gr);font-size:15px}}.ed{{color:var(--rd);font-size:15px}}.ef{{color:var(--mt);font-size:15px}}

/* 52w bar */
.bw{{position:relative;width:85px;height:5px;background:var(--s2);border-radius:3px}}
.bf{{height:100%;border-radius:3px}}
.bl{{position:absolute;top:-2px;right:-32px;font-size:10px;color:var(--mt)}}

/* Misc */
.na{{color:var(--mt)}}
.pr{{font-weight:500}}
</style>
</head>
<body>

<div class="hdr">
  <div>
    <div class="htitle">CEDEAR <span>Screener</span></div>
    <div class="hsub">BYMA · Acciones · Scoring ponderado 5 criterios</div>
  </div>
  <div class="hts">Datos: {timestamp} · Yahoo Finance</div>
</div>

<div class="ctrl">
  <label>Buscar<input type="text" id="si" placeholder="Ticker o nombre…"/></label>
  <label>Sector<select id="sf"><option value="">Todos</option>{sector_opts}</select></label>
  <label>Score mínimo<select id="scf">
    <option value="0">Sin filtro</option>
    <option value="70">≥ 70 Verde</option>
    <option value="50">≥ 50 Amarillo+</option>
    <option value="30">≥ 30</option>
  </select></label>
  <div class="cnt">Mostrando <span id="rc">0</span> de {total}</div>
</div>

<div class="leg">
  <div class="li"><div class="ld" style="background:var(--gr)"></div>Score ≥ 70</div>
  <div class="li"><div class="ld" style="background:var(--yl)"></div>Score 50–69</div>
  <div class="li"><div class="ld" style="background:var(--rd)"></div>Score &lt; 50</div>
  <div class="li lw">PEG 30% · Upside analistas 25% · Fwd P/E vs sector 20% · Revisión EPS 15% · Pos. 52w 10%</div>
</div>

<div class="tw">
<table id="mt">
  <thead><tr>
    <th data-k="rank">#<span class="si"></span></th>
    <th data-k="score">Score<span class="si"></span></th>
    <th data-k="ticker">Ticker<span class="si"></span></th>
    <th data-k="sector">Sector<span class="si"></span></th>
    <th data-k="price">Precio<span class="si"></span></th>
    <th data-k="uv">Upside<span class="si"></span></th>
    <th data-k="peg">PEG<span class="si"></span></th>
    <th data-k="fpe">P/E<span class="si"></span></th>
    <th data-k="smfpe">Med. Sector<span class="si"></span></th>
    <th data-k="eps">Rev. EPS<span class="si"></span></th>
    <th data-k="p52">Pos. 52w<span class="si"></span></th>
  </tr></thead>
  <tbody id="tb"></tbody>
</table>
</div>

<script>
const D={data_json};
let sc='rank',sd=1;

function uc(v){{
  if(v===null||v===undefined)return'na';
  return v>5?'up':v<-5?'dn':'nu';
}}
function b52(v){{
  if(v===null||v===undefined)return'<span class="na">—</span>';
  let p=Math.min(Math.max(v,0),100);
  let c='#00d4aa';
  if(p>90||p<5)c='#ff4d6d';else if(p>75)c='#ffc300';
  return`<div class="bw"><div class="bf" style="width:${{p.toFixed(1)}}%;background:${{c}}"></div><span class="bl">${{p.toFixed(0)}}%</span></div>`;
}}
function ea(l){{
  const m={{'↑':'eu','↓':'ed','→':'ef'}};
  return`<span class="${{m[l]||'na'}}">${{l}}</span>`;
}}
function row(r){{
  const sv=r.score!==null?r.score:'—';
  return`<tr>
<td class="rk">${{r.rank}}</td>
<td><span class="sp ${{r.sc}}">${{sv}}</span></td>
<td class="tc"><div class="sym">${{r.ticker}}</div><div class="cn" title="${{r.name}}">${{r.name}}</div></td>
<td><span class="sb" title="${{r.sector}}">${{r.sector}}</span></td>
<td class="pr">${{r.price}}</td>
<td class="${{uc(r.uv)}}">${{r.upside}}</td>
<td>${{r.peg}}</td>
<td>${{r.fpe}}</td>
<td class="na">${{r.smfpe}}</td>
<td style="text-align:center">${{ea(r.eps)}}</td>
<td style="padding-right:44px">${{b52(r.p52)}}</td>
</tr>`;
}}

function filtered(){{
  const s=document.getElementById('si').value.toLowerCase();
  const sec=document.getElementById('sf').value;
  const ms=parseInt(document.getElementById('scf').value)||0;
  return D.filter(r=>{{
    if(s&&!r.ticker.toLowerCase().includes(s)&&!r.name.toLowerCase().includes(s))return false;
    if(sec&&r.sector!==sec)return false;
    if(ms>0&&(r.score===null||r.score<ms))return false;
    return true;
  }});
}}

function render(){{
  let rows=filtered().slice().sort((a,b)=>{{
    let va=a[sc],vb=b[sc];
    if(va===null||va===undefined)return 1;
    if(vb===null||vb===undefined)return -1;
    if(typeof va==='string')return va.localeCompare(vb)*sd;
    return(va-vb)*sd;
  }});
  document.getElementById('tb').innerHTML=rows.map(row).join('');
  document.getElementById('rc').textContent=rows.length;
}}

document.querySelectorAll('th[data-k]').forEach(th=>{{
  th.addEventListener('click',()=>{{
    const k=th.dataset.k;
    if(sc===k)sd*=-1;else{{sc=k;sd=k==='rank'?1:-1;}}
    document.querySelectorAll('th').forEach(t=>t.classList.remove('sa','sd'));
    th.classList.add(sd===1?'sa':'sd');
    render();
  }});
}});
['si','sf','scf'].forEach(id=>{{
  const el=document.getElementById(id);
  el.addEventListener('input',render);
  el.addEventListener('change',render);
}});
render();
document.querySelector('th[data-k="rank"]').classList.add('sa');
</script>
</body></html>"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    data_file = Path("/home/user/Casa-Pipis/data/screener_raw.json")
    if not data_file.exists():
        print("ERROR: data/screener_raw.json not found. Run the fetch step first.", file=sys.stderr)
        sys.exit(1)

    with open(data_file) as f:
        raw = json.load(f)

    ART = timezone(timedelta(hours=-3))
    ts_raw = raw.get("timestamp", "")
    if ts_raw:
        # parse stored UTC timestamp and convert to ART
        try:
            dt_utc = datetime.strptime(ts_raw, "%Y-%m-%d %H:%M UTC").replace(tzinfo=timezone.utc)
            timestamp = dt_utc.astimezone(ART).strftime("%Y-%m-%d %H:%M ART")
        except ValueError:
            timestamp = ts_raw
    else:
        timestamp = datetime.now(ART).strftime("%Y-%m-%d %H:%M ART")
    rows  = build_rows(raw)
    scored = compute_scores(rows)

    html = generate_html(scored, timestamp)
    out  = "/home/user/Casa-Pipis/cedear_screener.html"
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Saved: {out}  ({len(html):,} bytes)")
    valid = [r for r in scored if r["score"] is not None]
    print(f"Scored: {len(valid)}/{len(scored)} tickers")
    print("\nTop 10:")
    for r in scored[:10]:
        fpe_str = f"fpe={r['use_pe']:.1f}" if r['use_pe'] else "fpe=—"
        print(f"  {r['rank']:2d}. {r['ticker']:<8} score={str(r['score']):<4} {fpe_str}  upside={fmt_pct(r['upside']*100 if r['upside'] else None)}  sector={r['sector']}")
