import { ChatScreen } from "@/components/chat/ChatScreen";
import { useAuthSession } from "@/hooks/useAuthSession";
import Login from "@/Login";
import Signup from "@/Signup";
import "./App.css";

export default function App() {
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
      onSignOut={handleSignOut}
      onSessionExpired={handleSessionExpired}
      onUserUpdated={handleUserUpdated}
    />
  );
}
