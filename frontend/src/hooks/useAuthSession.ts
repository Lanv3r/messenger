import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { toAuthUser } from "@/lib/message-helpers";
import type { AuthResponse, AuthUser } from "@/types";

export function useAuthSession() {
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadCurrentUser() {
      try {
        const currentUser = await apiFetch<AuthResponse>("/users/me/");

        if (!ignore) {
          setUser(toAuthUser(currentUser));
        }
      } catch {
        if (!ignore) {
          setUser(null);
        }
      } finally {
        if (!ignore) {
          setCheckingAuth(false);
        }
      }
    }

    loadCurrentUser();

    return () => {
      ignore = true;
    };
  }, []);

  const handleAuthSuccess = (authUser: AuthResponse) => {
    setUser(toAuthUser(authUser));
  };

  const handleUserUpdated = (authUser: AuthResponse) => {
    setUser(toAuthUser(authUser));
  };

  const handleSignOut = async () => {
    try {
      await apiFetch<{ ok: boolean }>("/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error(error);
    }

    setUser(null);
    setAuthView("login");
  };

  const handleSessionExpired = () => {
    setUser(null);
    setAuthView("login");
  };

  return {
    authView,
    user,
    checkingAuth,
    setAuthView,
    handleAuthSuccess,
    handleUserUpdated,
    handleSignOut,
    handleSessionExpired,
  };
}
