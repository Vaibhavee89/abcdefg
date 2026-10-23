import hashlib
import json
import logging
import os
import re
import time
import uuid
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import metrics
from .selection import (
    build_dataset,
    prep_actuals_hourly,
    prep_forecasts,
    select_for_decision,
    validate_full_coverage,
)

_LOCAL_DATA = Path(__file__).resolve().parents[2] / "data"
_BUNDLED_DATA = Path(__file__).resolve().parents[1] / "data"
DATA = Path(os.environ.get("DATA_DIR") or (_BUNDLED_DATA if _BUNDLED_DATA.exists() else _LOCAL_DATA))
F = prep_forecasts(pd.read_parquet(DATA / "forecasts_raw.parquet"))
A = prep_actuals_hourly(pd.read_parquet(DATA / "actuals_raw.parquet"))

FIRST, LAST = pd.Timestamp("2026-01-01"), pd.Timestamp("2026-01-31")
CUTOFF_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DEFAULT_CUTOFF = "09:20"


def _iso(ts) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")


def _data_version() -> str:
    """A short, deterministic fingerprint of the loaded dataset: changes if and
    only if the underlying parquet content (row counts or date range) changes."""
    fingerprint = "|".join([
        str(len(F)), str(len(A)),
        _iso(F["startTime"].min()), _iso(F["startTime"].max()),
        _iso(F["publishTime"].min()), _iso(F["publishTime"].max()),
        _iso(A["startTime"].min()), _iso(A["startTime"].max()),
    ])
    return hashlib.sha256(fingerprint.encode()).hexdigest()[:12]


