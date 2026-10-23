import numpy as np
import pandas as pd


def _agg(g):
    out = g.agg(
        n=("error", "size"),
        bias=("error", "mean"),
        mae=("abs_err", "mean"),
        mse=("sq_err", "mean"),
        p05=("error", lambda s: s.quantile(0.05)),
        p50=("error", lambda s: s.quantile(0.50)),
        p90=("error", lambda s: s.quantile(0.90)),
        p95=("error", lambda s: s.quantile(0.95)),
        mean_actual=("actual", "mean"),
        mean_forecast=("forecast", "mean"),
    )
    out["rmse"] = np.sqrt(out.pop("mse"))
    return out

def _prep(df):
    d = df.dropna(subset=["error"]).copy()
    d["abs_err"] = d["error"].abs()
    d["sq_err"] = d["error"] ** 2
    return d

def summary(df) -> dict:
    d = _prep(df)
    row = _agg(d.assign(_k=1).groupby("_k")).iloc[0].to_dict()
    row["mae_pct_of_mean_actual"] = 100 * row["mae"] / d["actual"].mean()
    row["bias_pct_of_mean_actual"] = 100 * row["bias"] / d["actual"].mean()
    return row

def by_hour(df):
    d = _prep(df)
    return _agg(d.groupby(d["startTime"].dt.hour.rename("hour"))).reset_index()

def by_day(df):
    d = _prep(df)
    return _agg(d.groupby(d["startTime"].dt.date.rename("date"))).reset_index()

def by_horizon(f, a_hourly, first="2026-01-02", last="2026-02-01", bucket_h=6):
    """Accuracy vs lead time using ALL forecast runs (not just the decision-time pick)."""
    x = f.merge(a_hourly, on="startTime")
    x = x[(x.startTime >= pd.Timestamp(first, tz="UTC")) & (x.startTime < pd.Timestamp(last, tz="UTC") + pd.Timedelta(days=1))]
    x["horizon_h"] = (x["startTime"] - x["publishTime"]).dt.total_seconds() / 3600
    x = x[x["horizon_h"] > 0]
    x["error"] = x["forecast"] - x["actual"]
    x = _prep(x)
    x["horizon_bucket"] = (x["horizon_h"] // bucket_h * bucket_h).astype(int)
    return _agg(x.groupby("horizon_bucket")).reset_index()

def error_histogram(df, bins=30):
    e = df["error"].dropna()
    counts, edges = np.histogram(e, bins=bins)
    return {"counts": counts.tolist(), "edges": edges.tolist()}

def heatmap(df):
    """One row per (decision date, delivery hour) with its error — the raw
    grid a hour-x-day heatmap is drawn from, not pre-aggregated like by_hour/by_day."""
    d = df[["startTime", "error"]].copy()
    d["date"] = d["startTime"].dt.date
    d["hour"] = d["startTime"].dt.hour
    return d[["date", "hour", "error"]].sort_values(["date", "hour"]).reset_index(drop=True)
