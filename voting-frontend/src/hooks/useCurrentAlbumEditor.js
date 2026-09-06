import { RECORD_SHELF_BUCKET } from "../lib/recordShelf";
import {
  saveCurrentAlbumWithCover,
  validateAlbumCoverFile,
} from "../lib/albumCoverUpload";
import { useEffect, useRef, useState } from "react";

export default function useCurrentAlbumEditor({
  poll,
  refreshPoll,
  setIsSavingContent,
  showConfirmation,
  showFailure,
  supabase,
}) {
  const [currentAlbumForm, setCurrentAlbumForm] = useState({
    title: poll.albumOfWeek.title || "",
    artist: poll.albumOfWeek.artist || "",
    note: poll.albumOfWeek.note || "Current club listen",
    coverUrl: poll.albumOfWeek.coverUrl || "",
  });

  const [currentAlbumCoverFile, setCurrentAlbumCoverFile] = useState(null);

  const [currentAlbumCoverPreviewUrl, setCurrentAlbumCoverPreviewUrl] =
    useState("");

  const [currentAlbumError, setCurrentAlbumError] = useState(null);

  const [currentAlbumMessage, setCurrentAlbumMessage] = useState(null);

  const currentAlbumCoverInputRef = useRef(null);

  useEffect(() => {
    setCurrentAlbumForm({
      title: poll.albumOfWeek.title || "",
      artist: poll.albumOfWeek.artist || "",
      note: poll.albumOfWeek.note || "Current club listen",
      coverUrl: poll.albumOfWeek.coverUrl || "",
    });
  }, [poll.albumOfWeek]);

  useEffect(() => {
    if (!currentAlbumCoverFile) {
      setCurrentAlbumCoverPreviewUrl("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(currentAlbumCoverFile);
    setCurrentAlbumCoverPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [currentAlbumCoverFile]);

  function handleCurrentAlbumChange(event) {
    const { name, value } = event.target;

    setCurrentAlbumForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  function handleCurrentAlbumCoverChange(event) {
    const file = event.target.files?.[0] || null;
    const validationError = file ? validateAlbumCoverFile(file) : null;

    setCurrentAlbumError(validationError);
    setCurrentAlbumMessage(null);

    if (validationError) {
      event.target.value = "";
      setCurrentAlbumCoverFile(null);
      return;
    }

    setCurrentAlbumCoverFile(file);
  }

  function handleCurrentAlbumCoverClear() {
    if (currentAlbumCoverInputRef.current) {
      currentAlbumCoverInputRef.current.value = "";
    }

    setCurrentAlbumCoverFile(null);
    setCurrentAlbumForm((currentForm) => ({
      ...currentForm,
      coverUrl: "",
    }));
    setCurrentAlbumError(null);
    setCurrentAlbumMessage(null);
  }

  async function handleCurrentAlbumSave(event) {
    event.preventDefault();
    setCurrentAlbumError(null);
    setCurrentAlbumMessage(null);

    if (!currentAlbumForm.title.trim() || !currentAlbumForm.artist.trim()) {
      setCurrentAlbumError(
        "Add a current album title and artist before saving.",
      );
      return;
    }

    const validationError = currentAlbumCoverFile
      ? validateAlbumCoverFile(currentAlbumCoverFile)
      : null;

    if (validationError) {
      setCurrentAlbumError(validationError);
      return;
    }

    setIsSavingContent(true);

    try {
      const { coverUrl: nextCoverUrl, uploaded } =
        await saveCurrentAlbumWithCover({
          album: currentAlbumForm,
          bucket: RECORD_SHELF_BUCKET,
          coverFile: currentAlbumCoverFile,
          currentCoverUrl: currentAlbumForm.coverUrl,
          pollId: poll.id,
          supabase,
        });

      setCurrentAlbumForm((currentForm) => ({
        ...currentForm,
        coverUrl: nextCoverUrl || "",
      }));
      setCurrentAlbumCoverFile(null);
      if (currentAlbumCoverInputRef.current) {
        currentAlbumCoverInputRef.current.value = "";
      }
      setCurrentAlbumMessage(
        uploaded
          ? "Current album and cover updated."
          : "Current album updated.",
      );
      showConfirmation(
        uploaded
          ? "Current album and cover updated."
          : "Current album updated.",
        "current-album",
      );
      try {
        await refreshPoll();
      } catch {
        setCurrentAlbumError(
          "The album was saved, but the page could not refresh. Reload to see the latest version.",
        );
      }
    } catch (saveError) {
      const saveErrorMessage =
        saveError.message ||
        "The current album could not be updated. Try again.";
      setCurrentAlbumError(saveErrorMessage);
      showFailure(saveErrorMessage);
    } finally {
      setIsSavingContent(false);
    }
  }
  return {
    currentAlbumForm,
    currentAlbumCoverFile,
    currentAlbumCoverPreviewUrl,
    currentAlbumError,
    currentAlbumMessage,
    currentAlbumCoverInputRef,
    handleCurrentAlbumChange,
    handleCurrentAlbumCoverChange,
    handleCurrentAlbumCoverClear,
    handleCurrentAlbumSave,
  };
}
