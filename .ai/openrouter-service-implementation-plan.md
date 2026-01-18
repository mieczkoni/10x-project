# OpenRouter Service — Implementation Plan (Astro + TypeScript)

## 1. Service description

The **OpenRouter service** is a server-side integration layer that calls the OpenRouter **Chat Completions** API to run LLM-based chats for application features (e.g., flashcard candidate generation). It is responsible for:

- Building correct OpenRouter requests (messages, model, `response_format`, model parameters).
- Enforcing **timeouts**, performing **retries** when safe, and emitting consistent **typed errors**.
- Returning a normalized result (model used, raw/parsed content, usage, metadata) to downstream services (e.g., `generate.service.ts`).

### Key components (numbered) and purpose

1. **Configuration / Defaults**
   - **Purpose**: Centralize OpenRouter URL, default model, default timeout, and required headers.
2. **Request builder**
   - **Purpose**: Convert input (messages + options) into a valid OpenRouter request body.
3. **Prompt/message composer**
   - **Purpose**: Provide helpers to reliably format system/user messages for product use-cases (generation, repair, etc.).
4. **Structured output support (`response_format`)**
   - **Purpose**: Enable strict JSON-schema responses for deterministic parsing/validation downstream.
5. **HTTP client + timeout control**
   - **Purpose**: Call OpenRouter via `fetch` with `AbortController`, guarantee bounded latency.
6. **Response normalizer**
   - **Purpose**: Extract `model`, `choices[0].message.content`, optional `usage`, and return consistent DTOs.
7. **Error mapping**
   - **Purpose**: Map upstream failures (401/429/5xx, invalid JSON, empty content, abort) into typed, actionable errors.
8. **Observability hooks**
   - **Purpose**: Provide structured logging hooks and metadata for event emission without leaking secrets or full prompts.

### Component details, challenges, and solutions

#### 1) Configuration / Defaults

- **Functionality**:
  - Define constants like `OPENROUTER_URL`, default model, default timeout.
  - Provide a single place to compute headers (`Authorization`, `Content-Type`, `HTTP-Referer`, optional `X-Title`).
- **Implementation challenges**:
  1. Multiple call sites reading env vars inconsistently.
  2. Accidentally shipping secrets to the client or logging them.
- **Solutions**:
  1. Create a factory (e.g., `createOpenRouterServiceFromEnv()`) used only in server code (`src/pages/api/*` and `src/lib/services/*`).
  2. Never expose `OPENROUTER_API_KEY` outside server runtime; redact it in logs; validate presence on startup/first use.

#### 2) Request builder

- **Functionality**:
  - Build the chat request body with:
    - `model`
    - `messages`
    - model parameters (`temperature`, `top_p`, `max_tokens`, etc.)
    - optional `response_format` for structured output
- **Implementation challenges**:
  1. API drift / optional fields causing invalid requests.
  2. Mixing “product defaults” with “call overrides” unpredictably.
- **Solutions**:
  1. Define TypeScript request types + a small validation layer (Zod optional) for requests you build.
  2. Use a single merge strategy: `defaults -> per-method defaults -> per-call overrides`, with explicit precedence and documented behavior.

#### 3) Prompt/message composer

- **Functionality**:
  - Provide helpers for common prompting needs (e.g., “generate candidates” and “repair previous issues”).
  - Ensure message formatting is consistent and deterministic.
- **Implementation challenges**:
  1. Prompts grow too large and cause 413/400 or provider truncation.
  2. Repair loops can become infinite or amplify cost.
- **Solutions**:
  1. Enforce max input size upstream (`generate.zod.ts` already does) and optionally clip/summary pre-step (future).
  2. Cap repair attempts (e.g., at 1), include concise repair hints, and emit retry counts for monitoring.

#### 4) Structured output support (`response_format`)

- **Functionality**:
  - Support strict JSON schema output for reliable parsing:
    - `response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }`
- **Implementation challenges**:
  1. Models occasionally return extra prose despite schema guidance.
  2. Schema complexity can lead to refusal/empty responses or schema mismatches.
- **Solutions**:
  1. Keep schema minimal, set `strict: true`, and validate response using Zod (already used in the project).
  2. Implement “repair” prompting: send a short fix instruction derived from validation errors, then re-call once.

#### 5) HTTP client + timeout control

- **Functionality**:
  - Use `fetch` with `AbortController` and a timer.
  - Treat timeouts as first-class typed errors.
- **Implementation challenges**:
  1. Hanging calls consume server resources.
  2. Abort errors are easy to misclassify.
