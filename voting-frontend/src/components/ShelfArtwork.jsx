import { useState } from "react";

export default function ShelfArtwork({
  coverUrl,
  fallbackCoverUrl,
  fallback = null,
  ...imageProps
}) {
  const [failedUrls, setFailedUrls] = useState([]);
  const source = [coverUrl, fallbackCoverUrl].find(
    (url) => url && !failedUrls.includes(url),
  );
  if (!source) return fallback;
  return (
    <img
      {...imageProps}
      src={source}
      onError={() => setFailedUrls((urls) => [...urls, source])}
    />
  );
}
