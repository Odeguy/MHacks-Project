export const cardColors = [
  { id: "neutral", name: "White", hex: "#ffffff" },
  { id: "mint", name: "Mint", hex: "#6ee7b7" },
  { id: "blue", name: "Ice blue", hex: "#7dd3fc" },
  { id: "violet", name: "Violet", hex: "#c4b5fd" },
  { id: "amber", name: "Amber", hex: "#fcd34d" },
  { id: "coral", name: "Coral", hex: "#fda4af" },
] as const;

export type CardColorId = (typeof cardColors)[number]["id"];

const presetHues: Record<CardColorId, number> = {
  neutral: 0,
  mint: 155,
  blue: 200,
  violet: 260,
  amber: 45,
  coral: 350,
};

export function cardHue(choice: string | number | undefined, seed: string) {
  if (typeof choice === "number") return Math.max(0, Math.min(360, choice));
  if (choice && choice !== "neutral")
    return presetHues[choice as CardColorId] ?? 200;
  const hash = [...seed].reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
    0,
  );
  return [155, 200, 260, 45, 350][hash % 5];
}

export function hueColor(hue: number) {
  return `hsl(${hue} 70% 76%)`;
}

export function getCardColor(id: string) {
  return cardColors.find((color) => color.id === id) ?? cardColors[0];
}

// One accent per page load; navigating between pages keeps it stable.
export const backgroundAccent =
  cardColors[1 + Math.floor(Math.random() * (cardColors.length - 1))];
