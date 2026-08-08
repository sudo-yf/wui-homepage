from pathlib import Path

from ruamel.yaml import YAML


REQUIRED_PATHS = (
    "_config.yml",
    "_data/experience.yml",
    "_data/news.yml",
    "_data/interests.yml",
    "index.md",
    "Gemfile",
)


class ProjectError(RuntimeError):
    pass


def _is_project_root(path: Path) -> bool:
    return all((path / relative).is_file() for relative in REQUIRED_PATHS)


def resolve_project(path: str | Path | None = None) -> Path:
    """Resolve an explicit project or find the root above the current directory."""
    candidate = Path(path or Path.cwd()).expanduser().resolve()
    if candidate.is_file():
        candidate = candidate.parent

    for current in (candidate, *candidate.parents):
        if _is_project_root(current):
            return current

    missing = ", ".join(REQUIRED_PATHS)
    raise ProjectError(
        f"Not a WUI homepage project: {candidate}. Required files: {missing}"
    )


def project_info(root: Path) -> dict:
    yaml = YAML(typ="safe")
    with (root / "_config.yml").open("r", encoding="utf-8") as handle:
        config = yaml.load(handle) or {}

    counts = {}
    for name in ("experience", "news", "interests"):
        with (root / "_data" / f"{name}.yml").open("r", encoding="utf-8") as handle:
            counts[name] = len(yaml.load(handle) or [])

    return {
        "project": str(root),
        "title": config.get("title"),
        "canonical": config.get("canonical"),
        "remote_theme": config.get("remote_theme"),
        "counts": counts,
        "backend": "bundle exec jekyll build",
    }
