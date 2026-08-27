export function validateCurrentAlbumRating(value) {
  if (value === "" || value === null || value === undefined) {
    return {
      isValid: false,
      message: "Choose a rating from 1 to 10.",
    };
  }

  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    return {
      isValid: false,
      message: "Choose a whole-number rating from 1 to 10.",
    };
  }

  return { isValid: true, rating };
}

export function normalizeCurrentAlbumRating(record, userId) {
  if (!record || !userId) {
    return null;
  }

  const validation = validateCurrentAlbumRating(record.rating);

  if (!validation.isValid) {
    return null;
  }

  return {
    pollId: record.poll_id,
    rating: validation.rating,
    submittedAt: record.created_at,
    userId,
  };
}

export function getCurrentAlbumRatingError(error) {
  const message = error?.message || "";

  if (message.includes("ALREADY_RATED") || message.includes("album_ratings_pkey")) {
    return "Your account already rated this album.";
  }

  if (message.includes("RATING_OUT_OF_RANGE")) {
    return "Choose a whole-number rating from 1 to 10.";
  }

  if (message.includes("PHASE_CLOSED")) {
    return "Album rating closed when nominations ended.";
  }

  return message || "Your album rating could not be saved. Try again.";
}

export function formatAverageRating(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const rating = Number(value);
  return Number.isFinite(rating) ? rating.toFixed(1) : null;
}
