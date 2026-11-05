# KLOC — Kernel-Level Oversight Council

> **Five independent reviewers, with optional local and free-model backup sub-seats.**

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

1. **All five seats must return valid, independently generated, correctly attributed reports.** In strict mode, primary failures abort the review. If opt-in sub-seats are configured, a missing or failed primary may be replaced by an explicitly registered, distinct backup model. A missing or invalid backup still prevents a decision.
2. Any `HARD_REJECT` → `BLOCK`.
3. Otherwise, any `ESCALATE` or reported unknown → `MANUAL_REVIEW`.
4. Otherwise, two or more `SOFT_REJECT` → `DEFER`.
5. Otherwise → `PROCEED` (**advisory only**; not an execution permit).

No model is permitted to supply the collective verdict or vote for another model. KLOC independently recalculates the final state from validated responses.

## Optional sub-seat fallback layer (v1.3)

The five primary seats and providers remain unchanged. `KLOC_SUBSEATS_ENABLED=false` preserves v1.2's strict five-provider behaviour.

When explicitly enabled, KLOC can draw from a registered backup pool **only when a primary reviewer lacks credentials or fails**. Backups are not extra votes, do not erase prior valid rejections, and cannot claim to be the original provider.

| Backup engine | KLOC adapter | Where the model runs | Notes |
| --- | --- | --- | --- |
| Ollama | `ollama` | The **same host as the KLOC backend** | Fixed `http://127.0.0.1:11434/api/chat`, JSON response mode; install models separately |
| LM Studio | `lmstudio` | The **same host as the KLOC backend** | Fixed `http://127.0.0.1:1234/v1/chat/completions`; use the runtime's exact loaded model ID |
| OpenRouter free models | `openrouter` | Third-party cloud provider | Explicit model ID ending `:free` and an API key; rate-limited, model availability varies |

The configured default local endpoints are **not configurable from user-submitted proposals**; this prevents turning the backup pool into an arbitrary network request or SSRF mechanism. Model names are server-side configuration only. An OpenRouter backup is an **additional external data recipient**; enable it only if sharing proposals there is authorised.

### Configuration example

In your server-side `.env`, set one single-line JSON array (shown wrapped here for readability):

```sh
KLOC_SUBSEATS_ENABLED=true
KLOC_SUBSEATS_JSON='[{"seat":"SECURITY","provider":"ollama","model":"qwen3:8b","priority":5},{"seat":"FOUNDER_ADVERSARY","provider":"openrouter","model":"google/gemma-3-4b-it:free","priority":10}]'
OPENROUTER_API_KEY=YOUR_PRIVATE_KEY_HERE
```

Examples are illustrative. Confirm each local model is actually downloaded/loaded and each listed `:free` ID is available in your OpenRouter account. No backups are auto-installed and no inference requests are made merely by configuring the pool.

A seat may have multiple priority-ordered backups. KLOC tries another registered backup when a candidate fails or produces invalid JSON. A backup can never reuse the model identifier of another selected reviewer. Five separate calls are preserved; a degraded council may include several models served by the **same local runtime**, so five different vendors are **not** guaranteed in backup mode.

### Trust and decision semantics

- **Primary quorum (5/5):** KLOC applies the ordinary `BLOCK / MANUAL_REVIEW / DEFER / PROCEED` deterministic rules.
- **Backup used (5/5 different models):** KLOC labels the council `five-models-with-backup-subseats`, records exactly which primary failed, the substitute engine/model and usage where available, and forces **`MANUAL_REVIEW` unless `BLOCK` already applies**.
- **Insufficient or invalid backup:** KLOC returns an error and produces **no council verdict**. It never fabricates or reuses a model's vote.
- **Fallback is never silently billed or invoked:** backup use requires the explicit environment opt-in. Note that configured OpenRouter free-tier requests can be rate-limited, and local execution still consumes machine resources.

No sub-seat can issue execution permits or authorise actions in Shards-Kernel.

### Mobile operation

You can **manage the repository from your Android phone**, but an Ollama/LM Studio backup must run on the actual KLOC server host (for example a machine or server with suitable memory). A phone does not make a remote server's `127.0.0.1` address point to itself. Secure mobile web access requires separate authenticated hosting; it is not delivered by this PR.

### Provenance

Each returned seat includes the configured provider and model, request latency and provider-reported token usage where available. KLOC does not claim that model reasoning is objectively correct or that five models guarantee unbiased assessment. Independence means separate inference requests and providers, **not** mathematically independent training data or correlated failure-free opinions.

## Local development

Requires Node.js 22+. In strict mode, configure credentials from all five primary vendors. In opt-in fallback mode, a missing primary credential can be replaced by an eligible backup model. Local runtimes must already be installed and running.

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

`GET /api/health` returns `configured: true` only when all five **primary** providers have non-placeholder keys and valid model configuration. The separate `backup_subseats` field reports whether the optional backup pool is configured; it does **not** prove its models are online. Tests use synthetic provider responses and **do not spend real API credits**.

**Never paste provider credentials into GitHub, frontend source, public environment variables, browser screenshots or this README.** Private keys belong in `.env` (gitignored) or a secured server secret manager.

## Privacy, billing and deployment limits

- Every submitted proposal is sent to **Anthropic, OpenAI, Google, xAI and Mistral**. Do not include secrets or sensitive material unless authorised to share it with all five providers under their current terms.
- One review can incur up to five primary provider inference charges plus backup attempts after provider failures. Configure budgets and provider account limits before real use; **a reliable cross-provider spending limit is not yet implemented**.
- KLOC intentionally binds the local gateway to loopback only. Remote/mobile hosting still requires authenticated access, production deployment security, and appropriately limited budgets.
- The current frontend uses the Tailwind CDN; replace it with a production CSS pipeline before exposing a public site.
- This version has no persistent audit database and no Shards-Kernel permit enforcement.
- Provider model availability and pricing can change; edit the `KLOC_*_MODEL` settings if your account lacks a default model. **The council only substitutes explicitly registered backup sub-seats when enabled, visibly marks the result degraded, and cannot automatically clear it.**

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
- `server/providers.mjs`: five primary provider adapters and explicit sub-seat failover, response metadata, quorum enforcement.
- `server/subseats.mjs`: fixed-endpoint Ollama, LM Studio and OpenRouter `:free` backup connectors.
- `server/prompt.mjs`: isolated seat-specific instructions.
- `server/council.mjs`: schema validation and independent decision resolution.
- `server/index.mjs`: local-only HTTP server, origin checks, rate limits, static file protection.
- `tests/providers.test.mjs`: five actual endpoint-shape mocks, identity, quorum and failure tests.
- `tests/council.test.mjs`: deterministic conflict handling.
- `tests/gateway.test.mjs`: HTTP request controls, rate and concurrency enforcement.

## Roadmap (not shipped yet)

Secure phone-accessible hosting, persistent reviewer attestations, replayable evaluations, budgets and quota-aware fallbacks, automated backup health checks, model quality calibration, provider diversity analysis, Shards-MCP communication, and Shards-Kernel execution permit integration.

MIT licensed. See [LICENSE](LICENSE).
