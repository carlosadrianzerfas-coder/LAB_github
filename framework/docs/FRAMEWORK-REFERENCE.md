# Framework Reference — Axet (Work-Item Root)

This document is a **reference** to understand how Axet is organized.
It intentionally **links to source-of-truth files** instead of duplicating them.

## Source of truth

- Agent entrypoint: `AGENT.md`
- Always-on rules: `framework/rules/core.md`
- Context routing: `framework/config/context-routing.yml`
- Approval policy: `framework/config/phase-approval.yml`
- Phase skipping policy: `framework/config/phase-skips.yml`
- Quality gates (compact): `framework/rules/quality-gates.md`
- Quality gates (verbose, only when needed): `framework/rules/quality-gates-extended.md`
- Evidence rules: `framework/rules/evidence.md`
- Technology rules: `technology-rules/[technology]/rules.md`

## Repository layout (high level)

- `framework/` — rules, workflows, skills, templates
- `technology-rules/` — tech-specific policies
- `work-item/` — active work-items (each work-item is a 10-phase lifecycle)
- `work-item/archive/` — completed work-items moved here after Phase 10
- `docs/` — operator documentation

## Framework skill modules

Framework skills are directory-based modules. Load each skill through its
entrypoint:

- `framework/skills/[skill-name]/skill.md`

Do not use legacy flat paths such as `framework/skills/[skill-name].md`.

## Work-item path contract

All phase artifacts live under:

- Active: `work-item/[work-item-slug]/NN-phase-name/<artifact>.md`
- Archived: `work-item/archive/[work-item-slug]/...`

## Technology resolution (strict from Phase 03 onwards)

Phases requiring technology rules:

- Phase 03 — Design
- Phase 04 — Tasks
- Phase 05 — Build
- Phase 06 — Verification
- Phase 07 — Testing
- Phase 09 — Release

Resolution order (see `framework/rules/core.md` and `framework/config/context-routing.yml`):

1. `work-item/[slug]/README.md` fields `technology:` or `tech_stack:`
2. `work-item/[slug]/tech-config.yml` field `technology`
3. Must match a folder under `technology-rules/`

If resolution fails, the agent must stop with `[BLOCKER]`.

## Living technical documentation

Axet supports project-level living technical documentation as a reusable capability for implementation context and maintenance.

Use it when a project keeps modular technical sheets for areas, modules, components, or services and wants agents to consult and maintain them during delivery work.

Recommended project configuration:

```yml
technical_documentation:
  enabled: true
  root: docs/
  index: docs/README.md
  module_pattern: docs/<module>.md
```

Key framework pieces:

- Always-on discipline: `framework/rules/core.md`
- Reusable skill: `framework/skills/project-documentation/skill.md`
- Reusable module sheet template: `framework/templates/module-doc.md`

`docs/` is a recommended convention, not a hardcoded framework path. Projects may use another path if they configure an equivalent index and sheet structure.

## Archive policy

After Phase 10 completes and is approved, the entire work-item folder is moved:

- `work-item/[slug]/` → `work-item/archive/[slug]/`

See `framework/skills/project-archiving/skill.md` and `framework/workflows/phase-10-archive.md`.
