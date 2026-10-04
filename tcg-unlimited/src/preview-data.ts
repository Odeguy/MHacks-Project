import { useState } from "react";
import type { GameDefinition } from "./module_bindings/types";
export type ArtVariant = "orbit" | "citadel" | "rift" | "echo";
export type PreviewGame = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  genre: string;
  players: string;
  minutes: string;
  cards: number;
  creator: string;
  initials: string;
  variant: ArtVariant;
  health: number;
  healthName?: string;
  versionId?: bigint;
  definition?: GameDefinition;
};
export const games: PreviewGame[] = [
  {
    id: "orbit-zero",
    title: "ORBIT ZERO",
    subtitle: "A duel at the edge of everything.",
    description:
      "Build your fleet, bend the orbit, and outmaneuver your opponent. A compact cosmic card game where every position changes the possibilities.",
    genre: "Strategy",
    players: "2",
    minutes: "15–20",
    cards: 24,
    creator: "Orbital studio",
    initials: "OS",
    variant: "orbit",
    health: 20,
  },
  {
    id: "black-citadel",
    title: "BLACK CITADEL",
    subtitle: "Build a kingdom. Break the siege.",
    description:
      "Raise your defenses and command a hand of knights, sentinels, and siege engines. Patient construction meets a beautifully unforgiving battlefield.",
    genre: "Duel",
    players: "2",
    minutes: "20–30",
    cards: 32,
    creator: "The rookery",
    initials: "TR",
    variant: "citadel",
    health: 30,
  },
  {
    id: "rift-tactics",
    title: "RIFT TACTICS",
    subtitle: "Small field. Impossible decisions.",
    description:
      "A shifting grid, fractured relics, and a handful of tactical cards. Make the most of every move in this spatial strategy experiment.",
    genre: "Strategy",
    players: "2–4",
    minutes: "10–15",
    cards: 18,
    creator: "Null collective",
    initials: "NC",
    variant: "rift",
    health: 15,
  },
  {
    id: "echo-echo",
    title: "ECHO / ECHO",
    subtitle: "What goes around, plays around.",
    description:
      "A playful loop of chance and clever combinations. Roll the dice, stack your effects, and see what comes back around the table.",
    genre: "Party",
    players: "2–4",
    minutes: "10–20",
    cards: 20,
    creator: "Parallel play",
    initials: "PP",
    variant: "echo",
    health: 20,
  },
];
export type PreviewCard = {
  id: string;
  name: string;
  type: string;
  attack: number;
  defense: number;
  cost: number;
  variant: ArtVariant;
  text: string;
  stats?: { label: string; value: number }[];
};
export const cards: PreviewCard[] = [
  {
    id: "voyager",
    name: "The Voyager",
    type: "Explorer",
    attack: 3,
    defense: 2,
    cost: 1,
    variant: "orbit",
    text: "A new path begins with a single move.",
  },
  {
    id: "sentinel",
    name: "Void Sentinel",
    type: "Guardian",
    attack: 2,
    defense: 5,
    cost: 2,
    variant: "citadel",
    text: "Hold the line at the edge of the unknown.",
  },
  {
    id: "fragment",
    name: "Rift Fragment",
    type: "Relic",
    attack: 4,
    defense: 1,
    cost: 2,
    variant: "rift",
    text: "Everything broken is another possibility.",
  },
  {
    id: "echo",
    name: "Last Echo",
    type: "Effect",
    attack: 1,
    defense: 3,
    cost: 1,
    variant: "echo",
    text: "Some things come back when you need them.",
  },
  {
    id: "architect",
    name: "The Architect",
    type: "Guardian",
    attack: 3,
    defense: 4,
    cost: 3,
    variant: "citadel",
    text: "Build a world that can withstand the next turn.",
  },
  {
    id: "nova",
    name: "Quiet Nova",
    type: "Explorer",
    attack: 5,
    defense: 1,
    cost: 3,
    variant: "orbit",
    text: "A small light. An enormous consequence.",
  },
];
export type PreviewDeck = {
  id: string;
  name: string;
  gameId: string;
  entries: Record<string, number>;
  updated: string;
  versionId?: bigint;
  revision?: number;
  complete?: boolean;
};
export const starterDecks: PreviewDeck[] = [
  {
    id: "first-contact",
    name: "First contact",
    gameId: "orbit-zero",
    entries: {
      voyager: 3,
      sentinel: 3,
      fragment: 2,
      echo: 2,
      architect: 1,
      nova: 1,
    },
    updated: "Starter deck",
  },
  {
    id: "castle-in-the-dark",
    name: "Castle in the dark",
    gameId: "black-citadel",
    entries: { sentinel: 4, architect: 4, voyager: 2, echo: 2 },
    updated: "Starter deck",
  },
  {
    id: "beautiful-fracture",
    name: "Beautiful fracture",
    gameId: "rift-tactics",
    entries: { fragment: 4, voyager: 4, nova: 2, echo: 2 },
    updated: "Starter deck",
  },
];
export function useLocalState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : fallback;
    } catch {
      return fallback;
    }
  });
  const update = (next: T | ((old: T) => T)) =>
    setValue((old) => {
      const result =
        typeof next === "function" ? (next as (old: T) => T)(old) : next;
      try {
        localStorage.setItem(key, JSON.stringify(result));
      } catch {
        /* Keep the preview usable if browser storage is unavailable. */
      }
      return result;
    });
  return [value, update] as const;
}
export function gameById(id: string | undefined) {
  return games.find((g) => g.id === id);
}
export function deckCount(deck: Pick<PreviewDeck, "entries">) {
  return Object.values(deck.entries).reduce((sum, amount) => sum + amount, 0);
}
