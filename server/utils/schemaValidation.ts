/**
 * Schema Validation Utilities
 *
 * Helpers for validating API responses with Zod schemas.
 */
import { z, ZodObject, ZodError } from "zod";
import { logger } from "./logger.js";

/**
 * Validate and strip extra fields from data
 *
 * @param schema - Zod object schema to validate against
 * @param data - Data to validate
 * @param context - Context for error logging (e.g., "scene response")
 * @returns Validated and stripped data
 * @throws ZodError if validation fails
 */
export function validateResponse<T extends ZodObject>(
  schema: T,
  data: unknown,
  context: string
): z.infer<T> {
  try {
    // strip() returns a new schema that removes unknown keys
    // We need to cast because strip() returns a new ZodObject type
    return schema.strip().parse(data) as z.infer<T>;
  } catch (error) {
    if (error instanceof ZodError) {
      logger.error(`Schema validation failed for ${context}`, {
        issues: error.issues.map(i => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      });
    }
    throw error;
  }
}

/**
 * Safely validate data, returning null on failure instead of throwing
 *
 * @param schema - Zod object schema to validate against
 * @param data - Data to validate
 * @param context - Context for error logging
 * @returns Validated data or null if validation fails
 */
export function safeValidateResponse<T extends ZodObject>(
  schema: T,
  data: unknown,
  context: string
): z.infer<T> | null {
  try {
    return validateResponse(schema, data, context);
  } catch {
    return null;
  }
}

/**
 * Validate an array of items, filtering out invalid ones
 *
 * @param schema - Zod object schema for individual items
 * @param items - Array of items to validate
 * @param context - Context for error logging
 * @returns Array of valid items (invalid items logged and filtered)
 */
export function validateArrayResponse<T extends ZodObject>(
  schema: T,
  items: unknown[],
  context: string
): z.infer<T>[] {
  const validItems: z.infer<T>[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      // strip() returns a new schema that removes unknown keys
      // We need to cast because strip() returns a new ZodObject type
      validItems.push(schema.strip().parse(items[i]) as z.infer<T>);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn(`Invalid item at index ${i} in ${context}`, {
          issues: error.issues.map(issue => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
    }
  }

  return validItems;
}
