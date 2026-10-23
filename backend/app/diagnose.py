import pandas as pd
from app.selection import *

f = prep_forecasts(pd.read_parquet("../data/forecasts_raw.parquet"))
raw = pd.read_parquet("../data/actuals_raw.parquet")
raw["startTime"] = pd.to_datetime(raw["startTime"], utc=True)
a_hourly = prep_actuals_hourly(raw)
df = build_dataset(f, a_hourly)

print("== A. ratio ==")
print("mean forecast / mean actual:", round(df.forecast.mean() / df.actual.mean(), 3))

print("\n== B. alignment test (MAE and bias by actual-time shift) ==")
act = a_hourly.set_index("startTime")["actual"]
s30 = raw.set_index("startTime")["generation"].sort_index()
cands = {f"hourly-mean shift {h:+d}h": act.shift(freq=pd.Timedelta(hours=h)) for h in [-2, -1, 0, 1, 2]}
cands["only :00 half-hour"] = s30
cands["only :30 half-hour"] = s30.shift(freq=pd.Timedelta(minutes=-30))
for name, ser in cands.items():
    a2 = ser.reindex(df.startTime).values
    e = df.forecast.values - a2
    print(f"{name:24s} MAE={pd.Series(abs(e)).mean():8.0f}  bias={pd.Series(e).mean():8.0f}")

print("\n== C. near-real-time forecast (latest published at or before the slot) ==")
g = f[f.publishTime <= f.startTime].sort_values("publishTime").groupby("startTime").tail(1)
g = g.merge(a_hourly, on="startTime")
g = g[(g.startTime >= "2026-01-02") & (g.startTime < "2026-02-02")]
print("bias:", round((g.forecast - g.actual).mean()), " MAE:", round((g.forecast - g.actual).abs().mean()))

print("\n== D. bias by hour of day and by day ==")
print(df.groupby(df.startTime.dt.hour)["error"].mean().round(0).to_dict())
print(df.groupby(df.startTime.dt.date)["error"].mean().round(0).describe())
print("share of days with positive mean error:", (df.groupby(df.startTime.dt.date)["error"].mean() > 0).mean().round(2))