- **Solutions**:
  1. Always use a timeout (per-call override allowed).
  2. Convert abort into `OpenRouterTimeoutError` (similar to existing `GenerationTimeoutError` pattern).

#### 6) Response normalizer

- **Functionality**:
  - Parse JSON response and extract:
    - `model` used
    - `choices[0].message.content` (raw)
    - optionally `usage` and request id headers (if available)
- **Implementation challenges**:
  1. Upstream returns unexpected response shape.
  2. `content` can be empty or null.
- **Solutions**:
  1. Guard + early return errors for missing fields; keep parsing defensive.
  2. Treat empty content as a typed “invalid response” error that can trigger one repair retry (optional).

#### 7) Error mapping

- **Functionality**:
  - Convert non-2xx responses into typed errors:
    - 401/403 → auth
    - 429 → rate limited
    - 400 → invalid request
    - 5xx → upstream
- **Implementation challenges**:
  1. Loss of useful error context when throwing generic `Error`.
  2. Leaking prompt content via error text.
- **Solutions**:
  1. Store `status`, `providerMessage`, `requestId` (if present), and a short body snippet in error object.
  2. Redact/truncate error bodies; never include full prompts in error messages.

#### 8) Observability hooks

- **Functionality**:
  - Provide structured logs and metrics inputs for `events.service.ts` without coupling it directly.
  - Record durations, model requested/used, retry count, timeout flags.
- **Implementation challenges**:
  1. Logging prompts/PII.
  2. Hard to correlate requests across services.
- **Solutions**:
  1. Log only metadata (lengths, ids, model, status).
  2. Accept a `requestId`/`traceId` param from caller and include it in logs/events.

## 2. Constructor description

Implement the OpenRouter service as a class in `src/lib/services/openrouter.service.ts` (or refactor the existing module to expose both a class and compatibility wrapper).

### Proposed constructor

- **`new OpenRouterService(config)`** where `config` includes:
  - `apiKey: string` (required)
  - `baseUrl?: string` (default: `https://openrouter.ai/api/v1/chat/completions`)
  - `defaultModel?: string` (default: `openrouter/auto`)
  - `defaultTimeoutMs?: number` (default: e.g. `15000`)
  - `referer?: string` (used for `HTTP-Referer` header; required by OpenRouter policy in many setups)
  - `appTitle?: string` (optional `X-Title` header for dashboard attribution)
  - `fetchImpl?: typeof fetch` (dependency injection for tests)
  - `logger?: { info(...); warn(...); error(...); }` (optional; must not log secrets/prompts)
  - `defaultModelParams?: { temperature?: number; top_p?: number; max_tokens?: number; seed?: number; }`

### Factory helper (recommended)

Create a helper `createOpenRouterServiceFromEnv()` that:

- Reads `import.meta.env.OPENROUTER_API_KEY` server-side.
- Validates it exists (throws a clear error on startup/first call).
- Supplies `referer` and `appTitle` defaults from env or constants.

## 3. Public methods and fields

### Public fields (recommended)

- `baseUrl: string`
- `defaultModel: string`
- `defaultTimeoutMs: number`

### Public methods (recommended)

1. **`chatCompletion(request): Promise<OpenRouterChatResult>`**
   - **Purpose**: Generic “chat completions” method used by all product flows.
   - **Inputs**:
     - `messages: Array<{ role: 'system'|'user'|'assistant'|'tool'; content: string }>`
     - `model?: string`
     - `responseFormat?: OpenRouterResponseFormatJsonSchema`
     - `modelParams?: ModelParams`
     - `timeoutMs?: number`
     - `traceId?: string` (optional correlation)
   - **Outputs**:
     - `modelUsed: string`
     - `rawContent: string`
     - `usage?: unknown` (store as-is unless you standardize it)

2. **`chatCompletionJson<T>(request, validator): Promise<{ data: T; modelUsed; rawContent }>`**
   - **Purpose**: Convenience wrapper for structured JSON outputs.
   - **Behavior**:
     - Calls `chatCompletion` with `response_format`.
     - Parses `rawContent` as JSON.
     - Validates with Zod (or caller-provided validator).
     - Optional: one “repair” attempt on validation failure (caller-controlled).

3. **Compatibility wrapper (optional, for minimal changes)**
   - Keep/export existing `callOpenRouterGenerate()` signature for `generate.service.ts`, implemented by calling the class internally.

### Explicit OpenRouter request element handling (with numbered examples)

#### 1) System message (purpose + example)

**Purpose**: Set global rules/constraints and style. Put this first in `messages`.

