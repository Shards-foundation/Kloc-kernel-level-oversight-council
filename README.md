# KLOC — Kernel-Level Oversight Council

> **Five independent AI reviewers. Five separate providers. One deterministic oversight decision.**

KLOC is the Shards ecosystem's adversarial proposal-review application. It does not deploy code, perform transactions, grant execution permits, or replace Shards-Kernel. The five council seats are actual **separate model API calls**, not simulated opinions returned by a single LLM.

## The five independent reviewers

| Seat | Provider | Default model | Mandate |
| --- | --- | --- | --- |
| Security | Anthropic | `claude-sonnet-5-5` | Abuse cases, injection, authorisation, data exposure |
| Systems Integrity | OpenAI | `gpt-6.1-terra` | State, concurrency, rollback, determinism, reliability |
| Economic Risk | Google | `gemini-3.8-flash` | Costs, token waste, budget, opportunity cost |
| Founder-Adversary | xAI | `grok-4.7` | Challenge assumptions, falsify benefits, expose biases |
| External Reality | Mistral | `mistral-small-latest` | Law, external dependencies, vendor lock-in and claims |

Models are configurable through server-side environment variables. Each request contains **only** the original proposal and the assigned seat's specialist instructions. A reviewer cannot see other reviewers' answers. KLOC calls the five distinct provider endpoints independently, checks each result, then applies trusted decision rules.

### Decision and quorum rules

1. **All five configured providers must respond with a valid, correctly identified seat report.** Missing credentials, network errors, timeouts, malformed responses or spoofed seats abort the review; no decision is issued.
2. Any `HARD_REJECT` → `BLOCK`.
3. Otherwise, any `ESCALATE` or reported unknown → `MANUAL_REVIEW`.
4. Otherwise, two or more `SOFT_REJECT` → `DEFER`.
5. Otherwise → `PROCEED` (**advisory only**; not an execution permit).

No model is permitted to supply the collective verdict or vote for another model. KLOC independently recalculates the final state from validated responses.

### Provenance

Each returned seat includes the configured provider and model, request latency and provider-reported token usage where available. KLOC does not claim that model reasoning is objectively correct or that five models guarantee unbiased assessment. Independence means separate inference requests and providers, **not** mathematically independent training data or correlated failure-free opinions.

## Local development

Requires Node.js 22+ and API credentials from **all five vendors**.

```sh
npm install
cp .env.example .env
# Configure five provider API keys in the server-only .env file
npm run dev
```

Open http://127.0.0.1:3000 in your local browser. The Node API listens on loopback at http://127.0.0.1:8787 and Vite proxies `/api` to it.

To test, build and inspect the client distribution:

```sh
npm test
npm run build
npm run check:bundle
npm start
```

`GET /api/health` returns `configured: true` only when all five providers have non-placeholder keys and valid model configuration. Tests use synthetic provider responses and **do not spend real API credits**.

**Never paste provider credentials into GitHub, frontend source, public environment variables, browser screenshots or this README.** Private keys belong in `.env` (gitignored) or a secured server secret manager.

## Privacy, billing and deployment limits

- Every submitted proposal is sent to **Anthropic, OpenAI, Google, xAI and Mistral**. Do not include secrets or sensitive material unless authorised to share it with all five providers under their current terms.
- One review can incur up to five provider inference charges. Configure budgets and provider account limits before real use; **a reliable cross-provider spending limit is not yet implemented**.
- KLOC intentionally binds the local gateway to loopback only. Remote/mobile hosting still requires authenticated access, production deployment security, and appropriately limited budgets.
- The current frontend uses the Tailwind CDN; replace it with a production CSS pipeline before exposing a public site.
- This version has no persistent audit database and no Shards-Kernel permit enforcement.
- Provider model availability and pricing can change; edit the `KLOC_*_MODEL` settings if your account lacks a default model. **The council never silently swaps an unavailable provider for Gemini.**

## Architecture

```text
                  React proposal intake
                           |
                     Local API gateway
                           |
          +----------------+-------------------+
          |                |                   |
     Anthropic           OpenAI              Google
     SECURITY        SYSTEMS_INTEGRITY     ECONOMIC_RISK
          |                |                   |
          +--------+-------+---------+---------+
                   |                 |
                  xAI              Mistral
            FOUNDER_ADVERSARY   EXTERNAL_REALITY
                   |                 |
                   +--------+--------+
                            |
                  Validate all five seats
                            |
                 Deterministic KLOC verdict
                            |
                     React results UI
```

Implementation:
- `server/providers.mjs`: five provider adapters, separate credentials, response metadata, quorum enforcement.
- `server/prompt.mjs`: isolated seat-specific instructions.
- `server/council.mjs`: schema validation and independent decision resolution.
- `server/index.mjs`: local-only HTTP server, origin checks, rate limits, static file protection.
- `tests/providers.test.mjs`: five actual endpoint-shape mocks, identity, quorum and failure tests.
- `tests/council.test.mjs`: deterministic conflict handling.
- `tests/gateway.test.mjs`: HTTP request controls, rate and concurrency enforcement.

## Roadmap (not shipped yet)

Secure phone-accessible hosting, persisted reviewer attestations, replayable evaluations, budgets, model benchmarking and routing, provider diversity analysis, Shards-MCP communication, and Shards-Kernel execution permit integration.

MIT licensed. See [LICENSE](LICENSE).
