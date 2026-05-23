# Meta Ads Data Reconciliation

Status: FAIL
Environment: production
Date range: 2024-01-01 to 2024-12-31 inclusive
Dimensions: campaign_umbrella
Filters: (none)
Source rows fetched: 46105
Source rows after filters: 46105

## Artifacts

- Reconciliation CSV: docs/superpowers/spike/2026-05-23/reconcile/run-2024-umbrella/reconciliation.csv
- Failures JSON: docs/superpowers/spike/2026-05-23/reconcile/run-2024-umbrella/failures.json
- Raw summary JSON: docs/superpowers/spike/2026-05-23/reconcile/run-2024-umbrella/raw-summary.json
- RPC rows JSON: docs/superpowers/spike/2026-05-23/reconcile/run-2024-umbrella/rpc-rows.json

## Result

75 mismatch(es) found.

- campaign_umbrella=Excluded / Non-umbrella spend: raw=3124.37 rpc=1632.15 delta=-1492.22
- campaign_umbrella=Excluded / Non-umbrella impressions: raw=1569260 rpc=788096 delta=-781164
- campaign_umbrella=Excluded / Non-umbrella reach: raw=1502052 rpc=753658 delta=-748394
- campaign_umbrella=Excluded / Non-umbrella clicks: raw=15159 rpc=7805 delta=-7354
- campaign_umbrella=Excluded / Non-umbrella messaging_contacts: raw=209 rpc=117 delta=-92
- campaign_umbrella=Excluded / Non-umbrella new_messaging_contacts: raw=27 rpc=15 delta=-12
- campaign_umbrella=Excluded / Non-umbrella primary_results: raw=209 rpc=117 delta=-92
- campaign_umbrella=Excluded / Non-umbrella ctr: raw=0.97 rpc=0.99 delta=0.02
- campaign_umbrella=Excluded / Non-umbrella cpm: raw=1.99 rpc=2.07 delta=0.08
- campaign_umbrella=Excluded / Non-umbrella source_rows: raw=1345 rpc=743 delta=-602
- campaign_umbrella=Facebook US Product spend: raw=71689.12 rpc=65717.83 delta=-5971.29
- campaign_umbrella=Facebook US Product impressions: raw=6500613 rpc=5958087 delta=-542526
- campaign_umbrella=Facebook US Product reach: raw=5519995 rpc=5057482 delta=-462513
- campaign_umbrella=Facebook US Product clicks: raw=289559 rpc=263811 delta=-25748
- campaign_umbrella=Facebook US Product leads: raw=123 rpc=96 delta=-27
- campaign_umbrella=Facebook US Product conversions: raw=128 rpc=101 delta=-27
- campaign_umbrella=Facebook US Product messaging_contacts: raw=12343 rpc=11151 delta=-1192
- campaign_umbrella=Facebook US Product new_messaging_contacts: raw=5942 rpc=5377 delta=-565
- campaign_umbrella=Facebook US Product primary_results: raw=12343 rpc=11151 delta=-1192
- campaign_umbrella=Facebook US Product secondary_results: raw=5942 rpc=5377 delta=-565
- campaign_umbrella=Facebook US Product ctr: raw=4.45 rpc=4.43 delta=-0.02
- campaign_umbrella=Facebook US Product cpl: raw=582.84 rpc=684.56 delta=101.72
- campaign_umbrella=Facebook US Product source_rows: raw=31984 rpc=28304 delta=-3680
- campaign_umbrella=Facebook VN Product spend: raw=35177.79 rpc=52313.12 delta=17135.33
- campaign_umbrella=Facebook VN Product impressions: raw=9150716 rpc=12439445 delta=3288729
- campaign_umbrella=Facebook VN Product reach: raw=8203343 rpc=11031038 delta=2827695
- campaign_umbrella=Facebook VN Product clicks: raw=317984 rpc=444381 delta=126397
- campaign_umbrella=Facebook VN Product leads: raw=31 rpc=175 delta=144
- campaign_umbrella=Facebook VN Product conversions: raw=33 rpc=177 delta=144
- campaign_umbrella=Facebook VN Product messaging_contacts: raw=19311 rpc=25726 delta=6415
- campaign_umbrella=Facebook VN Product new_messaging_contacts: raw=15815 rpc=20763 delta=4948
- campaign_umbrella=Facebook VN Product primary_results: raw=19311 rpc=25726 delta=6415
- campaign_umbrella=Facebook VN Product secondary_results: raw=15815 rpc=20763 delta=4948
- campaign_umbrella=Facebook VN Product ctr: raw=3.47 rpc=3.57 delta=0.1
- campaign_umbrella=Facebook VN Product cpm: raw=3.84 rpc=4.21 delta=0.37
- campaign_umbrella=Facebook VN Product cpl: raw=1134.77 rpc=298.93 delta=-835.84
- campaign_umbrella=Facebook VN Product source_rows: raw=11256 rpc=14454 delta=3198
- campaign_umbrella=Needs review spend: raw=573.57 rpc=1119.81 delta=546.24
- campaign_umbrella=Needs review impressions: raw=131817 rpc=261840 delta=130023
- campaign_umbrella=Needs review reach: raw=97371 rpc=192402 delta=95031
- campaign_umbrella=Needs review clicks: raw=3916 rpc=8274 delta=4358
- campaign_umbrella=Needs review messaging_contacts: raw=263 rpc=580 delta=317
- campaign_umbrella=Needs review new_messaging_contacts: raw=249 rpc=546 delta=297
- campaign_umbrella=Needs review primary_results: raw=263 rpc=580 delta=317
- campaign_umbrella=Needs review ctr: raw=2.97 rpc=3.16 delta=0.19
- campaign_umbrella=Needs review cpm: raw=4.35 rpc=4.28 delta=-0.07
- campaign_umbrella=Needs review source_rows: raw=101 rpc=208 delta=107
- campaign_umbrella=US Promotions (WKDS / OOAK) spend: raw=6061.14 rpc=7811.05 delta=1749.91
- campaign_umbrella=US Promotions (WKDS / OOAK) impressions: raw=333011 rpc=433265 delta=100254
- campaign_umbrella=US Promotions (WKDS / OOAK) reach: raw=226323 rpc=302225 delta=75902
- 25 more failures omitted.

