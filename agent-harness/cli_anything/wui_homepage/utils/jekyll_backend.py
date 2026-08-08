import shutil
import subprocess
import time
from pathlib import Path


class BackendError(RuntimeError):
    pass


def find_bundle() -> str:
    executable = shutil.which("bundle")
    if executable:
        return executable
    raise BackendError(
        "Bundler is not installed. Install Ruby and run: gem install bundler"
    )


def site_status(root: Path) -> dict:
    required = [
        "_config.yml",
        "index.md",
        "_data/experience.yml",
        "_data/news.yml",
        "_data/interests.yml",
        "Gemfile",
    ]
    files = {relative: (root / relative).is_file() for relative in required}
    try:
        git = subprocess.run(
            ["git", "status", "--short", "--branch"],
            cwd=root,
            text=True,
            capture_output=True,
            check=True,
        ).stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        git = None
    return {
        "project": str(root),
        "valid": all(files.values()),
        "files": files,
        "bundle": shutil.which("bundle"),
        "git": git,
    }


def build_site(root: Path, destination: str | Path | None = None) -> dict:
    bundle = find_bundle()
    output = Path(destination).expanduser().resolve() if destination else root / "_site"
    command = [
        bundle,
        "exec",
        "jekyll",
        "build",
        "--source",
        str(root),
        "--destination",
        str(output),
    ]
    started = time.monotonic()
    result = subprocess.run(command, cwd=root, text=True, capture_output=True)
    duration = time.monotonic() - started
    if result.returncode != 0:
        message = (result.stderr or result.stdout).strip()
        raise BackendError(f"Jekyll build failed ({result.returncode}):\n{message}")

    index = output / "index.html"
    if not index.is_file() or index.stat().st_size == 0:
        raise BackendError(f"Jekyll exited successfully but did not create {index}")
    html = index.read_text(encoding="utf-8")
    missing = [section for section in ("News", "Experience", "Research Interests") if section not in html]
    if missing:
        raise BackendError(f"Generated homepage is missing sections: {', '.join(missing)}")
    return {
        "backend": "jekyll",
        "command": command,
        "destination": str(output),
        "index": str(index),
        "index_size": index.stat().st_size,
        "duration_seconds": round(duration, 3),
        "stdout": result.stdout.strip(),
    }
