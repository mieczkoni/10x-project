import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BulkCreateCardsCommand,
  CheckCardDuplicateCommand,
  CreateCardCommand,
  UpdateCardCommand,
} from "../../types";
import { bulkCreateCards, checkCardDuplicate, createCard, deleteCard, listCards, updateCard } from "./cards.service";
import { decodeCursor, extractCursor } from "../pagination/cursor";
import { createEvent } from "./events.service";

vi.mock("../pagination/cursor", () => ({
  decodeCursor: vi.fn(),
  extractCursor: vi.fn(),
}));

vi.mock("./events.service", () => ({
  createEvent: vi.fn(),
}));

interface QueryResult<T> {
  data: T;
  error: { code?: string; message: string } | null;
}

interface BuilderOptions<T = unknown> {
  selectResolves?: boolean;
  selectResult?: QueryResult<T>;
  maybeSingleResult?: QueryResult<T>;
  singleResult?: QueryResult<T>;
  limitResult?: QueryResult<T>;
}

const createBuilder = <T = unknown>(options: BuilderOptions<T> = {}) => {
  const builder: Record<string, unknown> = {};
  const {
    selectResolves = false,
    selectResult = { data: null as T, error: null },
    maybeSingleResult = { data: null as T, error: null },
    singleResult = { data: null as T, error: null },
    limitResult = { data: [] as unknown as T, error: null },
  } = options;

  const selectImpl = () => (selectResolves ? Promise.resolve(selectResult) : builder);

  return Object.assign(builder, {
    select: vi.fn().mockImplementation(selectImpl),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(limitResult),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
    single: vi.fn().mockResolvedValue(singleResult),
  });
};

const createSupabaseMock = () => ({
  from: vi.fn(),
  rpc: vi.fn(),
});

