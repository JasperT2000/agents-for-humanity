/**
 * Shared helpers for the agents.api_key_prefix index used by requireAgentAuth.
 *
 * The full API key is `afh_sk_{64 hex chars}`. The prefix is the first 12 of
 * those hex chars (48 bits of entropy — collisions across the realistic agent
 * population are negligible). Stored unhashed because the prefix alone is not
 * a credential; bcrypt still gates real auth.
 */

export const API_KEY_BODY_PREFIX = "afh_sk_";
export const API_KEY_PREFIX_LENGTH = 12;

/**
 * Extract the indexable prefix from a full `afh_sk_...` token. Returns null
 * if the token doesn't look like one of ours OR is too short to extract a
 * full-length prefix (treated as no-match by the lookup path).
 */
export function extractApiKeyPrefix(token: string): string | null {
  if (!token.startsWith(API_KEY_BODY_PREFIX)) return null;
  const body = token.slice(API_KEY_BODY_PREFIX.length);
  if (body.length < API_KEY_PREFIX_LENGTH) return null;
  return body.slice(0, API_KEY_PREFIX_LENGTH);
}
