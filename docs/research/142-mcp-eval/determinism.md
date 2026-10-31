# Determinism record

Two independent processes ran `scripts/lc-mcp-eval.ts record` on 2026-10-31, at the same revision and origin. Both runs recorded 24 runs: eight rows by three modes.

| Run | Captured | Revision | Server | Runs | Chain-hash digest |
| --- | --- | --- | --- | --- | --- |
| A | 2026-10-31T00:14:56.435Z | `9d1a9a5` | `rmcp 3.2.0` | 24 | `5d4427f38cd767d5982377d08d5e379a` |
| B | 2026-10-31T00:16:34.910Z | `9d1a9a5` | `rmcp 3.2.0` | 24 | `5d4427f38cd767d5982377d08d5e379a` |

`compare /tmp/r1/evidence.json /tmp/r2/evidence.json` reported `OK determinism: 24 run hashes identical.`

The digest is SHA-256 over each run's chain hash, one per line, in file order. Run A is the committed [evidence.json](evidence.json), so a reviewer can reproduce the comparison:

```bash
node --import tsx scripts/lc-mcp-eval.ts record --out /tmp/recheck
node --import tsx scripts/lc-mcp-eval.ts compare docs/research/142-mcp-eval/evidence.json /tmp/recheck/evidence.json
```

`compare` also fails when the contract fingerprint differs: schema version, origin, negotiated protocol, server name and version, tool names, and schema hashes. Equal hashes across different contracts do not count as determinism.

## Limits

- Two runs, one hour, one key, one origin. Later vendor data changes produce different hashes, which is the intended signal, not a flake.
- `capturedAt`, latency and gateway headers differ between runs and are excluded from every hash.
- `session_id` is excluded from every hash and from every excerpt.
