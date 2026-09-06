import {
  RECORD_SHELF_BUCKET,
  getRecentShelfAlbums,
  loadRecordShelfAlbums,
  loadRecordShelfCoverOverrides,
  saveRecordShelfAlbums,
} from "../lib/recordShelf";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function useRecordShelfEditor({
  canManage,
  hasSupabaseConfig,
  session,
  setError,
  setMessage,
  showConfirmation,
  showFailure,
  supabase,
}) {
  const [isShelfCurating, setIsShelfCurating] = useState(false);

  const [selectedShelfAlbumId, setSelectedShelfAlbumId] = useState("");

  const [shelfArtistDrafts, setShelfArtistDrafts] = useState({});

  const [shelfCoverFile, setShelfCoverFile] = useState(null);

  const [shelfCoverOverrides, setShelfCoverOverrides] = useState({});

  const [isLoadingShelfCovers, setIsLoadingShelfCovers] = useState(false);

  const [isSavingShelfCover, setIsSavingShelfCover] = useState(false);

  const fallbackShelfAlbums = useMemo(() => getRecentShelfAlbums(), []);

  const [shelfAlbums, setShelfAlbums] = useState(fallbackShelfAlbums);

  const shelfCoverInputRef = useRef(null);

  const selectedShelfAlbum =
    shelfAlbums.find((album) => album.id === selectedShelfAlbumId) ||
    shelfAlbums[0];

  const loadShelfCovers = useCallback(async () => {
    if (!canManage) {
      return;
    }

    setIsLoadingShelfCovers(true);
    const overrides = await loadRecordShelfCoverOverrides(
      supabase,
      hasSupabaseConfig,
      shelfAlbums.map((album) => album.id),
    );
    setShelfCoverOverrides(overrides);
    setShelfArtistDrafts(
      Object.fromEntries(
        shelfAlbums.map((album) => [
          album.id,
          overrides[album.id]?.artist_override || "",
        ]),
      ),
    );
    setIsLoadingShelfCovers(false);
  }, [canManage, hasSupabaseConfig, shelfAlbums, supabase]);

  useEffect(() => {
    let isMounted = true;

    loadRecordShelfAlbums(
      supabase,
      hasSupabaseConfig,
      fallbackShelfAlbums,
    ).then((albums) => {
      if (isMounted) {
        setShelfAlbums(albums);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [fallbackShelfAlbums, hasSupabaseConfig, supabase]);

  useEffect(() => {
    if (!selectedShelfAlbumId && shelfAlbums.length) {
      setSelectedShelfAlbumId(shelfAlbums[0].id);
    }
  }, [selectedShelfAlbumId, shelfAlbums]);

  useEffect(() => {
    loadShelfCovers();
  }, [loadShelfCovers]);

  function handleShelfCoverFileChange(event) {
    setShelfCoverFile(event.target.files?.[0] || null);
  }

  function moveShelfAlbum(albumId, direction) {
    setShelfAlbums((currentAlbums) => {
      const currentIndex = currentAlbums.findIndex(
        (album) => album.id === albumId,
      );
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= currentAlbums.length
      ) {
        return currentAlbums;
      }

      const nextAlbums = [...currentAlbums];
      const [movedAlbum] = nextAlbums.splice(currentIndex, 1);
      nextAlbums.splice(nextIndex, 0, movedAlbum);
      return nextAlbums;
    });
  }

  async function saveShelfOrder() {
    setIsSavingShelfCover(true);
    setError(null);

    try {
      await saveRecordShelfAlbums(supabase, shelfAlbums);
      setIsShelfCurating(false);
      showConfirmation("Record shelf order saved.", "shelf-order");
    } catch (saveError) {
      const saveErrorMessage =
        saveError.message || "The shelf order could not be saved.";
      setError(saveErrorMessage);
      showFailure(saveErrorMessage);
    } finally {
      setIsSavingShelfCover(false);
    }
  }

  async function cancelShelfCuration() {
    const savedAlbums = await loadRecordShelfAlbums(
      supabase,
      hasSupabaseConfig,
      fallbackShelfAlbums,
    );
    setShelfAlbums(savedAlbums);
    setIsShelfCurating(false);
  }

  function handleShelfArtistChange(albumId, artistName) {
    setShelfArtistDrafts((currentDrafts) => ({
      ...currentDrafts,
      [albumId]: artistName,
    }));
  }

  async function handleShelfArtistSave(album) {
    setError(null);
    setMessage(null);
    setIsSavingShelfCover(true);

    const currentOverride = shelfCoverOverrides[album.id];
    const artistOverride = (shelfArtistDrafts[album.id] || "").trim();
    const nextOverride = {
      album_id: album.id,
      album_title: album.title,
      artist_override: artistOverride || null,
      cover_url: currentOverride?.cover_url || null,
      storage_path: currentOverride?.storage_path || null,
      updated_by: session?.user?.id || null,
    };

    const { error: saveError } = await supabase
      .from("record_shelf_covers")
      .upsert(nextOverride, { onConflict: "album_id" });

    setIsSavingShelfCover(false);

    if (saveError) {
      setError(saveError.message);
      showFailure(saveError.message);
      return;
    }

    setShelfCoverOverrides((currentOverrides) => ({
      ...currentOverrides,
      [album.id]: nextOverride,
    }));
    const successMessage = `${album.title} artist updated.`;
    setMessage(successMessage);
    showConfirmation(successMessage, `shelf-artist-${album.id}`);
  }

  async function handleShelfCoverUpload(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!selectedShelfAlbum || !shelfCoverFile) {
      setError("Choose an album and an image before uploading.");
      return;
    }

    if (!shelfCoverFile.type.startsWith("image/")) {
      setError("Upload an image file for the shelf cover.");
      return;
    }

    setIsSavingShelfCover(true);

    const extension =
      shelfCoverFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `${selectedShelfAlbum.id}/${shelfCoverFile.lastModified}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(RECORD_SHELF_BUCKET)
      .upload(storagePath, shelfCoverFile, {
        cacheControl: "3600",
        contentType: shelfCoverFile.type,
        upsert: true,
      });

    if (uploadError) {
      setIsSavingShelfCover(false);
      setError(uploadError.message);
      showFailure(uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from(RECORD_SHELF_BUCKET)
      .getPublicUrl(storagePath);

    const nextCover = {
      album_id: selectedShelfAlbum.id,
      album_title: selectedShelfAlbum.title,
      artist_override: shelfArtistDrafts[selectedShelfAlbum.id]?.trim() || null,
      cover_url: publicUrlData.publicUrl,
      storage_path: storagePath,
      updated_by: session?.user?.id || null,
    };
    const { error: saveError } = await supabase
      .from("record_shelf_covers")
      .upsert(nextCover, { onConflict: "album_id" });

    setIsSavingShelfCover(false);

    if (saveError) {
      setError(saveError.message);
      showFailure(saveError.message);
      return;
    }

    setShelfCoverFile(null);
    if (shelfCoverInputRef.current) {
      shelfCoverInputRef.current.value = "";
    }
    setShelfCoverOverrides((currentOverrides) => ({
      ...currentOverrides,
      [selectedShelfAlbum.id]: nextCover,
    }));
    const successMessage = `${selectedShelfAlbum.title} shelf cover updated.`;
    setMessage(successMessage);
    showConfirmation(successMessage, "shelf-cover");
  }

  async function handleShelfCoverClear(album) {
    setError(null);
    setMessage(null);
    setIsSavingShelfCover(true);

    const currentOverride = shelfCoverOverrides[album.id];

    const { error: deleteError } = await supabase
      .from("record_shelf_covers")
      .delete()
      .eq("album_id", album.id);

    if (!deleteError && currentOverride?.storage_path) {
      await supabase.storage
        .from(RECORD_SHELF_BUCKET)
        .remove([currentOverride.storage_path]);
    }

    setIsSavingShelfCover(false);

    if (deleteError) {
      setError(deleteError.message);
      showFailure(deleteError.message);
      return;
    }

    setShelfCoverOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[album.id];
      return nextOverrides;
    });
    const successMessage = `${album.title} will use the automatic cover again.`;
    setMessage(successMessage);
    showConfirmation(successMessage, `shelf-clear-${album.id}`);
  }
  return {
    isShelfCurating,
    setIsShelfCurating,
    selectedShelfAlbumId,
    setSelectedShelfAlbumId,
    shelfArtistDrafts,
    shelfCoverFile,
    shelfCoverOverrides,
    isLoadingShelfCovers,
    isSavingShelfCover,
    shelfAlbums,
    shelfCoverInputRef,
    handleShelfCoverFileChange,
    moveShelfAlbum,
    saveShelfOrder,
    cancelShelfCuration,
    handleShelfArtistChange,
    handleShelfArtistSave,
    handleShelfCoverUpload,
    handleShelfCoverClear,
  };
}
