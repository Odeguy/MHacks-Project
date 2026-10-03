import "./App.css";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import menuSymbol from "./assets/menu.svg";



function GameGalleryPage() {
  return (
    <>
    </>
  );
}

function GameDesignerPage() {
  return (
    <>
    </>
  );
}

function GameDetailsPage() {
  return (
    <>
    </>
  );
}

function SavedDecksPage() {
  return (
    <>
    </>
  );
}

function DeckBuilderPage() {
  return (
    <>
    </>
  );
}

function RoomPage() {
  return (
    <>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <title>TCG Unlimited</title>
      <Link to="/" style={{ textDecoration: "none" }}>
        <header>
          <h1>TCG Unlimited</h1>
        </header>
      </Link>

      <nav>
        <details open>
          <summary><img src={menuSymbol} alt="Menu" width={24} height={24} style={{ verticalAlign: "middle" }} /></summary>
          <ul>
            <li>
              <Link to="/">Game Gallery</Link>
            </li>
            <li>
              <Link to="/create">Game Designer</Link>
            </li>
            <li>
              <Link to="/games/:gameId/decks">Saved Decks</Link>
            </li>
            <li>
              <Link to="/decks/:deckId/edit">Deck Builder</Link>
            </li>
            <li>
              <Link to="/rooms/:roomId">Room</Link>
            </li>
          </ul>
        </details>
      </nav>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<GameGalleryPage />} />
          <Route path="/create" element={<GameDesignerPage />} />
          <Route path="/games/:gameId" element={<GameDetailsPage />} />
          <Route path="/games/:gameId/decks" element={<SavedDecksPage />} />
          <Route path="/decks/:deckId/edit" element={<DeckBuilderPage />} />
          <Route path="/rooms/:roomId" element={<RoomPage />} />
          <Route path="*" element={null} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
