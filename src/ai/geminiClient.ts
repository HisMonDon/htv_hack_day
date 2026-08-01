import { GoogleGenAI } from "@google/genai";

// Thin wrapper around the Gemini API. API key comes from an environment
// variable — never hardcode it, never log it or the raw response body.
const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

export const GEMINI_MODEL = "gemini-flash-latest";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set — copy .env.example to .env and fill it in.");
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

async function requestJSON<T>(prompt: string, responseSchema: object, attempt: number): Promise<T> {
  const genAI = getClient();
  const request = {
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  if (import.meta.env.DEV) {
    console.groupCollapsed(`[Gemini] JSON request (attempt ${attempt})`);
    console.log(JSON.stringify(request, null, 2));
    console.groupEnd();
  }

  const response = await genAI.models.generateContent(request);

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  const parsed = JSON.parse(text) as T;

  if (import.meta.env.DEV) {
    console.groupCollapsed(`[Gemini] JSON response (attempt ${attempt})`);
    console.log(text);
    console.log("Parsed response:", parsed);
    console.groupEnd();
  }

  return parsed;
}

// Generic structured-output call used by generateAbility() and
// generateZombieStats(). responseSchema follows Gemini's structured-output
// schema format (see @google/genai's `Type` enum), matching the Ability /
// ZombieStatBlock shapes in game/types.ts. Callers must still validate +
// clamp the parsed result — this wrapper does not do that.
export async function generateStructuredJSON<T>(
  prompt: string,
  responseSchema: object,
): Promise<T> {
  return requestJSON<T>(prompt, responseSchema, 1);
}

export interface StructuredGenerationResult<T> {
  value: T;
  // false when every attempt (including revisions) still failed `validate` —
  // the caller is expected to fall back to a local default in that case.
  valid: boolean;
  attempts: number;
}

// Same as generateStructuredJSON, but when `validate` throws on the parsed
// result, the failure message and Gemini's own bad output are fed back to
// Gemini as a follow-up turn asking it to correct itself, instead of the
// caller silently discarding the response. This is the generate -> validate
// -> revise loop: only after `maxAttempts` is exhausted does the caller need
// to fall back to a local default.
export async function generateStructuredJSONWithRevision<T>(
  prompt: string,
  responseSchema: object,
  validate: (candidate: T) => void,
  options?: { maxAttempts?: number },
): Promise<StructuredGenerationResult<T>> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 2);
  let currentPrompt = prompt;
  let lastValue: T | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const value = await requestJSON<T>(currentPrompt, responseSchema, attempt);
    lastValue = value;

    try {
      validate(value);
      return { value, valid: true, attempts: attempt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt >= maxAttempts) {
        console.warn(
          `[Gemini] validation failed after ${attempt} attempt(s), giving up and letting the caller fall back:`,
          message,
        );
        return { value, valid: false, attempts: attempt };
      }

      console.warn(`[Gemini] attempt ${attempt} failed validation (${message}) — asking Gemini to revise`);
      currentPrompt = [
        prompt,
        ``,
        `Your previous response failed the game engine's validator and was rejected:`,
        JSON.stringify(value),
        ``,
        `Validation error: ${message}`,
        `Fix that specific problem and return a corrected JSON object matching the schema exactly. Do not repeat the same mistake.`,
      ].join("\n");
    }
  }

  // Unreachable — the loop always returns by the final attempt — but keeps
  // TypeScript satisfied without a non-null assertion.
  return { value: lastValue as T, valid: false, attempts: maxAttempts };
}
