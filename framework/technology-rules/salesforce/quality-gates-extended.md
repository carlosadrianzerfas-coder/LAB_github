# Quality Gates — Salesforce Extensions (Extended)

Verbose guidance for the Salesforce technology-specific quality gates defined in:

- `technology-rules/salesforce/quality-gates.md`

These gates extend the framework baseline gates:

- `framework/rules/quality-gates.md`

They are **blocking** for Salesforce work-items.

---

## Phase 5 — Construction (Salesforce)

### SFG5.1 — Incremental deployments (fail-fast) executed per artifact

**Requirement**

- Deploy each concrete metadata artifact (or minimal logical unit) using its exact path.
- Use `--test-level NoTestRun` during Phase 5 incremental deploys.

**Command pattern**

```bash
sf project deploy start -d force-app/main/default/<exact-path> --test-level NoTestRun
```

**Evidence**

- For each deploy: command + job ID + success/failure.

---

### SFG5.2 — Cumulative `package.xml` exists and is maintained

**Requirement**

- A cumulative manifest must exist at:
  - `work-item/[project-slug]/05-build/package.xml`
- It must be updated cumulatively (append-only) and must not contain wildcards:
  - `<members>*</members>` is forbidden.

**Evidence**

- Manifest file present and referenced in build log.
- List of members added per group.

---

### SFG5.3 — Manifest deploy after each dependency group

**Requirement**

- After completing incremental deploys for a dependency group, update the manifest and deploy:

```bash
sf project deploy start \
  --manifest work-item/[project-slug]/05-build/package.xml \
  --test-level NoTestRun
```

**Evidence**

- Build log shows group boundary, members added, manifest deploy job ID, and result.

---

### SFG5.4 — Final manifest deploy with RunRelevantTests (non-skippable)

**Requirement**

- At end of Phase 5, execute:

```bash
sf project deploy start \
  --manifest work-item/[project-slug]/05-build/package.xml \
  --test-level RunRelevantTests
```

**Evidence**

- Build log includes: exact command, job ID, test summary, and 0 failures.

---

### SFG5.5 — Build log is complete and auditable

**Requirement**
`work-item/[project-slug]/05-build/build-log.md` must include:

- inventory of modified/created metadata (exact paths)
- dependency-ordered deployment plan (grouping by layer)
- per-artifact deploy results (job IDs)
- per-group manifest deploy result (job ID)
- final RunRelevantTests result

---

## Phase 6 — Verification (Salesforce)

### SFG6.1 — PMD / Salesforce Code Analyzer executed and thresholds met

**Requirement**

- Run Apex static analysis (PMD / Salesforce Code Analyzer) and meet the project threshold:
  - 0 critical/high violations (or equivalent threshold defined by the repo).

**Evidence**

- The verification report includes:
  - tool used + version (if available)
  - command executed
  - report location
  - summary: violations by priority/severity

**Blocking behavior**

- Any violation above the threshold is a **[BLOCKER]** → return to Phase 5 to fix.

---

### SFG6.2 — ESLint (LWC) executed and 0 errors

**Requirement**

- Run ESLint for LWC/JS per repository configuration.
- 0 errors.

**Evidence**

- The verification report includes:
  - command executed
  - summary output
  - report file path if generated

**Blocking behavior**

- Any ESLint error is a **[BLOCKER]** → return to Phase 5 to fix.

---

## Evidence Locations (recommended)

- Build evidence:
  - `work-item/[project-slug]/05-build/build-log.md`
  - `work-item/[project-slug]/05-build/package.xml`

- Verification evidence:
  - `work-item/[project-slug]/06-verification/verification-report.md`
  - optional reports:
    - `work-item/[project-slug]/06-verification/reports/pmd.*`
    - `work-item/[project-slug]/06-verification/reports/eslint.*`
