import { z } from 'zod';

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(80),
});

export const joinHouseholdSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{6}$/, 'Enter the 6-character invite code.'),
});
