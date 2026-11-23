import { describe, expect, it } from "vitest";
import { AUTH_ERROR_MESSAGES, authErrorPageMessage } from "@/lib/auth/auth-errors";
import { homePathFor, roleFromClaim } from "@/lib/auth/roles";
import { loginSchema, signUpSchema, updatePasswordSchema } from "@/lib/auth/validation";

describe("roleFromClaim", () => {
  it("recognises admin", () => {
    expect(roleFromClaim("admin")).toBe("admin");
  });

  it.each([["student"], [undefined], [null], [""], ["ADMIN"], [{ role: "admin" }], [1]])(
    "falls back to student for %j",
    (claim) => {
      expect(roleFromClaim(claim)).toBe("student");
    },
  );
});

describe("authErrorPageMessage", () => {
  it("shows the fixed message for a known code", () => {
    expect(authErrorPageMessage("invalid_link")).toBe(AUTH_ERROR_MESSAGES.invalid_link);
  });

  it.each([[undefined], ["Your account is locked, call 555-0100"], ["toString"], ["__proto__"]])(
    "never echoes URL text, falling back to a generic message for %j",
    (code) => {
      const message = authErrorPageMessage(code);
      expect(message).toBe("An unspecified error occurred.");
    },
  );
});

describe("homePathFor", () => {
  it("sends each role to its home", () => {
    expect(homePathFor("admin")).toBe("/admin");
    expect(homePathFor("student")).toBe("/dashboard");
  });
});

const validSignUp = {
  firstName: " Sam ",
  lastName: "Student",
  email: "sam@example.com",
  password: "password123",
  repeatPassword: "password123",
};

describe("auth form schemas", () => {
  it("accepts a valid sign-up and trims names", () => {
    expect(signUpSchema.parse(validSignUp).firstName).toBe("Sam");
  });

  it("puts a password mismatch on the repeat field", () => {
    const result = signUpSchema.safeParse({ ...validSignUp, repeatPassword: "different1" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["repeatPassword"]);
  });

  it("enforces the minimum password length", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, password: "short", repeatPassword: "short" }).success).toBe(false);
    expect(updatePasswordSchema.safeParse({ password: "short", repeatPassword: "short" }).success).toBe(false);
  });

  it("validates email format on login", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "sam@example.com", password: "x" }).success).toBe(true);
  });
});
