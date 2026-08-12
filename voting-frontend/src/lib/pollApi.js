export async function fetchCurrentPoll(session) {
  const headers = {
    Accept: "application/json",
  };

  if (session?.access_token) {
    headers["X-AlbumASU-Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch("/api/current-poll", {
    method: "GET",
    credentials: "same-origin",
    headers,
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Too many refreshes. Please wait a minute and try again."
        : "Could not load the current poll.",
    );
  }

  return response.json();
}
