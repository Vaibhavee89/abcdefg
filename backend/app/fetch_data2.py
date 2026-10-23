import pandas as pd

a = pd.read_parquet("data/actuals_raw.parquet")
f = pd.read_parquet("data/forecasts_raw.parquet")

print(a.columns.tolist(), f.columns.tolist())
print(a.head(3), f.head(3), sep="\n")

for df, col in [(a, "startTime"), (f, "startTime"), (f, "publishTime")]:
    df[col] = pd.to_datetime(df[col], utc=True)

# 1. Resolution check
print("actual step:", a["startTime"].sort_values().diff().value_counts().head(3))
print("forecast step:", f["startTime"].drop_duplicates().sort_values().diff().value_counts().head(3))

# 2. Horizon
f["horizon_h"] = (f["startTime"] - f["publishTime"]).dt.total_seconds() / 3600
print(f["horizon_h"].describe())

# 3. Forecasts per target slot
print(f.groupby("startTime").size().describe())

# 4. Duplicates / gaps
print("dup actuals:", a.duplicated(["startTime"]).sum())
print("dup forecasts:", f.duplicated(["startTime", "publishTime"]).sum())
full = pd.date_range("2026-01-01", "2026-01-31 23:30", freq="30min", tz="UTC")
print("missing actual slots in Jan:", len(full.difference(a["startTime"])))

# 5. Publish time pattern (does a forecast arrive every hour? every 3?)
print(f["publishTime"].dt.hour.value_counts().sort_index())