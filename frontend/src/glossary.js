export const GLOSSARY = {
  bias: 'The average error (forecast minus actual) across all hours — positive means the forecast tends to run too high.',
  mae: 'Mean Absolute Error: the average size of the error, ignoring direction — how far off the forecast typically is.',
  rmse: 'Root Mean Square Error: like MAE, but penalises large misses more heavily than small ones.',
  p90: 'The 90th percentile of over-forecast: in 90% of hours, the forecast was too high by less than this amount.',
  p95: 'The 95th percentile of over-forecast: a more defensive buffer — only 5% of hours exceeded this over-forecast.',
  error: 'Error = Forecast − Actual. Positive means the forecast was too high (shortfall risk); negative means it was too low (surplus).',
  cutoff: 'The time of day a trading decision is made. Only forecast runs published at or before this time are used.',
  horizon: 'How many hours ahead of delivery the forecast was published — shorter horizons are usually more accurate.',
}
