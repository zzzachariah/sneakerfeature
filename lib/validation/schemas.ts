import { z } from "zod";
import { DIM_KEYS } from "@/lib/star-rating";

export const authSchema = z.object({
  identifier: z.string().min(3, "Use at least 3 characters for username/email."),
  username: z.string().min(3).max(20).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  turnstileToken: z.string().min(1, "Please complete Turnstile verification.")
});

export const commentSchema = z.object({
  shoeId: z.string().uuid("Invalid shoe identifier."),
  content: z.string().min(3).max(1000),
  turnstileToken: z.string().min(1)
});

export const saveComparisonSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(80, "Title must be 80 characters or fewer."),
  shoeIds: z.array(z.string().uuid("Invalid shoe identifier.")).min(2, "Save at least 2 shoes.").max(5, "Save at most 5 shoes.")
});

export const deleteComparisonSchema = z.object({
  id: z.string().uuid("Invalid comparison identifier.")
});

const dimRatingValue = z
  .number()
  .min(0.5, "Rating must be at least 0.5.")
  .max(5, "Rating must be at most 5.")
  .refine((v) => Math.round(v * 2) === v * 2, "Rating must be in 0.5 increments.");

export const ratingUpsertSchema = z.object({
  shoeId: z.string().uuid("Invalid shoe identifier."),
  cushioning_feel: dimRatingValue,
  court_feel: dimRatingValue,
  bounce: dimRatingValue,
  stability: dimRatingValue,
  traction: dimRatingValue,
  fit: dimRatingValue
});

export const ratingDeleteSchema = z.object({
  shoeId: z.string().uuid("Invalid shoe identifier.")
});

const dimEnum = z.enum(DIM_KEYS);
export const ratingFocusSchema = z
  .object({
    primary: dimEnum,
    secondary: dimEnum,
    tertiary: dimEnum
  })
  .refine(
    (d) => new Set([d.primary, d.secondary, d.tertiary]).size === 3,
    "Three picks must be distinct."
  );

export const submissionSchema = z.object({
  shoe_name: z.string().min(2),
  brand: z.string().min(2),
  model: z.string().optional(),
  release_year: z.coerce.number().min(1980).max(new Date().getFullYear() + 2).optional(),
  forefoot_midsole_tech: z.string().optional(),
  heel_midsole_tech: z.string().optional(),
  outsole_tech: z.string().optional(),
  upper_tech: z.string().optional(),
  cushioning_feel: z.string().optional(),
  court_feel: z.string().optional(),
  bounce: z.string().optional(),
  stability: z.string().optional(),
  traction: z.string().optional(),
  fit: z.string().optional(),
  tags: z.string().optional(),
  story_title: z.string().optional(),
  story_notes: z.string().optional(),
  raw_text: z.string().min(20, "Please add detailed notes so normalization is reliable."),
  source_links: z.string().optional(),
  submission_type: z.enum(["new_shoe", "correction"]).optional().default("new_shoe"),
  target_shoe_id: z.string().uuid().optional(),
  original_snapshot: z.string().optional(),
  turnstileToken: z.string().min(1)
}).superRefine((data, ctx) => {
  if (data.submission_type === "correction" && !data.target_shoe_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["target_shoe_id"],
      message: "Correction submissions must include a target shoe."
    });
  }
});
