import pandas as pd
from app.selection import select_for_decision

def mk(rows):
    return pd.DataFrame(rows, columns=["startTime", "publishTime", "forecast"]).assign(
        startTime=lambda d: pd.to_datetime(d.startTime, utc=True),
        publishTime=lambda d: pd.to_datetime(d.publishTime, utc=True))

SLOT = "2026-01-15 14:00"

def test_excludes_after_cutoff():
    f = mk([(SLOT, "2026-01-14 07:30", 100), (SLOT, "2026-01-14 09:30", 999)])
    assert select_for_decision(f, "2026-01-14").forecast.tolist() == [100]

def test_includes_exactly_at_cutoff():
    f = mk([(SLOT, "2026-01-14 09:00", 100)])
    assert len(select_for_decision(f, "2026-01-14")) == 1

def test_latest_eligible_wins():
    f = mk([(SLOT, "2026-01-13 22:30", 1), (SLOT, "2026-01-14 07:30", 2), (SLOT, "2026-01-14 02:30", 3)])
    assert select_for_decision(f, "2026-01-14").forecast.tolist() == [2]
