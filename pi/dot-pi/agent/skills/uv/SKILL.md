---
name: uv
description: Use this skill whenever Python is being used. uv should be used for all Python work such as running scripts, managing virtual environments, managing dependencies and running tools.
---

# uv

Never call `pip`, `python`, or `python -m venv` directly. Use uv, especially when you see a `uv.lock` file or uv headers in `requirements*` files.

Don't edit dependencies in `pyproject.toml` by hand. Use `uv add` / `uv remove`.

## Scripts

```bash
uv run example.py                      # run a script
uv run --with rich example.py          # run with extra packages
uv add --script example.py requests    # write inline dependencies into the script
```

For throwaway code use here-document syntax:

```bash
uv run - <<'EOF'
# /// script
# dependencies = ["requests"]
# ///
import requests
print(requests.get("https://example.com").status_code)
EOF
```

## Projects

```bash
uv init                                # Initialize a uv project in current directory
uv init project-name                   # Initialize a project in a new directory

uv add requests                        # Add a dependency into pyproject.toml
uv add --dev pytest ruff               # Add a development dependency
uv add -r requirements.txt             # Import dependencies from requirements.txt file

uv remove requests                     # Remove a dependency from pyproject.toml

uv sync                                # Install from the lockfile
uv run pytest                          # Run a command in the project environment
```

Check `pyproject.toml` for `[project.scripts]`.

```toml
[project.scripts]
myapp = "mypackage.cli:main"
```

```bash
uv run myapp                           # Runs mypackage.cli:main
```

## pip interface

Use only in projects that already use a pip-based workflow (`requirements.txt`, no `uv.lock`).

uv finds `.venv` in the current directory (or nearest parent) automatically. Avoid running `source .venv/bin/activate`.

```bash
uv venv                                # Create .venv
uv venv --python 3.11                  # Create .venv with a specific Python version

uv pip install -r requirements.txt
uv pip install requests
uv run script.py
```

## Tools

```bash
uvx ruff                               # Equivalent to "uv tool run ruff"
uvx --from httpie http                 # Package name differs from command

uv tool install ruff                   # Install tool globally
```

## More help

For anything not covered here, run `uv help <command>`.