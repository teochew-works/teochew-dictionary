"""Checksum-pinning for checkpoints this tool is asked to load.

A PyTorch checkpoint is a pickle. Piper loads one with
`torch.load(..., weights_only=False)` for `--warmstart`, and
`LightningModule.load_from_checkpoint` additionally imports and calls module
names taken from the checkpoint's own hyperparameters (CVE-2026-58659,
GHSA-qqmf-gpg7-g8gw, unfixed as of `lightning` 2.6.6). Either path executes
whatever the file's author put there. Downloading a `.ckpt` from the
internet and passing it to `tts train` is therefore equivalent to running an
unsigned binary.

So the same rule the rest of this project applies to audio bytes
(ADR-0014: a URL is never trusted, its checksum is) applies here: a
checkpoint this tool did not produce must be pinned by SHA-256 before it is
loaded. `KNOWN_CHECKPOINTS` holds the ones we have verified;
`--allow-unpinned-warmstart` is the deliberate, noisy escape hatch for
trying a new one.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

# Upstream Piper release checkpoints, verified by download. Keyed by the
# SHA-256 itself so a renamed file is still recognised.
KNOWN_CHECKPOINTS: dict[str, str] = {
    "ab7e5b8dab40f834b7cc58ae4ad7b7009c954b901e4ddbb784bbe11ce379a1cd": (
        "piper en_US-lessac-medium (epoch=2164-step=1355540.ckpt), "
        "huggingface.co/datasets/rhasspy/piper-checkpoints"
    ),
}


class UnpinnedCheckpoint(RuntimeError):
    pass


def sha256(path: Path, chunk_bytes: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(chunk_bytes):
            digest.update(chunk)
    return digest.hexdigest()


def verify(path: Path, expected: str | None = None, allow_unpinned: bool = False) -> str:
    """The checkpoint's description, or raise.

    `expected` pins one specific digest (`--warmstart-sha256`); otherwise the
    file must be in `KNOWN_CHECKPOINTS` unless `allow_unpinned` is set.
    """
    digest = sha256(path)
    if expected is not None:
        if digest != expected.lower():
            raise UnpinnedCheckpoint(f"{path}: sha256 is {digest}, expected {expected.lower()} — refusing to load")
        return f"pinned by --warmstart-sha256 ({digest[:12]}…)"
    known = KNOWN_CHECKPOINTS.get(digest)
    if known is not None:
        return f"{known} ({digest[:12]}…)"
    if allow_unpinned:
        return f"UNPINNED, sha256 {digest} — loading anyway (--allow-unpinned-warmstart)"
    raise UnpinnedCheckpoint(
        f"{path}: sha256 {digest} is not a known checkpoint.\n"
        "A .ckpt is a pickle: loading one runs its author's code (CVE-2026-58659).\n"
        "If you trust this file, re-run with --warmstart-sha256=<digest> to pin it,\n"
        "or --allow-unpinned-warmstart to skip the check, and add it to\n"
        "KNOWN_CHECKPOINTS in tts/checkpoints.py if it should be a standing choice."
    )
