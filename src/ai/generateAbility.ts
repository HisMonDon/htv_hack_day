import { Type, type Schema } from "@google/genai";
import type { Ability, AbilityCategory, LaneType } from "../game/types";
import { generateStructuredJSON } from "./geminiClient";
import { SPRITE_SIZE, validateSprite, type RawSpriteResponse } from "../game/spriteValidation";
import { getFallbackSprite, tierForWave } from "../data/spriteLibrary";

function buildAbilitySchema(category: AbilityCategory): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      category: { type: Type.STRING, enum: [category] },
      description: { type: Type.STRING },
      damage: { type: Type.NUMBER, nullable: true },
      cooldownSeconds: { type: Type.NUMBER },
      range: { type: Type.NUMBER },
      areaOfEffect: { type: Type.NUMBER, nullable: true },
      durationSeconds: { type: Type.NUMBER, nullable: true },
      projectileCount: { type: Type.INTEGER, nullable: true },
      projectileSpeed: { type: Type.NUMBER, nullable: true },
      knockback: { type: Type.NUMBER, nullable: true },
      statusEffect: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, nullable: true },
          magnitude: { type: Type.NUMBER, nullable: true },
          durationSeconds: { type: Type.NUMBER, nullable: true },
        },
        required: ["type", "magnitude", "durationSeconds"],
      },
      movementBehavior: { type: Type.STRING, nullable: true },
      targeting: { type: Type.STRING },
      sprite: {
        type: Type.OBJECT,
        properties: {
          // Palette as an array of key/color pairs rather than a keyed object:
          // Gemini's structured output has no way to express arbitrary object
          // keys, so an object palette comes back inconsistently shaped.
          palette: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                color: { type: Type.STRING },
              },
              required: ["key", "color"],
            },
          },
          // One string per row, one character per pixel. Far more reliable to
          // get back well-formed than a nested string[][], and small enough to
          // regenerate every 15 seconds.
          rows: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["palette", "rows"],
      },
    },
    required: [
      "name",
      "category",
      "description",
      "cooldownSeconds",
      "range",
      "statusEffect",
      "targeting",
      "sprite",
    ],
  };
}

function buildPrompt(
  waveNumber: number,
  laneType: LaneType,
  category: AbilityCategory,
  currentLoadout: Ability[],
): string {
  const loadoutSummary = currentLoadout.length
    ? currentLoadout.map((a) => `- ${a.name}: ${a.description}`).join("\n")
    : "(none equipped yet)";

  return [
    `You are generating one ${category} ability for a top-down wave-survival brawler.`,
    `This is for wave ${waveNumber} of the "${laneType}" lane.`,
    `The controller currently has these abilities equipped — do not generate a near-duplicate of any of them:`,
    loadoutSummary,
    `Return a single JSON object matching the provided schema. Keep the description to one player-facing sentence.`,
    ``,
    `Also design a ${SPRITE_SIZE}x${SPRITE_SIZE} pixel-art icon for this ability:`,
    `- "palette": 2 to 5 entries. Each "key" is a single character from "1"-"5". Each "color" is a 6-digit hex string like "#c4552b". Do NOT define key "0" — it is reserved for transparent.`,
    `- "rows": exactly ${SPRITE_SIZE} strings, each exactly ${SPRITE_SIZE} characters long, every character either "0" (transparent) or one of your palette keys.`,
    `Art direction: harsh, aggressive, industrial arcade iconography — blades, thorns, teeth, chains, sparks, damaged metal, broken rings.`,
    `Read as a bold silhouette at small size: strong asymmetry, no fine one-pixel detail, and leave the outer border mostly transparent.`,
    `Reserve your brightest color for edges, cores, or the business end of the weapon.`,
  ].join("\n");
}

// Spec 3 — generates one ability option for a lane's controller.
// currentLoadout (spec 3.4) is passed so Gemini can avoid near-duplicates of
// what's already equipped. The caller is responsible for calling
// pickTwoCategories() first and invoking this once per category, then
// clamping the result with clampAbilityToRange().
export async function generateAbility(
  waveNumber: number,
  laneType: LaneType,
  category: AbilityCategory,
  currentLoadout: Ability[],
): Promise<Ability> {
  const schema = buildAbilitySchema(category);
  const prompt = buildPrompt(waveNumber, laneType, category, currentLoadout);

  const raw = await generateStructuredJSON<Ability & { sprite: RawSpriteResponse }>(prompt, schema);

  if (raw.category !== category) {
    // Schema constrains this to a single enum value, but don't trust it blindly.
    raw.category = category;
  }

  // Sprite validation failing must not fail the whole ability — the mechanics
  // are the load-bearing part, and a library silhouette of the right category
  // is a better outcome than dropping a generated ability entirely.
  let sprite;
  try {
    sprite = validateSprite(raw.sprite);
  } catch (err) {
    console.warn(
      `[generateAbility] sprite validation failed for "${raw.name}" (${category}) — substituting library sprite:`,
      err instanceof Error ? err.message : err,
    );
    sprite = getFallbackSprite(category, tierForWave(waveNumber));
    if (!sprite) {
      throw new Error(`no fallback sprite available for category ${category}`);
    }
  }

  return { ...raw, sprite };
}
