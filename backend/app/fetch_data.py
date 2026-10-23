from datetime import datetime, timedelta, timezone

import pandas as pd
import requests

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"

def _get(dataset, params):
    r = requests.get(f"{BASE}/{dataset}/stream", params=params, timeout=60)
    r.raise_for_status()
    return r.json()

def fetch_range(dataset, start, end, step_days=3, extra=None):
    rows, cur = [], start
    while cur < end:
        nxt = min(cur + timedelta(days=step_days), end)
        params = {
            "publishDateTimeFrom": cur.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishDateTimeTo": nxt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            **(extra or {}),
        }
        rows += _get(dataset, params)
        cur = nxt
    return pd.DataFrame(rows).drop_duplicates()

if __name__ == "__main__":
    start = datetime(2025, 12, 24, tzinfo=timezone.utc)
    end = datetime(2026, 2, 3, tzinfo=timezone.utc)

    actuals = fetch_range("FUELHH", start, end, extra={"fuelType": "WIND"})
    forecasts = fetch_range("WINDFOR", start, end)

    actuals.to_parquet("data/actuals_raw.parquet")
    forecasts.to_parquet("data/forecasts_raw.parquet")
    print(actuals.shape, forecasts.shape)
    print(actuals.head(), forecasts.head())
