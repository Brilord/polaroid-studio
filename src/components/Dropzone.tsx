import { DragEvent, useRef } from 'react';

type DropzoneProps = {
  onSelectFiles: (files: FileList | null) => void;
  onOpenNativeDialog: () => void;
  darkMode?: boolean;
};

export function Dropzone({
  onSelectFiles,
  onOpenNativeDialog,
  darkMode = false,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onSelectFiles(event.dataTransfer.files);
  };

  return (
    <div
      className={`group rounded-[28px] border-2 border-dashed p-6 text-center transition ${
        darkMode
          ? 'border-stone-600 bg-stone-900/60 hover:border-accent hover:bg-stone-900/80'
          : 'border-stone-300 bg-white/70 hover:border-accent hover:bg-white'
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accentSoft text-2xl text-accent transition group-hover:scale-105">
        +
      </div>
      <h3 className={`mt-4 text-lg font-semibold ${darkMode ? 'text-white' : 'text-ink'}`}>
        Drag in an image
      </h3>
      <p className={`mt-1 text-sm ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
        PNG, JPG, JPEG, and WEBP files are supported.
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button
          className={`rounded-full px-4 py-2 text-sm font-medium text-white transition ${
            darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
          }`}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          Choose File
        </button>
        <button
          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
            darkMode
              ? 'border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800'
              : 'border-stone-300 text-stone-700 hover:border-stone-400 hover:bg-stone-50'
          }`}
          onClick={onOpenNativeDialog}
          type="button"
        >
          Native Picker
        </button>
      </div>

      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={(event) => onSelectFiles(event.target.files)}
      />
    </div>
  );
}
