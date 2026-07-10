import { useEffect, useState } from "react";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { useAuthSession } from "@/hooks/useAuthSession";
import Login from "@/Login";
import Signup from "@/Signup";
import type { ThemeMode } from "@/types";
import "./App.css";

const THEME_STORAGE_KEY = "messenger-theme";

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);
  const {
    authView,
    user,
    checkingAuth,
    setAuthView,
    handleAuthSuccess,
    handleUserUpdated,
    handleSignOut,
    handleSessionExpired,
  } = useAuthSession();

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const handleToggleTheme = () => {
    setThemeMode((currentTheme) =>
      currentTheme === "dark" ? "light" : "dark",
    );
  };

  if (checkingAuth) {
    return (
      <main className="chat-shell">
        <section className="chat-card">
          <p className="status-copy">Checking your session...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return authView === "login" ? (
      <Login
        onSuccess={handleAuthSuccess}
        onGoToSignup={() => setAuthView("signup")}
      />
    ) : (
      <Signup
        onSuccess={handleAuthSuccess}
        onGoToLogin={() => setAuthView("login")}
      />
    );
  }

  return (
    <ChatScreen
      user={user}
      themeMode={themeMode}
      onToggleTheme={handleToggleTheme}
      onSignOut={handleSignOut}
      onSessionExpired={handleSessionExpired}
      onUserUpdated={handleUserUpdated}
    />
  );
}
