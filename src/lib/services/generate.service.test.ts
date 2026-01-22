import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerateCommand } from "../../types";
import { generateCandidates } from "./generate.service";
import { callOpenRouterGenerate, GenerationTimeoutError } from "./openrouter.service";
import { createEvent } from "./events.service";
import { enforceRateLimit, enforceRateLimitDb, RateLimitError } from "./rate-limit.service";

vi.mock("./openrouter.service", () => {
  class GenerationTimeoutError extends Error {
    constructor(message = "Generation timed out") {
      super(message);
      this.name = "GenerationTimeoutError";
    }
  }

  return {
    callOpenRouterGenerate: vi.fn(),
    GenerationTimeoutError,
  };
});

vi.mock("./events.service", () => ({
  createEvent: vi.fn(),
}));

vi.mock("./rate-limit.service", () => {
  class RateLimitError extends Error {
    constructor(message = "Rate limit exceeded") {
      super(message);
      this.name = "RateLimitError";
    }
  }

  return {
    enforceRateLimit: vi.fn(),
    enforceRateLimitDb: vi.fn(),
    RateLimitError,
  };
});

type Uuid = `${string}-${string}-${string}-${string}-${string}`;

type QueryResult<T> = { data: T; error: { message: string } | null };

type BuilderOptions<T = unknown> = {
  maybeSingleResult?: QueryResult<T>;
  inResult?: QueryResult<T>;
};

const createBuilder = <T = unknown>(options: BuilderOptions<T> = {}) => {
  const builder: Record<string, unknown> = {};
  const {
    maybeSingleResult = { data: null as T, error: null },
    inResult = { data: [] as unknown as T, error: null },
  } = options;

  return Object.assign(builder, {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue(inResult),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
  });
};

const createSupabaseMock = () => ({
  from: vi.fn(),
  rpc: vi.fn(),
});

