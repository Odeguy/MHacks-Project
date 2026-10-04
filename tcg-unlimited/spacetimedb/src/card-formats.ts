// Format presets are shared by the editor and publication validation.
export const cardFormats = [
  { id: "basic_atk_def", label: "Basic Atk/Def", combat: true, effects: false },
  {
    id: "effect_atk_def",
    label: "Effect Atk/Def",
    combat: true,
    effects: true,
  },
  {
    id: "instant_effect",
    label: "Instant Effect",
    combat: false,
    effects: true,
  },
  {
    id: "persistent_effect",
    label: "Persistent Effect",
    combat: false,
    effects: true,
  },
  { id: "equip_effect", label: "Equip Effect", combat: false, effects: true },
  { id: "trap_reaction", label: "Trap/Reaction", combat: false, effects: true },
  { id: "field_effect", label: "Field Effect", combat: false, effects: true },
  { id: "resource", label: "Resource", combat: false, effects: true },
] as const;

export function normalizeCardFormat(value: string, hasAbility = false): string {
  if (value === "fighter")
    return hasAbility ? "effect_atk_def" : "basic_atk_def";
  if (value === "effect") return "persistent_effect";
  return value;
}

export function cardFormat(value: string) {
  return (
    cardFormats.find((format) => format.id === normalizeCardFormat(value)) ??
    cardFormats[0]
  );
}
