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


if __name__ == "__main__":
    unittest.main()
