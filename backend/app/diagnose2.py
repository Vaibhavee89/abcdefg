import pandas as pd

from app.selection import *

f = prep_forecasts(pd.read_parquet("../data/forecasts_raw.parquet"))
a = prep_actuals_hourly(pd.read_parquet("../data/actuals_raw.parquet"))
df = build_dataset(f, a)

df["fc_bucket"] = pd.qcut(df.forecast, 5)
print(df.groupby("fc_bucket", observed=True)["error"].agg(["mean", "median", "count"]).round(0))
df["rel_err_pct"] = 100 * df.error / df.forecast
print(df.groupby("fc_bucket", observed=True)["rel_err_pct"].mean().round(1))
