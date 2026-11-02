import io
import json
import unittest
import urllib.error
from unittest import mock

import _paths  # noqa: F401
import harvest


def http_error(code):
    return urllib.error.HTTPError("http://x", code, "err", {}, io.BytesIO(b""))


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def ok(payload):
    return FakeResponse(json.dumps(payload).encode())


class HttpRetryTests(unittest.TestCase):
    def call(self, side_effect):
        with mock.patch.object(harvest.urllib.request, "urlopen", side_effect=side_effect) as urlopen, \
                mock.patch.object(harvest.time, "sleep"):
            try:
                result = harvest.http_json("http://x")
            except Exception as exc:  # noqa: BLE001 - the test inspects what was raised
                result = exc
            return result, urlopen.call_count

    def test_transient_server_errors_are_retried_until_success(self):
        result, calls = self.call([http_error(500), http_error(503), ok({"a": 1})])
        self.assertEqual((result, calls), ({"a": 1}, 3))

    def test_rate_limiting_is_retried(self):
        result, calls = self.call([http_error(429), ok({"a": 1})])
        self.assertEqual((result, calls), ({"a": 1}, 2))

    def test_persistent_server_error_fails_loudly_after_all_attempts(self):
        result, calls = self.call([http_error(500)] * harvest.HTTP_ATTEMPTS)
        self.assertIsInstance(result, urllib.error.HTTPError)
        self.assertEqual(calls, harvest.HTTP_ATTEMPTS)

    def test_not_found_is_a_normal_empty_answer(self):
        self.assertEqual(self.call([http_error(404)]), (None, 1))

    def test_client_errors_are_not_retried(self):
        result, calls = self.call([http_error(400), ok({"a": 1})])
        self.assertIsInstance(result, urllib.error.HTTPError)
        self.assertEqual(calls, 1)

    def test_network_errors_are_retried(self):
        result, calls = self.call([urllib.error.URLError("reset"), ok({"a": 1})])
        self.assertEqual((result, calls), ({"a": 1}, 2))


class FreshSinceTests(unittest.TestCase):
    """A retried sync reuses what it already fetched, but never trusts older cached data."""

    def setUp(self):
        import pathlib
        import tempfile

        self.dir = pathlib.Path(tempfile.mkdtemp())
        self._raw = harvest.RAW
        harvest.RAW = self.dir

    def tearDown(self):
        harvest.RAW = self._raw
        harvest.set_refresh(False)

    def fetch_twice(self, fresh_since, retrieved_at):
        """Fetch once (writes the cache), stamp the file with `retrieved_at`, fetch again; count network calls."""
        harvest.set_refresh(True, fresh_since)
        with mock.patch.object(harvest, "http_get", return_value={"new": True}) as get, mock.patch.object(harvest.time, "sleep"):
            harvest.fetch("x", "q", "http://u")
            for f in self.dir.glob("*.json"):
                record = json.loads(f.read_text(encoding="utf-8"))
                record["retrieved_at"] = retrieved_at
                f.write_text(json.dumps(record), encoding="utf-8")
            get.reset_mock()
            second = harvest.fetch("x", "q", "http://u")
            return second, get.call_count

    def test_a_response_fetched_during_this_run_is_reused_on_retry(self):
        second, calls = self.fetch_twice("2026-11-05T12:00:00+00:00", "2026-11-05T12:05:00+00:00")
        self.assertEqual((calls, second["response"]), (0, {"new": True}))

    def test_an_older_cached_response_is_refetched(self):
        self.assertEqual(self.fetch_twice("2026-11-05T12:00:00+00:00", "2026-10-01T09:00:00+00:00")[1], 1)

    def test_without_fresh_since_a_refresh_always_refetches(self):
        self.assertEqual(self.fetch_twice(None, "2026-11-05T12:05:00+00:00")[1], 1)

    def test_the_weekly_workflow_retries_once_and_reuses_fetched_responses(self):
        text = (_paths.ROOT / ".github" / "workflows" / "weekly-sync.yml").read_text(encoding="utf-8")
        commands = [line for line in text.splitlines() if "python sync/run_sync.py" in line]
        self.assertEqual(len(commands), 2, "one attempt, one retry")
        self.assertTrue(all('--fresh-since "$since"' in line for line in commands))
        self.assertIn("||", commands[0], "the retry runs only when the first attempt fails")


if __name__ == "__main__":
    unittest.main()
