"""Makes backend/ and sync/ importable from the tests (imported first by every test module)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for sub in ("backend", "sync"):
    path = str(ROOT / sub)
    if path not in sys.path:
        sys.path.insert(0, path)
