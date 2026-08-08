---
name: cli-anything-wui-homepage
description: Edit, inspect, undo, and build the wui.me Jekyll academic homepage through structured profile, experience, news, and research-interest commands.
---

# CLI-Anything WUI Homepage

Use `cli-anything-wui-homepage` whenever an agent or user needs to inspect or
edit the `wui.me` academic homepage. It edits the site's native YAML sources,
records exact undo/redo snapshots, and invokes the real Jekyll backend.

## Prerequisites

- Python 3.10+
- Ruby, Bundler, and the repository's Jekyll dependencies
- A homepage repository containing `_config.yml`, `index.md`, `Gemfile`, and the
  structured `_data/experience.yml`, `_data/news.yml`, and
  `_data/interests.yml` files

Install the editable harness with either a virtual environment or pipx:

```bash
pipx install --editable /absolute/path/to/homepage/agent-harness
```

## Global Syntax

```bash
cli-anything-wui-homepage \
  --project /absolute/path/to/homepage \
  [--json] [--dry-run] COMMAND
```

Global options must appear before the command group. Use `--json` for every
programmatic call. Use `--dry-run` before mutations when the requested change is
ambiguous or needs review.

## Commands

| Group | Commands | Purpose |
|---|---|---|
| `project` | `info` | Inspect site metadata, backend, and content counts |
| `profile` | `show`, `set` | Read or update profile, links, images, and SEO fields |
| `experience` | `list`, `add`, `update`, `remove` | Manage laboratory and research appointments |
| `news` | `list`, `add`, `update`, `remove` | Manage dated homepage updates |
| `interest` | `list`, `add`, `update`, `remove` | Manage research-interest topic/detail pairs |
| `site` | `status`, `build` | Validate source state or run the real Jekyll build |
| `history` | `list`, `undo`, `redo` | Inspect or restore persisted file snapshots |
| `repl` | | Enter the interactive editor; also the default with no command |

List indices are one-based. All `remove` commands require `--yes`.

## Common Workflows

Inspect before editing:

```bash
cli-anything-wui-homepage --project /path/to/homepage --json project info
cli-anything-wui-homepage --project /path/to/homepage --json experience list
```

Update an existing research appointment:

```bash
cli-anything-wui-homepage --project /path/to/homepage --json \
  experience update 1 \
  --role "Research Assistant (RA)" \
  --period "2026.07 - Present"
```

Add news safely, then build:

```bash
cli-anything-wui-homepage --project /path/to/homepage --dry-run --json \
  news add --date "2026.08" --text "Released a new research project."
cli-anything-wui-homepage --project /path/to/homepage --json \
  news add --date "2026.08" --text "Released a new research project."
cli-anything-wui-homepage --project /path/to/homepage --json site build
```

Recover from an incorrect edit:

```bash
cli-anything-wui-homepage --project /path/to/homepage --json history list
cli-anything-wui-homepage --project /path/to/homepage --json history undo
cli-anything-wui-homepage --project /path/to/homepage --json history redo
```

## Agent Rules

1. Call the relevant `show`, `list`, `info`, or `status` command before mutation.
2. Pass an absolute `--project` path; do not depend on the working directory.
3. Parse stdout as JSON only when `--json` is present.
4. Treat a nonzero exit code as failure and read stderr before retrying.
5. Use `--dry-run` when content or the target index is uncertain.
6. Run `site build --json` after a group of edits and verify `index_size` is
   nonzero.
7. Do not claim deployment from `site build`; it validates local Jekyll output
   and does not push Git or GitHub Pages.

## Preview Support

This harness does not publish CLI-Anything preview bundles. `site build` is the
truthful producer for real Jekyll HTML. Browser screenshots and live deployment
checks are separate repository quality gates.

## Version

1.0.0
