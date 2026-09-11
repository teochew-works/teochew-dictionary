"""The one place `pyworld` is imported.

pyworld 0.3.x's `__init__` reads its own version through `pkg_resources`,
which setuptools 81 removed (and every setuptools that still ships it has an
open advisory — PYSEC-2026-3447). Rather than pin a vulnerable setuptools for
one attribute lookup, give pyworld the single function it calls, backed by
`importlib.metadata`. Nothing else in this package touches `pkg_resources`.
"""

from __future__ import annotations

import importlib.metadata as _metadata
import sys
import types

try:
    import pkg_resources  # noqa: F401 — present on an older setuptools; nothing to do
except ModuleNotFoundError:
    _shim = types.ModuleType("pkg_resources")

    class _Distribution:
        def __init__(self, version: str) -> None:
            self.version = version

    def _get_distribution(name: str) -> _Distribution:
        return _Distribution(_metadata.version(name))

    _shim.get_distribution = _get_distribution  # type: ignore[attr-defined]
    sys.modules["pkg_resources"] = _shim

import pyworld as pw  # noqa: E402

__all__ = ["pw"]
