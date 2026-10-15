# Project Registry

This file is the single source of truth for all projects in this framework.  
Update the table whenever a project is created, advances a phase, changes status, or is archived.

## Status Legend

| Icon | Meaning |
|------|---------|
| 🔵 | Planned — not yet started |
| 🟡 | In Progress |
| 🟠 | Blocked |
| ✅ | Completed |
| ❌ | Cancelled |
| 📦 | Archived |

> Archived projects are physically moved to the top-level `archive/` directory
> and must no longer appear in this active registry table.

## Project Registry

| Slug | Name | Technology | Current Phase | Status | Last Updated |
|------|------|------------|---------------|--------|--------------|


---

## How to Register a New Project

1. Create the project folder: `work-item/[your-project-slug]/`
2. Copy `framework/templates/project-readme.md` → `work-item/[your-project-slug]/README.md` and fill it in
3. Add a row to the table above
4. Begin Phase 1 following `framework/workflows/phase-01-proposal.md`

## Folder Structure per Project

```
work-item/
  [project-slug]/
    README.md                        ← Project home page (this template)
    01-proposal/
      proposal.md
    02-specs/
      specs.md
    03-design/
      design.md
      adr/
        ADR-001-[title].md
        adr-registry.md
    04-tasks/
      task-list.md
    05-build/
      build-log.md
    06-verification/
      verification-report.md
    07-testing/
      test-report.md
    08-commit-pr/
      (PR link recorded in build-log or verification-report)
    09-release/
      release-notes.md
    10-archive/
      retrospective.md
