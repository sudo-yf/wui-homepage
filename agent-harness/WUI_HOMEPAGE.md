# WUI Homepage CLI Harness

## Target

- Source: the repository containing this `agent-harness` directory
- Application: Jekyll academic homepage deployed at `https://wui.me`
- Native content: YAML data, Jekyll configuration, Markdown, Liquid, HTML, and CSS
- Real backend: `bundle exec jekyll build`

## Architecture Analysis

The website uses Jekyll 3.8 with the Minimal Light remote theme. The local layout
and includes override the theme for the OP-style homepage. User-editable content
is stored in these structured files:

- `_config.yml`: profile, affiliation, links, SEO, images, and theme settings
- `_data/experience.yml`: research roles, institutions, advisors, and logos
- `_data/news.yml`: dated homepage updates
- `_data/interests.yml`: research-interest topic/detail pairs

The CLI edits YAML through `ruamel.yaml` so comments and ordering are preserved.
It never renders HTML itself. Site builds are delegated to the repository's real
Jekyll/Bundler backend and verified by reading the generated `_site/index.html`.

## Command Map

- `project info`: inspect paths, domain, profile, and content counts
- `profile show/set`: inspect or update `_config.yml`
- `experience list/add/update/remove`: manage research experience entries
- `news list/add/update/remove`: manage dated news entries
- `interest list/add/update/remove`: manage research interests
- `site status/build`: validate source structure or invoke Jekyll
- `history list/undo/redo`: inspect or restore file-level mutation snapshots
- `repl`: keep the project open for repeated interactive edits

All one-shot commands accept global `--project`, `--json`, and `--dry-run`
options. Mutations write immediately unless `--dry-run` is set. Each successful
write records before/after snapshots in `.wui-cli/session.json` using an exclusive
file lock. Undo and redo restore those snapshots atomically.

## Safety Model

- Project paths are resolved and validated before reads or writes.
- Mutations are limited to known site data/config files.
- List indices are one-based and bounds-checked.
- YAML is written to a temporary file and atomically replaced.
- Session history is locked during writes and excluded from Git/Jekyll output.
- `--dry-run` returns the proposed result without changing source or history.
- Destructive list removals require `--yes`.

## Backend Contract

`site build` requires Ruby, Bundler, and the repository's Jekyll dependencies.
It invokes:

```bash
bundle exec jekyll build --source PROJECT --destination DESTINATION
```

A build is successful only when the subprocess exits with zero, the generated
`index.html` exists, has nonzero size, and contains the expected Experience,
News, and Research Interests sections.

## Preview Scope

The first version does not publish CLI-Anything preview bundles. The truthful
inspection surface is the real Jekyll build output returned by `site build`.
Visual browser validation remains a separate deployment quality gate.
