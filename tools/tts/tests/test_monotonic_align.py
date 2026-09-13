"""The NumPy monotonic alignment search against an exhaustive reference."""

from __future__ import annotations

import itertools

import numpy as np
import pytest

from tts.monotonic_align import maximum_path_c, maximum_path_each


def _all_paths(t_y: int, t_x: int):
    """Every monotonic frame→token assignment covering all tokens in order."""
    # Choose the frame at which each token after the first starts.
    for starts in itertools.combinations(range(1, t_y), t_x - 1):
        assign = np.zeros(t_y, dtype=int)
        for token, start in enumerate(starts, start=1):
            assign[start:] = token
        yield assign


def _brute_force(value: np.ndarray, t_y: int, t_x: int) -> tuple[float, np.ndarray]:
    best_score, best_path = -np.inf, None
    for assign in _all_paths(t_y, t_x):
        score = sum(value[y, assign[y]] for y in range(t_y))
        if score > best_score:
            best_score = score
            best_path = np.zeros((t_y, t_x), dtype=np.int32)
            best_path[np.arange(t_y), assign] = 1
    return best_score, best_path


@pytest.mark.parametrize("seed", range(20))
@pytest.mark.parametrize("t_y,t_x", [(1, 1), (3, 1), (4, 4), (7, 3), (12, 5), (30, 6)])
def test_matches_exhaustive_search(seed: int, t_y: int, t_x: int) -> None:
    rng = np.random.default_rng(seed)
    value = rng.normal(size=(t_y, t_x)).astype(np.float32)
    expected_score, expected_path = _brute_force(value.copy(), t_y, t_x)

    path = np.zeros((t_y, t_x), dtype=np.int32)
    acc = value.copy()
    maximum_path_each(path, acc, t_y, t_x)

    # The chosen path scores the optimum (ties may pick a different, equal path).
    assert path.sum(axis=1).tolist() == [1] * t_y
    assert (path.sum(axis=0) >= 1).all()
    assert (np.diff(path.argmax(axis=1)) >= 0).all()
    assert float((path * value).sum()) == pytest.approx(expected_score, abs=1e-4)
    assert float(acc[t_y - 1, t_x - 1]) == pytest.approx(expected_score, abs=1e-4)


def test_batch_respects_per_item_lengths() -> None:
    rng = np.random.default_rng(0)
    values = rng.normal(size=(2, 10, 4)).astype(np.float32)
    paths = np.zeros_like(values, dtype=np.int32)
    t_ys = np.array([10, 6], dtype=np.int32)
    t_xs = np.array([4, 2], dtype=np.int32)
    maximum_path_c(paths, values, t_ys, t_xs)
    assert paths[0].sum() == 10
    assert paths[1].sum() == 6
    assert paths[1][6:].sum() == 0 and paths[1][:, 2:].sum() == 0
