import { PolaroidPreset } from '../types';

type PresetButtonProps = {
  preset: PolaroidPreset;
  active: boolean;
  onClick: () => void;
  darkMode?: boolean;
  previewSrc?: string;
};

export function PresetButton({
  preset,
  active,
  onClick,
  darkMode = false,
  previewSrc,
}: PresetButtonProps) {
  return (
    <button
      className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition duration-200 ${
        active
          ? 'border-accent bg-accent text-white shadow-lg shadow-orange-100'
          : darkMode
            ? 'border-stone-700 bg-stone-900/65 text-stone-100 hover:border-stone-500 hover:bg-stone-900'
            : 'border-stone-200 bg-white/80 text-stone-700 hover:border-stone-300 hover:bg-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {previewSrc ? (
        <span
          className={`flex h-20 w-16 shrink-0 items-center justify-center rounded-[10px] p-1 shadow-[0_12px_24px_rgba(28,20,12,0.18)] ${
            active
              ? 'bg-white/95'
              : darkMode
                ? 'bg-stone-100'
                : 'bg-white'
          }`}
        >
          <img
            className="h-full w-full object-contain"
            src={previewSrc}
            alt=""
          />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{preset.name}</span>
        <span
          className={`mt-1 block text-xs ${
            active ? 'text-white/80' : darkMode ? 'text-stone-400' : 'text-stone-500'
          }`}
        >
          {preset.description}
        </span>
      </span>
    </button>
  );
}
