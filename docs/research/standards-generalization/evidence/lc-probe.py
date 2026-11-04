"""Bounded Learning Commons REST probe for the standards-generalization brief.

Cap: N=6 live calls (hard-coded, counted). Reads LEARNING_COMMONS_API_KEY from
.env by name and never prints or writes it. Writes sanitized bodies (no headers)
to lc-probe-out/ and a call log to lc-probe-log.json.

Run: python3 -I docs/research/standards-generalization/evidence/lc-probe.py
"""

import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[4]
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "lc-probe-out"
ORIGIN = "https://api.learningcommons.org/knowledge-graph/v0"
CAP = 6

# Recorded UUIDs (docs/research/142-mcp-eval/evidence.json, Multi-State rows).
UUID_4_NF_A_1 = "6b9c09e2-d7cc-11e8-824f-0242ac160002"
UUID_4_OA_A_3 = "6b9e2e91-d7cc-11e8-824f-0242ac160002"


def read_key() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("LEARNING_COMMONS_API_KEY="):
            value = line.split("=", 1)[1].strip().strip("'\"")
            if value:
                return value
    sys.exit("LEARNING_COMMONS_API_KEY missing: pending LC key")


calls = []


def get(name: str, path: str, params: dict | None = None):
    if len(calls) >= CAP:
        raise RuntimeError("call cap reached")
    url = ORIGIN + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"x-api-key": KEY, "accept": "application/json"})
    started = time.perf_counter()
    status, body = None, None
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status = response.status
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        status = error.code
        try:
            body = json.loads(error.read().decode())
        except Exception:  # noqa: BLE001
            body = None
    except Exception as error:  # noqa: BLE001
        body = {"transportError": type(error).__name__}
    elapsed = round((time.perf_counter() - started) * 1000)
    calls.append({"n": len(calls) + 1, "name": name, "path": path, "params": params or {}, "status": status, "elapsedMs": elapsed})
    (OUT / f"{len(calls):02d}-{name}.json").write_text(json.dumps(body, indent=1, ensure_ascii=False))
    return body


def first_uuid(body, code: str):
    rows = body.get("data") if isinstance(body, dict) else body
    if isinstance(body, dict) and rows is None:
        rows = body.get("results") or body.get("standards") or []
    for row in rows or []:
        if row.get("statementCode") == code:
            return row.get("caseIdentifierUUID")
    return None


KEY = read_key()
OUT.mkdir(exist_ok=True)

search = get(
    "search-ri-5-2",
    "/academic-standards/search",
    {
        "query": "determine two or more main ideas of a text and explain how they are supported by key details; summarize the text",
        "jurisdiction": "Multi-State",
        "academicSubject": "English Language Arts",
        "limit": "5",
    },
)
ri_uuid = first_uuid(search, "RI.5.2")
if ri_uuid:
    get("components-ri-5-2", f"/academic-standards/{ri_uuid}/learning-components")
    get("prerequisites-ri-5-2", f"/academic-standards/{ri_uuid}/prerequisites")
get("components-4-oa-a-3", f"/academic-standards/{UUID_4_OA_A_3}/learning-components")
get("components-4-nf-a-1", f"/academic-standards/{UUID_4_NF_A_1}/learning-components")

(HERE / "lc-probe-log.json").write_text(
    json.dumps({"capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "origin": ORIGIN, "cap": CAP, "used": len(calls), "ri52Uuid": ri_uuid, "calls": calls}, indent=1)
)
print(json.dumps({"used": len(calls), "ri52Uuid": ri_uuid, "calls": calls}, indent=1))
