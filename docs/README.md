# GGX Corporate - Documentation Index

Open only the docs needed for the current task. Compact docs and context files
are the default; archive files are historical.

## Agent Entry Points

| File | For |
|---|---|
| `../AGENTS.md` | Codex and general agents |
| `../.claude/CLAUDE.md` | Claude sessions and skill routing |

`AGENTS.md` and `.claude/CLAUDE.md` are intentionally similar. If one changes,
check whether the other needs the same update.

## Routing Rules

1. Infer task type before reading files.
2. Claude should load only one primary skill unless the task clearly spans
   multiple types.
3. Load only relevant context docs.
4. Read compact docs before source.
5. Do not read archive docs unless resolving history or contradictions.

### Short-Prompt Routing

| Prompt shape | Use |
|---|---|
| "fix button size", "make buttons primary", "align cards", "fix spacing" | `small-ui-polish` + `docs/context/ui-components.md` |
| "not showing", "wrong state", "broken after refresh", "scope mismatch" | `scoped-bugfix` + relevant context doc |
| "change flow", "improve UX", "update CTA behavior" | `ux-flow-change` + relevant context doc |
| "update docs", "fix docs contradiction" | `docs-maintenance` |
| "add to roadmap", "save for later", "mark deferred" | `roadmap-update` |
| "prepare handoff", "update session state" | `session-handoff` |

## Compact Current Docs

| File | When to read |
|---|---|
| `session_state.md` | Resume/checkpoint state and latest validated commit |
| `roadmap.md` | Active priority, backlog, and deferred production-only work |

## Context Docs

| File | Topic |
|---|---|
| `context/current-state.md` | Current product/build state and standing constraints |
| `context/basic_user_requirements.md` | Basic self-serve seller product definition, segments, journeys, rules |
| `context/backend-integration.md` | Service-layer/BFF integration guardrails |
| `context/business-plus-addons.md` | Account Add-ons, access status, CTA, scope rules |
| `context/commerce-workflows.md` | Inventory, Storefront, checkout/cart demo surfaces |
| `context/bulk-booking.md` | Upload File, in-app spreadsheet, product attachment, fees |
| `context/future-backlog.md` | Detailed specs for planned-but-not-started roadmap items |
| `context/ui-components.md` | Design system, component, responsive, and Figma rules |
| `context/oms-sample-data.md` | OMS-shaped sample order data, adapter boundary, status mapping, scenario coverage |

## Detailed Rule Docs

| File | Topic |
|---|---|
| `product_rules.md` | Product / UX decisions and constraints |
| `account_model.md` | Account, Subaccount, and permission logic |
| `service_layer_rules.md` | Service layer architecture and import rules |
| `design_system_rules.md` | Component usage and DS conventions |
| `business_plus_modules.md` | Account Add-ons master spec |
| `contract_module_rules.md` | Add-on access status and CTA logic |
| `feature_enablement_rules.md` | Feature enablement model |
| `service_type_rules.md` | Service type definitions |
| `commerce_rules.md` | Commerce platform rules |
| `inventory_rules.md` | Inventory rules |
| `storefront_rules.md` | Storefront rules |
| `spreadsheet_booking_rules.md` | In-app spreadsheet booking grid rules |
| `token_pipeline.md` | Design token pipeline |

## Claude Skills

| Skill | Use for |
|---|---|
| `.claude/skills/scoped-bugfix/SKILL.md` | Focused bugs with known expected behavior |
| `.claude/skills/small-ui-polish/SKILL.md` | Button, spacing, alignment, density, hover, responsive polish |
| `.claude/skills/ux-flow-change/SKILL.md` | Approved behavior/flow, CTA state, empty/loading/error changes |
| `.claude/skills/docs-maintenance/SKILL.md` | Markdown-only cleanup, compact docs, contradictions, archive moves |
| `.claude/skills/roadmap-update/SKILL.md` | Active priority, backlog, deferred item updates |
| `.claude/skills/session-handoff/SKILL.md` | Lightweight checkpoints after medium/large changes |

## Archive

`docs/archive/` contains historical snapshots and detailed logs. Do not update
archive files except when intentionally moving old history into the archive. Do
not treat archive docs as current state unless resolving a contradiction.

Current June 2026 detailed history lives in:

- `archive/session_log_2026-06.md`

## Update Rules

- Update `session_state.md` after medium/large work or before handoff.
- Update `roadmap.md` only when priority/backlog/deferred status changes.
- Update context/rule docs when behavior or product truth changes.
- Do not update docs after tiny UI fixes unless rules, roadmap, or session state
  changed.
- Markdown-only tasks do not require a build.
