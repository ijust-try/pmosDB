"""
Diagnose Gemini access and speed. Reads the key from GEMINI_API_KEY and prints no secrets: only model names,
timings, HTTP status codes and the provider's uppercase status words.

    $k = Read-Host "Gemini key" -AsSecureString
    $env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new("", $k).Password
    py backend/gemini_probe.py

It lists the Flash models your key can use, times a trivial prompt on a few of them (so a slow "thinking" model
shows up), then times the chatbot's real prompt on the default model.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://generativelanguage.googleapis.com/v1beta"
PROBE_TIMEOUT = 40.0  # seconds per model; a model slower than this is too slow for the chat anyway
SKIP = ("image", "tts", "audio", "live", "embedding", "robotics", "computer", "veo", "imagen", "gemma", "learnlm", "aqa")


def call(key: str, method: str, path: str, body: dict | None = None, timeout: float = 60) -> tuple:
    """Returns (http_status_or_None, parsed_json, seconds). Errors become fixed words, never provider text."""
    req = urllib.request.Request(
        API + path, data=json.dumps(body).encode() if body is not None else None, method=method,
        headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), time.time() - started
    except urllib.error.HTTPError as exc:
        status = None
        try:
            raw = (json.loads(exc.read().decode("utf-8")).get("error") or {}).get("status")
            status = raw if isinstance(raw, str) and raw.replace("_", "").isupper() and len(raw) < 41 else None
        except Exception:  # noqa: BLE001
            pass
        return exc.code, {"status": status}, time.time() - started
    except Exception as exc:  # noqa: BLE001 - only the class name is reported
        return None, {"error": type(exc).__name__}, time.time() - started


def summarise(status, data, seconds) -> str:
    if status != 200:
        return f"HTTP {status} {data.get('status') or data.get('error') or ''} after {seconds:.1f}s"
    cand = (data.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []) if not p.get("thought"))
    usage = data.get("usageMetadata") or {}
    return (f"OK in {seconds:.1f}s, finishReason={cand.get('finishReason')}, "
            f"thinking tokens={usage.get('thoughtsTokenCount', 0)}, answer tokens={usage.get('candidatesTokenCount', 0)}, "
            f"reply={text.strip()[:40]!r}")


def generate(key: str, model: str, system: str, prompt: str, max_tokens: int, timeout: float = 60) -> tuple:
    body = {"systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": max_tokens}}
    return call(key, "POST", f"/models/{model}:generateContent", body, timeout)


def flash_models(key: str) -> list[str]:
    status, data, _ = call(key, "GET", "/models?pageSize=200")
    if status != 200:
        print(f"could not list models: HTTP {status} {data.get('status') or data.get('error') or ''}")
        return []
    names = []
    for m in data.get("models", []):
        name = m.get("name", "").removeprefix("models/")
        if "flash" in name and "generateContent" in m.get("supportedGenerationMethods", []) \
                and not any(word in name for word in SKIP):
            names.append(name)
    return names


def main() -> int:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        print("GEMINI_API_KEY is not set in this window.")
        return 1
    names = flash_models(key)
    print(f"Flash models your key can use ({len(names)}):", ", ".join(names[:14]) or "none found", flush=True)
    wanted = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.5-flash"]
    candidates = [m for m in wanted if m in names] or names[:4]
    print(f"\nTrivial prompt (\"reply with the word ready\"), 512 tokens allowed, {PROBE_TIMEOUT:.0f}s limit each:", flush=True)
    for model in candidates:
        print(f"  {model:34s} testing...", end=" ", flush=True)
        print(summarise(*generate(key, model, "Be brief.", "Reply with the single word: ready", 512, PROBE_TIMEOUT)), flush=True)

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import chat
    import pmos_data
    import retrieval
    import shutil
    import tempfile
    from pathlib import Path

    tmp = Path(tempfile.gettempdir()) / "pmos_probe.db"
    shutil.copyfile(pmos_data.DB_PATH, tmp)
    pmos_data.DB_PATH = tmp
    index = pmos_data.build_index(pmos_data.get_connection())
    result = retrieval.retrieve(index, "what does flutamide do")
    prompt = chat.build_prompt("what does flutamide do", result)
    print(f"\nThe chatbot's real prompt ({len(prompt)} characters, {len(result['records'])} records), "
          f"{chat.MAX_OUTPUT_TOKENS} tokens allowed:")
    for model in candidates[:4]:
        print(f"  {model:34s} testing...", end=" ", flush=True)
        print(summarise(*generate(key, model, chat.SYSTEM_PROMPT, prompt, chat.MAX_OUTPUT_TOKENS, PROBE_TIMEOUT)), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
