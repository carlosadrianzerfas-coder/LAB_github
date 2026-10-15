# Quality Gates — Acceptance Criteria by Phase (Extended)

This document contains the **verbose** checklists per phase.
For day-to-day operation, prefer `framework/rules/quality-gates.md` (compact IDs + 1-liners)
and reference quality gates by ID (avoid re-pasting long lists).

---

## Phase 1 — Proposal ✅ when:

- [ ] Has a title and description of the problem to solve
- [ ] Identifies the stakeholder / affected user
- [ ] Describes the expected business value
- [ ] Lists known constraints (time, technology, budget)
- [ ] Has been reviewed and approved by the user

---

## Phase 2 — Specs ✅ when:

- [ ] Contains **Functional Requirements (FR)** numbered and prioritized
- [ ] Contains **Non-Functional Requirements (NFR)** (performance, security, scalability)
- [ ] Defines **use cases** or **user stories** with acceptance criteria
- [ ] Identifies external integrations or dependencies
- [ ] Contains no ambiguities — each requirement is verifiable
- [ ] Has been reviewed and approved by the user

---

## Phase 3 — Design ✅ when:

- [ ] Defines the component architecture (Mermaid diagram)
- [ ] Describes each component: responsibility, inputs and outputs
- [ ] Documents the data model (objects, fields, relationships)
- [ ] Defines integration points
- [ ] Justifies relevant design decisions (ADRs)
- [ ] Is aligned with all phase 2 requirements

---

## Phase 4 — Atomic Tasks ✅ when:

- [ ] Each task is independent and has a verifiable result
- [ ] Each task references the design component it belongs to
- [ ] The set of tasks covers 100% of the design
- [ ] Dependencies between tasks are identified
- [ ] Each task has a complexity estimate (S/M/L)

---

## Phase 5 — Construction ✅ when:

- [ ] All atomic tasks in the task-list are marked as completed
- [ ] Code follows the applicable technology rules
- [ ] No compilation / static analysis errors
- [ ] Code is documented (comments on complex methods)
- [ ] A `work-item/[project-slug]/05-build/build-log.md` has been generated with decisions made during construction

---

## Phase 6 — Verification ✅ when:

- [ ] Each design component has its implementation verified
- [ ] Each atomic task has its implementation evidence
- [ ] Deviations are documented with justification
- [ ] No unresolved critical deviations
- [ ] The `work-item/[project-slug]/06-verification/verification-report.md` is signed (approved by the user)
- [ ] PMD static analysis — 0 violations Priority 1–3
- [ ] ESLint LWC — 0 errors

---

## Phase 7 — Testing ✅ when:

- [ ] Code coverage meets the threshold defined in the project's technology rules
- [ ] All use cases from phase 2 have an associated test
- [ ] Tests cover positive, negative and boundary cases
- [ ] No failing tests
- [ ] The `work-item/[project-slug]/07-testing/test-report.md` documents the coverage summary

---

## Phase 8 — Commit & PR ✅ when:

- [ ] All commits follow Conventional Commits
- [ ] The PR has a complete description with reference to the project
- [ ] The PR has passed automated checks (if applicable)
- [ ] Has been reviewed and approved

---

## Phase 9 — Release ✅ when:

- [ ] The `work-item/[project-slug]/09-release/release-notes.md` is complete with changes, impacts and rollback steps
- [ ] Deployment has been performed in the target environment
- [ ] Post-deploy functionality has been verified
- [ ] The tag/version has been created in the repository

---

## Phase 10 — Archive ✅ when:

- [ ] The retrospective is documented at `work-item/[project-slug]/10-archive/retrospective.md` (what went well, what to improve)
- [ ] All project artifacts are in their corresponding folder
- [ ] The project is marked as ARCHIVED in its README
