export const API_URL = "http://localhost:8000";

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
        ? String(data.detail)
        : `API request failed: ${response.status}`;

    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}
