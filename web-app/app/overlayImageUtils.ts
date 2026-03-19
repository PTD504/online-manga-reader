import type { Bubble } from "./overlayRenderer";

export const toDataUri = (value: string) =>
  value.startsWith("data:") ? value : "data:image/png;base64," + value;

export const preloadImages = async (bubbles: Bubble[], cache: Map<string, HTMLImageElement>) => {
  const uniqueKeys = new Set<string>();

  for (const bubble of bubbles) {
    if (!bubble.clean_image) continue;
    uniqueKeys.add(toDataUri(bubble.clean_image));
  }

  await Promise.all(
    Array.from(uniqueKeys).map(
      (key) =>
        new Promise<void>((resolve) => {
          if (cache.has(key)) {
            resolve();
            return;
          }

          const img = new Image();
          img.onload = () => {
            cache.set(key, img);
            resolve();
          };
          img.onerror = () => {
            resolve();
          };
          img.src = key;
        })
    )
  );
};
