import { describe, expect, it } from "vitest";
import { signupSchema } from "./signup";

const valid = {
  fullName: "Mariel Santos",
  username: "mariels",
  mobile: "09171234567",
  email: "mariel@example.com",
  city: "Pasig",
  password: "member-pass-123",
  activationCode: "1M-ABCD-EFGH",
  membershipConsent: true,
};
describe("signup requirements", () => {
  it("requires an activation code even when the rest of the form is valid", () => {
    for (const activationCode of [undefined, "", "   "]) {
      expect(signupSchema.safeParse({ ...valid, activationCode }).success).toBe(
        false,
      );
    }
  });
  it("requires explicit consent and rejects missing, false, and string values", () => {
    for (const membershipConsent of [undefined, false, "true", "on"]) {
      expect(
        signupSchema.safeParse({ ...valid, membershipConsent }).success,
      ).toBe(false);
    }
  });
  it("accepts one affirmative consent with an activation code", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });
});
