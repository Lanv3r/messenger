import { useEffect, useEffectEvent, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { UserProfile } from "@/types";

type UseContactsOptions = {
  onSessionExpired: () => void;
};

function sortContacts(contacts: UserProfile[]) {
  return [...contacts].sort((first, second) => {
    const firstName = `${first.first_name} ${first.last_name ?? ""}`.trim();
    const secondName = `${second.first_name} ${second.last_name ?? ""}`.trim();

    return firstName.localeCompare(secondName, undefined, {
      sensitivity: "base",
    });
  });
}

export function useContacts({ onSessionExpired }: UseContactsOptions) {
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const contactsVersionRef = useRef(0);

  async function refreshContacts() {
    const contactsVersion = contactsVersionRef.current;
    setLoading(true);
    setError(null);

    try {
      const loadedContacts = await apiFetch<UserProfile[]>("/users/me/contacts");
      if (contactsVersion !== contactsVersionRef.current) {
        return;
      }

      setContacts(sortContacts(loadedContacts));
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load contacts.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return;
      }

      if (contactsVersion === contactsVersionRef.current) {
        setError(message);
      }
    } finally {
      if (contactsVersion === contactsVersionRef.current) {
        setLoading(false);
      }
    }
  }

  const loadContactsFromEffect = useEffectEvent(refreshContacts);

  useEffect(() => {
    void loadContactsFromEffect();
  }, []);

  function isContact(userId: number) {
    return contacts.some((contact) => contact.id === userId);
  }

  async function toggleContact(userId: number) {
    if (savingUserId !== null) {
      return false;
    }

    const removingContact = isContact(userId);
    setSavingUserId(userId);
    setError(null);

    try {
      const contact = await apiFetch<UserProfile>(`/users/me/contacts/${userId}`, {
        method: removingContact ? "DELETE" : "PUT",
      });

      contactsVersionRef.current += 1;
      setContacts((current) => {
        if (removingContact) {
          return current.filter((entry) => entry.id !== userId);
        }

        return sortContacts([
          ...current.filter((entry) => entry.id !== contact.id),
          contact,
        ]);
      });
      return true;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update contacts.";

      if (message === "Could not validate credentials") {
        onSessionExpired();
        return false;
      }

      setError(message);
      return false;
    } finally {
      setSavingUserId(null);
    }
  }

  return {
    contacts,
    loading,
    error,
    savingUserId,
    isContact,
    toggleContact,
    refreshContacts,
  };
}
