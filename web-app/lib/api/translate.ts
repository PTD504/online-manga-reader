import type { Bubble } from "../../app/overlayRenderer";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function translatePageAPI(file: File, targetLanguage: string): Promise<Bubble[]> {
  const translateUrl = `${BASE_URL}/api/v1/translate-page?target_lang=${encodeURIComponent(targetLanguage)}`;

  // const arrayBuffer = await file.arrayBuffer();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(translateUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Translate request failed with status " + response.status);
  }

  const responseText = await response.text();

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error("Failed to parse API response JSON");
  }

  const extracted = Array.isArray(payload)
    ? payload
    : Object.values(payload as Record<string, unknown>).find(Array.isArray);

  if (!Array.isArray(extracted)) {
    throw new Error("Invalid translate response format");
  }

  return extracted as Bubble[];
}
