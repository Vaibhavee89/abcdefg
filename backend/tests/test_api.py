from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)

def test_forecast_returns_24_rows_before_cutoff():
    r = c.get("/api/v1/forecast", params={"decision_date": "2026-01-14", "cutoff": "09:00"})
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert len(rows) == 24
    assert all(x["publishTime"] <= "2026-01-14T09:00:00Z" for x in rows)

def test_summary_and_validation():
    s = c.get("/api/v1/metrics/summary").json()
    assert s["n"] == 744 and s["p95"] > s["p50"]
    assert c.get("/api/v1/forecast", params={"decision_date": "2026-03-01"}).status_code == 422
    assert c.get("/api/v1/metrics/summary", params={"cutoff": "9am"}).status_code == 422

def test_error_shape_is_consistent():
    """Every error response, whether a manual HTTPException or a FastAPI/Pydantic
    validation failure, comes back as {"error": {"code": ..., "message": ...}}."""
    manual = c.get("/api/v1/metrics/summary", params={"cutoff": "9am"})
    assert manual.status_code == 422
    body = manual.json()
    assert set(body.keys()) == {"error"}
    assert set(body["error"].keys()) == {"code", "message"}
    assert isinstance(body["error"]["code"], str) and isinstance(body["error"]["message"], str)

    # histogram's `bins` has a FastAPI Query(ge=5, le=100) constraint -> a
    # RequestValidationError, not our manual HTTPException -> same shape.
    auto = c.get("/api/v1/metrics/histogram", params={"bins": 1})
    assert auto.status_code == 422
    assert set(auto.json().keys()) == {"error"}
    assert set(auto.json()["error"].keys()) == {"code", "message"}

def test_meta_reflects_real_data_not_hardcoded():
    m = c.get("/api/v1/meta").json()
    assert m["data_version"]
    assert m["coverage"]["decisions"] == {"first": "2026-01-01", "last": "2026-01-31"}
    # the raw data range is padded well beyond the decision-date range
    assert m["coverage"]["actuals"]["first"] < m["coverage"]["decisions"]["first"]
    assert m["coverage"]["forecast_targets"]["last"] > m["coverage"]["decisions"]["last"]

def test_by_day_and_by_hour_match_their_response_models():
    """Regression test: by_day's "date" column is a plain datetime.date (object
    dtype), not a datetime64 column — it was silently skipped by records()'s
    stringify loop and failed response_model validation (500) until fixed."""
    by_day = c.get("/api/v1/metrics/by-day")
    assert by_day.status_code == 200
    days = by_day.json()
    assert len(days) == 31
    assert days[0]["date"] == "2026-01-02"

    by_hour = c.get("/api/v1/metrics/by-hour")
    assert by_hour.status_code == 200
    hours = by_hour.json()
    assert len(hours) == 24
    assert hours[0]["hour"] == 0

    by_horizon = c.get("/api/v1/metrics/by-horizon")
    assert by_horizon.status_code == 200
    assert len(by_horizon.json()) > 0

def test_every_response_carries_a_request_id():
    for r in [c.get("/api/v1/health"), c.get("/api/v1/metrics/summary", params={"cutoff": "9am"})]:
        rid = r.headers.get("x-request-id")
        assert rid and len(rid) == 8

def test_heatmap_covers_every_hour_of_every_day():
    r = c.get("/api/v1/metrics/heatmap")
    assert r.status_code == 200
    cells = r.json()
    assert len(cells) == 31 * 24
    assert {c["hour"] for c in cells} == set(range(24))
    assert len({c["date"] for c in cells}) == 31
    assert all(c["error"] is not None for c in cells)
