# KLOC — Kernel-Level Oversight Council

> **KLOC exists to help bad ideas fail before they become costly actions.**

KLOC is an open-source **adversarial proposal-review application** in the Shards ecosystem. It examines proposed AI systems and engineering changes for hidden failure modes. It is **not** an autonomous executor or a replacement for Shards-Kernel policy enforcement.

## Current capabilities (v1.1 development)

- Structured proposal intake with explicit scope, execution boundaries, risk assets and unknowns.
- Five **simulated** adversarial council perspectives: security, systems integrity, economic risk, founder-adversary and external reality.
- Gemini-backed analysis running on a **server-only** integration.
- Strict validation of model-generated seat results. Invalid or incomplete council results fail closed.
- **Independent, deterministic** rule calculation by application code. Model-supplied final states are ignored.
- Human-readable review cards, blocking reasons, mitigation requirements and rule traces.
- Automated decision logic tests and a build-gated GitHub Actions workflow.

### Decision precedence

1. At least one `HARD_REJECT` → `BLOCK`.
2. Otherwise an `ESCALATE` or admitted material unknown → `MANUAL_REVIEW`.
3. Otherwise two or more `SOFT_REJECT` → `DEFER`.
4. Otherwise → `PROCEED` (**advisory**, never execution authority).

The council represents five specialist **perspectives in one model call**, not five independent running agents. The system may make analytical mistakes; its conclusions require verification where consequences matter.

## Local setup

Requires Node.js 22+ and a Gemini API key.

```sh
npm install
cp .env.example .env
# Edit .env and set GEMINI_API_KEY to a real key.
npm run dev
```

Open **http://127.0.0.1:3000**. Vite serves the React interface; a localhost-only Node.js server handles `/api/analyze` on port 8787.

Do **not** paste provider credentials into browser source, `vite.config.ts`, public environment variables, screenshots or repository files. The private key belongs in the server-side `.env`, which is gitignored.

### Validation

```sh
npm test
npm run build
npm start
```

After a production build, `npm start` serves the UI/API locally on http://127.0.0.1:8787. Health endpoint: `GET /api/health`.

**Deployment constraint:** The backend intentionally refuses non-loopback network binding. Do not disable that restriction or publicly expose the API before authentication, rate limits, a secure reverse proxy and deployment security are reviewed. The current frontend loads Tailwind from a CDN; this also needs replacement before a production-grade public release.

### Mobile access

GitHub code, CI and pull requests can be reviewed from a phone. Running KLOC from a phone over the internet will require a separately secured hosted gateway; this repository is currently configured for localhost-only execution.

## Architecture

```text
React ProposalForm
      |
      | POST /api/analyze (same origin)
      v
Local Node.js API ----> Gemini provider
      |
      v
Validate exactly five seats and all typed fields
      |
      v
Recalculate council result in trusted application code
      |
      v
React KlocResults (advisory only)
```

- `server/council.mjs`: input validation, schema checks and independent deterministic resolution.
- `server/index.mjs`: local HTTP API, server-side provider access and static UI serving.
- `server/prompt.mjs`: server-side council instructions.
- `tests/council.test.mjs`: fail-closed and verdict precedence regression tests.

## Planned, not implemented

Independent provider-isolated council agents, multi-model adapters, persistent decisions, cost/latency/usage telemetry, task-outcome scoring, adaptive routing, Shards-Kernel permits, secure public authentication and durable signed audit records.

These are future milestones, **not current runtime capabilities**.

MIT licensed. See [LICENSE](LICENSE).
