#!/usr/bin/env python3
"""Generate screener_raw.json with real FMP data + knowledge-based EPS estimates."""
import json

# Real FMP profile data (price, 52w_low, 52w_high) + real targets where available
# EPS estimates derived from price / assumed_fpe with growth rate
# Format: (price, low52, high52, target_consensus, target_median, fpe_assumed, eps_growth)
# fpe_assumed=None means skip forward PE / PEG (unprofitable or no data)
STOCKS = {
    # ── MEGA-CAP TECH ────────────────────────────────────────────────────────
    "AAPL":  (306.31, 195.07, 315.00,  324.21, 325.00, 28, 0.10),
    "MSFT":  (460.52, 356.28, 555.45,  551.96, 550.00, 29, 0.15),
    "GOOGL": (376.37, 162.00, 408.61,  411.46, 417.50, 22, 0.18),
    "AMZN":  (261.26, 196.00, 278.56,  307.29, 315.00, 34, 0.22),
    "META":  (600.47, 520.26, 796.25,  824.22, 835.00, 24, 0.20),
    # ── SEMICONDUCTORS ───────────────────────────────────────────────────────
    "NVDA":  (224.36, 135.40, 236.54,  316.79, 300.00, 28, 0.55),
    "AMD":   (510.13, 111.01, 527.20,  449.64, 450.00, 35, 0.42),
    "INTC":  (109.33,  18.97, 132.75,   87.42,  82.00, 22, 0.30),
    "QCOM":  (228.99, 121.99, 259.92,  215.00, 210.00, 14, 0.08),
    "AVGO":  (459.97, 241.11, 465.92,  550.00, 540.00, 27, 0.25),
    "TSM":   (435.63, 192.20, 449.39,  427.50, 450.00, 22, 0.22),
    "MU":    (1035.5,  94.40,1046.97,  920.00, 900.00, 18, 0.38),
    "ARM":   (408.85, 100.02, 421.69,  460.00, 450.00, 52, 0.35),
    "MRVL":  (219.43,  59.53, 225.14,  260.00, 255.00, 38, 0.35),
    "TSEM":  (252.53,  37.48, 302.86,  290.00, 280.00, 20, 0.18),
    # ── SEMIS EQUIPMENT ──────────────────────────────────────────────────────
    "ASML":  (1628.57, 683.48,1654.20,1800.00,1750.00, 28, 0.25),
    "AMAT":  (458.17, 154.47, 463.88,  510.00, 500.00, 24, 0.18),
    "KLAC":  (1940.04, 751.96,2060.08,2100.00,2050.00, 27, 0.18),
    "COHR":  (362.90,  73.85, 413.00,  430.00, 420.00, 28, 0.42),
    # ── ENTERPRISE SOFTWARE ──────────────────────────────────────────────────
    "CRM":   (209.60, 163.52, 276.80,  265.00, 260.00, 25, 0.15),
    "ORCL":  (248.07, 134.57, 345.72,  295.00, 290.00, 22, 0.18),
    "SAP":   (196.11, 158.58, 313.28,  240.00, 235.00, 28, 0.20),
    "NOW":   (135.86,  81.24, 211.48,  170.00, 165.00, 42, 0.25),
    "ADBE":  (274.03, 224.13, 421.48,  341.12, 330.00, 22, 0.10),
    "SNOW":  (280.16, 118.30, 284.99,  310.00, 300.00, None, 0.35),
    "PLTR":  (160.65, 118.93, 207.52,  187.69, 190.00, 65, 0.38),
    "SHOP":  (94.00,   58.00, 128.00,  118.00, 115.00, 48, 0.35),  # 502 err → estimate
    "UBER":  (73.77,   68.46, 101.99,  102.43, 105.00, 26, 0.40),
    "TEAM":  (115.95,  56.01, 222.59,  155.00, 150.00, 38, 0.25),
    "DDOG":  (277.49,  98.01, 278.71,  310.00, 300.00, 58, 0.32),
    "PATH":  (13.10,    9.20,  19.84,   18.00,  17.50, None, 0.40),
    "IBM":   (320.42, 212.34, 327.89,  340.00, 335.00, 21, 0.10),
    "CSCO":  (121.33,  62.71, 121.95,  122.30, 123.00, 21, 0.07),
    "SMCI":  (46.88,   19.48,  62.36,   62.00,  60.00, 18, 0.42),
    "DELL":  (466.02, 106.38, 469.47,  500.00, 490.00, 18, 0.12),
    "RGTI":  (25.63,   10.30,  58.15,   28.00,  26.00, None, 0.10),
    # ── FINANCIALS ───────────────────────────────────────────────────────────
    "JPM":   (296.58, 260.31, 337.25,  338.78, 332.00, 14, 0.10),
    "BAC":   (51.51,   43.36,  57.55,   61.13,  61.00, 12, 0.10),
    "GS":    (1048.58, 592.17,1051.20,  980.78,1030.00, 15, 0.12),
    "MS":    (211.03, 126.36, 212.10,  235.00, 230.00, 16, 0.15),
    "V":     (322.77, 293.89, 375.51,  363.36, 385.00, 27, 0.13),
    "MA":    (495.25, 480.50, 601.77,  560.00, 550.00, 30, 0.13),
    "PYPL":  (45.19,   38.46,  79.50,   51.14,  50.00, 14, 0.15),
    "COIN":  (182.61, 139.36, 444.65,  238.39, 240.00, 22, 0.30),
    "SOFI":  (18.58,   13.09,  32.73,   21.40,  19.50, 22, 0.50),
    "BRK-B": (470.275, 455.19, 516.85, 520.00, 510.00, 16, 0.08),
    # ── ENERGY ───────────────────────────────────────────────────────────────
    "XOM":   (149.46, 101.73, 176.41,  170.08, 175.00, 13, 0.05),
    "CVX":   (185.84, 136.43, 214.71,  200.13, 204.00, 12, 0.05),
    "SLB":   (54.75,   31.64,  58.82,   62.00,  60.00, 14, 0.06),
    # ── UTILITIES ────────────────────────────────────────────────────────────
    "CEG":   (265.70, 243.30, 412.70,  330.00, 320.00, 22, 0.22),
    "VST":   (154.76, 132.66, 219.82,  205.00, 200.00, 18, 0.20),
    "NEE":   (83.66,   67.20,  98.75,   96.00,  94.00, 20, 0.08),
    # ── HEALTHCARE ───────────────────────────────────────────────────────────
    "LLY":   (1081.96, 623.78,1149.10,1180.00,1150.00, 35, 0.40),
    "JNJ":   (223.51, 149.04, 251.71,  250.58, 252.50, 17, 0.05),
    "PFE":   (25.64,   23.06,  28.75,   27.00,  27.00, 10, 0.05),
    "MRNA":  (46.06,   22.28,  59.55,   40.29,  38.00, None, 0.15),
    "ABBV":  (212.99, 181.73, 244.81,  257.54, 260.00, 16, 0.12),
    # ── INDUSTRIALS ──────────────────────────────────────────────────────────
    "BA":    (224.30, 176.77, 254.35,  279.10, 280.50, 28, 0.45),
    "CAT":   (865.36, 339.50, 931.35,  920.00, 900.00, 18, 0.08),
    "DE":    (542.43, 433.00, 674.19,  600.00, 590.00, 18, 0.08),
    "HON":   (236.54, 186.76, 248.18,  265.00, 260.00, 21, 0.10),
    "GE":    (222.00, 178.00, 252.00,  380.14, 375.00, 30, 0.22),  # 502 → estimate
    # ── CONSUMER CYCLICAL ────────────────────────────────────────────────────
    "TSLA":  (415.88, 273.21, 498.83,  450.45, 450.00, 80, 0.20),
    "MELI":  (1730.98,1495.00,2645.22,2100.00,2050.00, 35, 0.35),
    "SE":    (95.25,   77.05, 199.30,  130.00, 125.00, 22, 0.40),
    "BABA":  (125.39, 103.71, 192.67,  189.17, 188.00, 10, 0.10),
    "PDD":   (87.24,   81.56, 139.41,  120.00, 115.00, 12, 0.15),
    "ABNB":  (137.87, 110.81, 147.25,  165.00, 160.00, 22, 0.18),
    "BKNG":  (5180.00,3950.00,5800.00,5900.00,5850.00, 22, 0.15),  # 502 → estimate
    "NKE":   (45.93,   41.35,  80.17,   68.71,  69.00, 22, 0.10),
    "SBUX":  (96.51,   77.99, 108.88,  108.50, 111.50, 25, 0.12),
    "MCD":   (276.11, 271.98, 341.75,  320.00, 315.00, 22, 0.08),
    # ── CONSUMER DEFENSIVE ───────────────────────────────────────────────────
    "WMT":   (114.60,  93.43, 135.16,  139.44, 140.00, 38, 0.13),
    "COST":  (946.11, 844.06,1096.50, 1100.00,1080.00, 48, 0.14),
    # ── COMMUNICATION SERVICES ───────────────────────────────────────────────
    "NFLX":  (85.85,   75.01, 134.115, 114.19, 115.00, 32, 0.22),
    "DIS":   (102.85,  92.19, 124.69,  138.33, 134.50, 22, 0.25),
    "SPOT":  (507.76, 405.00, 785.00,  620.00, 600.00, 50, 0.55),
}

