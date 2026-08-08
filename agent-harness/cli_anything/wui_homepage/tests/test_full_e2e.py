import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]


def _resolve_cli(name):
    """Resolve installed CLI command; fall back to the module only for development."""
    force = os.environ.get("CLI_ANYTHING_FORCE_INSTALLED", "").strip() == "1"
    path = shutil.which(name)
    if path:
        print(f"[_resolve_cli] Using installed command: {path}")
        return [path]
    if force:
        raise RuntimeError(f"{name} not found in PATH. Install with: pip install -e .")
    module = "cli_anything.wui_homepage.wui_homepage_cli"
    print(f"[_resolve_cli] Falling back to: {os.sys.executable} -m {module}")
    return [os.sys.executable, "-m", module]


CLI_BASE = _resolve_cli("cli-anything-wui-homepage")


@pytest.fixture
def real_site(tmp_path):
    target = tmp_path / "homepage"
    ignored = shutil.ignore_patterns(
        ".git", ".wui-cli", "_site", "agent-harness", "vendor", "*.egg-info", "__pycache__"
    )
    shutil.copytree(REPO_ROOT, target, ignore=ignored)
    os.symlink(REPO_ROOT / "vendor", target / "vendor", target_is_directory=True)
    (target / ".bundle").mkdir(exist_ok=True)
    shutil.copy2(REPO_ROOT / ".bundle/config", target / ".bundle/config")
    return target


def _run(arguments, check=True):
    return subprocess.run(CLI_BASE + arguments, text=True, capture_output=True, check=check)


def _json(arguments):
    result = _run(["--json", *arguments])
    return json.loads(result.stdout)


def test_installed_help_from_arbitrary_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    result = _run(["--help"])
    assert result.returncode == 0
    assert "experience" in result.stdout
    assert "site" in result.stdout


def test_json_project_info(real_site):
    result = _json(["--project", str(real_site), "project", "info"])
    assert result["canonical"] == "https://wui.me/"
    assert result["counts"]["experience"] == 2
    assert result["backend"] == "bundle exec jekyll build"


def test_dry_run_profile_is_byte_stable(real_site):
    config = real_site / "_config.yml"
    before = config.read_bytes()
    result = _json(
        [
            "--project",
            str(real_site),
            "--dry-run",
            "profile",
            "set",
            "--bio",
            "Proposed biography",
        ]
    )
    assert result["dry_run"] is True
    assert config.read_bytes() == before


def test_experience_add_update_remove_workflow(real_site):
    common = ["--project", str(real_site)]
    added = _json(
        [
            *common,
            "experience",
            "add",
            "--lab",
            "TEST Lab",
            "--institution",
            "TEST",
            "--institution-name",
            "Test Institute",
            "--period",
            "2027.01 - Present",
            "--advisor",
            "Test Advisor",
            "--role",
            "Research Assistant (RA)",
        ]
    )
    assert added["index"] == 3
    updated = _json([*common, "experience", "update", "3", "--period", "2027.02 - Present"])
    assert updated["experience"]["period"] == "2027.02 - Present"
    removed = _json([*common, "experience", "remove", "3", "--yes"])
    assert removed["experience"]["lab"] == "TEST Lab"
    listed = _json([*common, "experience", "list"])
    assert len(listed) == 2


def test_news_history_undo_redo_workflow(real_site):
    common = ["--project", str(real_site)]
    _json([*common, "news", "add", "--date", "2026.08", "--text", "CLI released."])
    assert _json([*common, "news", "list"])[0]["text"] == "CLI released."
    undone = _json([*common, "history", "undo"])
    assert undone["restored"] == "news add: 2026.08"
    assert _json([*common, "news", "list"])[0]["date"] == "2026.07"
    redone = _json([*common, "history", "redo"])
    assert redone["restored"] == "news add: 2026.08"
    assert _json([*common, "news", "list"])[0]["date"] == "2026.08"


def test_real_jekyll_build_backend(real_site):
    destination = real_site / "build-output"
    result = _json(
        ["--project", str(real_site), "site", "build", "--destination", str(destination)]
    )
    index = Path(result["index"])
    assert result["backend"] == "jekyll"
    assert result["index_size"] > 1000
    assert index.is_file()
    html = index.read_text(encoding="utf-8")
    assert "Research Assistant (RA)" in html
    assert "Joined RAPID Lab at SLAI." in html
    print(f"\n  HTML: {index} ({index.stat().st_size:,} bytes)")


def test_profile_mutation_round_trip_through_jekyll(real_site):
    common = ["--project", str(real_site)]
    _json([*common, "profile", "set", "--bio", "CLI-managed academic homepage."])
    destination = real_site / "profile-build"
    result = _json([*common, "site", "build", "--destination", str(destination)])
    html = Path(result["index"]).read_text(encoding="utf-8")
    assert "CLI-managed academic homepage." in html
    assert "Shenzhen Loop Area Institute" in html
