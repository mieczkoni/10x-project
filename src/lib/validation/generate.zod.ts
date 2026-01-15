import { z } from 'zod';

const MAX_SOURCE_TEXT_CHARS = 20000;
const MIN_CARDS = 1;
const MAX_CARDS = 20;
const DEFAULT_MAX_CARDS = 20;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;
const MAX_FRONT_LENGTH = 2000;
const MAX_BACK_LENGTH = 10000;

export function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
    )
  );
}

const sourceTextSchema = z
  .string({ required_error: 'source_text is required' })
  .transform((val) => val?.trim?.() ?? val)
  .pipe(
    z
      .string()
      .min(1, 'source_text cannot be empty')
      .max(MAX_SOURCE_TEXT_CHARS, `source_text must be ${MAX_SOURCE_TEXT_CHARS} characters or less`)
  );

const optionsSchema = z
  .object({
    max_cards: z
      .number()
      .int()
      .min(MIN_CARDS, `max_cards must be at least ${MIN_CARDS}`)
      .max(MAX_CARDS, `max_cards must be ${MAX_CARDS} or less`)
      .optional(),
    language: z
      .string()
      .trim()
      .min(2, 'language must be at least 2 characters')
      .max(10, 'language must be at most 10 characters')
      .optional(),
    model: z
      .string()
      .trim()
      .min(1, 'model cannot be empty')
      .max(100, 'model must be at most 100 characters')
      .optional(),
  })
  .optional()
  .transform((opts) => {
    const normalized = opts ?? {};
    return {
      max_cards: normalized.max_cards ?? DEFAULT_MAX_CARDS,
      language: normalized.language ?? 'en',
      ...(normalized.model ? { model: normalized.model } : {}),
    };
  });

export const generateSchema = z.object({
  deck_id: z
    .string()
    .uuid({ message: 'deck_id must be a valid UUID' })
    .optional(),
  source_text: sourceTextSchema,
  options: optionsSchema,
});

export const validateGenerateInputSchema = z.object({
  source_text: sourceTextSchema,
});

export const generatedCandidateSchema = z.object({
  front: z
    .string({ required_error: 'front is required' })
    .trim()
    .min(1, 'front cannot be empty')
    .max(MAX_FRONT_LENGTH, `front must be ${MAX_FRONT_LENGTH} characters or less`),
  back: z
    .string({ required_error: 'back is required' })
    .trim()
    .min(1, 'back cannot be empty')
    .max(MAX_BACK_LENGTH, `back must be ${MAX_BACK_LENGTH} characters or less`),
  tags: z
    .array(z.string().max(MAX_TAG_LENGTH, `Each tag must be ${MAX_TAG_LENGTH} characters or less`))
    .optional()
    .transform((val) => normalizeTags(val ?? []))
    .pipe(z.array(z.string()).max(MAX_TAGS, `Maximum ${MAX_TAGS} tags allowed`)),
});

export type GenerateCommandBody = z.infer<typeof generateSchema>;
export type ValidateGenerateInputBody = z.infer<typeof validateGenerateInputSchema>;
export type GeneratedCandidateBody = z.infer<typeof generatedCandidateSchema>;

export const generateValidationLimits = {
  MAX_SOURCE_TEXT_CHARS,
  MIN_CARDS,
  MAX_CARDS,
  DEFAULT_MAX_CARDS,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_FRONT_LENGTH,
  MAX_BACK_LENGTH,
};
