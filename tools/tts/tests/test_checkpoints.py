from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from tts.checkpoints import KNOWN_CHECKPOINTS, UnpinnedCheckpoint, sha256, verify


@pytest.fixture
def ckpt(tmp_path: Path) -> Path:
    p = tmp_path / "some.ckpt"
    p.write_bytes(b"not really a checkpoint")
    return p


def test_sha256_matches_hashlib(ckpt: Path) -> None:
    assert sha256(ckpt) == hashlib.sha256(ckpt.read_bytes()).hexdigest()
    # Chunking must not change the digest.
    assert sha256(ckpt, chunk_bytes=1) == sha256(ckpt)


def test_unknown_checkpoint_is_refused_by_default(ckpt: Path) -> None:
    with pytest.raises(UnpinnedCheckpoint, match="is not a known checkpoint"):
        verify(ckpt)


def test_explicit_pin_accepts_a_match_and_refuses_a_mismatch(ckpt: Path) -> None:
    digest = sha256(ckpt)
    assert "pinned by" in verify(ckpt, expected=digest.upper())  # case-insensitive
    with pytest.raises(UnpinnedCheckpoint, match="refusing to load"):
        verify(ckpt, expected="0" * 64)


def test_allow_unpinned_says_so_loudly(ckpt: Path) -> None:
    assert "UNPINNED" in verify(ckpt, allow_unpinned=True)


def test_a_known_checkpoint_needs_no_flag(ckpt: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(KNOWN_CHECKPOINTS, sha256(ckpt), "the test checkpoint")
    assert "the test checkpoint" in verify(ckpt)
