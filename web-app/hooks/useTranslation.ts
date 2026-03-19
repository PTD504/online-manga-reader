import { useCallback, useState } from "react";
import type { Bubble } from "../app/overlayRenderer";
import { translatePageAPI } from "../lib/api/translate";

export function useTranslation() {
  const [isLoading, setIsLoading] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  const translate = useCallback(async (file: File, targetLanguage: string) => {
    setIsLoading(true);

    try {
      const results = await translatePageAPI(file, targetLanguage);
      setBubbles(results);
    } catch (error) {
      console.error("Translate request failed", error);
      setBubbles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isLoading, bubbles, setBubbles, translate };
}
