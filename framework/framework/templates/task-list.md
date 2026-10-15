---
template_id: task-list
version: "1.1"
track: "{{track}}"
project_slug: "{{project_slug}}"
created: "{{date}}"
updated: "{{date}}"
---

# Atomic Task List — {{project_name}}

> Each task must be independently verifiable and reference design components (CMP-\*) and requirements (FR/NFR) where applicable.

**Track**: {{track}} | **Phase**: 4 — Atomic Tasks | **Project**: {{project_slug}}

---

## Legend

- **Status**: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked
- **Complexity**: S (< 2h) · M (2–8h) · L (> 8h)
- **Priority**: P1 critical · P2 high · P3 normal
- **depends_on**: list of TASK-IDs that must be completed before this task starts

---

## Summary Table

| Task     | Title          | Component | Complexity | Priority | Depends on | Status |
| -------- | -------------- | --------- | ---------- | -------- | ---------- | ------ |
| TASK-001 | {{task_title}} | CMP-01    | S          | P2       | —          | [ ]    |

---

## Tasks

### TASK-001 — {{task_title}}

- **Status**: [ ]
- **Component(s)**: CMP-01
- **Requirements**: FR-01
- **Description**: {{description}}
- **depends_on**: —
- **Complexity**: S
- **Priority**: P2
- **Verification** (how to prove done):
  - Evidence:
  - Command / screenshot / link:

---

## Open Questions / Pending Decisions

> Phase 4 cannot close while any task requires a pending design decision. Resolve questions before Phase 5 or defer with explicit user approval and target phase.

| ID | Question | Status | Resolution | Owner | Target phase |
| --- | --- | --- | --- | --- | --- |
| Q-000 | No open questions at draft creation. Add real questions as needed. | cancelled | Not applicable | Agent | Phase 4 |

---

<!--
Add more tasks following the same structure.
Keep the Summary Table in sync with the tasks below.
-->
