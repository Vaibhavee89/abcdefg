import pandas as pd

from app.metrics import summary


def mk_df(rows):
    df = pd.DataFrame(rows, columns=["startTime", "forecast", "actual"])
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["error"] = df["forecast"] - df["actual"]
    return df

def test_summary_matches_hand_calculation():
    # errors: +10, -20, +30, 0
    # bias = mean(error) = (10 - 20 + 30 + 0) / 4 = 5
    # MAE  = mean(|error|) = (10 + 20 + 30 + 0) / 4 = 15
    # RMSE = sqrt(mean(error^2)) = sqrt((100 + 400 + 900 + 0) / 4) = sqrt(350)
    df = mk_df([
        ("2026-01-15 00:00", 110, 100),
        ("2026-01-15 01:00", 80, 100),
        ("2026-01-15 02:00", 130, 100),
        ("2026-01-15 03:00", 100, 100),
    ])
    s = summary(df)
    assert s["n"] == 4
    assert s["bias"] == 5
    assert s["mae"] == 15
    assert round(s["rmse"], 6) == round(350 ** 0.5, 6)
    assert s["mean_actual"] == 100

def test_missing_actual_is_excluded_from_metrics():
    df = mk_df([
        ("2026-01-15 00:00", 110, float("nan")),  # no actual -> error is NaN -> excluded
        ("2026-01-15 01:00", 100, 100),            # error 0
    ])
    s = summary(df)
    assert s["n"] == 1
    assert s["bias"] == 0
    assert s["mae"] == 0
