# WUI Homepage CLI Test Plan

## Test Inventory Plan

- `test_core.py`: 18 unit tests planned
- `test_full_e2e.py`: 7 end-to-end and installed-command tests planned
- Total planned: 25 tests

## Unit Test Plan

### `core.project`

- Resolve a valid homepage repository from an explicit path.
- Reject a directory without required Jekyll files.
- Return accurate project metadata and content counts.
- Expected: 3 tests.

### `core.content`

- Read profile fields from `_config.yml`.
- Update allowed profile fields while preserving unrelated configuration.
- Reject unknown profile fields.
- Add, update, and remove experience entries.
- Reject an out-of-range experience index.
- Add, update, and remove news entries.
- Add, update, and remove interest entries.
- Verify dry-run returns proposed data without writing.
- Expected: 11 tests.

### `core.session`

- Save and reload locked history state.
- Undo restores the exact previous file content.
- Redo restores the exact subsequent file content.
- Reject undo when history is empty.
- Expected: 4 tests.

## E2E Test Plan

- Invoke the installed CLI help command from a directory outside the repository.
- Inspect project info through `--json` and validate the response schema.
- Run a full experience add/update/remove workflow against a real copied site.
- Verify `--dry-run` leaves the real YAML file byte-for-byte unchanged.
- Undo and redo a real news mutation through subprocess commands.
- Invoke the real Jekyll backend and validate generated HTML content.
- Run a full profile mutation followed by a real Jekyll build.

## Realistic Workflow Scenarios

### Add a research appointment

- Simulates: adding a future lab role to the academic CV.
- Operations: inspect experiences, add an entry, update its period, build site.
- Verified: YAML fields, CLI JSON, generated HTML, and build artifact size.

### Correct a homepage announcement

- Simulates: adding news, noticing an error, undoing, then redoing the change.
- Operations: news add, history list, undo, redo.
- Verified: exact file content at every history position.

### Safely revise profile copy

- Simulates: previewing a profile edit before committing it.
- Operations: profile set with `--dry-run`, real profile set, Jekyll build.
- Verified: no dry-run write, persisted YAML, and rendered HTML content.

## Backend Requirements

- Python 3.10+
- Installed `cli-anything-wui-homepage` command
- Ruby Bundler and Jekyll dependencies available to the target repository

## Test Results

Command:

```bash
CLI_ANYTHING_FORCE_INSTALLED=1 \
agent-harness/.venv/bin/python -m pytest \
  agent-harness/cli_anything/wui_homepage/tests -v -s --tb=no
```

Result:

```text
[_resolve_cli] Using installed command: /Users/a123/.local/bin/cli-anything-wui-homepage
collected 25 items

test_core.py::test_resolve_explicit_project PASSED
test_core.py::test_resolve_project_from_child PASSED
test_core.py::test_reject_invalid_project PASSED
test_core.py::test_project_info_counts PASSED
test_core.py::test_show_profile PASSED
test_core.py::test_update_profile_preserves_comments_and_unrelated_values PASSED
test_core.py::test_update_profile_rejects_unknown_field PASSED
test_core.py::test_add_experience PASSED
test_core.py::test_update_experience PASSED
test_core.py::test_remove_experience PASSED
test_core.py::test_experience_index_validation PASSED
test_core.py::test_news_add_update_remove_workflow PASSED
test_core.py::test_interest_add_update_remove_workflow PASSED
test_core.py::test_dry_run_does_not_write_or_create_history PASSED
test_core.py::test_session_state_is_saved_and_reloaded PASSED
test_core.py::test_undo_restores_exact_previous_file PASSED
test_core.py::test_redo_restores_exact_subsequent_file PASSED
test_core.py::test_empty_undo_and_new_change_truncates_redo PASSED
test_full_e2e.py::test_installed_help_from_arbitrary_directory PASSED
test_full_e2e.py::test_json_project_info PASSED
test_full_e2e.py::test_dry_run_profile_is_byte_stable PASSED
test_full_e2e.py::test_experience_add_update_remove_workflow PASSED
test_full_e2e.py::test_news_history_undo_redo_workflow PASSED
test_full_e2e.py::test_real_jekyll_build_backend PASSED
test_full_e2e.py::test_profile_mutation_round_trip_through_jekyll PASSED

============================= 25 passed in 10.18s ==============================
```

## Summary Statistics

- Total: 25
- Passed: 25
- Failed: 0
- Pass rate: 100%
- Recorded full-suite time: 10.18 seconds

## Coverage Notes

- The suite covers structured edits, dry-run behavior, history locking,
  undo/redo, installed-command subprocess execution, and real Jekyll builds.
- Generated HTML content and nonzero artifact size are verified.
- Interactive terminal keystrokes in the REPL are not automated; the same Click
  commands used by the REPL are covered through installed-command tests.
- Browser screenshots and GitHub Pages deployment are outside the harness test
  suite and remain repository delivery checks.
