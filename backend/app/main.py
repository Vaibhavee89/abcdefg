import os
import re
from functools import lru_cache
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import metrics
from .selection import (build_dataset, prep_actuals_hourly, prep_forecasts,
                        select_for_decision, validate_full_coverage)

_LOCAL_DATA = Path(__file__).resolve().parents[2] / "data"
_BUNDLED_DATA = Path(__file__).resolve().parents[1] / "data"
DATA = Path(os.environ.get("DATA_DIR") or (_BUNDLED_DATA if _BUNDLED_DATA.exists() else _LOCAL_DATA))
F = prep_forecasts(pd.read_parquet(DATA / "forecasts_raw.parquet"))
A = prep_actuals_hourly(pd.read_parquet(DATA / "actuals_raw.parquet"))

FIRST, LAST = pd.Timestamp("2026-01-01"), pd.Timestamp("2026-01-31")
CUTOFF_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DEFAULT_CUTOFF = "09:20"

app = FastAPI(title="Wind Forecast Accuracy API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def check_cutoff(cutoff: str) -> str:
    if not CUTOFF_RE.match(cutoff):
        raise HTTPException(422, "cutoff must be HH:MM (UTC)")
    return cutoff


@lru_cache(maxsize=64)
def dataset(cutoff: str) -> pd.DataFrame:
    return build_dataset(F, A, cutoff=cutoff)


# Fail loudly at startup if the data pipeline produced an incomplete dataset,
# rather than silently serving partial results from a broken deploy.
validate_full_coverage(dataset(DEFAULT_CUTOFF))


def records(df: pd.DataFrame) -> list:
    d = df.copy()
    for c in d.columns:
        if pd.api.types.is_datetime64_any_dtype(d[c]):
            d[c] = d[c].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return d.astype(object).where(d.notna(), None).to_dict("records")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    return {"first_decision_date": "2026-01-01", "last_decision_date": "2026-01-31",
            "default_cutoff": DEFAULT_CUTOFF, "timezone": "UTC"}


@app.get("/api/forecast")
def forecast(decision_date: str = Query("2026-01-14"), cutoff: str = DEFAULT_CUTOFF):
    """Forecast available at `cutoff` on decision_date, for delivery the next day."""
    check_cutoff(cutoff)
    try:
        d = pd.Timestamp(decision_date)
    except ValueError:
        raise HTTPException(422, "decision_date must be YYYY-MM-DD")
    if not (FIRST <= d <= LAST):
        raise HTTPException(422, "decision_date must be within January 2026")
    sel = select_for_decision(F, decision_date, cutoff).merge(A, on="startTime", how="left")
    sel["error"] = sel["forecast"] - sel["actual"]
    return {"decision_date": decision_date, "cutoff": cutoff, "rows": records(sel)}


@app.get("/api/metrics/summary")
def summary(cutoff: str = DEFAULT_CUTOFF):
    check_cutoff(cutoff)
    s = metrics.summary(dataset(cutoff))
    return {k: (None if pd.isna(v) else float(v)) for k, v in s.items()}


@app.get("/api/metrics/by-hour")
def by_hour(cutoff: str = DEFAULT_CUTOFF):
    return records(metrics.by_hour(dataset(check_cutoff(cutoff))))


@app.get("/api/metrics/by-day")
def by_day(cutoff: str = DEFAULT_CUTOFF):
    return records(metrics.by_day(dataset(check_cutoff(cutoff))))


@app.get("/api/metrics/by-horizon")
def by_horizon():
    return records(metrics.by_horizon(F, A))


@app.get("/api/metrics/histogram")
def histogram(cutoff: str = DEFAULT_CUTOFF, bins: int = Query(30, ge=5, le=100)):
    return metrics.error_histogram(dataset(check_cutoff(cutoff)), bins=bins)
