from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)

def test_forecast_returns_24_rows_before_cutoff():
    r = c.get("/api/forecast", params={"decision_date": "2026-01-14", "cutoff": "09:00"})
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert len(rows) == 24
    assert all(x["publishTime"] <= "2026-01-14T09:00:00Z" for x in rows)

def test_summary_and_validation():
    s = c.get("/api/metrics/summary").json()
    assert s["n"] == 744 and s["p95"] > s["p50"]
    assert c.get("/api/forecast", params={"decision_date": "2026-03-01"}).status_code == 422
    assert c.get("/api/metrics/summary", params={"cutoff": "9am"}).status_code == 422
