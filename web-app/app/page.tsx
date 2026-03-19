"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import ControlPanel from "./components/ControlPanel";
import Header from "./components/Header";
import ImageCanvasViewer from "./components/ImageCanvasViewer";
import { useTranslation } from "../hooks/useTranslation";

type SelectedImage = {
  file: File;
  name: string;
  url: string;
};

export default function Home() {
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("Vietnamese");
  const { isLoading, bubbles, setBubbles, translate } = useTranslation();

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (image?.url) {
        URL.revokeObjectURL(image.url);
      }
    };
  }, [image]);

  const applyFile = useCallback((file: File | null) => {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    setImage((previousImage) => {
      if (previousImage?.url) {
        URL.revokeObjectURL(previousImage.url);
      }

      return {
        file,
        name: file.name,
        url: URL.createObjectURL(file),
      };
    });
    setBubbles([]);
  }, []);

  const clearImage = useCallback(() => {
    setImage((previousImage) => {
      if (previousImage?.url) {
        URL.revokeObjectURL(previousImage.url);
      }
      return null;
    });

    setBubbles([]);
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files;
      if (!files || files.length === 0) {
        return;
      }

      const pastedImage = Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
      if (!pastedImage) {
        return;
      }

      event.preventDefault();
      applyFile(pastedImage);
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [applyFile]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    applyFile(file);

    // Reset value so selecting the same file again still triggers onChange.
    event.target.value = "";
  };

  const handleTranslateClick = async () => {
    if (!image?.file || isLoading) {
      return;
    }

    await translate(image.file, targetLanguage);
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Header
          title="Manga Translator"
          subtitle="Upload, Analyze, and Translate seamlessly"
        />

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ControlPanel
            fileInputRef={fileInputRef}
            hasImage={Boolean(image)}
            imageName={image?.name ?? null}
            isLoading={isLoading}
            targetLanguage={targetLanguage}
            onInputChange={handleInputChange}
            onDropFile={applyFile}
            onChooseAnother={clearImage}
            onLanguageChange={setTargetLanguage}
            onTranslate={handleTranslateClick}
          />

          <ImageCanvasViewer
            imageUrl={image?.url ?? null}
            imageName={image?.name ?? null}
            bubbles={bubbles}
            isLoading={isLoading}
          />
        </div>
      </section>
    </main>
  );
}
