# ALM and Deployment Guidelines

## Baseline

- Use unmanaged solutions in development.
- Use managed solutions in test, UAT, and production.
- Store unpacked solution source in source control.
- Treat managed solution zip files as build artifacts.
- Use Power Platform CLI (`pac`) locally and Microsoft Power Platform Build Tools in Azure DevOps pipelines.

## Solution Workflow

1. Build changes in the development environment.
2. Add all changed components to the explicit unmanaged solution.
3. Export the unmanaged solution.
4. Unpack the solution into `solutions/[SolutionName]/src/`.
5. Run Solution Checker on the unmanaged solution.
6. Export or build the managed solution artifact.
7. Import the managed solution into downstream environments.
8. Record evidence in the work item build, verification, testing, and release artifacts.

## Required Local Commands

```bash
pac auth create --url [environment-url]
pac solution export --name [SolutionName] --path solutions/[SolutionName]/[SolutionName].zip --managed false
pac solution unpack --zipfile solutions/[SolutionName]/[SolutionName].zip --folder solutions/[SolutionName]/src --packagetype Unmanaged
pac solution checker --path solutions/[SolutionName]/[SolutionName].zip --outputDirectory work-item/[project-slug]/05-build/checker-results
pac solution export --name [SolutionName] --path solutions/[SolutionName]/[SolutionName]_managed.zip --managed true
pac solution import --path solutions/[SolutionName]/[SolutionName]_managed.zip
```

Project-specific authentication, solution names, and paths may override these
commands, but the build log must record the exact commands used.

## Azure DevOps

Use Microsoft Power Platform Build Tools version 2 tasks consistently in the
same pipeline. Do not mix Build Tools major versions.

Recommended pipeline stages:

- Initiate: authenticate and validate environment access.
- Export: export unmanaged solution from development.
- Build: unpack/pack solution, run checker, publish managed artifact.
- Release: import managed solution to target environment.
- Verify: run smoke checks and record evidence.

## Solution Checker

- Run Solution Checker before deployment evidence is accepted.
- Critical and high findings block the phase unless an approved exception is recorded.
- Store checker output under `work-item/[project-slug]/05-build/checker-results/`.
- Reference checker output from `verification-report.md`.

## Environment Variables and Connection References

- Every environment-specific value must be represented by an environment variable, connection reference, secure configuration, or project-approved equivalent.
- Production values must be supplied by pipeline, deployment settings, or administrator-controlled configuration.
- Do not overwrite production connection references with developer-owned connections.

## Rollback

Rollback must be chosen before production deployment:

- Import previous managed solution version.
- Apply managed solution upgrade rollback strategy.
- Restore environment backup when solution import cannot safely reverse the change.
- Disable affected app, command, or flow as emergency mitigation.

## Checklist

- [ ] Explicit unmanaged development solution exists.
- [ ] Managed artifact is generated for downstream environments.
- [ ] Solution source is unpacked and committed.
- [ ] Solution Checker result is recorded.
- [ ] Environment variables and connection references are handled per environment.
- [ ] Import result/job evidence is recorded.
- [ ] Rollback approach is documented before production.
