import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));
import { assertEmailConfigured, sendPasswordResetEmail } from "./email.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("password recovery email", () => {
  it("fails clearly when delivery is not configured", async () => {
    vi.stubEnv("SMTP_HOST", "");
    expect(assertEmailConfigured).toThrow("temporarily unavailable");
    await expect(
      sendPasswordResetEmail(
        "member@example.com",
        "https://example.com/reset-password",
      ),
    ).rejects.toThrow("temporarily unavailable");
    expect(sendMail).not.toHaveBeenCalled();
  });
});
