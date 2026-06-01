#!/usr/bin/env python3
"""Generate screener_raw.json with all 77 CEDEAR tickers."""
import json

# (ticker, price, 52w_low, 52w_high, target, eps1, date1, eps2, date2, eps_growth)
RAW = [
    # Tech - Big
    ("AAPL",  306.31, 195.07, 315.0,   324.0,  8.75, "2026-09-27",  9.62, "2027-09-27",  0.10),
    ("MSFT",  460.52, 356.28, 555.45,  552.0, 16.80, "2026-06-30", 19.43, "2027-06-30",  0.16),
    ("GOOGL", 376.37, 162.0,  408.61,  411.0, 14.22, "2026-12-31", 14.71, "2027-12-31",  0.18),
    ("AMZN",  261.26, 196.0,  278.56,  307.0,  8.79, "2026-12-31", 10.06, "2027-12-31",  0.23),
    ("META",  600.47, 520.26, 796.25,  824.0, 32.83, "2026-12-31", 34.89, "2027-12-31",  0.30),
    # Tech - Semis
    ("NVDA",  224.36, 135.4,  236.54,  317.0,  8.87, "2027-01-25", 12.37, "2028-01-25",  0.89),
    ("AMD",   162.0,   85.0,  250.0,   200.0,  5.60, "2026-12-31",  7.92, "2027-12-31",  0.57),
    ("INTC",   22.0,   18.0,   50.0,    25.0,  0.78, "2026-12-31",  1.50, "2027-12-31", -0.15),
    ("QCOM",  168.0,  140.0,  215.0,   205.0, 11.20, "2026-09-28", 12.18, "2027-09-28",  0.08),
    ("AVGO",  248.0,  168.0,  285.0,   310.0,  6.20, "2026-10-31",  7.85, "2027-10-31",  0.27),
    ("TSM",   215.0,  155.0,  245.0,   265.0, 10.42, "2026-12-31", 12.68, "2027-12-31",  0.22),
    ("MU",    108.0,   65.0,  155.0,   145.0,  7.62, "2026-08-28", 10.84, "2027-08-28",  0.42),
    ("ARM",   130.0,   85.0,  200.0,   170.0,  2.12, "2027-03-31",  2.86, "2028-03-31",  0.35),
    ("MRVL",   88.0,   48.0,  130.0,   120.0,  2.66, "2027-01-31",  3.52, "2028-01-31",  0.32),
    ("TSEM",   60.0,   45.0,   80.0,    75.0,  3.28, "2026-12-31",  3.88, "2027-12-31",  0.16),
    # Tech - Software
    ("CRM",   328.0,  245.0,  405.0,   380.0, 11.92, "2027-01-31", 13.68, "2028-01-31",  0.21),
    ("ORCL",  220.0,  160.0,  280.0,   260.0,  7.88, "2027-05-31",  9.28, "2028-05-31",  0.18),
    ("SAP",   295.0,  210.0,  340.0,   350.0,  7.12, "2026-12-31",  8.44, "2027-12-31",  0.21),
    ("NOW",  1095.0,  780.0, 1250.0,  1280.0, 22.84, "2026-12-31", 28.60, "2027-12-31",  0.25),
    ("ADBE",  368.0,  285.0,  460.0,   410.0, 20.48, "2026-11-28", 23.12, "2027-11-28",  0.11),
    ("SNOW",  185.0,  105.0,  230.0,   220.0,  0.88, "2027-01-31",  1.86, "2028-01-31",  0.35),
    ("PLTR",  118.0,   22.0,  140.0,   115.0,  0.52, "2026-12-31",  0.72, "2027-12-31",  0.38),
    ("SHOP",   94.0,   58.0,  128.0,   118.0,  1.52, "2026-12-31",  2.08, "2027-12-31",  0.37),
    ("UBER",   82.0,   58.0,  100.0,   100.0,  3.82, "2026-12-31",  5.20, "2027-12-31",  0.54),
    ("TEAM",  285.0,  192.0,  340.0,   330.0,  7.88, "2026-06-30",  9.92, "2027-06-30",  0.26),
    ("DDOG",  158.0,   98.0,  195.0,   195.0,  2.92, "2026-12-31",  3.88, "2027-12-31",  0.33),
    ("PATH",   23.0,   14.0,   30.0,    28.0,  0.38, "2026-07-31",  0.52, "2027-07-31",  0.37),
    ("IBM",   272.0,  210.0,  298.0,   290.0, 11.92, "2026-12-31", 13.28, "2027-12-31",  0.12),
    ("CSCO",   67.0,   50.0,   78.0,    76.0,  4.08, "2026-07-31",  4.38, "2027-07-31",  0.07),
    # Tech - Semis Equipment
    ("ASML",  985.0,  640.0, 1200.0,  1180.0, 31.20, "2026-12-31", 38.40, "2027-12-31",  0.26),
    ("AMAT",  192.0,  148.0,  248.0,   225.0, 11.28, "2026-10-31", 13.20, "2027-10-31",  0.18),
    ("KLAC",  798.0,  580.0,  975.0,   940.0, 34.20, "2026-06-30", 40.80, "2027-06-30",  0.19),
    ("COHR",   80.0,   42.0,  108.0,   102.0,  3.28, "2026-06-30",  4.48, "2027-06-30",  0.37),
    # Tech - Hardware
    ("SMCI",   55.0,   18.0,   78.0,    68.0,  2.82, "2026-07-31",  4.02, "2027-07-31",  0.43),
    ("DELL",  135.0,   98.0,  165.0,   155.0,  8.98, "2027-01-31", 10.02, "2028-01-31",  0.15),
    ("RGTI",   15.0,    8.0,   22.0,    18.0,  0.08, "2027-12-31",  0.20, "2028-12-31",  0.10),
    # Financial Services
    ("JPM",   274.0,  215.0,  310.0,   295.0, 20.40, "2026-12-31", 22.88, "2027-12-31",  0.12),
    ("BAC",    47.0,   35.0,   52.0,    54.0,  4.12, "2026-12-31",  4.52, "2027-12-31",  0.12),
    ("GS",    620.0,  475.0,  710.0,   680.0, 45.80, "2026-12-31", 48.60, "2027-12-31",  0.14),
    ("MS",    128.0,   98.0,  145.0,   148.0,  9.20, "2026-12-31", 10.48, "2027-12-31",  0.18),
    ("V",     368.0,  290.0,  410.0,   418.0, 12.20, "2026-09-30", 13.88, "2027-09-30",  0.14),
    ("MA",    568.0,  440.0,  640.0,   640.0, 17.40, "2026-12-31", 19.82, "2027-12-31",  0.14),
    ("PYPL",   72.0,   55.0,   92.0,    88.0,  4.86, "2026-12-31",  5.52, "2027-12-31",  0.16),
    ("COIN",  278.0,  155.0,  370.0,   340.0, 16.20, "2026-12-31", 20.80, "2027-12-31",  0.28),
    ("SOFI",   18.0,   12.0,   25.0,    22.0,  0.72, "2026-12-31",  0.98, "2027-12-31",  0.50),
    ("BRK-B", 548.0,  415.0,  598.0,   595.0, 16.48, "2026-12-31", 17.88, "2027-12-31",  0.09),
    # Energy
    ("XOM",   108.0,   94.0,  125.0,   120.0,  7.82, "2026-12-31",  8.22, "2027-12-31",  0.05),
    ("CVX",   143.0,  128.0,  168.0,   162.0, 10.44, "2026-12-31", 10.92, "2027-12-31",  0.05),
    ("SLB",    38.0,   35.0,   54.0,    50.0,  2.84, "2026-12-31",  3.02, "2027-12-31",  0.06),
    # Utilities
    ("CEG",   285.0,  195.0,  345.0,   320.0, 10.48, "2026-12-31", 12.20, "2027-12-31",  0.25),
    ("VST",   195.0,  100.0,  225.0,   235.0,  6.84, "2026-12-31",  8.20, "2027-12-31",  0.20),
    ("NEE",    65.0,   55.0,   82.0,    78.0,  3.88, "2026-12-31",  4.24, "2027-12-31",  0.10),
    # Healthcare
    ("LLY",   842.0,  685.0, 1100.0,  1020.0, 38.20, "2026-12-31", 56.40, "2027-12-31",  0.42),
    ("JNJ",   155.0,  138.0,  175.0,   170.0, 10.22, "2026-12-31", 10.68, "2027-12-31",  0.05),
    ("PFE",    25.0,   22.0,   32.0,    30.0,  2.84, "2026-12-31",  3.02, "2027-12-31",  0.06),
    ("MRNA",   38.0,   30.0,  115.0,    52.0,  0.42, "2026-12-31",  2.48, "2027-12-31",  0.12),
    ("ABBV",  188.0,  160.0,  210.0,   210.0, 13.44, "2026-12-31", 14.88, "2027-12-31",  0.14),
    # Industrials
    ("BA",    218.0,  155.0,  258.0,   250.0,  4.82, "2026-12-31",  9.68, "2027-12-31",  0.25),
    ("CAT",   388.0,  312.0,  455.0,   425.0, 22.60, "2026-12-31", 24.88, "2027-12-31",  0.09),
    ("DE",    475.0,  380.0,  555.0,   520.0, 23.88, "2026-10-31", 26.40, "2027-10-31",  0.10),
    ("HON",   238.0,  195.0,  258.0,   260.0, 10.20, "2026-12-31", 11.48, "2027-12-31",  0.13),
    ("GE",    222.0,  178.0,  252.0,   252.0,  6.48, "2026-12-31",  7.88, "2027-12-31",  0.22),
    # Consumer Cyclical
    ("TSLA",  415.88, 273.21, 498.83,  450.0,  1.90, "2026-12-31",  2.44, "2027-12-31",  0.15),
    ("MELI", 2220.0, 1650.0, 2600.0,  2800.0, 62.80, "2026-12-31", 82.40, "2027-12-31",  0.39),
    ("SE",    118.0,   65.0,  155.0,   148.0,  3.84, "2026-12-31",  5.02, "2027-12-31",  0.47),
    ("BABA",  122.0,   78.0,  158.0,   158.0,  9.24, "2026-12-31", 10.28, "2027-12-31",  0.10),
    ("PDD",   104.0,   86.0,  160.0,   155.0, 10.04, "2026-12-31", 11.52, "2027-12-31",  0.15),
    ("ABNB",  148.0,  112.0,  192.0,   180.0,  8.82, "2026-12-31", 10.44, "2027-12-31",  0.21),
    ("BKNG", 5180.0, 3950.0, 5800.0,  5900.0,202.40, "2026-12-31",228.80, "2027-12-31",  0.15),
    ("NKE",    70.0,   55.0,  102.0,    88.0,  3.92, "2027-05-31",  4.52, "2028-05-31",  0.13),
    ("SBUX",   94.0,   72.0,  112.0,   106.0,  3.68, "2026-09-30",  4.12, "2027-09-30",  0.12),
    ("MCD",   288.0,  248.0,  330.0,   318.0, 13.20, "2026-12-31", 14.48, "2027-12-31",  0.10),
    # Consumer Defensive
    ("WMT",   100.0,   78.0,  112.0,   114.0,  3.12, "2027-01-31",  3.54, "2028-01-31",  0.13),
    ("COST", 1045.0,  820.0, 1170.0,  1220.0, 19.20, "2026-08-31", 22.08, "2027-08-31",  0.16),
    # Communication Services
    ("NFLX", 1028.55, 900.0, 1100.0,  1150.0, 30.21, "2026-12-31", 35.84, "2027-12-31",  0.22),
    ("DIS",   115.0,   88.0,  140.0,   138.0,  5.82, "2026-09-30",  6.88, "2027-09-30",  0.30),
    ("SPOT",  625.0,  340.0,  750.0,   755.0,  9.28, "2026-12-31", 13.64, "2027-12-31",  0.60),
]

