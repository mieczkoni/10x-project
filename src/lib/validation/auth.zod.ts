import { z } from "zod";

const emailSchema = z
  .string({ required_error: "Email is required." })
  .trim()
  .min(1, "Email is required.")
  .max(254, "Email must be 254 characters or less.")
  .email("Enter a valid email address.");

const passwordSchema = z
  .string({ required_error: "Password is required." })
  .min(1, "Password is required.")
  .min(8, "Password must be at least 8 characters.");

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginCommandBody = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z
      .string({ required_error: "Confirm password is required." })
      .min(1, "Confirm password is required."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignupCommandBody = z.infer<typeof signupSchema>;

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export type RequestPasswordResetCommandBody = z.infer<typeof requestPasswordResetSchema>;

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z
      .string({ required_error: "Confirm password is required." })
      .min(1, "Confirm password is required."),
    accessToken: z.string().optional().nullable(),
    refreshToken: z.string().optional().nullable(),
    code: z.string().optional().nullable(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type UpdatePasswordCommandBody = z.infer<typeof updatePasswordSchema>;
