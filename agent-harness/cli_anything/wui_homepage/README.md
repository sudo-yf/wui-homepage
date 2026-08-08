# CLI-Anything WUI Homepage

`cli-anything-wui-homepage` is a structured editor for the Jekyll academic
homepage deployed at `https://wui.me`. It edits profile, experience, news, and
research-interest data, tracks undo/redo history, and invokes the real Jekyll
backend for builds.

## Requirements

- Python 3.10+
- Ruby and Bundler
- The target repository's Jekyll gems installed with `bundle install`

## Install

```bash
cd agent-harness
python3 -m pip install -e .
cli-anything-wui-homepage --help
```

The command works from any directory when `--project` points to the homepage
repository. From inside the repository, `--project` is optional.

## Inspect

```bash
cli-anything-wui-homepage --project /path/to/homepage project info
cli-anything-wui-homepage --project /path/to/homepage profile show
cli-anything-wui-homepage --project /path/to/homepage experience list
cli-anything-wui-homepage --project /path/to/homepage --json news list
```

Put global options before the command group. Use `--json` for agents and scripts.

## Edit

```bash
cli-anything-wui-homepage --project /path/to/homepage profile set \
  --bio "Researcher working on embodied intelligence."

cli-anything-wui-homepage --project /path/to/homepage experience update 1 \
  --period "2026.07 - Present" \
  --role "Research Assistant (RA)"

cli-anything-wui-homepage --project /path/to/homepage news add \
  --date "2026.08" \
  --text "Released a new research project."

cli-anything-wui-homepage --project /path/to/homepage interest add \
  --topic "Robot Learning" \
  --detail "generalizable visuomotor policies"
```

Mutations write immediately and record exact before/after file snapshots in
`.wui-cli/session.json`. This directory is excluded from Git and Jekyll output.

## Dry Run And History

```bash
cli-anything-wui-homepage --project /path/to/homepage --dry-run \
  profile set --bio "Proposed copy"

cli-anything-wui-homepage --project /path/to/homepage history list
cli-anything-wui-homepage --project /path/to/homepage history undo
cli-anything-wui-homepage --project /path/to/homepage history redo
```

Removal commands require `--yes`.

## Build

```bash
cli-anything-wui-homepage --project /path/to/homepage site status
cli-anything-wui-homepage --project /path/to/homepage site build
```

`site build` calls `bundle exec jekyll build`; the CLI does not reimplement the
renderer. It checks the generated `index.html` and required homepage sections
before reporting success.

## REPL

Run the command without a subcommand:

```bash
cli-anything-wui-homepage --project /path/to/homepage
```

Use the same subcommands inside the REPL, such as `experience list`, `news add
--date 2026.08 --text "Update"`, `history undo`, and `site build`.

## Preview Support

This version does not publish `preview-bundle/v1` artifacts. The truthful render
surface is `site build`, which returns the real generated Jekyll `index.html`.

## Tests

```bash
cd agent-harness
CLI_ANYTHING_FORCE_INSTALLED=1 python3 -m pytest \
  cli_anything/wui_homepage/tests -v -s
```
