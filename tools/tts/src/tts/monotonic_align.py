"""Monotonic alignment search without the Cython extension.

VITS aligns text tokens to spectrogram frames with a dynamic programme
(`maximum_path`), which Piper ships as a Cython module — and the macOS
wheel ships neither the compiled module nor the `.pyx` to build it. This is
the same algorithm in NumPy, vectorised across the token axis so the Python
loop runs once per frame: for one of this corpus's syllables that is ~5
tokens × ~50 frames, far below the point where compiled code would matter.

`install()` registers it under the module names Piper imports *only if* the
compiled extension is missing, so a checkout that has built the extension
keeps using it.
"""

from __future__ import annotations

import importlib
import sys
import types

import numpy as np

MAX_NEG = -1e9


def maximum_path_each(path: np.ndarray, value: np.ndarray, t_y: int, t_x: int) -> None:
    """In-place port of `core.pyx`'s `maximum_path_each`.

    `value[y, x]` is the log-likelihood of frame `y` being emitted by token
    `x`; on return it holds the best cumulative score and `path` the 0/1
    alignment that achieves it: monotonic, every frame to exactly one token,
    every token to at least one frame.
    """
    v = value  # accumulated in place, as the Cython does
    for y in range(t_y):
        lo = max(0, t_x + y - t_y)
        hi = min(t_x, y + 1)
        if lo >= hi:
            continue
        xs = np.arange(lo, hi)
        if y == 0:
            # Only x == 0 is reachable, from the implicit start with score 0.
            prev = np.where(xs == 0, 0.0, MAX_NEG)
        else:
            stay = np.where(xs == y, MAX_NEG, v[y - 1, xs])  # same token as the frame before
            xm1 = np.where(xs > 0, xs - 1, 0)
            advance = np.where(xs == 0, MAX_NEG, v[y - 1, xm1])  # moved on from the previous token
            prev = np.maximum(stay, advance)
        v[y, lo:hi] += prev

    index = t_x - 1
    for y in range(t_y - 1, -1, -1):
        path[y, index] = 1
        if index != 0 and (index == y or v[y - 1, index] < v[y - 1, index - 1]):
            index -= 1


def maximum_path_c(paths: np.ndarray, values: np.ndarray, t_ys: np.ndarray, t_xs: np.ndarray) -> None:
    """Batch entry point with the Cython function's signature."""
    for i in range(paths.shape[0]):
        maximum_path_each(paths[i], values[i], int(t_ys[i]), int(t_xs[i]))


_PACKAGE = "piper.train.vits.monotonic_align"


def install() -> str:
    """Make `piper.train.vits.monotonic_align` importable; returns 'compiled' or 'numpy'."""
    try:
        importlib.import_module(_PACKAGE)
        return "compiled"
    except ModuleNotFoundError as e:
        if e.name is None or not e.name.startswith(f"{_PACKAGE}.monotonic_align"):
            raise
    inner = types.ModuleType(f"{_PACKAGE}.monotonic_align")
    core = types.ModuleType(f"{_PACKAGE}.monotonic_align.core")
    core.maximum_path_c = maximum_path_c  # type: ignore[attr-defined]
    inner.core = core  # type: ignore[attr-defined]
    sys.modules[inner.__name__] = inner
    sys.modules[core.__name__] = core
    sys.modules.pop(_PACKAGE, None)
    importlib.import_module(_PACKAGE)
    return "numpy"
