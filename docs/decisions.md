# Decisions

Short, one-paragraph notes on a few choices in this project that weren't obvious defaults, and why they were made.

## Why parquet, not a database or live API calls

The API never calls Elexon at request time. Instead, `backend/app/fetch_data.py` is run once to pull FUELHH and WINDFOR into `data/*.parquet`, which the backend loads into memory at startup. For a fixed, bounded dataset (one month plus padding, under 700 KB total) a database would be pure overhead, and querying Elexon live on every request would make the API's latency and uptime depend on a third-party service with no SLA to this project. Parquet also keeps the whole analysis reproducible from a single committed snapshot: anyone who clones the repo sees exactly the same numbers, with no risk of the live data having moved on.

## Why the decision cutoff is a parameter, not a constant

The cutoff (which forecast run counts as "available" at decision time) is threaded through `select_for_decision`, `build_dataset`, and every API endpoint as an argument with a default, never hardcoded into the selection logic itself. This was a deliberate bet that the exact gate-closure time would be uncertain or would need to be revisited — which is exactly what happened (09:00 as a placeholder, then corrected to the real EPEX GB/N2EX times). Because it was already a parameter, that correction, and the 09:20-vs-09:50 sensitivity check in the README, required zero changes to the selection or metrics code, only a default value.

## Why no bias correction is applied

The forecast runs persistently and substantially above metered actuals (around +15% on average). It would be easy to quietly subtract that average from every forecast shown and present a "corrected" number. This project deliberately does not do that, for two reasons: the cause of the bias isn't confirmed (plausible explanations like curtailment or a WINDFOR/FUELHH scope mismatch were never tested against other data), and any correction computed from the full month would leak future information into a number meant to represent what was knowable at decision time. The one buffer-sizing feature in the app (the "cautious plan" line, and the capacity-scaling calculator) is explicitly labelled as illustrative, not a trading recommendation, for the same reason.

## Why actuals are averaged to the hour instead of using one half-hour

FUELHH actuals are published every 30 minutes; WINDFOR forecasts are hourly. Rather than discarding half the actuals (e.g. always taking the `:00` reading) or upsampling the forecast, the two half-hours inside each hour are averaged, and the result is explicitly NaN if either half-hour is missing rather than silently averaging over one data point. This keeps the comparison symmetric — each metric is a true hourly average on both sides — at the cost of being unable to say anything about sub-hourly ramps.

## Why selection and metrics are pure functions, separate from the API

`backend/app/selection.py` and `backend/app/metrics.py` take and return plain DataFrames, with no FastAPI, no I/O, and no global state. The API layer (`main.py`) is a thin wrapper that calls them and serializes the result. This was worth the extra indirection because it makes the core logic — the part most likely to have a subtle bug, like an off-by-one in the cutoff comparison — directly unit-testable without spinning up a server, which is what `backend/tests/test_selection.py` and `test_metrics.py` do.