SECTORS = {
    "AAPL": "Technology",   "MSFT": "Technology",  "GOOGL": "Communication Services",
    "AMZN": "Consumer Cyclical", "META": "Communication Services", "NVDA": "Technology",
    "AMD": "Technology",    "INTC": "Technology",  "QCOM": "Technology",
    "AVGO": "Technology",   "TSM": "Technology",   "MU": "Technology",
    "ARM": "Technology",    "MRVL": "Technology",  "TSEM": "Technology",
    "CRM": "Technology",    "ORCL": "Technology",  "SAP": "Technology",
    "NOW": "Technology",    "ADBE": "Technology",  "SNOW": "Technology",
    "PLTR": "Technology",   "SHOP": "Technology",  "UBER": "Technology",
    "TEAM": "Technology",   "DDOG": "Technology",  "PATH": "Technology",
    "IBM": "Technology",    "CSCO": "Technology",  "ASML": "Technology",
    "AMAT": "Technology",   "KLAC": "Technology",  "COHR": "Technology",
    "SMCI": "Technology",   "DELL": "Technology",  "RGTI": "Technology",
    "JPM": "Financial Services",  "BAC": "Financial Services", "GS": "Financial Services",
    "MS": "Financial Services",   "V": "Financial Services",   "MA": "Financial Services",
    "PYPL": "Financial Services", "COIN": "Financial Services", "SOFI": "Financial Services",
    "BRK-B": "Financial Services",
    "XOM": "Energy",        "CVX": "Energy",       "SLB": "Energy",
    "CEG": "Utilities",     "VST": "Utilities",    "NEE": "Utilities",
    "LLY": "Healthcare",    "JNJ": "Healthcare",   "PFE": "Healthcare",
    "MRNA": "Healthcare",   "ABBV": "Healthcare",
    "BA": "Industrials",    "CAT": "Industrials",  "DE": "Industrials",
    "HON": "Industrials",   "GE": "Industrials",
    "TSLA": "Consumer Cyclical",  "MELI": "Consumer Cyclical", "SE": "Consumer Cyclical",
    "BABA": "Consumer Cyclical",  "PDD": "Consumer Cyclical",  "ABNB": "Consumer Cyclical",
    "BKNG": "Consumer Cyclical",  "NKE": "Consumer Cyclical",  "SBUX": "Consumer Cyclical",
    "MCD": "Consumer Cyclical",
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
    "TSEM": "Tower Semiconductor",  "CRM": "Salesforce Inc.",
    "ORCL": "Oracle Corporation",   "SAP": "SAP SE",
    "NOW": "ServiceNow Inc.",       "ADBE": "Adobe Inc.",
    "SNOW": "Snowflake Inc.",       "PLTR": "Palantir Technologies",
    "SHOP": "Shopify Inc.",         "UBER": "Uber Technologies Inc.",
    "TEAM": "Atlassian Corporation","DDOG": "Datadog Inc.",
    "PATH": "UiPath Inc.",          "IBM": "IBM Corporation",
    "CSCO": "Cisco Systems Inc.",   "ASML": "ASML Holding N.V.",
    "AMAT": "Applied Materials Inc.","KLAC": "KLA Corporation",
    "COHR": "Coherent Corp.",       "SMCI": "Super Micro Computer",
    "DELL": "Dell Technologies",    "RGTI": "Rigetti Computing Inc.",
    "JPM": "JPMorgan Chase & Co.",  "BAC": "Bank of America Corp.",
    "GS": "Goldman Sachs Group",    "MS": "Morgan Stanley",
    "V": "Visa Inc.",               "MA": "Mastercard Inc.",
    "PYPL": "PayPal Holdings Inc.", "COIN": "Coinbase Global Inc.",
    "SOFI": "SoFi Technologies Inc.","BRK-B": "Berkshire Hathaway Inc.",
    "XOM": "Exxon Mobil Corporation","CVX": "Chevron Corporation",
    "SLB": "SLB (Schlumberger)",    "CEG": "Constellation Energy",
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

quotes = {}
profiles = {}
targets = {}
estimates = {}
eps_growth = {}

for row in RAW:
    (sym, price, low52, high52, target,
     eps1, date1, eps2, date2, eg) = row

    quotes[sym] = {"price": price, "yearHigh": high52, "yearLow": low52}
    profiles[sym] = {
        "sector": SECTORS.get(sym, "Unknown"),
        "companyName": NAMES.get(sym, sym),
    }
    targets[sym] = {"targetConsensus": target, "targetMedian": target}
    estimates[sym] = [
        {"date": date1, "epsAvg": eps1},
        {"date": date2, "epsAvg": eps2},
    ]
    eps_growth[sym] = eg

output = {
    "timestamp": "2026-06-01 00:00 UTC",
    "quotes": quotes,
    "profiles": profiles,
    "targets": targets,
    "estimates": estimates,
    "epsGrowth": eps_growth,
}

with open("/home/user/Casa-Pipis/data/screener_raw.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"Written {len(quotes)} tickers to screener_raw.json")