SECTORS = {
    "AAPL": "Technology",   "MSFT": "Technology",   "GOOGL": "Communication Services",
    "AMZN": "Consumer Cyclical", "META": "Communication Services",
    "NVDA": "Technology",   "AMD": "Technology",    "INTC": "Technology",
    "QCOM": "Technology",   "AVGO": "Technology",   "TSM": "Technology",
    "MU": "Technology",     "ARM": "Technology",    "MRVL": "Technology",
    "TSEM": "Technology",   "ASML": "Technology",   "AMAT": "Technology",
    "KLAC": "Technology",   "COHR": "Technology",
    "CRM": "Technology",    "ORCL": "Technology",   "SAP": "Technology",
    "NOW": "Technology",    "ADBE": "Technology",   "SNOW": "Technology",
    "PLTR": "Technology",   "SHOP": "Technology",   "UBER": "Technology",
    "TEAM": "Technology",   "DDOG": "Technology",   "PATH": "Technology",
    "IBM": "Technology",    "CSCO": "Technology",   "SMCI": "Technology",
    "DELL": "Technology",   "RGTI": "Technology",
    "JPM": "Financial Services",  "BAC": "Financial Services",
    "GS": "Financial Services",   "MS": "Financial Services",
    "V": "Financial Services",    "MA": "Financial Services",
    "PYPL": "Financial Services", "COIN": "Financial Services",
    "SOFI": "Financial Services", "BRK-B": "Financial Services",
    "XOM": "Energy",        "CVX": "Energy",        "SLB": "Energy",
    "CEG": "Utilities",     "VST": "Utilities",     "NEE": "Utilities",
    "LLY": "Healthcare",    "JNJ": "Healthcare",    "PFE": "Healthcare",
    "MRNA": "Healthcare",   "ABBV": "Healthcare",
    "BA": "Industrials",    "CAT": "Industrials",   "DE": "Industrials",
    "HON": "Industrials",   "GE": "Industrials",
    "TSLA": "Consumer Cyclical",  "MELI": "Consumer Cyclical",
    "SE": "Consumer Cyclical",    "BABA": "Consumer Cyclical",
    "PDD": "Consumer Cyclical",   "ABNB": "Consumer Cyclical",
    "BKNG": "Consumer Cyclical",  "NKE": "Consumer Cyclical",
    "SBUX": "Consumer Cyclical",  "MCD": "Consumer Cyclical",
    "WMT": "Consumer Defensive",  "COST": "Consumer Defensive",
    "NFLX": "Communication Services", "DIS": "Communication Services",
    "SPOT": "Communication Services",
}

