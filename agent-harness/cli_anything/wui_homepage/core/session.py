import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


SESSION_RELATIVE_PATH = Path(".wui-cli/session.json")


class SessionError(RuntimeError):
    pass


def _default_state() -> dict:
    return {"version": 1, "cursor": 0, "history": []}


def _locked_save_json(path: Path, data: dict, **dump_kwargs) -> None:
    """Write JSON while holding an exclusive lock before truncation."""
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        handle = path.open("r+", encoding="utf-8")
    except FileNotFoundError:
        handle = path.open("w", encoding="utf-8")

    with handle:
        locked = False
        try:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            locked = True
        except (ImportError, OSError):
            pass
        try:
            handle.seek(0)
            handle.truncate()
            json.dump(data, handle, ensure_ascii=True, indent=2, **dump_kwargs)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        finally:
            if locked:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def load_state(root: Path) -> dict:
    path = root / SESSION_RELATIVE_PATH
    if not path.exists():
        return _default_state()
    try:
        with path.open("r", encoding="utf-8") as handle:
            state = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise SessionError(f"Cannot read session history at {path}: {exc}") from exc

    if state.get("version") != 1 or not isinstance(state.get("history"), list):
        raise SessionError(f"Unsupported session history format at {path}")
    cursor = state.get("cursor")
    if not isinstance(cursor, int) or cursor < 0 or cursor > len(state["history"]):
        raise SessionError(f"Invalid session cursor at {path}")
    return state


def record_change(root: Path, action: str, relative_path: str, before: str, after: str) -> dict:
    state = load_state(root)
    history = state["history"][: state["cursor"]]
    entry = {
        "id": uuid4().hex,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "changes": {
            relative_path: {
                "before": before,
                "after": after,
            }
        },
    }
    history.append(entry)
    state["history"] = history
    state["cursor"] = len(history)
    _locked_save_json(root / SESSION_RELATIVE_PATH, state)
    return entry


def apply_change(
    root: Path,
    action: str,
    relative_path: str,
    before: str,
    after: str,
    dry_run: bool = False,
) -> dict:
    if before == after:
        return {"changed": False, "dry_run": dry_run, "path": relative_path}
    if dry_run:
        return {
            "changed": True,
            "dry_run": True,
            "path": relative_path,
            "action": action,
        }

    path = root / relative_path
    _atomic_write_text(path, after)
    try:
        entry = record_change(root, action, relative_path, before, after)
    except Exception:
        _atomic_write_text(path, before)
        raise
    return {
        "changed": True,
        "dry_run": False,
        "path": relative_path,
        "action": action,
        "history_id": entry["id"],
    }


def list_history(root: Path) -> dict:
    state = load_state(root)
    entries = []
    for index, entry in enumerate(state["history"], start=1):
        entries.append(
            {
                "index": index,
                "id": entry["id"],
                "timestamp": entry["timestamp"],
                "action": entry["action"],
                "applied": index <= state["cursor"],
            }
        )
    return {"cursor": state["cursor"], "entries": entries}


def _restore_entry(root: Path, entry: dict, key: str) -> None:
    previous = {}
    try:
        for relative_path, versions in entry["changes"].items():
            path = root / relative_path
            previous[relative_path] = path.read_text(encoding="utf-8")
            _atomic_write_text(path, versions[key])
    except Exception:
        for relative_path, content in previous.items():
            _atomic_write_text(root / relative_path, content)
        raise


def undo(root: Path, dry_run: bool = False) -> dict:
    state = load_state(root)
    if state["cursor"] == 0:
        raise SessionError("Nothing to undo")
    entry = state["history"][state["cursor"] - 1]
    if not dry_run:
        _restore_entry(root, entry, "before")
        state["cursor"] -= 1
        _locked_save_json(root / SESSION_RELATIVE_PATH, state)
    return {
        "action": "undo",
        "history_id": entry["id"],
        "restored": entry["action"],
        "dry_run": dry_run,
        "cursor": state["cursor"] - (1 if dry_run else 0),
    }


def redo(root: Path, dry_run: bool = False) -> dict:
    state = load_state(root)
    if state["cursor"] >= len(state["history"]):
        raise SessionError("Nothing to redo")
    entry = state["history"][state["cursor"]]
    if not dry_run:
        _restore_entry(root, entry, "after")
        state["cursor"] += 1
        _locked_save_json(root / SESSION_RELATIVE_PATH, state)
    return {
        "action": "redo",
        "history_id": entry["id"],
        "restored": entry["action"],
        "dry_run": dry_run,
        "cursor": state["cursor"] + (1 if dry_run else 0),
    }
