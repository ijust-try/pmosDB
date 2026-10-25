"""
Stdlib-only REST API that serves the FK-stitched PMOS knowledge base to the
pmos-biograph frontend, matching the contract in:
  pmos-biograph/pmos-biograph/src/services/api.config.ts  (paths)
  pmos-biograph/pmos-biograph/src/services/backend.ts     (shapes)
  pmos-biograph/pmos-biograph/src/types/index.ts          (payload types)

Run:
    py backend/server.py
Then, in pmos-biograph/pmos-biograph/.env:
    VITE_USE_MOCK=false
    VITE_API_BASE_URL=http://localhost:8000/api
"""
from __future__ import annotations

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import pmos_data

HOST = "127.0.0.1"
PORT = 8000

INDEX: pmos_data.Index | None = None

ROUTES = {
    "search": re.compile(r"^/api/search$"),
    "entities_list": re.compile(r"^/api/entities$"),
    "entity": re.compile(r"^/api/entities/([^/]+)$"),
    "neighbours": re.compile(r"^/api/entities/([^/]+)/relationships$"),
    "graph": re.compile(r"^/api/graph$"),
    "pathways": re.compile(r"^/api/pathways$"),
    "therapeutics": re.compile(r"^/api/therapeutics$"),
    "publications": re.compile(r"^/api/publications$"),
    "sources": re.compile(r"^/api/sources$"),
    "summary": re.compile(r"^/api/summary$"),
}


def _csv_param(params: dict, key: str) -> list[str] | None:
    raw = params.get(key, [""])[0]
    if not raw:
        return None
    return [v for v in raw.split(",") if v]


def _int_param(params: dict, key: str, default=None):
    raw = params.get(key, [None])[0]
    if raw in (None, ""):
        return default
    return int(raw)


class Handler(BaseHTTPRequestHandler):
    server_version = "PMOSBackend/0.1"

    def log_message(self, format: str, *args) -> None:  # quieter default logging
        sys.stderr.write(f"[server] {self.address_string()} {format % args}\n")

    def _send_json(self, payload, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # CORS preflight
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Accept, Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        assert INDEX is not None
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        path = parsed.path

        try:
            if ROUTES["search"].match(path):
                q = params.get("q", [""])[0]
                hits = pmos_data.search_entities(
                    INDEX, q, types=_csv_param(params, "types"), sources=_csv_param(params, "sources"),
                    limit=_int_param(params, "limit", 50),
                )
                self._send_json(hits)
                return

            if ROUTES["entities_list"].match(path):
                query = {
                    "query": params.get("query", [None])[0],
                    "types": _csv_param(params, "types"),
                    "sources": _csv_param(params, "sources"),
                    "sortBy": params.get("sortBy", [None])[0],
                    "sortDir": params.get("sortDir", [None])[0],
                    "page": _int_param(params, "page", 1),
                    "pageSize": _int_param(params, "pageSize", 10),
                }
                query = {k: v for k, v in query.items() if v is not None}
                self._send_json(pmos_data.list_entities(INDEX, query))
                return

            m = ROUTES["neighbours"].match(path)
            if m:
                entity_id = m.group(1)
                self._send_json(pmos_data.get_neighbours(INDEX, entity_id))
                return

            m = ROUTES["entity"].match(path)
            if m:
                entity_id = m.group(1)
                entity = INDEX.by_id.get(entity_id)
                if entity is None:
                    self._send_json({"error": "not found"}, status=404)
                else:
                    self._send_json(entity)
                return

            if ROUTES["graph"].match(path):
                focus = params.get("focus", [pmos_data.PROCESS_PCOS_ID])[0]
                depth = _int_param(params, "depth", 2)
                self._send_json(pmos_data.get_graph(INDEX, focus, depth))
                return

            if ROUTES["pathways"].match(path):
                self._send_json([e for e in INDEX.entities if e["type"] == "pathway"])
                return

            if ROUTES["therapeutics"].match(path):
                self._send_json([e for e in INDEX.entities if e["type"] == "therapeutic"])
                return

            if ROUTES["publications"].match(path):
                year_raw = params.get("year", [None])[0]
                year = year_raw if year_raw == "unknown" else (int(year_raw) if year_raw else None)
                query = {
                    "query": params.get("query", [None])[0],
                    "year": year,
                    "entityId": params.get("entityId", [None])[0],
                    "category": params.get("category", [None])[0],
                }
                self._send_json(pmos_data.get_publications(INDEX, query))
                return

            if ROUTES["sources"].match(path):
                self._send_json(pmos_data.get_sources(INDEX))
                return

            if ROUTES["summary"].match(path):
                self._send_json(pmos_data.get_summary(INDEX))
                return

            self._send_json({"error": "not found"}, status=404)
        except Exception as exc:  # pragma: no cover - dev server guard
            self._send_json({"error": str(exc)}, status=500)


def main() -> None:
    global INDEX
    conn = pmos_data.get_connection()
    pmos_data.init_relationships(conn)
    INDEX = pmos_data.build_index(conn)
    conn.close()

    print(f"[server] entities={len(INDEX.entities)} relationships={len(INDEX.relationships)}")
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[server] listening on http://{HOST}:{PORT}/api")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
