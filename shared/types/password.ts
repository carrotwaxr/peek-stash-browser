/**
 * The one password rule: every form shows it and the server enforces it on
 * every path that sets a password (setup wizard, admin-created accounts,
 * password change, admin reset, recovery-key reset).
 */

export const PASSWORD_MIN_LENGTH = 8;

/** bcrypt ignores everything past 72 bytes, so a longer password is refused */
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_RULES_TEXT =
  "8+ characters with at least one letter and one number";

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export const validatePassword = (
  password: string
): PasswordValidationResult => {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (!/[a-zA-Z]/.test(password)) {
    errors.push("Password must contain at least one letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    errors.push(`Password must be at most ${PASSWORD_MAX_BYTES} bytes`);
  }

  return { valid: errors.length === 0, errors };
};
