import { z } from 'zod';

export const loginSchema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const signupSchema = z
  .object({
    full_name:        z.string().min(2, 'Name must be at least 2 characters').max(100),
    email:            z.string().email('Enter a valid email address'),
    password:         z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

export const workspaceCreateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
});

export type LoginInput           = z.infer<typeof loginSchema>;
export type SignupInput           = z.infer<typeof signupSchema>;
export type ForgotPasswordInput  = z.infer<typeof forgotPasswordSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;

export interface AuthActionResult {
  success: boolean;
  error?: string;
  redirectTo?: string;
}
