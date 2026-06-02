#!/usr/bin/env python3
"""Fetch CEDEAR underlying stock data from Yahoo Finance and write screener_raw.json."""

import json
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import yfinance as yf

TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META",
    "NVDA", "AMD",  "INTC", "QCOM", "AVGO", "TSM", "MU", "ARM", "MRVL", "TSEM",
    "ASML", "AMAT", "KLAC", "LRCX", "COHR",
    "CRM",  "ORCL", "SAP",  "NOW",  "ADBE", "SNOW", "PLTR", "DDOG", "NET",  "CRWD",
    "JPM",  "BAC",  "GS",   "MS",   "V",    "MA",   "PYPL",
    "XOM",  "CVX",
    "CEG",  "VST",  "NEE",
    "TSLA",
    "BIDU", "BABA", "PDD",  "JD",
    "SE",   "MELI",
    "DIS",  "NFLX", "SPOT",
    "ABNB", "UBER", "LYFT", "DASH", "BKNG", "SHOP",
    "COIN", "HOOD",
    "PATH", "SMCI",
    "DELL", "HPQ",  "IBM",  "CSCO",
    "GE",   "CAT",  "DE",   "HON",
    "BA",   "LMT",  "RTX",
    "UPS",  "FDX",
    "AMT",
    "ZM",
]


def fetch_all():
    quotes, profiles, targets, estimates, eps_growth = {}, {}, {}, {}, {}
    next_year = datetime.now().year + 1
    year_after = next_year + 1

    for sym in TICKERS:
        try:
            info = yf.Ticker(sym).info

            price = info.get("currentPrice") or info.get("regularMarketPrice")
            if not price:
                print(f"  {sym}: no price — skip")
                continue

            quotes[sym] = {
                "price": price,
                "yearHigh": info.get("fiftyTwoWeekHigh"),
                "yearLow":  info.get("fiftyTwoWeekLow"),
            }

            profiles[sym] = {
                "sector":      info.get("sector", ""),
                "companyName": info.get("longName", sym),
            }

            t_mean   = info.get("targetMeanPrice")
            t_median = info.get("targetMedianPrice")
            if t_mean or t_median:
                targets[sym] = {"targetConsensus": t_mean, "targetMedian": t_median}

            fwd_eps = info.get("forwardEps")
            growth  = info.get("earningsGrowth") or info.get("earningsQuarterlyGrowth")
            if fwd_eps:
                gr = growth if growth and -0.5 < growth < 5 else 0.12
                estimates[sym] = [
                    {"date": f"{next_year}-12-31", "epsAvg": round(fwd_eps, 4)},
                    {"date": f"{year_after}-12-31", "epsAvg": round(fwd_eps * (1 + gr), 4)},
                ]
                eps_growth[sym] = round(gr, 4)

            print(f"  {sym}: ${price:.2f}")
            time.sleep(0.15)  # gentle pacing to avoid Yahoo throttle

        except Exception as e:
            print(f"  {sym}: error — {e}")

    return quotes, profiles, targets, estimates, eps_growth


def main():
    ART = timezone(timedelta(hours=-3))
    timestamp = datetime.now(ART).strftime("%Y-%m-%d %H:%M ART")

    print(f"Fetching {len(TICKERS)} tickers from Yahoo Finance …")
    quotes, profiles, targets, estimates, eps_growth = fetch_all()

    output = {
        "timestamp": timestamp,
        "quotes":    quotes,
        "profiles":  profiles,
        "targets":   targets,
        "estimates": estimates,
        "epsGrowth": eps_growth,
    }

    out_path = Path(__file__).parent / "data" / "screener_raw.json"
    out_path.parent.mkdir(exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWritten {len(quotes)} tickers → {out_path}")


if __name__ == "__main__":
    main()
