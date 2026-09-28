"""Checks for the standalone .coskin packaging helper."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "package_theme", ROOT / "scripts" / "package-theme.py"
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageThemeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        shutil.copytree(ROOT / "docs" / "examples" / "basic", self.source)

    def test_example_has_matching_manifest_hashes_and_reproducible_bytes(self) -> None:
        first = self.root / "first.coskin"
        second = self.root / "second.coskin"
        MODULE.package(self.source, first)
        MODULE.package(self.source, second)
        self.assertEqual(first.read_bytes(), second.read_bytes())
        with zipfile.ZipFile(first) as archive:
            self.assertEqual(archive.namelist(), ["manifest.json", "theme.json"])
            manifest = json.loads(archive.read("manifest.json"))
            payload = archive.read("theme.json")
            self.assertEqual(payload, (self.source / "theme.json").read_bytes())
            self.assertEqual(
                manifest["files"],
                [
                    {
                        "path": "theme.json",
                        "bytes": len(payload),
                        "sha256": hashlib.sha256(payload).hexdigest(),
                    }
                ],
            )

    def test_existing_output_is_preserved(self) -> None:
        output = self.root / "existing.coskin"
        output.write_bytes(b"keep me")
        with self.assertRaises(FileExistsError):
            MODULE.package(self.source, output)
        self.assertEqual(output.read_bytes(), b"keep me")

    def test_unsupported_internal_path_is_rejected(self) -> None:
        assets = self.source / "assets"
        assets.mkdir()
        (assets / "UPPER.PNG").write_bytes(b"not an image")
        output = self.root / "invalid.coskin"
        with self.assertRaisesRegex(ValueError, "Invalid package path"):
            MODULE.package(self.source, output)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