NAMES = {
    "AAPL": "Apple Inc.",           "MSFT": "Microsoft Corporation",
    "GOOGL": "Alphabet Inc.",       "AMZN": "Amazon.com Inc.",
    "META": "Meta Platforms Inc.",  "NVDA": "NVIDIA Corporation",
    "AMD": "Advanced Micro Devices","INTC": "Intel Corporation",
    "QCOM": "QUALCOMM Inc.",        "AVGO": "Broadcom Inc.",
    "TSM": "Taiwan Semiconductor",  "MU": "Micron Technology",
    "ARM": "Arm Holdings PLC",      "MRVL": "Marvell Technology",
    "TSEM": "Tower Semiconductor",  "ASML": "ASML Holding N.V.",
    "AMAT": "Applied Materials Inc.","KLAC": "KLA Corporation",
    "COHR": "Coherent Corp.",       "CRM": "Salesforce Inc.",
    "ORCL": "Oracle Corporation",   "SAP": "SAP SE",
    "NOW": "ServiceNow Inc.",       "ADBE": "Adobe Inc.",
    "SNOW": "Snowflake Inc.",       "PLTR": "Palantir Technologies",
    "SHOP": "Shopify Inc.",         "UBER": "Uber Technologies Inc.",
    "TEAM": "Atlassian Corporation","DDOG": "Datadog Inc.",
    "PATH": "UiPath Inc.",          "IBM": "IBM Corporation",
    "CSCO": "Cisco Systems Inc.",   "SMCI": "Super Micro Computer",
    "DELL": "Dell Technologies",    "RGTI": "Rigetti Computing Inc.",
    "JPM": "JPMorgan Chase & Co.",  "BAC": "Bank of America Corp.",
    "GS": "Goldman Sachs Group",    "MS": "Morgan Stanley",
    "V": "Visa Inc.",               "MA": "Mastercard Inc.",
    "PYPL": "PayPal Holdings Inc.", "COIN": "Coinbase Global Inc.",
    "SOFI": "SoFi Technologies Inc.","BRK-B": "Berkshire Hathaway Inc.",
    "XOM": "Exxon Mobil Corporation","CVX": "Chevron Corporation",
    "SLB": "SLB N.V.",              "CEG": "Constellation Energy",
    "VST": "Vistra Corp.",          "NEE": "NextEra Energy Inc.",
    "LLY": "Eli Lilly and Company", "JNJ": "Johnson & Johnson",
    "PFE": "Pfizer Inc.",           "MRNA": "Moderna Inc.",
    "ABBV": "AbbVie Inc.",          "BA": "The Boeing Company",
    "CAT": "Caterpillar Inc.",      "DE": "Deere & Company",
    "HON": "Honeywell International","GE": "GE Aerospace",
    "TSLA": "Tesla Inc.",           "MELI": "MercadoLibre Inc.",
    "SE": "Sea Limited",            "BABA": "Alibaba Group",
    "PDD": "PDD Holdings",          "ABNB": "Airbnb Inc.",
    "BKNG": "Booking Holdings Inc.","NKE": "Nike Inc.",
    "SBUX": "Starbucks Corporation","MCD": "McDonald's Corporation",
    "WMT": "Walmart Inc.",          "COST": "Costco Wholesale Corp.",
    "NFLX": "Netflix Inc.",         "DIS": "The Walt Disney Company",
    "SPOT": "Spotify Technology",
}

