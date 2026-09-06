import { useEffect, useState } from "react";
import { fetchAlbumMetadata } from "../lib/recordShelf";

// Manual artwork is available immediately; automatic lookup must not delay it.
export default function useShelfMetadata(albums, overrides) {
  const [automatic, setAutomatic] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const entries = await Promise.all(
        albums.map(async (album) => {
          try {
            return [
              album.id,
              await fetchAlbumMetadata(
                album.title,
                controller.signal,
                overrides[album.id]?.artist_override || album.artist,
              ),
            ];
          } catch {
            return [album.id, null];
          }
        }),
      );
      if (!controller.signal.aborted) setAutomatic(Object.fromEntries(entries));
    }
    load();
    return () => controller.abort();
  }, [albums, overrides]);

  return Object.fromEntries(
    albums.map((album) => {
      const override = overrides[album.id];
      return [
        album.id,
        {
          artist:
            override?.artist_override ||
            automatic[album.id]?.artist ||
            album.artist,
          coverUrl:
            override?.cover_url || automatic[album.id]?.coverUrl || null,
          fallbackCoverUrl: automatic[album.id]?.coverUrl || null,
        },
      ];
    }),
  );
}
