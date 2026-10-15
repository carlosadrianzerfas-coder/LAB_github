# Technology Rules — New Technology Template

This directory contains the template files for adding a new technology to the framework.

## How to add a new technology

1. Copy this entire `_template/` directory to `technology-rules/[your-technology-slug]/`
2. Fill in all `{{placeholder}}` values in every file
3. Add technology-specific guideline files as needed (see examples in `technology-rules/salesforce/`)
4. Validate by setting `technology: [your-technology-slug]` in a project README or project `tech-config.yml`

## Files in this template

| File                   | Purpose                                                          | Required    |
| ---------------------- | ---------------------------------------------------------------- | ----------- |
| `rules.md`             | Phase-by-phase rules for this technology                         | ✅ Yes      |
| `tech-config.yml`      | Machine-readable configuration (coverage, deploy commands, etc.) | ✅ Yes      |
| `context.md`           | Background knowledge the agent loads before any task             | ✅ Yes      |
| `GeneralGuidelines.md` | Non-overlapping coding standards                                 | Recommended |
| `NamingConventions.md` | Naming standards                                                 | Recommended |

## Naming convention for the technology slug

- Use lowercase-kebab-case
- Examples: `salesforce`, `nodejs`, `react`, `python-django`, `java-spring`

## See also

- `technology-rules/salesforce/` — Complete reference implementation
- `AGENT.md` — Agent entrypoint and source-of-truth map
- `framework/rules/core.md` — Rule precedence and technology resolution
