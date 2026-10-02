"""Build a .coskin v1 archive from a theme directory using Python's standard library.

This tool fills manifest.files with the actual byte lengths and SHA-256 hashes.
CoSkin's own importer remains the final validator for theme and media semantics.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import tempfile
from typing import Optional
import zipfile


MAX_PACKAGE = 768 * 1024 * 1024
MAX_EXPANDED = 768 * 1024 * 1024
MAX_JSON = 2 * 1024 * 1024
MAX_MEDIA = 25 * 1024 * 1024
MAX_VIDEO = 512 * 1024 * 1024
MAX_FILES = 512
PATH_PATTERN = re.compile(r"^[a-z0-9_./-]{1,240}$")
RESERVED = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)")


def safe_path(path: str) -> bool:
    if not PATH_PATTERN.fullmatch(path):
        return False
    if path not in ("manifest.json", "theme.json") and not path.startswith(
        ("assets/", "preview/")
    ):
        return False
    return all(
        part and part not in (".", "..") and not part.endswith(".") and not RESERVED.match(part)
        for part in path.split("/")
    )


def unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"Duplicate JSON key: {key}")
        value[key] = item
    return value


def read_json(data: bytes, name: str) -> dict[str, object]:
    if len(data) > MAX_JSON:
        raise ValueError(f"JSON file exceeds 2 MiB: {name}")
    value = json.loads(data.decode("utf-8"), object_pairs_hook=unique_object)
    if not isinstance(value, dict):
        raise ValueError(f"JSON root must be an object: {name}")
    return value


def collect(source: Path) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for path in source.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"Symlinks are not allowed: {path}")
        if not path.is_file():
            continue
        name = path.relative_to(source).as_posix()
        if not safe_path(name):
            raise ValueError(f"Invalid package path: {name}")
        if name.startswith(("assets/", "preview/")) and not name.endswith(
            (".png", ".jpg", ".jpeg", ".gif", ".mp4", ".webm")
        ):
            raise ValueError(f"Unsupported media extension: {name}")
        if name.lower() in (previous.lower() for previous in files):
            raise ValueError(f"Duplicate package path: {name}")
        limit = MAX_JSON if name.endswith(".json") else MAX_VIDEO if name.endswith((".mp4", ".webm")) else MAX_MEDIA
        if path.stat().st_size > limit:
            raise ValueError(f"File exceeds size limit: {name}")
        data = path.read_bytes()
        if len(data) > limit:
            raise ValueError(f"File exceeds size limit: {name}")
        files[name] = data
    if "manifest.json" not in files or "theme.json" not in files:
        raise ValueError("manifest.json and theme.json are required")
    if len(files) > MAX_FILES or sum(map(len, files.values())) > MAX_EXPANDED:
        raise ValueError("Package file count or expanded size limit exceeded")
    return files


def package(source: Path, destination: Path) -> None:
    source = source.resolve(strict=True)
    destination = destination.resolve()
    if not source.is_dir():
        raise ValueError("Source must be a directory")
    if destination.suffix != ".coskin":
        raise ValueError("Output filename must end in .coskin")
    if destination.is_relative_to(source):
        raise ValueError("Output must be outside the source directory")
    if destination.exists():
        raise FileExistsError(f"Output already exists: {destination}")
    if not destination.parent.is_dir():
        raise ValueError("Output directory does not exist")

    files = collect(source)
    manifest = read_json(files["manifest.json"], "manifest.json")
    read_json(files["theme.json"], "theme.json")
    if (
        manifest.get("format") != "coskin.theme"
        or type(manifest.get("formatVersion")) is not int
        or manifest.get("formatVersion") != 1
        or manifest.get("entry") != "theme.json"
    ):
        raise ValueError("Expected coskin.theme formatVersion 1 and theme.json entry")
    manifest["files"] = [
        {
            "path": name,
            "bytes": len(files[name]),
            "sha256": hashlib.sha256(files[name]).hexdigest(),
        }
        for name in sorted(files)
        if name != "manifest.json"
    ]
    preview = manifest.get("preview")
    if preview is not None and (
        not isinstance(preview, str) or not preview.startswith("preview/") or preview not in files
    ):
        raise ValueError("manifest.preview must name a packaged file")
    files["manifest.json"] = (
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    ).encode("utf-8")
    if len(files["manifest.json"]) > MAX_JSON:
        raise ValueError("Generated manifest exceeds 2 MiB")

    temporary: Optional[Path] = None
    created = False
    try:
        with tempfile.NamedTemporaryFile(
            prefix=".coskin-", suffix=".tmp", dir=destination.parent, delete=False
        ) as handle:
            temporary = Path(handle.name)
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED) as archive:
            for name in sorted(files):
                entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_STORED
                entry.create_system = 0
                archive.writestr(entry, files[name])
        if temporary.stat().st_size > MAX_PACKAGE:
            raise ValueError("Archive exceeds 768 MiB")
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError("ZIP integrity check failed")
        with temporary.open("rb") as source_file, destination.open("xb") as output:
            created = True
            while chunk := source_file.read(1024 * 1024):
                output.write(chunk)
    except Exception:
        if created:
            destination.unlink(missing_ok=True)
        raise
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Directory with manifest.json and theme.json")
    parser.add_argument("output", type=Path, help="New .coskin file outside the source directory")
    args = parser.parse_args()
    package(args.source, args.output)
    print(f"Created {args.output.resolve()} ({args.output.stat().st_size} bytes)")
    print("Import the file in CoSkin to validate the theme and media semantics.")


if __name__ == "__main__":
    main()
