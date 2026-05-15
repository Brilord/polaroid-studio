type SliderControlProps = {
  label: string;
  description?: string;
  tooltip?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
  darkMode?: boolean;
};

export function SliderControl({
  label,
  description,
  tooltip,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = '',
  darkMode = false,
}: SliderControlProps) {
  return (
    <label className="space-y-2" title={tooltip ?? description}>
      <div
        className={`flex items-center justify-between text-sm ${
          darkMode ? 'text-stone-200' : 'text-stone-700'
        }`}
      >
        <span>{label}</span>
        <span
          className={`font-medium ${
            darkMode ? 'text-stone-400' : 'text-stone-500'
          }`}
        >
          {value}
          {suffix}
        </span>
      </div>
      <input
        className={`h-2 w-full cursor-pointer appearance-none rounded-full accent-accent ${
          darkMode ? 'bg-stone-700' : 'bg-stone-200'
        }`}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        title={tooltip ?? description ?? label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {description ? (
        <p className={`text-xs ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
          {description}
        </p>
      ) : null}
    </label>
  );
}