**Example 1.1** (flashcard generator constraints):

- `messages[0] = { role: 'system', content: 'You generate concise flashcard candidates. Respond ONLY with JSON...' }`

**Implementation notes**:

- Keep the system prompt stable and deterministic.
- Don’t include JSON-schema itself in the system message when using `response_format` (schema belongs in `response_format`).

#### 2) User message (purpose + example)

**Purpose**: Provide the task payload (source text, language, limits) in a clear template.

**Example 2.1** (prompt template):

- `messages[1] = { role: 'user', content: 'Language: en\nMax cards: 10\nSource:\n<user text>' }`

**Example 2.2** (repair message approach):

- Include a short hint: `Fix previous issues: <validation errors summary>`

#### 3) Structured responses via `response_format` (JSON schema) (purpose + examples)

**Purpose**: Make the assistant return machine-parseable JSON matching a strict schema.

**Example 3.1** (required pattern; strict schema):

```ts
const response_format = {
  type: 'json_schema',
  json_schema: {
    name: 'generate_candidates',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['candidates'],
      properties: {
        candidates: {
          type: 'array',
          maxItems: maxCards,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['front', 'back', 'tags'],
            properties: {
              front: { type: 'string', minLength: 1, maxLength: 2000 },
              back: { type: 'string', minLength: 1, maxLength: 10000 },
              tags: {
                type: 'array',
                maxItems: 20,
                items: { type: 'string', minLength: 1, maxLength: 50 },
              },
            },
          },
        },
      },
    },
  },
} as const;
```

**Example 3.2** (another schema: single “summary” object):

```ts
const response_format = {
  type: 'json_schema',
  json_schema: {
    name: 'summarize_text',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'key_points'],
      properties: {
        summary: { type: 'string', minLength: 1, maxLength: 2000 },
        key_points: {
          type: 'array',
          maxItems: 12,
          items: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
  },
} as const;
```

**Implementation notes**:

- Treat `response_format` as optional: only include it for flows that need strict structured outputs.
- Even with `strict: true`, still validate locally (Zod) and implement a single repair attempt if desired.

#### 4) Model name (purpose + examples)

**Purpose**: Choose the provider/model for cost/quality trade-offs; allow caller override.

**Example 4.1** (default/fallback):

- Default: `model = 'openrouter/auto'`

**Example 4.2** (explicit caller choice):

- `model = 'anthropic/claude-3.5-sonnet'` (example) or any OpenRouter-supported name.

**Implementation notes**:

- Preserve both:
  - `modelRequested` (what caller asked for)
  - `modelUsed` (what response says was used, if returned)

#### 5) Model parameters (purpose + examples)

**Purpose**: Control creativity, determinism, and output size/cost.

**Example 5.1** (deterministic-ish extraction):

- `temperature: 0.2` or `0.3`
- `top_p: 1`
- `max_tokens: 1200` (set based on expected output)

**Example 5.2** (highly deterministic with schema):

- `temperature: 0` (if supported/desired)
- Keep schema strict and validate output

**Implementation notes**:

- Keep product defaults in the service; allow per-call overrides.
- Consider adding a hard cap for `max_tokens` to protect cost.

## 4. Private methods and fields

### Private fields (recommended)

- `apiKey: string` (never exposed outside service)
- `fetchImpl: typeof fetch`
- `logger?: Logger`
- `defaultModelParams: ModelParams`

### Private methods (recommended)

1. **`buildHeaders()`**
   - Returns headers with:
     - `Authorization: Bearer <apiKey>`
     - `Content-Type: application/json`
     - `HTTP-Referer: <referer>`
     - optional `X-Title: <appTitle>`
2. **`withTimeout(timeoutMs, fn)`**
   - Wraps a fetch call with `AbortController` and converts abort to typed timeout error.
3. **`buildRequestBody(input)`**
   - Produces the final JSON body with merged defaults + overrides.
4. **`parseOpenRouterResponse(json)`**
   - Extracts `modelUsed` and `rawContent`, validates presence.
5. **`mapHttpError(status, bodyText)`**
   - Produces typed errors with safe/truncated provider body.

## 5. Error handling

### Numbered error scenarios (service-wide)

1. **Missing API key** (`OPENROUTER_API_KEY` not set)
2. **Request timeout** (abort)
3. **Network failure** (DNS, connection reset)
4. **401/403 Unauthorized/Forbidden** (invalid key, blocked)
5. **429 Rate limited** (provider or account-level)
6. **400 Invalid request** (bad schema, invalid model, exceeded limits)
7. **5xx Upstream error** (provider outage)
8. **Non-JSON response** when expecting JSON output
9. **JSON schema mismatch** (parsed JSON fails validation)
10. **Empty `choices[0].message.content`**

