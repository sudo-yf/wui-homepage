import shutil
from pathlib import Path

import pytest

from cli_anything.wui_homepage.core import content, project, session


REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_FILES = (
    "_config.yml",
    "index.md",
    "Gemfile",
)
SOURCE_DIRS = ("_data",)


@pytest.fixture
def site_root(tmp_path):
    root = tmp_path / "site"
    root.mkdir()
    for relative in SOURCE_FILES:
        shutil.copy2(REPO_ROOT / relative, root / relative)
    for relative in SOURCE_DIRS:
        shutil.copytree(REPO_ROOT / relative, root / relative)
    return root


def test_resolve_explicit_project(site_root):
    assert project.resolve_project(site_root) == site_root.resolve()


def test_resolve_project_from_child(site_root):
    child = site_root / "nested" / "directory"
    child.mkdir(parents=True)
    assert project.resolve_project(child) == site_root.resolve()


def test_reject_invalid_project(tmp_path):
    with pytest.raises(project.ProjectError, match="Not a WUI homepage project"):
        project.resolve_project(tmp_path)


def test_project_info_counts(site_root):
    result = project.project_info(site_root)
    assert result["title"] == "Yifan"
    assert result["canonical"] == "https://wui.me/"
    assert result["counts"] == {"experience": 2, "news": 2, "interests": 2}


def test_show_profile(site_root):
    result = content.show_profile(site_root)
    assert result["title"] == "Yifan"
    assert result["affiliation"] == "South China University of Technology"
    assert result["bio"].startswith("Research student")


def test_update_profile_preserves_comments_and_unrelated_values(site_root):
    result = content.update_profile(site_root, {"bio": "Updated research biography."})
    text = (site_root / "_config.yml").read_text(encoding="utf-8")
    assert result["changed"] is True
    assert result["profile"]["bio"] == "Updated research biography."
    assert "# Basic Information" in text
    assert "remote_theme: yaoyao-liu/minimal-light" in text


def test_update_profile_rejects_unknown_field(site_root):
    with pytest.raises(content.ContentError, match="Unknown profile fields"):
        content.update_profile(site_root, {"unsupported": "value"})


def test_add_experience(site_root):
    result = content.add_experience(
        site_root,
        {
            "lab": "TEST Lab",
            "institution": "TEST",
            "institution_name": "Test Institute",
            "period": "2027.01 - Present",
            "advisor": "Test Advisor",
            "role": "Research Assistant (RA)",
            "relationship": "Supervisor",
        },
    )
    assert result["index"] == 3
    assert content.list_experiences(site_root)[-1]["lab"] == "TEST Lab"


def test_update_experience(site_root):
    result = content.update_experience(site_root, 1, {"period": "2026.08 - Present"})
    assert result["experience"]["period"] == "2026.08 - Present"
    assert content.list_experiences(site_root)[0]["lab"] == "RAPID Lab"


def test_remove_experience(site_root):
    result = content.remove_experience(site_root, 2)
    assert result["experience"]["lab"] == "MIAA Lab"
    assert len(content.list_experiences(site_root)) == 1


def test_experience_index_validation(site_root):
    with pytest.raises(content.ContentError, match="out of range"):
        content.update_experience(site_root, 99, {"period": "Never"})


def test_news_add_update_remove_workflow(site_root):
    added = content.add_news(site_root, "2026.08", "Started CLI editing.")
    assert added["index"] == 1
    updated = content.update_news(site_root, 1, text="Released CLI editing.")
    assert updated["news"]["text"] == "Released CLI editing."
    removed = content.remove_news(site_root, 1)
    assert removed["news"]["date"] == "2026.08"
    assert len(content.list_news(site_root)) == 2


def test_interest_add_update_remove_workflow(site_root):
    added = content.add_interest(site_root, "Robot Learning", "visuomotor policies")
    assert added["index"] == 3
    updated = content.update_interest(site_root, 3, detail="generalizable visuomotor policies")
    assert updated["interest"]["detail"].startswith("generalizable")
    removed = content.remove_interest(site_root, 3)
    assert removed["interest"]["topic"] == "Robot Learning"


def test_dry_run_does_not_write_or_create_history(site_root):
    path = site_root / "_config.yml"
    before = path.read_bytes()
    result = content.update_profile(site_root, {"bio": "Proposed"}, dry_run=True)
    assert result["dry_run"] is True
    assert path.read_bytes() == before
    assert not (site_root / session.SESSION_RELATIVE_PATH).exists()


def test_session_state_is_saved_and_reloaded(site_root):
    content.add_news(site_root, "2026.08", "History entry.")
    state = session.load_state(site_root)
    assert state["cursor"] == 1
    assert state["history"][0]["action"] == "news add: 2026.08"


def test_undo_restores_exact_previous_file(site_root):
    path = site_root / "_data/news.yml"
    before = path.read_text(encoding="utf-8")
    content.add_news(site_root, "2026.08", "Undo this.")
    result = session.undo(site_root)
    assert result["restored"] == "news add: 2026.08"
    assert path.read_text(encoding="utf-8") == before


def test_redo_restores_exact_subsequent_file(site_root):
    path = site_root / "_data/news.yml"
    content.add_news(site_root, "2026.08", "Redo this.")
    after = path.read_text(encoding="utf-8")
    session.undo(site_root)
    result = session.redo(site_root)
    assert result["restored"] == "news add: 2026.08"
    assert path.read_text(encoding="utf-8") == after


def test_empty_undo_and_new_change_truncates_redo(site_root):
    with pytest.raises(session.SessionError, match="Nothing to undo"):
        session.undo(site_root)
    content.add_news(site_root, "2026.08", "First.")
    session.undo(site_root)
    content.add_interest(site_root, "Planning", "model-based control")
    state = session.load_state(site_root)
    assert len(state["history"]) == 1
    assert state["history"][0]["action"] == "interest add: Planning"
    with pytest.raises(session.SessionError, match="Nothing to redo"):
        session.redo(site_root)
