import io
import json
import unittest
import urllib.error
from unittest import mock

import _paths  # noqa: F401
import gemini_probe as probe

KEY = "TESTKEY-probe-do-not-leak-98765"


class ProbeNeverLeaksTests(unittest.TestCase):
    def call(self, side_effect):
        with mock.patch.object(probe.urllib.request, "urlopen", side_effect=side_effect):
            return probe.call(KEY, "GET", "/models")

    def test_provider_text_and_key_never_appear_in_results(self):
        err = urllib.error.HTTPError("u", 403, "x", {}, io.BytesIO(json.dumps(
            {"error": {"status": "PERMISSION_DENIED", "message": f"bad key {KEY}"}}).encode()))
        status, data, _ = self.call(err)
        self.assertEqual((status, data), (403, {"status": "PERMISSION_DENIED"}))
        self.assertNotIn(KEY, probe.summarise(status, data, 1.0))

    def test_free_text_status_is_dropped(self):
        err = urllib.error.HTTPError("u", 400, "x", {}, io.BytesIO(json.dumps(
            {"error": {"status": f"invalid {KEY}"}}).encode()))
        self.assertEqual(self.call(err)[1], {"status": None})

    def test_network_errors_report_only_the_class_name(self):
        status, data, _ = self.call(urllib.error.URLError(f"failed using {KEY}"))
        self.assertEqual((status, data), (None, {"error": "URLError"}))
        self.assertNotIn(KEY, probe.summarise(status, data, 1.0))

    def test_summary_shows_timing_and_thinking_tokens(self):
        data = {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "ready"}]}}],
                "usageMetadata": {"thoughtsTokenCount": 812, "candidatesTokenCount": 2}}
        line = probe.summarise(200, data, 23.4)
        self.assertIn("23.4s", line)
        self.assertIn("thinking tokens=812", line)


if __name__ == "__main__":
    unittest.main()