const mockedDecodeCursor = vi.mocked(decodeCursor);
const mockedExtractCursor = vi.mocked(extractCursor);
const mockedCreateEvent = vi.mocked(createEvent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cards.service", () => {
  it("creates a card with server-computed content hash", async () => {
    const supabase = createSupabaseMock();
    const deckBuilder = createBuilder({ maybeSingleResult: { data: { id: "deck-1" }, error: null } });
    const insertBuilder = createBuilder({
      singleResult: { data: { id: "card-1", front: "Front", back: "Back" }, error: null },
    });

    supabase.from.mockReturnValueOnce(deckBuilder).mockReturnValueOnce(insertBuilder);
    supabase.rpc.mockResolvedValue({ data: "hash-123", error: null });

    const command: CreateCardCommand = {
      deck_id: "deck-1",
      front: "Front",
      back: "Back",
      ai_generated: true,
    };

    const result = await createCard(supabase as never, "user-1", command);

    expect(result).toMatchInlineSnapshot(`
      {
        "back": "Back",
        "front": "Front",
        "id": "card-1",
      }
    `);
    expect(supabase.rpc).toHaveBeenCalledWith("generate_content_hash", { front: "Front", back: "Back" });
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      deck_id: "deck-1",
      front: "Front",
      back: "Back",
      tags: [],
      ai_generated: true,
      content_hash: "hash-123",
    });
  });

  it("fails to create a card when deck is missing", async () => {
    const supabase = createSupabaseMock();
    const deckBuilder = createBuilder({ maybeSingleResult: { data: null, error: null } });

    supabase.from.mockReturnValueOnce(deckBuilder);

    const command: CreateCardCommand = {
      deck_id: "deck-1",
      front: "Front",
      back: "Back",
      ai_generated: false,
    };

    await expect(createCard(supabase as never, "user-1", command)).rejects.toThrow("DECK_NOT_FOUND");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("maps duplicate insert errors when creating a card", async () => {
    const supabase = createSupabaseMock();
    const deckBuilder = createBuilder({ maybeSingleResult: { data: { id: "deck-1" }, error: null } });
    const insertBuilder = createBuilder({
      singleResult: { data: null, error: { code: "23505", message: "duplicate" } },
    });

    supabase.from.mockReturnValueOnce(deckBuilder).mockReturnValueOnce(insertBuilder);
    supabase.rpc.mockResolvedValue({ data: "hash-123", error: null });

    const command: CreateCardCommand = {
      deck_id: "deck-1",
      front: "Front",
      back: "Back",
      ai_generated: true,
    };

    await expect(createCard(supabase as never, "user-1", command)).rejects.toThrow("DUPLICATE_IN_DECK");
  });

  it("rejects listCards when cursor format is invalid", async () => {
    const supabase = createSupabaseMock();
    const builder = createBuilder();
    supabase.from.mockReturnValueOnce(builder);
    mockedDecodeCursor.mockReturnValueOnce(null);

    await expect(
      listCards(supabase as never, "user-1", {
        limit: 10,
        cursor: "bad-cursor",
        sort: "created_at",
        order: "desc",
        includeDeleted: false,
        tag: undefined,
        tags: undefined,
      })
    ).rejects.toThrow("Invalid cursor format");
  });

  it("applies filters and returns a next cursor when listing cards", async () => {
    const supabase = createSupabaseMock();
    const data = [
      { id: "card-1", created_at: "2025-01-01T00:00:00Z" },
      { id: "card-2", created_at: "2024-01-01T00:00:00Z" },
      { id: "card-3", created_at: "2023-01-01T00:00:00Z" },
    ];
    const builder = createBuilder({
      limitResult: { data, error: null },
    });

    supabase.from.mockReturnValueOnce(builder);
    mockedDecodeCursor.mockReturnValueOnce({ sortValue: "2025-01-01T00:00:00Z", id: "card-0" });
    mockedExtractCursor.mockReturnValueOnce("next-cursor");

    const result = await listCards(supabase as never, "user-1", {
      limit: 2,
      cursor: "valid-cursor",
      sort: "created_at",
      order: "desc",
      deckId: "deck-1",
      tags: ["tag-1"],
      q: "needle",
      aiGenerated: true,
      includeDeleted: false,
      tag: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "data": [
          {
            "created_at": "2025-01-01T00:00:00Z",
            "id": "card-1",
          },
          {
            "created_at": "2024-01-01T00:00:00Z",
            "id": "card-2",
          },
        ],
        "page": {
          "limit": 2,
          "nextCursor": "next-cursor",
        },
      }
    `);
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.eq).toHaveBeenCalledWith("deck_id", "deck-1");
    expect(builder.eq).toHaveBeenCalledWith("ai_generated", true);
    expect(builder.contains).toHaveBeenCalledWith("tags", ["tag-1"]);
    expect(builder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(builder.or).toHaveBeenCalledWith("front.ilike.%needle%,back.ilike.%needle%");
    expect(builder.or).toHaveBeenCalledWith(
      "created_at.lt.2025-01-01T00:00:00Z,and(created_at.eq.2025-01-01T00:00:00Z,id.lt.card-0)"
    );
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(3);
  });

  it("returns null when updating a missing card", async () => {
    const supabase = createSupabaseMock();
    const getBuilder = createBuilder({ maybeSingleResult: { data: null, error: null } });

    supabase.from.mockReturnValueOnce(getBuilder);

    const result = await updateCard(supabase as never, "user-1", "card-1", {
      front: "Updated",
    });

    expect(result).toBeNull();
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("recomputes content hash when updating front or back", async () => {
    const supabase = createSupabaseMock();
    const existingCard = { id: "card-1", front: "Old", back: "Back" };
    const getBuilder = createBuilder({ maybeSingleResult: { data: existingCard, error: null } });
    const updateBuilder = createBuilder({
      singleResult: { data: { id: "card-1", front: "New", back: "Back" }, error: null },
    });

    supabase.from.mockReturnValueOnce(getBuilder).mockReturnValueOnce(updateBuilder);
    supabase.rpc.mockResolvedValue({ data: "hash-new", error: null });

    const command: UpdateCardCommand = { front: "New" };
    const result = await updateCard(supabase as never, "user-1", "card-1", command);

    expect(result).toMatchInlineSnapshot(`
      {
        "back": "Back",
        "front": "New",
        "id": "card-1",
      }
    `);
    expect(supabase.rpc).toHaveBeenCalledWith("generate_content_hash", { front: "New", back: "Back" });
    expect(updateBuilder.update).toHaveBeenCalledWith({
      front: "New",
      content_hash: "hash-new",
    });
  });

  it("maps duplicate errors when updating a card", async () => {
    const supabase = createSupabaseMock();
    const existingCard = { id: "card-1", front: "Old", back: "Back" };
    const getBuilder = createBuilder({ maybeSingleResult: { data: existingCard, error: null } });
    const updateBuilder = createBuilder({
      singleResult: { data: null, error: { code: "23505", message: "duplicate" } },
    });

    supabase.from.mockReturnValueOnce(getBuilder).mockReturnValueOnce(updateBuilder);
    supabase.rpc.mockResolvedValue({ data: "hash-new", error: null });

    await expect(updateCard(supabase as never, "user-1", "card-1", { front: "New" })).rejects.toThrow(
      "DUPLICATE_IN_DECK"
    );
  });

  it("returns false when deleteCard removes no rows", async () => {
    const supabase = createSupabaseMock();
    const deleteBuilder = createBuilder({
      selectResolves: true,
      selectResult: { data: [], error: null },
    });

    supabase.from.mockReturnValueOnce(deleteBuilder);

    const result = await deleteCard(supabase as never, "user-1", "card-1");

    expect(result).toBe(false);
  });

  it("returns duplicate details from checkCardDuplicate", async () => {
    const supabase = createSupabaseMock();
    const deckBuilder = createBuilder({ maybeSingleResult: { data: { id: "deck-1" }, error: null } });
    const duplicateBuilder = createBuilder({
      maybeSingleResult: { data: { id: "card-1", front: "Front", back: "Back" }, error: null },
    });

    supabase.from.mockReturnValueOnce(deckBuilder).mockReturnValueOnce(duplicateBuilder);
    supabase.rpc.mockResolvedValue({ data: "hash-dup", error: null });

    const command: CheckCardDuplicateCommand = {
      deck_id: "deck-1",
      front: "Front",
      back: "Back",
    };

    const result = await checkCardDuplicate(supabase as never, "user-1", command);

    expect(result).toMatchInlineSnapshot(`
      {
        "content_hash": "hash-dup",
        "duplicateCard": {
          "back": "Back",
          "front": "Front",
          "id": "card-1",
        },
        "isDuplicate": true,
      }
    `);
    expect(duplicateBuilder.eq).toHaveBeenCalledWith("deck_id", "deck-1");
    expect(duplicateBuilder.eq).toHaveBeenCalledWith("content_hash", "hash-dup");
    expect(duplicateBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(duplicateBuilder.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("deduplicates and tracks skipped candidates in bulkCreateCards", async () => {
    const supabase = createSupabaseMock();
    const deckBuilder = createBuilder({ maybeSingleResult: { data: { id: "deck-1" }, error: null } });
    const upsertBuilder = createBuilder({
      selectResolves: true,
      selectResult: {
        data: [{ id: "card-1", front: "A", back: "1", content_hash: "hash-a" }],
        error: null,
      },
    });

    supabase.from.mockReturnValueOnce(deckBuilder).mockReturnValueOnce(upsertBuilder);
    supabase.rpc.mockImplementation((_fn, args: { front: string; back: string }) => {
      const key = `${args.front}:${args.back}`;
      const hash = key === "A:1" ? "hash-a" : "hash-b";
      return Promise.resolve({ data: hash, error: null });
    });

    const command: BulkCreateCardsCommand = {
      deck_id: "deck-1",
      cards: [
        { front: "A", back: "1", ai_generated: true, tags: ["tag"], edited: true },
        { front: "A", back: "1", ai_generated: true, tags: ["tag"], edited: false },
        { front: "B", back: "2", ai_generated: false, tags: [], edited: false },
      ],
    };

    const result = await bulkCreateCards(supabase as never, "user-1", command);

    expect(result).toMatchInlineSnapshot(`
      {
        "created": [
          {
            "back": "1",
            "front": "A",
            "id": "card-1",
          },
        ],
        "skipped": [
          {
            "back": "1",
            "front": "A",
            "reason": "duplicate_in_deck",
          },
          {
            "back": "2",
            "front": "B",
            "reason": "duplicate_in_deck",
          },
        ],
      }
    `);
    expect(mockedCreateEvent).toHaveBeenCalledWith(supabase, "user-1", "accepted_after_edit", {
      deck_id: "deck-1",
      card_id: "card-1",
    });
    expect(mockedCreateEvent).toHaveBeenCalledWith(supabase, "user-1", "edited", {
      deck_id: "deck-1",
      card_id: "card-1",
    });
  });

  it("throws CONTENT_HASH_FAILED when bulk content hash fails", async () => {
    const supabase = createSupabaseMock();
    const deckBuilder = createBuilder({ maybeSingleResult: { data: { id: "deck-1" }, error: null } });

    supabase.from.mockReturnValueOnce(deckBuilder);
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "bad" } });

    const command: BulkCreateCardsCommand = {
      deck_id: "deck-1",
      cards: [{ front: "A", back: "1", ai_generated: true, tags: [], edited: false }],
    };

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(bulkCreateCards(supabase as never, "user-1", command)).rejects.toThrow("CONTENT_HASH_FAILED");

    consoleSpy.mockRestore();
  });
});
