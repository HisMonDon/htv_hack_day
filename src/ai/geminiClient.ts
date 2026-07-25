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

// Generic structured-output call used by generateAbility() and
// generateZombieStats(). responseSchema follows Gemini's structured-output
// schema format (see @google/genai's `Type` enum), matching the Ability /
// ZombieStatBlock shapes in game/types.ts. Callers must still validate +
// clamp the parsed result — this wrapper does not do that.
export async function generateStructuredJSON<T>(
  prompt: string,
  responseSchema: object,
): Promise<T> {
  const genAI = getClient();
  const response = await genAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return JSON.parse(text) as T;
}
