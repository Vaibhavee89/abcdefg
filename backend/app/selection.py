import pandas as pd

def _utc(s):
    return pd.to_datetime(s, utc=True)

def prep_forecasts(f: pd.DataFrame) -> pd.DataFrame:
    f = f[["startTime", "publishTime", "generation"]].copy()
    f["startTime"] = _utc(f["startTime"])
    f["publishTime"] = _utc(f["publishTime"])
    f = f.drop_duplicates(subset=["startTime", "publishTime"])
    return f.rename(columns={"generation": "forecast"})

def prep_actuals_hourly(a: pd.DataFrame) -> pd.DataFrame:
    """Average the two half-hours inside each hour. NaN if either is missing."""
    s = a.assign(startTime=_utc(a["startTime"])).set_index("startTime").sort_index()["generation"]
    g = s.resample("1h")
    out = g.mean().where(g.count() == 2)
    return out.rename("actual").reset_index()

def select_for_decision(f, decision_date, cutoff="09:20"):
    """Decision made on decision_date at `cutoff` (UTC) for delivery on the next day.
    For each hourly slot, take the forecast with max publishTime <= cutoff."""
    d = pd.Timestamp(decision_date, tz="UTC").normalize()
    cut = d + pd.Timedelta(hours=int(cutoff[:2]), minutes=int(cutoff[3:5]))
    start, end = d + pd.Timedelta(days=1), d + pd.Timedelta(days=2)

    x = f[(f["startTime"] >= start) & (f["startTime"] < end) & (f["publishTime"] <= cut)]
    x = x.sort_values("publishTime").groupby("startTime").tail(1).sort_values("startTime")
    x = x.assign(decision_time=cut,
                 horizon_h=(x["startTime"] - x["publishTime"]).dt.total_seconds() / 3600)
    return x.reset_index(drop=True)

def build_dataset(f, a_hourly, first="2026-01-01", last="2026-01-31", cutoff="09:20"):
    days = pd.date_range(first, last, freq="D")
    sel = pd.concat([select_for_decision(f, d, cutoff) for d in days], ignore_index=True)
    out = sel.merge(a_hourly, on="startTime", how="left")
    out["error"] = out["forecast"] - out["actual"]   # + = over-forecast (shortfall risk)
    return out

def validate_full_coverage(df, days=31, hours_per_day=24):
    """Raise loudly if the dataset doesn't have a forecast + actual for every delivery hour.
    Intended to run at startup so a broken data pipeline fails fast and visibly,
    rather than silently serving partial results."""
    expected_n = days * hours_per_day
    if len(df) != expected_n:
        raise RuntimeError(
            f"Expected {expected_n} hourly slots, got {len(df)}. "
            "January is not fully covered — check the padding window in fetch_data.py "
            "and whether a forecast run was missing before the cutoff for some slot."
        )
    missing_forecast = int(df["forecast"].isna().sum())
    if missing_forecast:
        raise RuntimeError(f"{missing_forecast} hourly slots have no forecast available before the cutoff.")
    missing_actual = int(df["actual"].isna().sum())
    if missing_actual:
        raise RuntimeError(f"{missing_actual} hourly slots have no actual (a half-hour reading is missing).")