### Recommended typed errors

Define small custom errors (similar to existing `GenerationTimeoutError`) so API routes can map them predictably:

- `OpenRouterConfigError`
- `OpenRouterTimeoutError`
- `OpenRouterNetworkError`
- `OpenRouterAuthError`
- `OpenRouterRateLimitError`
- `OpenRouterBadRequestError`
- `OpenRouterUpstreamError`
- `OpenRouterInvalidResponseError` (unexpected shape / empty content)
- `OpenRouterJsonParseError`
- `OpenRouterSchemaValidationError` (include issues list, capped)

### Mapping to API responses (Astro endpoints)

In `src/pages/api/*`, catch these and return existing helpers (e.g., `ApiErrors.*`) with consistent status codes:

- Auth → 401/403
- Rate limit → 429
- Timeout → 504 (or your existing `generationTimeout`)
- Bad request → 400
- Upstream → 502/503
- Schema/parse → 422 (or your existing `modelError`)

## 6. Security considerations

- **API key handling**: Keep `OPENROUTER_API_KEY` strictly server-side. Never return it to clients. Never log it.
- **Prompt/PII logging**: Avoid logging full `sourceText` or raw prompts. Log only lengths, hashes, and metadata.
- **Output sanitization**: Even with structured output, validate and normalize server-side (Zod). Reject unexpected fields (`additionalProperties: false`).
- **Cost controls**:
  - Enforce rate limiting (already present in `rate-limit.service.ts`).
  - Set reasonable timeouts and (optional) max token caps.
  - Cap retries (repair attempts) to prevent runaway costs.
- **Headers**: Provide `HTTP-Referer` and optional `X-Title` to meet OpenRouter expectations and improve attribution.
- **SSRF concerns**: Base URL should be a constant (not user-controlled) unless you explicitly whitelist.

## 7. Step-by-step implementation plan

1. **Define service API + types**
   - In `src/lib/services/openrouter.service.ts`, introduce:
     - `OpenRouterServiceConfig`, `ModelParams`
     - `OpenRouterChatMessage`, `OpenRouterChatRequest`, `OpenRouterChatResult`
     - `OpenRouterResponseFormatJsonSchema` type for `response_format`

2. **Introduce typed errors**
   - Add small error classes (section 5) with fields:
     - `status?: number`
     - `providerMessage?: string` (truncated)
     - `requestId?: string` (if available)
   - Ensure error messages do not include secrets or full prompts.

3. **Implement `OpenRouterService` constructor + env factory**
   - Constructor validates required config (`apiKey`, `referer` if required by your policy).
   - Add `createOpenRouterServiceFromEnv()` that reads `import.meta.env.*`.

4. **Implement `chatCompletion()`**
   - Build request body:
     - `model`
     - `messages` (system + user + optional history)
     - merged model parameters
     - optional `response_format` (pass-through)
   - Call OpenRouter via `fetch` with timeout.
   - On non-2xx: read response text (truncate), map to typed errors.
   - On success: parse JSON, extract `modelUsed` + `rawContent`, throw typed error if missing.

5. **Implement `chatCompletionJson()`**
   - Require a `response_format` and a validator (Zod schema or parsing function).
   - Parse `rawContent` as JSON and validate.
   - Optionally implement a single repair attempt:
     - Convert validation issues to a short `repairMessage`
     - Re-call `chatCompletion()` once with the same schema and a repair note

6. **Align structured output with strict JSON schema**
   - Ensure every schema you ship uses:
     - `strict: true`
     - `additionalProperties: false`
     - explicit `required` lists
   - Keep schema sizes minimal and business-focused.

7. **Integrate with existing generation flow**
   - Option A (minimal change): keep `callOpenRouterGenerate()` but internally instantiate/reuse the class and set `strict: true`.
   - Option B (cleaner): update `generate.service.ts` to depend on `OpenRouterService` (pass instance or create from env).

8. **Testing strategy (recommended)**
   - Unit-test request building (messages, `response_format`, parameter merging).
   - Mock `fetchImpl` to test:
     - timeout path
     - 401/429/5xx mapping
     - empty content handling
     - JSON parse + schema validation + repair attempt

9. **Operational verification**
   - Confirm headers and referer are accepted by OpenRouter.
   - Verify structured output works for target models (some models may not honor strictness equally).
   - Monitor event logs for:
     - validation failures
     - repair retry rate
     - timeouts and 429s
