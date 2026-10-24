import { z } from "zod";
import { MOBILE_RE, USERNAME_RE } from "@/lib/types";

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, "Username: 3–20 letters, numbers or _"),
  mobile: z
    .string()
    .trim()
    .regex(MOBILE_RE, "Use a valid PH mobile number (09…)"),
  email: z.email("Please enter a valid email").trim().toLowerCase().max(120),
  city: z.string().trim().min(2, "Please enter your city").max(60),
  referrerCode: z.string().trim().toUpperCase().max(20).optional(),
  activationCode: z
    .string()
    .trim()
    .min(1, "An activation code from the Admin Console is required")
    .max(30),
  membershipConsent: z.literal(true, {
    error: "Please accept the membership and privacy agreement",
  }),
  password: z.string().min(6, "Password needs at least 6 characters").max(200),
});
