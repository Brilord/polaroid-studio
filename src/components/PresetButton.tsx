import { PolaroidPreset } from '../types';

type PresetButtonProps = {
  preset: PolaroidPreset;
  active: boolean;
  onClick: () => void;
  darkMode?: boolean;
};

export function PresetButton({
  preset,
  active,
  onClick,
  darkMode = false,
}: PresetButtonProps) {
  return (
    <button
      className={`rounded-2xl border px-4 py-3 text-left transition duration-200 ${
        active
          ? 'border-accent bg-accent text-white shadow-lg shadow-orange-100'
          : darkMode
            ? 'border-stone-700 bg-stone-900/65 text-stone-100 hover:border-stone-500 hover:bg-stone-900'
            : 'border-stone-200 bg-white/80 text-stone-700 hover:border-stone-300 hover:bg-white'
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="text-sm font-semibold">{preset.name}</div>
      <div
        className={`mt-1 text-xs ${
          active ? 'text-white/80' : darkMode ? 'text-stone-400' : 'text-stone-500'
        }`}
      >
        {preset.description}
      </div>
    </button>
  );
}
