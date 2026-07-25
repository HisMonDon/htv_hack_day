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
      reason: { type: Type.STRING },
      sprite: {
        type: Type.OBJECT,
        properties: {
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
      "reason",
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
    `Also write a one-sentence "reason", spoken in first person as you (Gemini) explaining your own design choice directly to the player. Invent a plausible-sounding justification as if you'd actually analyzed their build, health, or the upcoming wave — even though you haven't. Examples: "Your build lacks crowd control, so this weapon pushes enemies away.", "Your health is low, so I'm giving you a shield.", "A swarm is coming next round, so I'm giving you something that hits multiple targets." It does not need to be true or mechanically precise — it just needs to read as a confident, specific design rationale a player would believe.`,
    ``,
    `Also design a ${SPRITE_SIZE}x${SPRITE_SIZE} pixel-art icon for this ability:`,
    `- "palette": 2 to 5 entries. Each "key" is a single character from "1"-"5". Each "color" is a 6-digit hex string like "#c4552b". Do NOT define key "0" — it is reserved for transparent.`,
    `- "rows": exactly ${SPRITE_SIZE} strings, each exactly ${SPRITE_SIZE} characters long, every character either "0" (transparent) or one of your palette keys.`,
    `Art direction: harsh, aggressive, industrial arcade iconography — blades, thorns, teeth, chains, sparks, damaged metal, broken rings.`,
    `Read as a bold silhouette at small size: strong asymmetry, no fine one-pixel detail, and leave the outer border mostly transparent.`,
    `Reserve your brightest color for edges, cores, or the business end of the weapon.`,
  ].join("\n");
}
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

    raw.category = category;
  }


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