const mockedCallOpenRouterGenerate = vi.mocked(callOpenRouterGenerate);
const mockedCreateEvent = vi.mocked(createEvent);
const mockedEnforceRateLimit = vi.mocked(enforceRateLimit);
const mockedEnforceRateLimitDb = vi.mocked(enforceRateLimitDb);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-22T10:00:00.000Z"));
  const randomIds: Uuid[] = [
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
    "33333333-3333-3333-3333-333333333333",
    "44444444-4444-4444-4444-444444444444",
  ];
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
    () => randomIds.shift() ?? "99999999-9999-9999-9999-999999999999"
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("generate.service", () => {
  it("generates candidates, normalizes tags, and emits events", async () => {
    const supabase = createSupabaseMock();

    mockedCallOpenRouterGenerate.mockResolvedValue({
      rawContent: JSON.stringify([
        { front: "A", back: "B", tags: [" Tag ", "tag"] },
        { front: "C", back: "D", tags: ["Other"] },
      ]),
      modelUsed: "model-x",
    });
    mockedCreateEvent.mockResolvedValue(undefined);

    const command: GenerateCommand = {
      source_text: "Some source text",
      options: { max_cards: 2, language: "en" },
    };

    const result = await generateCandidates(supabase as never, "user-1", command);

    expect(result).toMatchInlineSnapshot(`
      {
        "candidates": [
          {
            "back": "B",
            "duplicate": {
              "duplicateCardId": null,
              "isDuplicate": false,
            },
            "front": "A",
            "tags": [
              "tag",
            ],
            "temp_id": "22222222-2222-2222-2222-222222222222",
          },
          {
            "back": "D",
            "duplicate": {
              "duplicateCardId": null,
              "isDuplicate": false,
            },
            "front": "C",
            "tags": [
              "other",
            ],
            "temp_id": "33333333-3333-3333-3333-333333333333",
          },
        ],
        "generation": {
          "created_at": "2026-01-22T10:00:00.000Z",
          "id": "11111111-1111-1111-1111-111111111111",
          "input_chars": 16,
          "model": "model-x",
        },
      }
    `);
    expect(mockedCreateEvent).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "generate_request",
      expect.objectContaining({
        generation_id: "11111111-1111-1111-1111-111111111111",
        input_chars: 16,
        deck_id: null,
        max_cards: 2,
        language: "en",
      })
    );
    expect(mockedCreateEvent).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "generated_view",
      expect.objectContaining({
        candidate_count: 2,
        repair_attempted: false,
        retry_count: 0,
      })
    );
  });

  it("marks duplicates when deck_id is provided", async () => {
    const supabase = createSupabaseMock();
    const deckBuilder = createBuilder({ maybeSingleResult: { data: { id: "deck-1" }, error: null } });
    const duplicatesBuilder = createBuilder({
      inResult: { data: [{ id: "card-1", content_hash: "hash-a" }], error: null },
    });

    supabase.from.mockImplementation((table: string) => (table === "decks" ? deckBuilder : duplicatesBuilder));
    supabase.rpc.mockImplementation((_fn: string, args: { front: string; back: string }) => {
      const hash = `${args.front}:${args.back}` === "A:B" ? "hash-a" : "hash-b";
      return Promise.resolve({ data: hash, error: null });
    });

    mockedCallOpenRouterGenerate.mockResolvedValue({
      rawContent: JSON.stringify([
        { front: "A", back: "B", tags: [] },
        { front: "C", back: "D", tags: [] },
      ]),
      modelUsed: "model-x",
    });
    mockedCreateEvent.mockResolvedValue(undefined);

    const command: GenerateCommand = {
      source_text: "Some source text",
      deck_id: "deck-1",
      options: { max_cards: 2 },
    };

    const result = await generateCandidates(supabase as never, "user-1", command);

    expect(result.candidates).toMatchInlineSnapshot(`
      [
        {
          "back": "B",
          "duplicate": {
            "duplicateCardId": "card-1",
            "isDuplicate": true,
          },
          "front": "A",
          "tags": [],
          "temp_id": "22222222-2222-2222-2222-222222222222",
        },
        {
          "back": "D",
          "duplicate": {
            "duplicateCardId": null,
            "isDuplicate": false,
          },
          "front": "C",
          "tags": [],
          "temp_id": "33333333-3333-3333-3333-333333333333",
        },
      ]
    `);
    expect(duplicatesBuilder.in).toHaveBeenCalledWith("content_hash", ["hash-a", "hash-b"]);
  });

  it("repairs after validation errors and retries the provider", async () => {
    const supabase = createSupabaseMock();

    mockedCallOpenRouterGenerate
      .mockResolvedValueOnce({
        rawContent: JSON.stringify([{ front: "", back: "Bad" }]),
        modelUsed: "model-x",
      })
      .mockResolvedValueOnce({
        rawContent: JSON.stringify([{ front: "Ok", back: "Fine", tags: [] }]),
        modelUsed: "model-x",
      });
    mockedCreateEvent.mockResolvedValue(undefined);

    const command: GenerateCommand = {
      source_text: "Some source text",
      options: { max_cards: 1 },
    };

    const result = await generateCandidates(supabase as never, "user-1", command);

    expect(result.candidates.length).toBe(1);
    expect(mockedCallOpenRouterGenerate).toHaveBeenCalledTimes(2);
    expect(mockedCallOpenRouterGenerate.mock.calls[1][0]?.repairMessage).toMatchInlineSnapshot(
      `"0.front: front cannot be empty"`
    );

    const generatedViewCall = mockedCreateEvent.mock.calls.find((call) => call[2] === "generated_view");
    expect(generatedViewCall?.[3]).toEqual(
      expect.objectContaining({
        repair_attempted: true,
        retry_count: 1,
      })
    );
  });

  it("emits rate limit errors and stops the flow", async () => {
    const supabase = createSupabaseMock();
    mockedEnforceRateLimit.mockImplementation(() => {
      throw new RateLimitError();
    });
    mockedCreateEvent.mockResolvedValue(undefined);

    const command: GenerateCommand = {
      source_text: "Some source text",
      options: { max_cards: 1 },
    };

    await expect(generateCandidates(supabase as never, "user-1", command)).rejects.toThrow("Rate limit exceeded");

    expect(mockedCreateEvent).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "generate_error",
      expect.objectContaining({ code: "rate_limited" })
    );
    expect(mockedCallOpenRouterGenerate).not.toHaveBeenCalled();
    expect(mockedEnforceRateLimitDb).not.toHaveBeenCalled();
  });

  it("emits timeout errors when the provider times out", async () => {
    const supabase = createSupabaseMock();
    mockedCallOpenRouterGenerate.mockRejectedValue(new GenerationTimeoutError());
    mockedCreateEvent.mockResolvedValue(undefined);

    const command: GenerateCommand = {
      source_text: "Some source text",
      options: { max_cards: 1 },
    };

    await expect(generateCandidates(supabase as never, "user-1", command)).rejects.toThrow("Generation timed out");

    expect(mockedCreateEvent).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "generate_error",
      expect.objectContaining({ code: "generation_timeout" })
    );
  });
});
