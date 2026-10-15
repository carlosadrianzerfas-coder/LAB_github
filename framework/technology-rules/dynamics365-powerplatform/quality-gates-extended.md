# Quality Gates - Dynamics 365 / Power Platform Extensions (Extended)

Use this file when a detailed gate explanation is needed. The short authoritative
gate list is `quality-gates.md`.

---

## Phase 5 - Construction

### DPPG5.1 - Explicit unmanaged solution

All changed Dataverse, app, flow, plugin, PCF, web resource, security, and
configuration components must be added to the feature's explicit unmanaged
development solution. Planned work must not happen only in the default solution.

### DPPG5.4 - Export and unpack evidence

The build log must include exact `pac solution export` and
`pac solution unpack` commands, paths, and solution version. Source control must
receive the unpacked solution source, not only screenshots or exported zips.

### DPPG5.6 - Solution Checker threshold

Solution Checker must run before deployment evidence is accepted. Critical and
high findings are blockers unless a named approver accepts and records the risk.

### DPPG5.7 - Plugin/custom API validation

When plugin or custom API code exists, the relevant `.NET` build and test
commands must run and pass. Missing evidence is a blocker.

### DPPG5.8 - PCF validation

When PCF code exists, npm build/lint/test commands defined by the project must
run and pass. Missing evidence is a blocker.

---

## Phase 6 - Verification

### DPPG6.1 - Design-to-implementation trace

The verification report must compare the approved design, task list, solution
inventory, and actual source changes. Missing or extra solution components must
be explained.

### DPPG6.6 - Persona security validation

Security validation must use representative personas. It must prove allowed and
denied access paths for changed tables, columns, apps, flows, commands, custom
APIs, and plugin-triggered behavior.

---

## Phase 7 - Testing

### DPPG7.2 - Flow run evidence

For changed critical flows, run history or equivalent evidence must show the
trigger inputs, major branch taken, important outputs, and final outcome. Mask
sensitive data before recording evidence.

### DPPG7.3 - Plugin/custom API scenario coverage

Plugin/custom API tests must include positive, negative, permissions, recursion
or depth guard, and bulk-like execution scenarios where applicable.

---

## Phase 9 - Release

### DPPG9.3 - Environment-specific configuration

Before release, confirm environment variables, connection references, DLP policy,
service connections, and service accounts are valid for the target environment.

### DPPG9.4 - Rollback readiness

The release notes must state whether rollback uses previous managed solution
import, managed solution upgrade rollback strategy, environment backup restore,
or emergency disablement of affected components.
