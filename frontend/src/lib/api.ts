export const API_URL = "http://localhost:8000";

function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item || typeof item !== "object") {
          return String(item);
        }

        const error = item as { loc?: unknown; msg?: unknown };
        const field = Array.isArray(error.loc)
          ? error.loc.filter((part) => part !== "body").join(".")
          : null;
        const message =
          typeof error.msg === "string" ? error.msg : "Invalid value";

        return field ? `${field}: ${message}` : message;
      })
      .join("\n");
  }

  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }

  return "API request failed.";
}

export async function apiFetch<T>(path: string, options?: RequestInit) {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Cannot reach the backend at ${API_URL}. Make sure the FastAPI server is running.`,
      );
    }

    throw error;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const detail =
      data && typeof data === "object" && "detail" in data
        ? formatErrorDetail(data.detail)
        : `API request failed: ${response.status}`;

    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}
