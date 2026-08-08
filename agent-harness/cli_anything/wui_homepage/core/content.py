from io import StringIO
from pathlib import Path

from ruamel.yaml import YAML

from cli_anything.wui_homepage.core.session import apply_change


PROFILE_FIELDS = (
    "title",
    "position",
    "affiliation",
    "affiliation_link",
    "email",
    "bio",
    "location",
    "github_link",
    "description",
    "keywords",
    "avatar",
)

EXPERIENCE_FIELDS = (
    "lab",
    "institution",
    "institution_name",
    "period",
    "advisor",
    "advisor_url",
    "role",
    "relationship",
    "summary",
    "initials",
    "logo",
    "logo_variant",
    "logo_source",
)


class ContentError(RuntimeError):
    pass


def _yaml() -> YAML:
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.width = 4096
    yaml.indent(mapping=2, sequence=4, offset=2)
    return yaml


def _load_document(root: Path, relative_path: str):
    path = root / relative_path
    before = path.read_text(encoding="utf-8")
    document = _yaml().load(before)
    return before, document


def _dump_document(document) -> str:
    buffer = StringIO()
    _yaml().dump(document, buffer)
    return buffer.getvalue()


def _plain(value):
    if isinstance(value, dict):
        return {str(key): _plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


def _validate_index(items: list, index: int, label: str) -> int:
    zero_based = index - 1
    if zero_based < 0 or zero_based >= len(items):
        raise ContentError(f"{label} index {index} is out of range (1-{len(items)})")
    return zero_based


def show_profile(root: Path) -> dict:
    _, document = _load_document(root, "_config.yml")
    return {field: document.get(field) for field in PROFILE_FIELDS}


def update_profile(root: Path, values: dict, dry_run: bool = False) -> dict:
    unknown = sorted(set(values) - set(PROFILE_FIELDS))
    if unknown:
        raise ContentError(f"Unknown profile fields: {', '.join(unknown)}")
    before, document = _load_document(root, "_config.yml")
    for field, value in values.items():
        if value is not None:
            document[field] = value
    after = _dump_document(document)
    result = apply_change(root, "profile set", "_config.yml", before, after, dry_run)
    result["profile"] = {field: document.get(field) for field in PROFILE_FIELDS}
    return result


def list_experiences(root: Path) -> list[dict]:
    _, document = _load_document(root, "_data/experience.yml")
    return _plain(document or [])


def add_experience(root: Path, values: dict, dry_run: bool = False) -> dict:
    required = ("lab", "institution", "institution_name", "period", "advisor", "role")
    missing = [field for field in required if not values.get(field)]
    if missing:
        raise ContentError(f"Missing experience fields: {', '.join(missing)}")
    before, document = _load_document(root, "_data/experience.yml")
    document = document or []
    entry = {field: values[field] for field in EXPERIENCE_FIELDS if values.get(field) is not None}
    document.append(entry)
    after = _dump_document(document)
    result = apply_change(
        root, f"experience add: {values['lab']}", "_data/experience.yml", before, after, dry_run
    )
    result.update({"index": len(document), "experience": _plain(entry)})
    return result


def update_experience(root: Path, index: int, values: dict, dry_run: bool = False) -> dict:
    unknown = sorted(set(values) - set(EXPERIENCE_FIELDS))
    if unknown:
        raise ContentError(f"Unknown experience fields: {', '.join(unknown)}")
    before, document = _load_document(root, "_data/experience.yml")
    zero_based = _validate_index(document or [], index, "Experience")
    entry = document[zero_based]
    for field, value in values.items():
        if value is not None:
            entry[field] = value
    after = _dump_document(document)
    result = apply_change(
        root, f"experience update: {index}", "_data/experience.yml", before, after, dry_run
    )
    result.update({"index": index, "experience": _plain(entry)})
    return result


def remove_experience(root: Path, index: int, dry_run: bool = False) -> dict:
    before, document = _load_document(root, "_data/experience.yml")
    zero_based = _validate_index(document or [], index, "Experience")
    removed = document.pop(zero_based)
    after = _dump_document(document)
    result = apply_change(
        root, f"experience remove: {index}", "_data/experience.yml", before, after, dry_run
    )
    result.update({"index": index, "experience": _plain(removed)})
    return result


def list_news(root: Path) -> list[dict]:
    _, document = _load_document(root, "_data/news.yml")
    return _plain(document or [])


def add_news(root: Path, date: str, text: str, dry_run: bool = False) -> dict:
    if not date.strip() or not text.strip():
        raise ContentError("News date and text are required")
    before, document = _load_document(root, "_data/news.yml")
    document = document or []
    entry = {"date": date.strip(), "text": text.strip()}
    document.insert(0, entry)
    after = _dump_document(document)
    result = apply_change(root, f"news add: {date}", "_data/news.yml", before, after, dry_run)
    result.update({"index": 1, "news": entry})
    return result


def update_news(
    root: Path, index: int, date: str | None = None, text: str | None = None, dry_run: bool = False
) -> dict:
    before, document = _load_document(root, "_data/news.yml")
    zero_based = _validate_index(document or [], index, "News")
    entry = document[zero_based]
    if date is not None:
        entry["date"] = date.strip()
    if text is not None:
        entry["text"] = text.strip()
    after = _dump_document(document)
    result = apply_change(root, f"news update: {index}", "_data/news.yml", before, after, dry_run)
    result.update({"index": index, "news": _plain(entry)})
    return result


def remove_news(root: Path, index: int, dry_run: bool = False) -> dict:
    before, document = _load_document(root, "_data/news.yml")
    zero_based = _validate_index(document or [], index, "News")
    removed = document.pop(zero_based)
    after = _dump_document(document)
    result = apply_change(root, f"news remove: {index}", "_data/news.yml", before, after, dry_run)
    result.update({"index": index, "news": _plain(removed)})
    return result


def list_interests(root: Path) -> list[dict]:
    _, document = _load_document(root, "_data/interests.yml")
    return _plain(document or [])


def add_interest(root: Path, topic: str, detail: str, dry_run: bool = False) -> dict:
    if not topic.strip() or not detail.strip():
        raise ContentError("Interest topic and detail are required")
    before, document = _load_document(root, "_data/interests.yml")
    document = document or []
    entry = {"topic": topic.strip(), "detail": detail.strip()}
    document.append(entry)
    after = _dump_document(document)
    result = apply_change(
        root, f"interest add: {topic}", "_data/interests.yml", before, after, dry_run
    )
    result.update({"index": len(document), "interest": entry})
    return result


def update_interest(
    root: Path,
    index: int,
    topic: str | None = None,
    detail: str | None = None,
    dry_run: bool = False,
) -> dict:
    before, document = _load_document(root, "_data/interests.yml")
    zero_based = _validate_index(document or [], index, "Interest")
    entry = document[zero_based]
    if topic is not None:
        entry["topic"] = topic.strip()
    if detail is not None:
        entry["detail"] = detail.strip()
    after = _dump_document(document)
    result = apply_change(
        root, f"interest update: {index}", "_data/interests.yml", before, after, dry_run
    )
    result.update({"index": index, "interest": _plain(entry)})
    return result


def remove_interest(root: Path, index: int, dry_run: bool = False) -> dict:
    before, document = _load_document(root, "_data/interests.yml")
    zero_based = _validate_index(document or [], index, "Interest")
    removed = document.pop(zero_based)
    after = _dump_document(document)
    result = apply_change(
        root, f"interest remove: {index}", "_data/interests.yml", before, after, dry_run
    )
    result.update({"index": index, "interest": _plain(removed)})
    return result
