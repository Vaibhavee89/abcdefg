import pandas as pd

a = pd.read_parquet("data/actuals_raw.parquet")
f = pd.read_parquet("data/forecasts_raw.parquet")

for df, cols in [(a, ["startTime"]), (f, ["startTime", "publishTime"])]:
    for c in cols:
        df[c] = pd.to_datetime(df[c], utc=True)

a = a.sort_values("startTime")

print("== 1. Step sizes ==")
print("actual:", a["startTime"].diff().value_counts().head(3).to_dict())
print("forecast:", f["startTime"].drop_duplicates().sort_values().diff().value_counts().head(3).to_dict())

print("\n== 2. Horizon (hours) ==")
f["horizon_h"] = (f["startTime"] - f["publishTime"]).dt.total_seconds() / 3600
print(f["horizon_h"].describe())
print("negative-horizon rows:", (f["horizon_h"] <= 0).sum())

print("\n== 3. Forecasts per target slot ==")
print(f.groupby("startTime").size().describe())

print("\n== 4. Duplicates and gaps ==")
print("dup actuals:", a.duplicated("startTime").sum())
print("dup forecasts:", f.duplicated(["startTime", "publishTime"]).sum())
full = pd.date_range("2026-01-01", "2026-01-31 23:30", freq="30min", tz="UTC")
print("missing actual half-hours in Jan:", len(full.difference(a["startTime"])))

print("\n== 5. Publish hours (UTC) ==")
print(f["publishTime"].dt.hour.value_counts().sort_index().to_dict())

print("\n== 6. Selection check for 2026-01-15, cutoff 09:00 UTC on 14 Jan ==")
cutoff = pd.Timestamp("2026-01-14 09:00", tz="UTC")
day = pd.Timestamp("2026-01-15", tz="UTC")
sel = f[(f["startTime"] >= day) & (f["startTime"] < day + pd.Timedelta(days=1)) & (f["publishTime"] <= cutoff)]
sel = sel.sort_values("publishTime").groupby("startTime").tail(1).sort_values("startTime")
print("rows:", len(sel))
print(sel[["startTime", "publishTime", "horizon_h"]].head(5).to_string())
print("distinct publishTimes picked:", sel["publishTime"].nunique())