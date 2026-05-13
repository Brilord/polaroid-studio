import { DragEvent, useRef } from 'react';

type DropzoneProps = {
  onSelectFiles: (files: FileList | null) => void;
  onOpenNativeDialog: () => void;
  darkMode?: boolean;
  copy?: {
    title: string;
    description: string;
    chooseFiles: string;
    changePhoto: string;
    nativePicker: string;
  };
  compact?: boolean;
};

export function Dropzone({
  onSelectFiles,
  onOpenNativeDialog,
  darkMode = false,
  compact = false,
  copy = {
    title: 'Choose photos',
    description:
      'PNG, JPG, JPEG, and WEBP files are supported. Multiple files can export as a batch.',
    chooseFiles: 'Choose Photo',
    changePhoto: 'Change Photo',
    nativePicker: 'Native Picker',
  },
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onSelectFiles(event.dataTransfer.files);
  };

  const input = (
    <input
      ref={inputRef}
      className="hidden"
      type="file"
      aria-label="Image files"
      accept="image/png,image/jpeg,image/jpg,image/webp"
      multiple
      onChange={(event) => onSelectFiles(event.target.files)}
    />
  );

  const fullDropzone = (
    <div
      className={`group rounded-[22px] border-2 border-dashed p-4 text-center transition sm:rounded-[28px] sm:p-6 ${
        darkMode
          ? 'border-stone-600 bg-stone-900/60 hover:border-accent hover:bg-stone-900/80'
          : 'border-stone-300 bg-white/70 hover:border-accent hover:bg-white'
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accentSoft text-2xl text-accent transition group-hover:scale-105 sm:h-14 sm:w-14">
        +
      </div>
      <h2 className={`mt-3 text-base font-semibold sm:mt-4 sm:text-lg ${darkMode ? 'text-white' : 'text-ink'}`}>
        {copy.title}
      </h2>
      <p className={`mt-1 text-sm ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
        {copy.description}
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-3 sm:mt-5">
        <button
          className={`rounded-full px-4 py-2 text-sm font-medium text-white transition ${
            darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
          }`}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {copy.chooseFiles}
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
          {copy.nativePicker}
        </button>
      </div>
    </div>
  );

  if (!compact) {
    return (
      <>
        {fullDropzone}
        {input}
      </>
    );
  }

  return (
    <>
      <div
        className={`flex items-center justify-between gap-3 rounded-[18px] border p-3 lg:hidden ${
          darkMode
            ? 'border-stone-800 bg-stone-900/72'
            : 'border-stone-200 bg-stone-50/70'
        }`}
      >
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>
            {copy.changePhoto}
          </div>
          <div className={`mt-1 truncate text-xs ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
            PNG, JPG, WEBP
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            className={`rounded-full px-4 py-2 text-sm font-medium text-white transition ${
              darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
            }`}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {copy.changePhoto}
          </button>
          <button
            aria-label={copy.nativePicker}
            className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
              darkMode
                ? 'border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800'
                : 'border-stone-300 text-stone-700 hover:border-stone-400 hover:bg-stone-50'
            }`}
            onClick={onOpenNativeDialog}
            type="button"
          >
            ...
          </button>
        </div>
      </div>
      <div className="hidden lg:block">{fullDropzone}</div>
      {input}
    </>
  );
}
