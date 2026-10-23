import pandas as pd
import pytest

from app.selection import (
    prep_actuals_hourly,
    prep_forecasts,
    select_for_decision,
    validate_full_coverage,
)


def mk(rows):
    return pd.DataFrame(rows, columns=["startTime", "publishTime", "forecast"]).assign(
        startTime=lambda d: pd.to_datetime(d.startTime, utc=True),
        publishTime=lambda d: pd.to_datetime(d.publishTime, utc=True))

SLOT = "2026-01-15 14:00"

def test_excludes_after_cutoff():
    f = mk([(SLOT, "2026-01-14 07:30", 100), (SLOT, "2026-01-14 09:30", 999)])
    assert select_for_decision(f, "2026-01-14").forecast.tolist() == [100]

def test_includes_exactly_at_cutoff():
    f = mk([(SLOT, "2026-01-14 09:20", 100)])
    assert len(select_for_decision(f, "2026-01-14")) == 1

def test_latest_eligible_wins():
    f = mk([(SLOT, "2026-01-13 22:30", 1), (SLOT, "2026-01-14 07:30", 2), (SLOT, "2026-01-14 02:30", 3)])
    assert select_for_decision(f, "2026-01-14").forecast.tolist() == [2]

def test_missing_slot_is_absent_not_filled():
    """A slot with no forecast published before the cutoff simply doesn't appear
    in the output — it must not be silently filled with NaN, zero, or an error."""
    other_slot = "2026-01-15 15:00"
    f = mk([
        (SLOT, "2026-01-14 09:30", 100),        # only run is after the 09:20 cutoff -> no eligible forecast
        (other_slot, "2026-01-14 07:30", 200),  # has an eligible forecast
    ])
    out = select_for_decision(f, "2026-01-14", cutoff="09:20")
    assert len(out) == 1
    assert out.iloc[0]["startTime"] == pd.Timestamp(other_slot, tz="UTC")
    assert out.iloc[0]["forecast"] == 200

def test_no_lookahead_regression_guard():
    """If this ever fails, a forecast published after the cutoff leaked into the dataset."""
    f = mk([
        (SLOT, "2026-01-14 07:30", 100),
        (SLOT, "2026-01-14 09:30", 999),  # published after the 09:20 cutoff
    ])
    out = select_for_decision(f, "2026-01-14", cutoff="09:20")
    cut = pd.Timestamp("2026-01-14 09:20", tz="UTC")
    assert out.forecast.tolist() == [100]
    assert (out["publishTime"] <= cut).all()

def test_prep_forecasts_drops_duplicate_rows():
    raw = pd.DataFrame([
        {"startTime": "2026-01-15 00:00", "publishTime": "2026-01-14 07:30", "generation": 100},
        {"startTime": "2026-01-15 00:00", "publishTime": "2026-01-14 07:30", "generation": 100},
    ])
    out = prep_forecasts(raw)
    assert len(out) == 1

def test_actuals_missing_half_hour_is_nan():
    raw = pd.DataFrame([
        {"startTime": "2026-01-15 00:00", "generation": 100},  # only the :00 half-hour present
        {"startTime": "2026-01-15 01:00", "generation": 50},
        {"startTime": "2026-01-15 01:30", "generation": 70},
    ])
    out = prep_actuals_hourly(raw).set_index("startTime")["actual"]
    assert pd.isna(out[pd.Timestamp("2026-01-15 00:00", tz="UTC")])
    assert out[pd.Timestamp("2026-01-15 01:00", tz="UTC")] == 60

def test_validate_full_coverage_passes_on_complete_data():
    idx = pd.date_range("2026-01-02", periods=31 * 24, freq="h", tz="UTC")
    df = pd.DataFrame({"startTime": idx, "forecast": 100.0, "actual": 90.0})
    validate_full_coverage(df)  # should not raise

def test_validate_full_coverage_fails_on_missing_day():
    idx = pd.date_range("2026-01-02", periods=30 * 24, freq="h", tz="UTC")  # one day short
    df = pd.DataFrame({"startTime": idx, "forecast": 100.0, "actual": 90.0})
    with pytest.raises(RuntimeError):
        validate_full_coverage(df)

def test_validate_full_coverage_fails_on_missing_actual():
    idx = pd.date_range("2026-01-02", periods=31 * 24, freq="h", tz="UTC")
    df = pd.DataFrame({"startTime": idx, "forecast": 100.0, "actual": 90.0})
    df.loc[0, "actual"] = None
    with pytest.raises(RuntimeError):
        validate_full_coverage(df)
