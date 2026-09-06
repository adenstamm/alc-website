import {
  getCurrentAlbumRatingError,
  normalizeCurrentAlbumRating,
  validateCurrentAlbumRating,
} from "../lib/currentAlbumRating";
import { useEffect, useState } from "react";

export default function useAlbumRating({
  accountStatus,
  poll,
  supabase,
  userId,
}) {
  const [storedCurrentAlbumRating, setStoredCurrentAlbumRating] =
    useState(null);

  const [currentAlbumRating, setCurrentAlbumRating] = useState("");

  const [currentAlbumRatingError, setCurrentAlbumRatingError] = useState(null);

  const [isLoadingCurrentAlbumRating, setIsLoadingCurrentAlbumRating] =
    useState(false);

  const [isSubmittingCurrentAlbumRating, setIsSubmittingCurrentAlbumRating] =
    useState(false);

  useEffect(() => {
    if (
      !supabase ||
      !userId ||
      accountStatus !== "approved" ||
      poll.phase !== "nominations"
    ) {
      setStoredCurrentAlbumRating(null);
      setCurrentAlbumRating("");
      setCurrentAlbumRatingError(null);
      setIsLoadingCurrentAlbumRating(false);
      return undefined;
    }

    let isMounted = true;

    async function loadCurrentAlbumRating() {
      setIsLoadingCurrentAlbumRating(true);
      setCurrentAlbumRatingError(null);

      const { data, error } = await supabase
        .from("album_ratings")
        .select("poll_id, rating, created_at")
        .eq("poll_id", poll.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (error) {
        setStoredCurrentAlbumRating(null);
        setCurrentAlbumRatingError(
          "Your saved album rating could not be checked. You can retry by reloading this page.",
        );
      } else {
        setStoredCurrentAlbumRating(normalizeCurrentAlbumRating(data, userId));
      }

      setIsLoadingCurrentAlbumRating(false);
    }

    loadCurrentAlbumRating();

    return () => {
      isMounted = false;
    };
  }, [accountStatus, poll.id, poll.phase, supabase, userId]);

  async function handleCurrentAlbumRatingSubmit(event) {
    event.preventDefault();
    setCurrentAlbumRatingError(null);

    const validation = validateCurrentAlbumRating(currentAlbumRating);

    if (!validation.isValid) {
      setCurrentAlbumRatingError(validation.message);
      return;
    }

    if (
      !window.confirm(
        `Submit ${validation.rating}/10 for ${poll.albumOfWeek?.title || "the current album"}? Your rating cannot be changed.`,
      )
    ) {
      return;
    }

    setIsSubmittingCurrentAlbumRating(true);
    const { data, error } = await supabase.rpc("submit_current_album_rating", {
      target_poll_id: poll.id,
      rating_input: validation.rating,
    });
    setIsSubmittingCurrentAlbumRating(false);

    if (error) {
      setCurrentAlbumRatingError(getCurrentAlbumRatingError(error));
      return;
    }

    const savedRating = normalizeCurrentAlbumRating(data, userId);

    if (!savedRating) {
      setCurrentAlbumRatingError(
        "Your rating was saved, but its confirmation could not be loaded. Reload this page to check it.",
      );
      return;
    }

    setStoredCurrentAlbumRating(savedRating);
  }
  return {
    storedCurrentAlbumRating,
    currentAlbumRating,
    setCurrentAlbumRating,
    currentAlbumRatingError,
    setCurrentAlbumRatingError,
    isLoadingCurrentAlbumRating,
    isSubmittingCurrentAlbumRating,
    handleCurrentAlbumRatingSubmit,
  };
}
