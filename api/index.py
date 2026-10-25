"""
Vercel serverless entry point: serves the same API as backend/server.py
under /api/* (see vercel.json rewrites).
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import pmos_data  # noqa: E402
import server  # noqa: E402

# Vercel's filesystem is read-only except /tmp, and init_relationships() writes
# link tables into the database, so work on a copy.
_tmp_db = Path("/tmp/pmos_knowledge_base.db")
if not _tmp_db.exists():
    shutil.copyfile(pmos_data.DB_PATH, _tmp_db)
pmos_data.DB_PATH = _tmp_db

if server.INDEX is None:
    _conn = pmos_data.get_connection()
    pmos_data.init_relationships(_conn)
    server.INDEX = pmos_data.build_index(_conn)
    _conn.close()


class handler(server.Handler):
    pass
