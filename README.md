# OGSERC Revenue Register — Claude Code handoff pack

Standalone project. Shares nothing with the other OGSERC apps.

Start with KICKOFF.md: step 0 setup, then one prompt per phase.

- CLAUDE.md: rules Claude Code follows in every session
- BUILD_SPEC.md: what to build and the exact business rules (from the .xlsm)
- DESIGN.md: dark-mode design system, gradients and motion
- seed/: data extracted from OGSERC_Revenue_Register_FMS_v2.xlsm (2 Nov 2026)
  - fee_heads.json (78), licence_fee_bands.json (76), schedule3_*.json
  - payers.json (46; 10 flagged is_sample)
  - revenue_budget_fy2026.json (19 lines x 12 months, Budget V2 draft)
  - settings.json (settings + dropdown lists)
  - sample_receipts.json (17), sample_demand_notices.json (7): dev/preview and acceptance tests only