app = FastAPI(title="Wind Forecast Accuracy API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

API = "/api/v1"


# -------------------------------------------------------------- logging ---

log = logging.getLogger("api")
log.setLevel(logging.INFO)
if not log.handlers:
    # explicit handler so these lines show up under uvicorn/Docker/Vercel
    # regardless of how (or whether) the host app has configured logging
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(_handler)
    log.propagate = False


@app.middleware("http")
async def timing(request: Request, call_next):
    rid, t = uuid.uuid4().hex[:8], time.perf_counter()
    resp = await call_next(request)
    ms = round((time.perf_counter() - t) * 1000, 1)
    log.info(json.dumps({
        "rid": rid, "method": request.method, "path": request.url.path,
        "status": resp.status_code, "ms": ms,
    }))
    resp.headers["X-Request-ID"] = rid
    return resp


# ---------------------------------------------------------------- errors ---

class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


_STATUS_CODES = {400: "bad_request", 404: "not_found", 422: "validation_error", 500: "internal_error"}


def _error_response(status_code: int, message: str, code: Optional[str] = None) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=code or _STATUS_CODES.get(status_code, "error"), message=message))
    return JSONResponse(status_code=status_code, content=body.model_dump())


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return _error_response(exc.status_code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return _error_response(422, "Invalid request parameters.")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return _error_response(500, "Internal server error.")


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
        elif d[c].dtype == object:
            # e.g. by_day()'s "date" column: a plain datetime.date per row (object
            # dtype, not datetime64), which response_model's strict str validation
            # won't auto-coerce the way the default JSON encoder used to.
            non_null = d[c].dropna()
            if len(non_null) and hasattr(non_null.iloc[0], "isoformat"):
                d[c] = d[c].map(lambda v: v.isoformat() if hasattr(v, "isoformat") else v)
    return d.astype(object).where(d.notna(), None).to_dict("records")


# ---------------------------------------------------------------- models ---

class HealthResponse(BaseModel):
    status: str


class DateRange(BaseModel):
    first: str
    last: str


class Coverage(BaseModel):
    decisions: DateRange          # decision dates the API will accept
    actuals: DateRange            # FUELHH metered actual timestamps available
    forecast_publishes: DateRange  # WINDFOR publishTime range available
    forecast_targets: DateRange    # WINDFOR startTime (delivery hour) range available


class MetaResponse(BaseModel):
    data_version: str
    coverage: Coverage
    default_cutoff: str
    timezone: str


class ForecastRow(BaseModel):
    startTime: str
    publishTime: str
    forecast: float
    decision_time: str
    horizon_h: float
    actual: Optional[float] = None
    error: Optional[float] = None


class ForecastResponse(BaseModel):
    decision_date: str
    cutoff: str
    rows: List[ForecastRow]


class Summary(BaseModel):
    n: int
    bias: Optional[float] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    p05: Optional[float] = None
    p50: Optional[float] = None
    p90: Optional[float] = None
    p95: Optional[float] = None
    mean_actual: Optional[float] = None
    mean_forecast: Optional[float] = None
    mae_pct_of_mean_actual: Optional[float] = None
    bias_pct_of_mean_actual: Optional[float] = None


class ByHourRow(BaseModel):
    hour: int
    n: int
    bias: Optional[float] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    p05: Optional[float] = None
    p50: Optional[float] = None
    p90: Optional[float] = None
    p95: Optional[float] = None
    mean_actual: Optional[float] = None
    mean_forecast: Optional[float] = None


class ByDayRow(BaseModel):
    date: str
    n: int
    bias: Optional[float] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    p05: Optional[float] = None
    p50: Optional[float] = None
    p90: Optional[float] = None
    p95: Optional[float] = None
    mean_actual: Optional[float] = None
    mean_forecast: Optional[float] = None


class ByHorizonRow(BaseModel):
    horizon_bucket: int
    n: int
    bias: Optional[float] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    p05: Optional[float] = None
    p50: Optional[float] = None
    p90: Optional[float] = None
    p95: Optional[float] = None
    mean_actual: Optional[float] = None
    mean_forecast: Optional[float] = None


class Histogram(BaseModel):
    counts: List[int]
    edges: List[float]


class HeatmapCell(BaseModel):
    date: str
    hour: int
    error: Optional[float] = None


# ------------------------------------------------------------------ routes ---

@app.get(f"{API}/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}


@app.get(f"{API}/meta", response_model=MetaResponse)
def meta():
    return {
        "data_version": _data_version(),
        "coverage": {
            "decisions": {"first": FIRST.strftime("%Y-%m-%d"), "last": LAST.strftime("%Y-%m-%d")},
            "actuals": {"first": _iso(A["startTime"].min()), "last": _iso(A["startTime"].max())},
            "forecast_publishes": {"first": _iso(F["publishTime"].min()), "last": _iso(F["publishTime"].max())},
            "forecast_targets": {"first": _iso(F["startTime"].min()), "last": _iso(F["startTime"].max())},
        },
        "default_cutoff": DEFAULT_CUTOFF,
        "timezone": "UTC",
    }


@app.get(f"{API}/forecast", response_model=ForecastResponse)
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


@app.get(f"{API}/metrics/summary", response_model=Summary)
def summary(cutoff: str = DEFAULT_CUTOFF):
    check_cutoff(cutoff)
    s = metrics.summary(dataset(cutoff))
    return {k: (None if pd.isna(v) else float(v)) for k, v in s.items()}


@app.get(f"{API}/metrics/by-hour", response_model=List[ByHourRow])
def by_hour(cutoff: str = DEFAULT_CUTOFF):
    return records(metrics.by_hour(dataset(check_cutoff(cutoff))))


@app.get(f"{API}/metrics/by-day", response_model=List[ByDayRow])
def by_day(cutoff: str = DEFAULT_CUTOFF):
    return records(metrics.by_day(dataset(check_cutoff(cutoff))))


@app.get(f"{API}/metrics/by-horizon", response_model=List[ByHorizonRow])
def by_horizon():
    return records(metrics.by_horizon(F, A))


@app.get(f"{API}/metrics/histogram", response_model=Histogram)
def histogram(cutoff: str = DEFAULT_CUTOFF, bins: int = Query(30, ge=5, le=100)):
    return metrics.error_histogram(dataset(check_cutoff(cutoff)), bins=bins)


@app.get(f"{API}/metrics/heatmap", response_model=List[HeatmapCell])
def heatmap(cutoff: str = DEFAULT_CUTOFF):
    """One row per (date, hour) — the raw grid a 31-day x 24-hour error heatmap draws from."""
    return records(metrics.heatmap(dataset(check_cutoff(cutoff))))