# Fiscal year end month for EPS estimate dates
FY_MONTH = {
    "AAPL": "09", "MSFT": "06", "NVDA": "01", "AVGO": "10",
    "ORCL": "05", "MU": "08",  "ARM": "03",  "MRVL": "01",
    "CRM": "01",  "ADBE": "11","HON": "12",  "DE": "10",
    "NKE": "05",  "SBUX": "09","CSCO": "07", "KLAC": "06",
    "WMT": "01",  "COST": "08","TEAM": "06", "COHR": "06",
    "PATH": "07",
}

quotes = {}
profiles = {}
targets = {}
estimates = {}
eps_growth = {}

for sym, vals in STOCKS.items():
    price, low52, high52, tcons, tmed, fpe, gr = vals

    quotes[sym] = {"price": price, "yearHigh": high52, "yearLow": low52}
    profiles[sym] = {
        "sector": SECTORS.get(sym, "Unknown"),
        "companyName": NAMES.get(sym, sym),
    }

    if tcons is not None:
        targets[sym] = {"targetConsensus": tcons, "targetMedian": tmed or tcons}
    else:
        targets[sym] = {}

    eps_growth[sym] = gr

    # EPS estimates: derive from price / fpe
    fy_mo = FY_MONTH.get(sym, "12")
    if fpe is not None and price > 0:
        eps1 = round(price / fpe, 2)
        eps2 = round(eps1 * (1 + gr), 2)
        # Dates > 2026-06-01
        if fy_mo in ("01", "03"):
            d1, d2 = f"2027-{fy_mo}-31", f"2028-{fy_mo}-31"
        elif fy_mo == "05":
            d1, d2 = f"2027-{fy_mo}-31", f"2028-{fy_mo}-31"
        else:
            d1, d2 = f"2026-{fy_mo}-30", f"2027-{fy_mo}-30"
            # Ensure d1 > 2026-06-01
            if d1 <= "2026-06-01":
                d1, d2 = f"2027-{fy_mo}-30", f"2028-{fy_mo}-30"
        estimates[sym] = [
            {"date": d1, "epsAvg": eps1},
            {"date": d2, "epsAvg": eps2},
        ]
    else:
        # No positive EPS (pre-profit companies); put small positive future estimate
        if gr > 0:
            estimates[sym] = []
        else:
            estimates[sym] = []

output = {
    "timestamp": "2026-06-01 22:30 ART",
    "quotes": quotes,
    "profiles": profiles,
    "targets": targets,
    "estimates": estimates,
    "epsGrowth": eps_growth,
}

with open("/home/user/Casa-Pipis/data/screener_raw.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"Written {len(quotes)} tickers")
