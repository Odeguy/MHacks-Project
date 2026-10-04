import { createContext, useContext, type ReactNode } from "react";
import { starterDecks, useLocalState, type PreviewDeck } from "./preview-data";
import type { CardColorId } from "./colors";
type PreviewState = {
  decks: PreviewDeck[];
  setDecks: (
    decks: PreviewDeck[] | ((old: PreviewDeck[]) => PreviewDeck[]),
  ) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  notify: (message: string) => void;
  cardColorChoices: Record<string, CardColorId | number>;
  setCardColor: (cardId: string, color: number) => void;
  nightMode: boolean;
  setNightMode: (value: boolean) => void;
};
const PreviewContext = createContext<PreviewState | null>(null);
export function PreviewProvider({
  children,
  notify,
}: {
  children: ReactNode;
  notify: (message: string) => void;
}) {
  const [decks, setDecks] = useLocalState("tcg:preview:v1:decks", starterDecks);
  const [cardColorChoices, setCardColorChoices] = useLocalState<
    Record<string, CardColorId | number>
  >("tcg:preview:v1:card-colors", {});
  const [nightMode, setNightMode] = useLocalState("tcg:night-mode", false);
  const setCardColor = (cardId: string, color: number) =>
    setCardColorChoices((old) => ({ ...old, [cardId]: color }));
  const [favorites, setFavorites] = useLocalState<string[]>(
    "tcg:preview:v1:favorites",
    [],
  );
  const toggleFavorite = (id: string) =>
    setFavorites((old) =>
      old.includes(id) ? old.filter((item) => item !== id) : [...old, id],
    );
  return (
    <PreviewContext.Provider
      value={{
        decks,
        setDecks,
        favorites,
        toggleFavorite,
        notify,
        cardColorChoices,
        setCardColor,
        nightMode,
        setNightMode,
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}
export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("Preview provider missing");
  return ctx;
}
