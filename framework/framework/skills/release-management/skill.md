<!--
Skill: release-management/skill.md
Framework version: 1.0
Last updated: 2026-05-12
-->

# Skill — Release Management (Phase 9)

## Purpose

Guide the agent through planning and executing a production release, including pre-release validation, deployment, and post-release verification.

## When to use

Load this skill at the start of Phase 9 (Release).

## Prerequisites

- Phase 7 (Testing) completed and test report generated
- Phase 8 (Commit/PR) completed and PR merged to main/master
- Release notes drafted in `release-notes.md`

## Steps

### 1. Pre-release checklist

- [ ] All Phase 7 tests pass in staging/UAT environment
- [ ] Release notes are complete and reviewed
- [ ] Deployment runbook is prepared (rollback procedure documented)
- [ ] Stakeholder sign-off obtained for production deployment
- [ ] Maintenance window communicated (if applicable)

### 2. Prepare the release artifact

- Tag the commit following the convention in `framework/skills/git-operations/skill.md`
- Format: `v{MAJOR}.{MINOR}.{PATCH}` (Semantic Versioning)
- Create GitHub/GitLab Release with release notes attached

### 3. Execute deployment

- Follow the deployment steps defined in `technology-rules/[tech]/` (e.g., `DeploymentGuidelines.md`)
- Deploy to production environment
- Record deployment start time, target environment, and deployer

### 4. Post-deployment verification

- [ ] Smoke tests pass in production
- [ ] No critical errors in application logs immediately post-deploy
- [ ] Key business flows verified manually or via automated sanity suite
- [ ] Performance metrics within expected range

### 5. Rollback criteria

Trigger rollback if any of the following occur within 1 hour of deployment:

- Critical error rate exceeds pre-deployment baseline
- Core business functionality is broken
- Data integrity issues detected

### 6. Complete the release artifact

Save the completed `release-notes.md` to `work-item/[project-slug]/09-release/`.

### Quality gate

| Criterion            | Pass condition                        |
| -------------------- | ------------------------------------- |
| Deployment completed | No errors during deployment execution |
| Smoke tests          | All pass in production                |
| Release artifact     | `release-notes.md` saved and complete |
| Rollback plan        | Documented before deployment begins   |
