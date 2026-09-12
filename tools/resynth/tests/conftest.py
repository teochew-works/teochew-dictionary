from __future__ import annotations

import numpy as np
import pytest

from resynth.audio import Wave

SR = 48_000


def tone(freq_hz: float, ms: float, amp: float = 0.3, sr: int = SR) -> np.ndarray:
    """A sawtooth-ish harmonic tone — WORLD's tracker wants harmonics, not a
    bare sine, to lock onto reliably."""
    n = int(sr * ms / 1000.0)
    t = np.arange(n) / sr
    x = np.zeros(n)
    for k in range(1, 8):
        x += np.sin(2 * np.pi * freq_hz * k * t) / k
    return amp * x / np.max(np.abs(x))


def noise(ms: float, amp: float = 0.1, sr: int = SR, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return amp * rng.standard_normal(int(sr * ms / 1000.0))


def silence(ms: float, sr: int = SR) -> np.ndarray:
    return np.zeros(int(sr * ms / 1000.0))


@pytest.fixture
def syllable_like() -> Wave:
    """200 ms silence, 80 ms noise burst (a voiceless onset), 400 ms of a
    150 Hz vowel, 150 ms silence — the shape of a corpus clip like `du2`."""
    x = np.concatenate([silence(200), noise(80), tone(150.0, 400), silence(150)])
    return Wave(samples=x, sample_rate=SR)
