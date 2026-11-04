"""Learning Commons call 6 of N=6: California RI.5.2 text. Key read by name, never printed.
Run: python3 -I docs/research/standards-generalization/evidence/lc-probe-ca.py"""
import json, pathlib, time, urllib.parse, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[4]; HERE = pathlib.Path(__file__).resolve().parent
key = next(l.split("=", 1)[1].strip().strip("'\"") for l in (ROOT / ".env").read_text().splitlines() if l.startswith("LEARNING_COMMONS_API_KEY="))
q = urllib.parse.urlencode({"query": "determine two or more main ideas of a text and explain how they are supported by key details; summarize the text", "jurisdiction": "California", "academicSubject": "English Language Arts", "limit": "5"})
t = time.perf_counter()
with urllib.request.urlopen(urllib.request.Request(f"https://api.learningcommons.org/knowledge-graph/v0/academic-standards/search?{q}", headers={"x-api-key": key}), timeout=10) as r:
    status, body = r.status, json.loads(r.read().decode())
ms = round((time.perf_counter() - t) * 1000)
(HERE / "lc-probe-out" / "06-search-ri-5-2-california.json").write_text(json.dumps(body, indent=1, ensure_ascii=False))
log = json.loads((HERE / "lc-probe-log.json").read_text()); log["calls"].append({"n": 6, "name": "search-ri-5-2-california", "status": status, "elapsedMs": ms}); log["used"] = 6
(HERE / "lc-probe-log.json").write_text(json.dumps(log, indent=1))
for row in body: print(row.get("statementCode"), round(row.get("score", 0), 3), row.get("jurisdiction"), "|", row.get("description"))
print("status", status, "ms", ms)
