import { Type, type Schema } from "@google/genai";
import type { Ability, AbilityCategory, LaneType } from "../game/types";
import { generateStructuredJSON } from "./geminiClient";

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
    },
    required: [
      "name",
      "category",
      "description",
      "cooldownSeconds",
      "range",
      "statusEffect",
      "targeting",
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

  const ability = await generateStructuredJSON<Ability>(prompt, schema);

  if (ability.category !== category) {
    // Schema constrains this to a single enum value, but don't trust it blindly.
    ability.category = category;
  }

  return ability;
}
