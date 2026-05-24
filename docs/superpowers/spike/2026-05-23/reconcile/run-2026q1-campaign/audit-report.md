# Meta Ads Data Reconciliation

Status: FAIL
Environment: production
Date range: 2026-01-01 to 2026-03-31 inclusive
Dimensions: campaign
Filters: (none)
Source rows fetched: 5428
Source rows after filters: 5428

## Artifacts

- Reconciliation CSV: docs/superpowers/spike/2026-05-23/reconcile/run-2026q1-campaign/reconciliation.csv
- Failures JSON: docs/superpowers/spike/2026-05-23/reconcile/run-2026q1-campaign/failures.json
- Raw summary JSON: docs/superpowers/spike/2026-05-23/reconcile/run-2026q1-campaign/raw-summary.json
- RPC rows JSON: docs/superpowers/spike/2026-05-23/reconcile/run-2026q1-campaign/rpc-rows.json

## Result

178 mismatch(es) found.

- campaign=120204385505670650 spend: raw=734.4 rpc=883.97 delta=149.57
- campaign=120204385505670650 impressions: raw=159698 rpc=182247 delta=22549
- campaign=120204385505670650 reach: raw=132892 rpc=151451 delta=18559
- campaign=120204385505670650 clicks: raw=6602 rpc=7611 delta=1009
- campaign=120204385505670650 leads: raw=18 rpc=21 delta=3
- campaign=120204385505670650 conversions: raw=35 rpc=42 delta=7
- campaign=120204385505670650 messaging_contacts: raw=481 rpc=556 delta=75
- campaign=120204385505670650 new_messaging_contacts: raw=380 rpc=434 delta=54
- campaign=120204385505670650 primary_results: raw=481 rpc=556 delta=75
- campaign=120204385505670650 secondary_results: raw=380 rpc=434 delta=54
- campaign=120204385505670650 ctr: raw=4.13 rpc=4.18 delta=0.05
- campaign=120204385505670650 cpm: raw=4.6 rpc=4.85 delta=0.25
- campaign=120204385505670650 cpl: raw=40.8 rpc=42.09 delta=1.29
- campaign=120204385505670650 source_rows: raw=280 rpc=350 delta=70
- campaign=120204385704650650 spend: raw=642.93 rpc=581.09 delta=-61.84
- campaign=120204385704650650 impressions: raw=54099 rpc=49696 delta=-4403
- campaign=120204385704650650 reach: raw=46262 rpc=42570 delta=-3692
- campaign=120204385704650650 clicks: raw=3017 rpc=2712 delta=-305
- campaign=120204385704650650 leads: raw=17 rpc=14 delta=-3
- campaign=120204385704650650 conversions: raw=33 rpc=26 delta=-7
- campaign=120204385704650650 messaging_contacts: raw=143 rpc=131 delta=-12
- campaign=120204385704650650 new_messaging_contacts: raw=58 rpc=55 delta=-3
- campaign=120204385704650650 primary_results: raw=143 rpc=131 delta=-12
- campaign=120204385704650650 secondary_results: raw=58 rpc=55 delta=-3
- campaign=120204385704650650 ctr: raw=5.58 rpc=5.46 delta=-0.12
- campaign=120204385704650650 cpm: raw=11.88 rpc=11.69 delta=-0.19
- campaign=120204385704650650 cpl: raw=37.82 rpc=41.51 delta=3.69
- campaign=120204385704650650 source_rows: raw=369 rpc=332 delta=-37
- campaign=120211070105150650 spend: raw=583.8 rpc=709.59 delta=125.79
- campaign=120211070105150650 impressions: raw=160093 rpc=189194 delta=29101
- campaign=120211070105150650 reach: raw=126435 rpc=147854 delta=21419
- campaign=120211070105150650 clicks: raw=5795 rpc=6832 delta=1037
- campaign=120211070105150650 leads: raw=11 rpc=16 delta=5
- campaign=120211070105150650 conversions: raw=22 rpc=30 delta=8
- campaign=120211070105150650 messaging_contacts: raw=282 rpc=334 delta=52
- campaign=120211070105150650 new_messaging_contacts: raw=203 rpc=240 delta=37
- campaign=120211070105150650 primary_results: raw=282 rpc=334 delta=52
- campaign=120211070105150650 secondary_results: raw=203 rpc=240 delta=37
- campaign=120211070105150650 cpm: raw=3.65 rpc=3.75 delta=0.1
- campaign=120211070105150650 cpl: raw=53.07 rpc=44.35 delta=-8.72
- campaign=120211070105150650 source_rows: raw=87 rpc=111 delta=24
- campaign=120211096155910650 spend: raw=909.8 rpc=1148.51 delta=238.71
- campaign=120211096155910650 impressions: raw=324204 rpc=461284 delta=137080
- campaign=120211096155910650 reach: raw=278610 rpc=400335 delta=121725
- campaign=120211096155910650 clicks: raw=7363 rpc=9248 delta=1885
- campaign=120211096155910650 leads: raw=21 rpc=25 delta=4
- campaign=120211096155910650 conversions: raw=36 rpc=44 delta=8
- campaign=120211096155910650 messaging_contacts: raw=362 rpc=500 delta=138
- campaign=120211096155910650 new_messaging_contacts: raw=321 rpc=449 delta=128
- campaign=120211096155910650 primary_results: raw=362 rpc=500 delta=138
- 128 more failures omitted.

