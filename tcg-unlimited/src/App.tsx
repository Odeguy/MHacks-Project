import "./App.css";

import { useEffect, useRef, useState } from "react";
import {
    BrowserRouter,
    Link,
    NavLink,
    Route,
    Routes,
    useLocation,
} from "react-router-dom";
import {
    AnimatePresence,
    MotionConfig,
    motion,
    useReducedMotion,
} from "motion/react";

import FlowBackground from "./components/FlowBackground";
import menuIcon from "./assets/menu.svg";
import { PreviewProvider, usePreview } from "./PreviewContext";
import { GameDataProvider, useGameData } from "./GameDataContext";
import {
    DeckBuilderPage,
    GameDesignerPage,
    GameDetailsPage,
    GameGalleryPage,
    NotFoundPage,
    RoomPage,
    SavedDecksPage,
    RoomsPage,
} from "./pages";
import { Icon, type IconName } from "./ui";

function Shell() {
    const location = useLocation();
    const reduced = useReducedMotion();
    const { nightMode, setNightMode } = usePreview();
    const { decks, ready, isActive, error } = useGameData();
    const [navOpen, setNavOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const navRef = useRef<HTMLElement>(null);

    const links: {
        href: string;
        name: string;
        icon: IconName;
        number: string;
        end?: boolean;
    }[] = [
        {
            href: "/",
            name: "Games",
            icon: "grid",
            number: "01",
            end: true,
        },
        { href: "/create", name: "Create game", icon: "spark", number: "02" },
        {
            href: "/decks",
            name: "Decks",
            icon: "cards",
            number: "03",
            end: true,
        },
        {
            href: decks.length ? `/decks/${decks[0].id}/edit` : "/decks",
            name: "Deck editor",
            icon: "settings",
            number: "04",
        },
        {
            href: "/rooms",
            name: "Table",
            icon: "field",
            number: "05",
        },
    ];

    useEffect(() => {
        window.scrollTo({ top: 0 });
        document.title = `TCG Unlimited / ${location.pathname === "/" ? "The collection" : location.pathname.startsWith("/create") ? "Design studio" : location.pathname.startsWith("/rooms") ? "The table" : location.pathname.endsWith("/edit") ? "Deck workshop" : location.pathname.includes("/decks") ? "Your decks" : "Explore"}`;
    }, [location.pathname]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setNavOpen(false);
                setProfileOpen(false);
            }

            const target = event.target as HTMLElement;
            if (
                event.key === "/" &&
                !target.closest("input, textarea, select, [contenteditable]")
            ) {
                const search = document.querySelector<HTMLInputElement>(
                    'input[aria-label^="Search"]',
                );
                if (search) {
                    event.preventDefault();
                    search.focus();
                }
            }
        };

        const onPointer = (event: PointerEvent) => {
            if (
                navRef.current &&
                !navRef.current.contains(event.target as Node)
            )
                setNavOpen(false);
        };

        window.addEventListener("keydown", onKey);
        window.addEventListener("pointerdown", onPointer);

        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("pointerdown", onPointer);
        };
    }, []);

    const float = reduced
        ? { y: 0, rotate: 0 }
        : { y: [0, -3, 1, 0], rotate: [0, 0.25, -0.15, 0] };

    return (
        <div className={`ui-theme ${nightMode ? "night-mode" : "day-mode"}`}>
            <a className="skip-link" href="#main-content">
                Skip to content
            </a>

            <FlowBackground />

            <div className="app-shell">
                <motion.header
                    className="app-header"
                    animate={float}
                    transition={{
                        duration: 12,
                        repeat: reduced ? 0 : Infinity,
                        ease: "easeInOut",
                    }}
                >
                    <div className="header-actions">
                        <span className="preview-badge">
                            <span className="ring-dot" />
                            {ready
                                ? "CONNECTED"
                                : isActive
                                  ? "LOADING"
                                  : "OFFLINE"}
                        </span>

                        <button
                            className="theme-toggle text-button"
                            aria-pressed={nightMode}
                            onClick={() => setNightMode(!nightMode)}
                        >
                            {nightMode ? "Light cards" : "Dark cards"}
                        </button>

                        <Link className="header-create" to="/create">
                            <Icon name="plus" size={15} />
                            <span>Create a game</span>
                        </Link>

                        <button
                            className="profile-button"
                            onClick={() => setProfileOpen(!profileOpen)}
                            aria-expanded={profileOpen}
                            aria-controls="profile-panel"
                            aria-label="Guest profile"
                        >
                            Y<span className="profile-dot" />
                        </button>

                        <AnimatePresence>
                            {profileOpen && (
                                <motion.div
                                    className="profile-panel panel"
                                    id="profile-panel"
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                >
                                    <span className="micro muted">
                                        YOUR SPACE
                                    </span>
                                    <h3>Guest session</h3>
                                    <p>
                                        {ready
                                            ? "Decks saved in SpacetimeDB."
                                            : "Database disconnected."}
                                    </p>

                                    <Link
                                        className="text-button"
                                        to="/decks"
                                        onClick={() => setProfileOpen(false)}
                                    >
                                        Visit your decks
                                        <Icon name="arrow" size={15} />
                                    </Link>

                                    <button
                                        className="text-button"
                                        onClick={() => setProfileOpen(false)}
                                    >
                                        Close
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.header>

                <motion.nav
                    ref={navRef}
                    className={`app-nav ${navOpen ? "nav-expanded" : ""}`}
                    aria-label="Main navigation"
                    animate={{ ...float, width: navOpen ? 234 : 60 }}
                    transition={{
                        width: { type: "spring", stiffness: 300, damping: 30 },
                        y: {
                            duration: 10,
                            repeat: reduced ? 0 : Infinity,
                            ease: "easeInOut",
                        },
                        rotate: {
                            duration: 10,
                            repeat: reduced ? 0 : Infinity,
                            ease: "easeInOut",
                        },
                    }}
                >
                    <button
                        className="app-nav-toggle"
                        aria-label={
                            navOpen
                                ? "Collapse navigation"
                                : "Expand navigation"
                        }
                        aria-expanded={navOpen}
                        aria-controls="app-nav-links"
                        onClick={() => setNavOpen(!navOpen)}
                    >
                        {navOpen ? (
                            <Icon name="close" size={22} />
                        ) : (
                            <img src={menuIcon} width={22} height={22} alt="" />
                        )}
                        <span className="nav-label">MENU</span>
                    </button>

                    <div className="nav-divider" />

                    <ul id="app-nav-links">
                        {links.map((link) => (
                            <li key={link.name}>
                                <NavLink
                                    end={link.end}
                                    to={link.href}
                                    className={({ isActive }) =>
                                        isActive
                                            ? "nav-link active"
                                            : "nav-link"
                                    }
                                    title={!navOpen ? link.name : undefined}
                                    onClick={() => setNavOpen(false)}
                                >
                                    <Icon name={link.icon} size={20} />
                                    <span className="nav-label">
                                        {link.name}
                                    </span>
                                    <span className="nav-number">
                                        {link.number}
                                    </span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </motion.nav>

                <main id="main-content" className="app-content">
                    {!ready && (
                        <p className="connection-status" role="status">
                            {error ||
                                (isActive
                                    ? "Loading games…"
                                    : "Database disconnected. Preview only; saving and multiplayer need a connection.")}
                        </p>
                    )}
                    {ready && error && (
                        <p className="connection-status" role="alert">
                            {error}
                        </p>
                    )}
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: reduced ? 0 : 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: reduced ? 0 : -5 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Routes location={location}>
                                <Route path="/" element={<GameGalleryPage />} />

                                <Route
                                    path="/create"
                                    element={<GameDesignerPage />}
                                />

                                <Route
                                    path="/games/:gameId"
                                    element={<GameDetailsPage />}
                                />

                                <Route
                                    path="/decks"
                                    element={<SavedDecksPage />}
                                />

                                <Route
                                    path="/games/:gameId/decks"
                                    element={<SavedDecksPage />}
                                />

                                <Route
                                    path="/decks/:deckId/edit"
                                    element={<DeckBuilderPage />}
                                />

                                <Route path="/rooms" element={<RoomsPage />} />

                                <Route
                                    path="/rooms/:roomId"
                                    element={<RoomPage />}
                                />

                                <Route path="*" element={<NotFoundPage />} />
                            </Routes>
                        </motion.div>
                    </AnimatePresence>
                </main>

                <footer className="app-footer">
                    <span className="footer-preview">
                        {ready ? "SpacetimeDB" : "Offline preview"}
                    </span>
                </footer>
            </div>
        </div>
    );
}

export default function App() {
    const [notice, setNotice] = useState("");
    const timer = useRef<ReturnType<typeof setTimeout>>();

    const notify = (message: string) => {
        setNotice(message);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setNotice(""), 4500);
    };

    useEffect(() => () => clearTimeout(timer.current), []);

    return (
        <MotionConfig reducedMotion="user">
            <BrowserRouter>
                <PreviewProvider notify={notify}>
                    <GameDataProvider>
                        <Shell />

                        <AnimatePresence>
                            {notice && (
                                <motion.div
                                    className="toast"
                                    role="status"
                                    style={{ x: "-50%" }}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 16 }}
                                >
                                    <Icon name="check" size={18} />
                                    <span>{notice}</span>
                                    <button
                                        className="icon-button"
                                        onClick={() => setNotice("")}
                                        aria-label="Dismiss message"
                                    >
                                        <Icon name="close" size={15} />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </GameDataProvider>
                </PreviewProvider>
            </BrowserRouter>
        </MotionConfig>
    );
}
