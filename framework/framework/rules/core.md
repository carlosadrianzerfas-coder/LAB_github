# Core Framework Rules (Minimal Always-On)

This file is the **minimal** rule set intended to be kept in context at all times.
All other framework documents are considered **load-on-demand** via `framework/config/context-routing.yml`.

---

## 1) Phase Discipline

- Phases are executed **sequentially**. You must not start Phase N+1 until Phase N is complete.
- Every phase must produce its **mandatory artifact** (Markdown) in `work-item/[project-slug]/`.
- If a phase is blocked, announce `[BLOCKER] — <description>` and request the missing input.

---

## 1.1) Operational Checkpoint (Always-On)

At the start of each work session and before touching a phase artifact, state the current operating checkpoint:

- Work item: `project-slug`
- Track: `new-feature`, `change-request`, or `hotfix`
- Current phase: phase number and name
- Work-item status: `active`, `blocked`, `on-hold`, or `archived`
- Phase status: descriptive `active.yml.phase_status` text when present
- Allowed persisted artifact(s): only the current phase artifact(s)
- Next gate: approval, missing input, quality gate, or blocker

If a checkpoint value has a mandatory fallback in `AGENT.md`, use that fallback and state it. If no fallback applies or multiple valid choices remain, ask a structured question and wait for the answer.

## 1.2) Structured Questions

- Use a question/choice tool when available.
- If no question tool exists, ask in chat with numbered options.
- Ask before choosing a track only when it cannot be resolved deterministically, and before resolving ambiguous phase state, deferring open questions, skipping a phase, or moving to the next phase.
- At phase closeout, use a structured next-step question with 2-4 options; do not use a bare yes/no prompt when the user may need to revise, pause, or resolve evidence.

## 1.3) Open Questions And Artifact Scope

- A phase cannot close while any current-phase open question has status `open`.
- `deferred` questions require explicit user approval and a named target phase.
- Do not persist artifacts owned by later phases during the current phase.
- Update `active.yml.current_phase` only after the transition gate passes and approval is recorded.
- When reporting produced artifacts, use full repo-relative paths.

---

## 2) Track Selection

Every work item belongs to exactly one **track**. The track determines which phases are mandatory,
optional, or pre-approved to skip. Resolve the track before loading any phase context.

| Track            | Typical trigger                   | Entry phase         | Key skips        |
| ---------------- | --------------------------------- | ------------------- | ---------------- |
| `new-feature`    | New functionality                 | Phase 1             | None             |
| `change-request` | Modification to existing behavior | Phase 1 (CR intake) | Phase 3 optional |
| `hotfix`         | Bug / emergency patch             | Phase 4             | Phases 1–3       |

**Resolution**: See `AGENT.md → Track Selection` for the full resolution algorithm.  
**Skip rules**: See `framework/config/phase-skips.yml → tracks` for per-track skip overrides.  
**Constraint**: The track must be recorded in `work-item/[project-slug]/active.yml` before Phase 1 (or Phase 4 for hotfix).

---

## 3) Approval Policy (Transitions)

- Before every phase transition, consult `framework/config/phase-approval.yml`.
- If the user requests skipping a phase, consult `framework/config/phase-skips.yml`:
  - default: skipping is not allowed unless explicitly enabled
  - even if enabled, require explicit user confirmation and any required evidence
- If `approval_mode: human`, stop and present:
  1. summary of what was produced
  2. quality gate result (prefer IDs, do not paste long checklists)
  3. explicit request for approval to proceed
- If `approval_mode: automatic`, proceed once criteria are met (post a short notice if configured).

---

## 4) Quality Gates

- Quality gates live in `framework/rules/quality-gates.md`.
- When reporting quality gates, **do not paste full checklists**.
- Report as:
  - `Passed: [QG...], Pending: [QG...]`
  - Provide details only for pending/failed items.

---

## 5) Change Management

- If construction (Phase 5) reveals design gaps, return to Phase 3 before continuing.
- If verification (Phase 6) finds deviations, document them and return to Phase 5.
- Scope changes must be reflected in updated Specs (Phase 2) before affecting design/build.

---

## 6) Technology Stack Resolution

Whenever a phase requires loading `technology-rules/[technology]/rules.md` (Phases 3, 4, 5, 6, 7, 9):

1. Read `work-item/[project-slug]/README.md` and look for a `technology:` or `tech_stack:` field.
2. If not found, read `work-item/[project-slug]/tech-config.yml` → field `technology`.
3. The resolved value must match an existing directory under `technology-rules/`
   (e.g., `"salesforce"` → `technology-rules/salesforce/`).
4. If no matching directory exists: **stop**, create one from `technology-rules/_template/`,
   and populate it before resuming the phase.
5. **Never guess or proceed silently.** If resolution fails, ask the user to confirm the technology stack.

---

## 7) Technical Documentation Discipline

- If the project defines living technical documentation for modules, areas, or components, consult it before analyzing or modifying the affected functionality.
- Use the configured index document to locate the relevant module or area sheet before changing code or phase artifacts that depend on implementation context.
- Treat the project's technical documentation as the functional and architectural source of truth unless the current change is explicitly updating that documentation.
- If a change modifies responsibilities, flows, contracts, dependencies, entry points, or relevant behavior, update the affected technical documentation before closing the work.

---

## 8) Framework Skill Resolution

- Framework skills are directory-based modules under `framework/skills/[skill-name]/`.
- The canonical entrypoint for each skill is `framework/skills/[skill-name]/skill.md`.
- Legacy flat paths such as `framework/skills/[skill-name].md` must not be used.

---

## 9) Rule Precedence

When rules conflict, apply in order:

1. Project-level overrides (explicit user instruction or `work-item/[slug]/README.md`)
2. Technology rules (`technology-rules/[technology]/rules.md`)
3. Framework rules (this file + other `framework/rules/*`)
4. Agent defaults

If a conflict is detected, surface it to the user before proceeding.

---

## 10) Prohibitions (Hard)

- Do not modify any source file before the mandatory intake artifact exists under
  `work-item/[project-slug]/01-intake/` (hotfix) or `work-item/[project-slug]/01-proposal/`
  (new-feature / change-request). Creating the work-item artifact always comes first.
- Do not start Phase 5 (Build) without a completed Phase 4 task-list artifact at
  `work-item/[project-slug]/04-tasks/task-list.md`.
- Do not generate code without loading applicable technology rules.
- Do not skip Phase 6 (Verification).
- Do not commit code without tests (Phase 7 completed).
- Do not release/archive without required approvals and artifacts.
- When Phase 10 (Archive) is approved, the full project folder MUST be moved
  from `work-item/[project-slug]/` to `work-item/archive/[project-slug]/`.
- **Phase 10 CANNOT be marked as Done or Closed until ALL of the following are confirmed:**
  1. The physical directory move has been executed — `work-item/[project-slug]/` must no longer exist.
  2. A git commit recording the archive movement has been created (use `--allow-empty` if files are gitignored).
  3. The archive commit hash has been recorded in the retrospective at `work-item/archive/[project-slug]/10-archive/retrospective.md`.
  - Marking status as `closed` in `active.yml` before these steps is **prohibited**.
  - Logical closure (status field update) ≠ Archive completion. Physical relocation is mandatory.
- Archived projects are immutable and must never be reactivated in-place.
