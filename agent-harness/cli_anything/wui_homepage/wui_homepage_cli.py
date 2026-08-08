import json
import shlex
from functools import wraps
from pathlib import Path

import click

from cli_anything.wui_homepage import __version__
from cli_anything.wui_homepage.core import content, project, session
from cli_anything.wui_homepage.utils import jekyll_backend
from cli_anything.wui_homepage.utils.repl_skin import ReplSkin


HANDLED_ERRORS = (
    project.ProjectError,
    content.ContentError,
    session.SessionError,
    jekyll_backend.BackendError,
    OSError,
)


def guarded(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except HANDLED_ERRORS as exc:
            raise click.ClickException(str(exc)) from exc

    return wrapper


def _root(ctx: click.Context) -> Path:
    return project.resolve_project(ctx.obj.get("project"))


def _emit(ctx: click.Context, data, human: str | None = None) -> None:
    if ctx.obj.get("json"):
        click.echo(json.dumps(data, ensure_ascii=True, indent=2))
    elif human is not None:
        click.echo(human)
    elif isinstance(data, (dict, list)):
        click.echo(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        click.echo(str(data))


def _format_indexed(items: list[dict], fields: tuple[str, ...]) -> str:
    if not items:
        return "No entries."
    lines = []
    for index, item in enumerate(items, start=1):
        parts = [str(item.get(field, "")) for field in fields]
        lines.append(f"{index}. " + " | ".join(parts))
    return "\n".join(lines)


@click.group(invoke_without_command=True)
@click.option(
    "--project",
    "project_path",
    type=click.Path(path_type=Path, file_okay=False),
    help="Homepage repository. Defaults to the current directory or a parent.",
)
@click.option("--json", "use_json", is_flag=True, help="Output machine-readable JSON.")
@click.option("--dry-run", is_flag=True, help="Show mutation results without writing files.")
@click.version_option(__version__)
@click.pass_context
def cli(ctx: click.Context, project_path: Path | None, use_json: bool, dry_run: bool) -> None:
    """Edit and build the wui.me Jekyll academic homepage."""
    ctx.ensure_object(dict)
    ctx.obj.update({"project": project_path, "json": use_json, "dry_run": dry_run})
    if ctx.invoked_subcommand is None:
        ctx.invoke(repl)


@cli.group("project")
def project_group() -> None:
    """Inspect the homepage project."""


@project_group.command("info")
@click.pass_context
@guarded
def project_info(ctx: click.Context) -> None:
    """Show project paths, backend, domain, and content counts."""
    data = project.project_info(_root(ctx))
    human = (
        f"Project: {data['project']}\n"
        f"Site: {data['canonical']}\n"
        f"Profile: {data['title']}\n"
        f"Experience: {data['counts']['experience']}\n"
        f"News: {data['counts']['news']}\n"
        f"Interests: {data['counts']['interests']}\n"
        f"Backend: {data['backend']}"
    )
    _emit(ctx, data, human)


@cli.group()
def profile() -> None:
    """Inspect or update profile and SEO fields."""


@profile.command("show")
@click.pass_context
@guarded
def profile_show(ctx: click.Context) -> None:
    """Show all editable profile fields."""
    data = content.show_profile(_root(ctx))
    human = "\n".join(f"{key}: {value or ''}" for key, value in data.items())
    _emit(ctx, data, human)


@profile.command("set")
@click.option("--title")
@click.option("--position")
@click.option("--affiliation")
@click.option("--affiliation-link")
@click.option("--email")
@click.option("--bio")
@click.option("--location")
@click.option("--github-link")
@click.option("--description")
@click.option("--keywords")
@click.option("--avatar")
@click.pass_context
@guarded
def profile_set(ctx: click.Context, **values) -> None:
    """Update one or more profile fields."""
    selected = {key: value for key, value in values.items() if value is not None}
    if not selected:
        raise click.UsageError("Provide at least one profile option")
    result = content.update_profile(_root(ctx), selected, ctx.obj["dry_run"])
    state = "Would update" if result["dry_run"] else "Updated"
    _emit(ctx, result, f"{state} profile fields: {', '.join(selected)}")


@cli.group()
def experience() -> None:
    """Manage research and laboratory experience."""


@experience.command("list")
@click.pass_context
@guarded
def experience_list(ctx: click.Context) -> None:
    """List experience entries in display order."""
    items = content.list_experiences(_root(ctx))
    _emit(ctx, items, _format_indexed(items, ("institution_name", "period", "role", "lab", "advisor")))


@experience.command("add")
@click.option("--lab", required=True)
@click.option("--institution", required=True)
@click.option("--institution-name", required=True)
@click.option("--period", required=True)
@click.option("--advisor", required=True)
@click.option("--advisor-url")
@click.option("--role", required=True)
@click.option("--relationship", default="Supervisor", show_default=True)
@click.option("--summary")
@click.option("--initials")
@click.option("--logo")
@click.option("--logo-variant")
@click.option("--logo-source")
@click.pass_context
@guarded
def experience_add(ctx: click.Context, **values) -> None:
    """Append a research experience entry."""
    result = content.add_experience(_root(ctx), values, ctx.obj["dry_run"])
    state = "Would add" if result["dry_run"] else "Added"
    _emit(ctx, result, f"{state} experience #{result['index']}: {result['experience']['lab']}")


@experience.command("update")
@click.argument("index", type=click.IntRange(min=1))
@click.option("--lab")
@click.option("--institution")
@click.option("--institution-name")
@click.option("--period")
@click.option("--advisor")
@click.option("--advisor-url")
@click.option("--role")
@click.option("--relationship")
@click.option("--summary")
@click.option("--initials")
@click.option("--logo")
@click.option("--logo-variant")
@click.option("--logo-source")
@click.pass_context
@guarded
def experience_update(ctx: click.Context, index: int, **values) -> None:
    """Update selected fields on a one-based experience index."""
    selected = {key: value for key, value in values.items() if value is not None}
    if not selected:
        raise click.UsageError("Provide at least one experience option")
    result = content.update_experience(_root(ctx), index, selected, ctx.obj["dry_run"])
    state = "Would update" if result["dry_run"] else "Updated"
    _emit(ctx, result, f"{state} experience #{index}: {', '.join(selected)}")


@experience.command("remove")
@click.argument("index", type=click.IntRange(min=1))
@click.option("--yes", is_flag=True, help="Confirm removal.")
@click.pass_context
@guarded
def experience_remove(ctx: click.Context, index: int, yes: bool) -> None:
    """Remove a one-based experience entry."""
    if not yes:
        raise click.UsageError("Pass --yes to confirm removal")
    result = content.remove_experience(_root(ctx), index, ctx.obj["dry_run"])
    state = "Would remove" if result["dry_run"] else "Removed"
    _emit(ctx, result, f"{state} experience #{index}: {result['experience']['lab']}")


@cli.group()
def news() -> None:
    """Manage dated homepage news."""


@news.command("list")
@click.pass_context
@guarded
def news_list(ctx: click.Context) -> None:
    """List news in display order."""
    items = content.list_news(_root(ctx))
    _emit(ctx, items, _format_indexed(items, ("date", "text")))


@news.command("add")
@click.option("--date", required=True, help="Display date such as 2026.07.")
@click.option("--text", required=True)
@click.pass_context
@guarded
def news_add(ctx: click.Context, date: str, text: str) -> None:
    """Prepend a news item."""
    result = content.add_news(_root(ctx), date, text, ctx.obj["dry_run"])
    state = "Would add" if result["dry_run"] else "Added"
    _emit(ctx, result, f"{state} news: {date} {text}")


@news.command("update")
@click.argument("index", type=click.IntRange(min=1))
@click.option("--date")
@click.option("--text")
@click.pass_context
@guarded
def news_update(ctx: click.Context, index: int, date: str | None, text: str | None) -> None:
    """Update a one-based news item."""
    if date is None and text is None:
        raise click.UsageError("Provide --date or --text")
    result = content.update_news(_root(ctx), index, date, text, ctx.obj["dry_run"])
    state = "Would update" if result["dry_run"] else "Updated"
    _emit(ctx, result, f"{state} news #{index}")


@news.command("remove")
@click.argument("index", type=click.IntRange(min=1))
@click.option("--yes", is_flag=True, help="Confirm removal.")
@click.pass_context
@guarded
def news_remove(ctx: click.Context, index: int, yes: bool) -> None:
    """Remove a one-based news item."""
    if not yes:
        raise click.UsageError("Pass --yes to confirm removal")
    result = content.remove_news(_root(ctx), index, ctx.obj["dry_run"])
    state = "Would remove" if result["dry_run"] else "Removed"
    _emit(ctx, result, f"{state} news #{index}")


@cli.group()
def interest() -> None:
    """Manage research interests."""


@interest.command("list")
@click.pass_context
@guarded
def interest_list(ctx: click.Context) -> None:
    """List research interests in display order."""
    items = content.list_interests(_root(ctx))
    _emit(ctx, items, _format_indexed(items, ("topic", "detail")))


@interest.command("add")
@click.option("--topic", required=True)
@click.option("--detail", required=True)
@click.pass_context
@guarded
def interest_add(ctx: click.Context, topic: str, detail: str) -> None:
    """Append a research interest."""
    result = content.add_interest(_root(ctx), topic, detail, ctx.obj["dry_run"])
    state = "Would add" if result["dry_run"] else "Added"
    _emit(ctx, result, f"{state} interest #{result['index']}: {topic}")


@interest.command("update")
@click.argument("index", type=click.IntRange(min=1))
@click.option("--topic")
@click.option("--detail")
@click.pass_context
@guarded
def interest_update(ctx: click.Context, index: int, topic: str | None, detail: str | None) -> None:
    """Update a one-based research interest."""
    if topic is None and detail is None:
        raise click.UsageError("Provide --topic or --detail")
    result = content.update_interest(_root(ctx), index, topic, detail, ctx.obj["dry_run"])
    state = "Would update" if result["dry_run"] else "Updated"
    _emit(ctx, result, f"{state} interest #{index}")


@interest.command("remove")
@click.argument("index", type=click.IntRange(min=1))
@click.option("--yes", is_flag=True, help="Confirm removal.")
@click.pass_context
@guarded
def interest_remove(ctx: click.Context, index: int, yes: bool) -> None:
    """Remove a one-based research interest."""
    if not yes:
        raise click.UsageError("Pass --yes to confirm removal")
    result = content.remove_interest(_root(ctx), index, ctx.obj["dry_run"])
    state = "Would remove" if result["dry_run"] else "Removed"
    _emit(ctx, result, f"{state} interest #{index}")


@cli.group()
def site() -> None:
    """Inspect and build the real Jekyll site."""


@site.command("status")
@click.pass_context
@guarded
def site_status(ctx: click.Context) -> None:
    """Check source files, Bundler, and Git state."""
    data = jekyll_backend.site_status(_root(ctx))
    human = (
        f"Project: {data['project']}\n"
        f"Valid: {data['valid']}\n"
        f"Bundler: {data['bundle'] or 'missing'}\n"
        f"Git:\n{data['git'] or 'unavailable'}"
    )
    _emit(ctx, data, human)


@site.command("build")
@click.option("--destination", type=click.Path(path_type=Path, file_okay=False))
@click.pass_context
@guarded
def site_build(ctx: click.Context, destination: Path | None) -> None:
    """Build with the repository's real Jekyll backend and verify HTML."""
    if ctx.obj["dry_run"]:
        data = {"dry_run": True, "project": str(_root(ctx)), "destination": str(destination) if destination else None}
        _emit(ctx, data, "Would run the Jekyll build")
        return
    data = jekyll_backend.build_site(_root(ctx), destination)
    _emit(
        ctx,
        data,
        f"Built {data['index']} ({data['index_size']} bytes) in {data['duration_seconds']}s",
    )


@cli.group()
def history() -> None:
    """Inspect, undo, or redo persisted content changes."""


@history.command("list")
@click.pass_context
@guarded
def history_list(ctx: click.Context) -> None:
    """List mutation history and the current cursor."""
    data = session.list_history(_root(ctx))
    if not data["entries"]:
        human = "No history."
    else:
        human = "\n".join(
            f"{entry['index']}. {'applied' if entry['applied'] else 'redo'} | {entry['action']} | {entry['timestamp']}"
            for entry in data["entries"]
        )
    _emit(ctx, data, human)


@history.command("undo")
@click.pass_context
@guarded
def history_undo(ctx: click.Context) -> None:
    """Restore the files from the previous mutation."""
    data = session.undo(_root(ctx), ctx.obj["dry_run"])
    state = "Would undo" if data["dry_run"] else "Undid"
    _emit(ctx, data, f"{state}: {data['restored']}")


@history.command("redo")
@click.pass_context
@guarded
def history_redo(ctx: click.Context) -> None:
    """Reapply the next mutation after an undo."""
    data = session.redo(_root(ctx), ctx.obj["dry_run"])
    state = "Would redo" if data["dry_run"] else "Redid"
    _emit(ctx, data, f"{state}: {data['restored']}")


@cli.command("repl")
@click.pass_context
@guarded
def repl(ctx: click.Context) -> None:
    """Enter the stateful interactive editor."""
    root = _root(ctx)
    skin = ReplSkin("wui_homepage", version=__version__)
    skin.print_banner()
    skin.info(f"Project: {root}")
    prompt_session = skin.create_prompt_session()
    commands = {
        "project info": "Inspect project metadata and content counts",
        "profile show/set": "Inspect or update profile fields",
        "experience list/add/update/remove": "Manage laboratory experience",
        "news list/add/update/remove": "Manage homepage news",
        "interest list/add/update/remove": "Manage research interests",
        "site status/build": "Validate or build with Jekyll",
        "history list/undo/redo": "Inspect or restore edits",
        "quit": "Exit the REPL",
    }
    while True:
        try:
            line = skin.get_input(prompt_session, project_name=root.name).strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not line:
            continue
        if line in {"quit", "exit"}:
            break
        if line == "help":
            skin.help(commands)
            continue
        try:
            arguments = shlex.split(line)
            if arguments and arguments[0] == "repl":
                skin.warning("Already in the REPL")
                continue
            prefix = ["--project", str(root)]
            if ctx.obj.get("json"):
                prefix.insert(0, "--json")
            if ctx.obj.get("dry_run"):
                prefix.insert(0, "--dry-run")
            cli.main(args=prefix + arguments, prog_name="cli-anything-wui-homepage", standalone_mode=False)
        except click.ClickException as exc:
            skin.error(exc.format_message())
        except (ValueError, SystemExit) as exc:
            skin.error(str(exc))
    skin.print_goodbye()


def main() -> None:
    cli(prog_name="cli-anything-wui-homepage")


if __name__ == "__main__":
    main()
