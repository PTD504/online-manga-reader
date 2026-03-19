import { ChangeEvent, DragEvent, RefObject, useState } from "react";

type ControlPanelProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  hasImage: boolean;
  imageName: string | null;
  isLoading: boolean;
  targetLanguage: string;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDropFile: (file: File | null) => void;
  onChooseAnother: () => void;
  onLanguageChange: (lang: string) => void;
  onTranslate: () => Promise<void>;
};

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-white"
      aria-hidden="true"
    />
  );
}

export default function ControlPanel({
  fileInputRef,
  hasImage,
  imageName,
  isLoading,
  targetLanguage,
  onInputChange,
  onDropFile,
  onChooseAnother,
  onLanguageChange,
  onTranslate,
}: ControlPanelProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    onDropFile(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <aside className="rounded-xl border border-indigo-100 bg-white p-5 shadow-lg sm:p-6">
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Control Panel</h2>
          <p className="mt-1 text-sm text-neutral-600">Upload an image and run text detection before translation.</p>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={
            "w-full rounded-xl border-2 border-dashed px-4 py-8 text-left transition-all " +
            (isDragging
              ? "border-indigo-500 bg-indigo-50"
              : "border-neutral-300 bg-neutral-50 hover:border-indigo-400 hover:bg-indigo-50/60")
          }
        >
          <p className="text-sm font-semibold text-indigo-700">Upload Image</p>
          <p className="mt-2 text-sm text-neutral-700">Drag and drop or click to browse files</p>
          <p className="mt-1 text-xs text-neutral-500">Supported: JPG, PNG, WEBP</p>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onInputChange}
          className="hidden"
        />

        {hasImage ? (
          <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
            <p className="truncate pr-3 text-xs text-neutral-700">Selected: {imageName ?? "Image"}</p>
            <button
              type="button"
              onClick={onChooseAnother}
              className="shrink-0 text-xs font-medium text-indigo-700 hover:text-indigo-600"
            >
              Choose another
            </button>
          </div>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="target-language" className="text-sm font-medium text-neutral-800">
            Target Language
          </label>
          <select
            id="target-language"
            value={targetLanguage}
            onChange={(event) => onLanguageChange(event.target.value)}
            className="h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="Vietnamese">Vietnamese</option>
            <option value="English">English</option>
            <option value="Japanese">Japanese</option>
            <option value="Korean">Korean</option>
            <option value="Chinese">Chinese</option>
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Thai">Thai</option>
            <option value="Indonesian">Indonesian</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onTranslate}
          disabled={!hasImage || isLoading}
          className="relative inline-flex h-11 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          <span className={isLoading ? "opacity-0" : "opacity-100"}>Translate Page</span>
          {isLoading ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner />
            </span>
          ) : null}
        </button>
      </div>
    </aside>
  );
}
