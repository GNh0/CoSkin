"""Package only public runtime files; never include libraries, profiles or user media."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import zipfile

FILES = ("CoSkin.Loader.exe", "THIRD-PARTY-NOTICES.txt", "renderer.js")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    directory = arguments.directory.resolve(strict=True)
    output = arguments.output.resolve()
    if output.exists():
        raise SystemExit("기존 배포 파일은 덮어쓰지 않습니다.")
    for name in FILES:
        source = directory / name
        if source.is_symlink() or not source.is_file() or source.resolve().parent != directory:
            raise SystemExit("배포 파일 경로가 안전하지 않습니다: " + name)
    try:
        with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in FILES:
                entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                with archive.open(entry, "w") as target, (directory / name).open("rb") as source:
                    while chunk := source.read(1024 * 1024):
                        target.write(chunk)
        with zipfile.ZipFile(output) as archive:
            if sorted(archive.namelist()) != sorted(FILES) or archive.testzip() is not None:
                raise SystemExit("배포 ZIP 검사 실패")
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    with output.open("rb") as source:
        checksum = hashlib.sha256()
        while chunk := source.read(1024 * 1024):
            checksum.update(chunk)
        digest = checksum.hexdigest()
    output.with_suffix(output.suffix + ".sha256").write_text(digest + "  " + output.name + "\n", encoding="ascii")
    print(digest + "  " + output.name)


if __name__ == "__main__":
    main()
