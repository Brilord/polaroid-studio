import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { PresetButton } from './components/PresetButton';
import { PreviewStage } from './components/PreviewStage';
import { SliderControl } from './components/SliderControl';
import logoImage from './assets/logo.png';
import { defaultSettings, presets } from './data/presets';
import { fileToImageAsset, loadImage } from './lib/image';
import { exportCanvasBlob } from './lib/polaroidRenderer';
import {
  ExportFormat,
  ExportSettings,
  ImageAsset,
  PolaroidPreset,
  PolaroidSettings,
} from './types';

type HistoryState = {
  past: PolaroidSettings[];
  future: PolaroidSettings[];
};

type ExportSizeOption = {
  id: string;
  label: string;
  settings: ExportSettings;
};

const exportSizeOptions: ExportSizeOption[] = [
  { id: 'social', label: 'Social', settings: { scale: 1.25, quality: 92 } },
  { id: 'print', label: 'Print', settings: { scale: 1.9, quality: 95 } },
  { id: 'large', label: 'Large', settings: { scale: 2.6, quality: 96 } },
];

const captionFonts = [
  { id: 'handwritten', label: 'Handwritten' },
  { id: 'typewriter', label: 'Typewriter' },
  { id: 'marker', label: 'Marker' },
  { id: 'clean', label: 'Clean' },
];

const greatestCommonDivisor = (a: number, b: number): number =>
  b === 0 ? a : greatestCommonDivisor(b, a % b);

function App() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [imageAsset, setImageAsset] = useState<ImageAsset | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [settings, setSettings] = useState<PolaroidSettings>(defaultSettings);
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  const [customPresets, setCustomPresets] = useState<PolaroidPreset[]>([]);
  const [recentImages, setRecentImages] = useState<ImageAsset[]>([]);
  const [exportSizeId, setExportSizeId] = useState('print');
  const [previewEffects, setPreviewEffects] = useState(true);
  const [activePresetId, setActivePresetId] = useState<string>('classic');
  const [darkMode, setDarkMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Import a photo to begin.');

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('polaroid-studio-theme');
    if (storedTheme === 'dark') {
      setDarkMode(true);
    }

    const storedSound = window.localStorage.getItem('polaroid-studio-sound');
    if (storedSound === 'off') {
      setSoundEnabled(false);
    }

    const storedPresets = window.localStorage.getItem(
      'polaroid-studio-custom-presets'
    );
    if (storedPresets) {
      try {
        setCustomPresets(JSON.parse(storedPresets) as PolaroidPreset[]);
      } catch {
        window.localStorage.removeItem('polaroid-studio-custom-presets');
      }
    }

    const storedRecent = window.localStorage.getItem('polaroid-studio-recent');
    if (storedRecent) {
      try {
        setRecentImages(JSON.parse(storedRecent) as ImageAsset[]);
      } catch {
        window.localStorage.removeItem('polaroid-studio-recent');
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      'polaroid-studio-theme',
      darkMode ? 'dark' : 'light'
    );
  }, [darkMode]);

  useEffect(() => {
    window.localStorage.setItem(
      'polaroid-studio-sound',
      soundEnabled ? 'on' : 'off'
    );
  }, [soundEnabled]);

  useEffect(() => {
    window.localStorage.setItem(
      'polaroid-studio-custom-presets',
      JSON.stringify(customPresets)
    );
  }, [customPresets]);

  useEffect(() => {
    window.localStorage.setItem(
      'polaroid-studio-recent',
      JSON.stringify(recentImages)
    );
  }, [recentImages]);

  useEffect(() => {
    if (!imageAsset) {
      setImageElement(null);
      return;
    }

    let cancelled = false;
    loadImage(imageAsset.dataUrl)
      .then((image) => {
        if (!cancelled) {
          setImageElement(image);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageAsset]);

  const hasImage = Boolean(imageAsset && imageElement);
  const shellClass = darkMode
    ? 'border-stone-800 bg-stone-950/72 text-stone-100 shadow-[0_20px_45px_rgba(0,0,0,0.32)]'
    : 'border-white/60 bg-white/60 text-ink shadow-panel';
  const surfaceClass = darkMode
    ? 'border-stone-800 bg-stone-900/72'
    : 'border-stone-200 bg-white/80';
  const mutedTextClass = darkMode ? 'text-stone-400' : 'text-stone-500';
  const bodyTextClass = darkMode ? 'text-stone-300' : 'text-stone-600';
  const fieldClass = darkMode
    ? 'border-stone-700 bg-stone-950 text-stone-100 placeholder:text-stone-500 focus:border-accent'
    : 'border-stone-200 bg-white text-stone-900 focus:border-accent';
  const exportSettings = useMemo(
    () =>
      exportSizeOptions.find((option) => option.id === exportSizeId)
        ?.settings ?? exportSizeOptions[1].settings,
    [exportSizeId]
  );
  const allPresets = useMemo(
    () => [...presets, ...customPresets],
    [customPresets]
  );

  const originalMeta = useMemo(() => {
    if (!imageElement) {
      return null;
    }

    return `${imageElement.naturalWidth} × ${imageElement.naturalHeight}`;
  }, [imageElement]);

  const cropRatioMeta = useMemo(() => {
    if (!imageElement) {
      return null;
    }

    const divisor = greatestCommonDivisor(
      imageElement.naturalWidth,
      imageElement.naturalHeight
    );
    const originalRatio = `${imageElement.naturalWidth / divisor}:${
      imageElement.naturalHeight / divisor
    }`;

    return {
      originalRatio,
      isSquare: imageElement.naturalWidth === imageElement.naturalHeight,
    };
  }, [imageElement]);

  const getAudioContext = useCallback(() => {
    if (!soundEnabled) {
      return null;
    }

    const AudioContextConstructor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextConstructor();
    }

    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, [soundEnabled]);

  const playSound = useCallback(
    (type: 'click' | 'shutter' | 'success') => {
      const context = getAudioContext();
      if (!context) {
        return;
      }

      const now = context.currentTime;
      const output = context.createGain();
      output.connect(context.destination);

      if (type === 'click') {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(620, now);
        oscillator.frequency.exponentialRampToValueAtTime(380, now + 0.06);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        oscillator.connect(gain).connect(output);
        oscillator.start(now);
        oscillator.stop(now + 0.09);
        return;
      }

      if (type === 'success') {
        [540, 780].forEach((frequency, index) => {
          const start = now + index * 0.07;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.045, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
          oscillator.connect(gain).connect(output);
          oscillator.start(start);
          oscillator.stop(start + 0.14);
        });
        return;
      }

      const length = Math.floor(context.sampleRate * 0.12);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const channel = buffer.getChannelData(0);

      for (let index = 0; index < length; index += 1) {
        const decay = 1 - index / length;
        channel[index] = (Math.random() * 2 - 1) * decay * decay;
      }

      const noise = context.createBufferSource();
      const noiseGain = context.createGain();
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(900, now);
      noise.buffer = buffer;
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.16, now + 0.008);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      noise.connect(filter).connect(noiseGain).connect(output);
      noise.start(now);
      noise.stop(now + 0.13);

      [140, 96].forEach((frequency, index) => {
        const start = now + index * 0.035;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.04, start + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
        oscillator.connect(gain).connect(output);
        oscillator.start(start);
        oscillator.stop(start + 0.06);
      });
    },
    [getAudioContext]
  );

  const commitSettings = useCallback(
    (
      updater:
        | PolaroidSettings
        | ((current: PolaroidSettings) => PolaroidSettings),
      presetId = 'custom'
    ) => {
      setSettings((current) => {
        const next =
          typeof updater === 'function' ? updater(current) : updater;

        if (JSON.stringify(next) === JSON.stringify(current)) {
          return current;
        }

        setHistory((currentHistory) => ({
          past: [...currentHistory.past.slice(-39), current],
          future: [],
        }));
        setActivePresetId(presetId);
        return next;
      });
    },
    []
  );

  const undoSettings = useCallback(() => {
    setHistory((currentHistory) => {
      const previous = currentHistory.past[currentHistory.past.length - 1];
      if (!previous) {
        return currentHistory;
      }

      setSettings(previous);
      setActivePresetId('custom');
      return {
        past: currentHistory.past.slice(0, -1),
        future: [settings, ...currentHistory.future].slice(0, 40),
      };
    });
  }, [settings]);

  const redoSettings = useCallback(() => {
    setHistory((currentHistory) => {
      const next = currentHistory.future[0];
      if (!next) {
        return currentHistory;
      }

      setSettings(next);
      setActivePresetId('custom');
      return {
        past: [...currentHistory.past, settings].slice(-40),
        future: currentHistory.future.slice(1),
      };
    });
  }, [settings]);

  const rememberImage = useCallback((asset: ImageAsset) => {
    setRecentImages((current) => [
      asset,
      ...current.filter((item) => item.dataUrl !== asset.dataUrl),
    ].slice(0, 4));
  }, []);

  const applyPreset = (presetId: string) => {
    const preset = allPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    commitSettings((current) => ({
      ...current,
      ...preset.settings,
    }), presetId);
    playSound('click');
  };

  const updateSetting = <K extends keyof PolaroidSettings>(
    key: K,
    value: PolaroidSettings[K]
  ) => {
    commitSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const previewCropDrag = useCallback((nextSettings: PolaroidSettings) => {
    setActivePresetId('custom');
    setSettings(nextSettings);
  }, []);

  const commitCropDrag = useCallback(
    (previous: PolaroidSettings, next: PolaroidSettings) => {
      const cropChanged =
        previous.cropX !== next.cropX || previous.cropY !== next.cropY;

      if (!cropChanged) {
        setSettings(previous);
        return;
      }

      setHistory((currentHistory) => ({
        past: [...currentHistory.past.slice(-39), previous],
        future: [],
      }));
      setSettings(next);
      setActivePresetId('custom');
    },
    []
  );

  const importFirstFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      return;
    }

    try {
      const asset = await fileToImageAsset(file);
      setImageAsset(asset);
      rememberImage(asset);
      setStatus(`Loaded ${file.name}`);
      playSound('shutter');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import file.');
    }
  };

  const openNativePicker = async () => {
    try {
      const result = await window.electronAPI?.openImage();
      if (!result) {
        return;
      }

      setImageAsset(result);
      rememberImage(result);
      setStatus(`Loaded ${result.name}`);
      setError(null);
      playSound('shutter');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not open the native file picker.'
      );
    }
  };

  const exportImage = async (format: ExportFormat) => {
    if (!imageElement) {
      return;
    }

    try {
      setBusy(true);
      setStatus(`Rendering ${format.toUpperCase()} export...`);
      const blob = await exportCanvasBlob(
        imageElement,
        settings,
        format,
        exportSettings
      );
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      const cleanName = (imageAsset?.name || 'polaroid')
        .replace(/\.[^.]+$/, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();

      const result = await window.electronAPI?.saveImage({
        suggestedName: `${cleanName || 'polaroid-studio'}-${Date.now()}.${format}`,
        format,
        data: bytes,
      });

      if (!result || result.canceled) {
        setStatus('Export canceled.');
      } else {
        setStatus(`Saved to ${result.filePath}`);
        playSound('success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
      setStatus('Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const saveCustomPreset = () => {
    const name = window.prompt('Name this preset');
    if (!name?.trim()) {
      return;
    }

    const id = `custom-${Date.now()}`;
    setCustomPresets((current) => [
      ...current,
      {
        id,
        name: name.trim(),
        description: 'Saved custom look.',
        settings,
      },
    ]);
    setActivePresetId(id);
    setStatus(`Saved preset ${name.trim()}.`);
    playSound('success');
  };

  const deleteCustomPreset = (presetId: string) => {
    setCustomPresets((current) => current.filter((preset) => preset.id !== presetId));
    if (activePresetId === presetId) {
      setActivePresetId('custom');
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'SELECT';

      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openNativePicker();
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void exportImage('png');
      }

      if (!isTyping && event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        redoSettings();
      } else if (!isTyping && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoSettings();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exportImage, openNativePicker, redoSettings, undoSettings]);

  return (
    <div
      className={`min-h-screen px-4 py-4 lg:px-6 ${
        darkMode
          ? 'bg-[radial-gradient(circle_at_top,_rgba(74,74,82,0.32),transparent_28%),linear-gradient(140deg,_#09090b_0%,_#11131a_45%,_#1b160f_100%)] text-stone-100'
          : 'bg-grain text-ink'
      }`}
    >
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1700px] grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(540px,1fr)_360px]">
        <aside className={`scrollbar-soft flex max-h-[calc(100vh-2rem)] flex-col gap-4 overflow-y-auto rounded-[32px] border p-5 backdrop-blur-xl ${shellClass}`}>
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-20 w-20 items-center justify-center rounded-[24px] p-2 ring-1 ${
                    darkMode
                      ? 'bg-stone-900/90 shadow-lg shadow-black/30 ring-stone-700'
                      : 'bg-white/80 shadow-lg shadow-orange-100/60 ring-white/70'
                  }`}
                >
                  <img
                    className="h-full w-full rounded-[18px] object-cover"
                    src={logoImage}
                    alt="Polaroid Studio logo"
                  />
                </div>
                <div>
                  <p className={`text-xs uppercase tracking-[0.3em] ${mutedTextClass}`}>
                    Polaroid Studio
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold">Create instant nostalgia.</h1>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    darkMode
                      ? 'border-stone-700 bg-stone-900 text-stone-100 hover:bg-stone-800'
                      : 'border-stone-300 bg-white/70 text-stone-700 hover:bg-white'
                  }`}
                  onClick={() => setDarkMode((current) => !current)}
                  type="button"
                >
                  {darkMode ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    soundEnabled
                      ? darkMode
                        ? 'border-accent bg-accent/15 text-orange-200 hover:bg-accent/20'
                        : 'border-accent bg-accentSoft text-accent hover:bg-orange-100'
                      : darkMode
                        ? 'border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800'
                        : 'border-stone-300 bg-white/70 text-stone-600 hover:bg-white'
                  }`}
                  onClick={() => {
                    if (soundEnabled) {
                      playSound('click');
                    }
                    setSoundEnabled((current) => !current);
                  }}
                  type="button"
                >
                  {soundEnabled ? 'Sound on' : 'Sound off'}
                </button>
              </div>
            </div>
            <p className={`mt-2 text-sm leading-6 ${bodyTextClass}`}>
              Import any photo, tune the analog finish, and export a high-resolution
              Polaroid frame with caption and shadow.
            </p>
          </div>

          <Dropzone
            onSelectFiles={importFirstFile}
            onOpenNativeDialog={openNativePicker}
            darkMode={darkMode}
          />

          {imageAsset ? (
            <div className={`rounded-[26px] border p-4 ${darkMode ? 'border-stone-800 bg-stone-900/72' : 'border-stone-200 bg-stone-50/70'}`}>
              <div className="flex items-center gap-4">
                <img
                  className="h-24 w-24 rounded-2xl object-cover shadow-md"
                  src={imageAsset.dataUrl}
                  alt="Original upload"
                />
                <div className="min-w-0">
                  <div className={`truncate text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>
                    {imageAsset.name}
                  </div>
                  <div className={`mt-1 text-xs ${mutedTextClass}`}>{originalMeta}</div>
                  {cropRatioMeta ? (
                    <div className={`mt-2 text-xs leading-5 ${cropRatioMeta.isSquare ? mutedTextClass : darkMode ? 'text-orange-200' : 'text-amber-700'}`}>
                      Original ratio {cropRatioMeta.originalRatio}; Polaroid crop is 1:1.
                    </div>
                  ) : null}
                  <div className={`mt-3 text-xs uppercase tracking-[0.24em] ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                    Original preview
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className={`space-y-5 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div>
              <h2 className={`text-sm font-semibold uppercase tracking-[0.24em] ${mutedTextClass}`}>
                Crop
              </h2>
              {cropRatioMeta ? (
                <p className={`mt-2 text-sm leading-6 ${cropRatioMeta.isSquare ? bodyTextClass : darkMode ? 'text-orange-200' : 'text-amber-700'}`}>
                  {cropRatioMeta.isSquare
                    ? 'This image already matches the 1:1 Polaroid crop.'
                    : `Your image is ${cropRatioMeta.originalRatio}; exports use a 1:1 square crop. Drag the preview to choose what stays in frame.`}
                </p>
              ) : null}
            </div>
            <SliderControl
              label="Zoom"
              value={settings.cropZoom}
              min={1}
              max={3}
              step={0.05}
              onChange={(value) => updateSetting('cropZoom', value)}
              suffix="x"
              darkMode={darkMode}
            />
            <SliderControl
              label="Horizontal"
              value={settings.cropX}
              min={-100}
              max={100}
              onChange={(value) => updateSetting('cropX', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label="Vertical"
              value={settings.cropY}
              min={-100}
              max={100}
              onChange={(value) => updateSetting('cropY', value)}
              darkMode={darkMode}
            />
          </div>

          <div className={`space-y-5 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div>
              <h2 className={`text-sm font-semibold uppercase tracking-[0.24em] ${mutedTextClass}`}>
                Tone & frame
              </h2>
            </div>
            <SliderControl
              label="Brightness"
              value={settings.brightness}
              min={70}
              max={140}
              onChange={(value) => updateSetting('brightness', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label="Contrast"
              value={settings.contrast}
              min={60}
              max={130}
              onChange={(value) => updateSetting('contrast', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label="Saturation"
              value={settings.saturation}
              min={40}
              max={140}
              onChange={(value) => updateSetting('saturation', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label="Warmth"
              value={settings.warmth}
              min={0}
              max={45}
              onChange={(value) => updateSetting('warmth', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label="Fade"
              value={settings.fade}
              min={0}
              max={45}
              onChange={(value) => updateSetting('fade', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label="Grain"
              value={settings.grain}
              min={0}
              max={30}
              onChange={(value) => updateSetting('grain', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label="Vignette"
              value={settings.vignette}
              min={0}
              max={35}
              onChange={(value) => updateSetting('vignette', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label="Top border"
              value={settings.borderTop}
              min={2}
              max={30}
              onChange={(value) => updateSetting('borderTop', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label="Side border"
              value={settings.borderSide}
              min={2}
              max={30}
              onChange={(value) => updateSetting('borderSide', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label="Bottom border"
              value={settings.borderBottom}
              min={8}
              max={50}
              onChange={(value) => updateSetting('borderBottom', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label="Shadow"
              value={settings.shadowIntensity}
              min={0}
              max={100}
              onChange={(value) => updateSetting('shadowIntensity', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label="Rotation"
              value={settings.rotation}
              min={-12}
              max={12}
              onChange={(value) => updateSetting('rotation', value)}
              suffix="°"
              darkMode={darkMode}
            />
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-2rem)] flex-col gap-4">
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[28px] border px-5 py-4 backdrop-blur-xl ${shellClass}`}>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  darkMode
                    ? 'border-stone-700 text-stone-200 hover:bg-stone-900'
                    : 'border-stone-300 text-stone-700 hover:bg-stone-50'
                }`}
                type="button"
                disabled={history.past.length === 0}
                onClick={undoSettings}
              >
                Undo
              </button>
              <button
                className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  darkMode
                    ? 'border-stone-700 text-stone-200 hover:bg-stone-900'
                    : 'border-stone-300 text-stone-700 hover:bg-stone-50'
                }`}
                type="button"
                disabled={history.future.length === 0}
                onClick={redoSettings}
              >
                Redo
              </button>
            </div>
            <button
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                previewEffects
                  ? darkMode
                    ? 'border-accent bg-accent/15 text-orange-200'
                    : 'border-accent bg-accentSoft text-accent'
                  : darkMode
                    ? 'border-stone-700 text-stone-200 hover:bg-stone-900'
                    : 'border-stone-300 text-stone-700 hover:bg-stone-50'
              }`}
              type="button"
              onClick={() => setPreviewEffects((current) => !current)}
            >
              {previewEffects ? 'Showing final' : 'Showing before'}
            </button>
          </div>
          <PreviewStage
            image={imageElement}
            settings={settings}
            ready={hasImage}
            error={error}
            applyEffects={previewEffects}
            onCropPreview={previewCropDrag}
            onCropCommit={commitCropDrag}
            darkMode={darkMode}
          />

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className={`rounded-[28px] border p-5 backdrop-blur-xl ${shellClass}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`text-xs uppercase tracking-[0.24em] ${mutedTextClass}`}>
                    Presets
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">Analog looks</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      darkMode
                        ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                        : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                    }`}
                    type="button"
                    onClick={saveCustomPreset}
                  >
                    Save preset
                  </button>
                  <button
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      darkMode
                        ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                        : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                    }`}
                    type="button"
                    onClick={() => {
                      commitSettings(defaultSettings, 'classic');
                      setStatus('Settings reset to default.');
                      playSound('click');
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {allPresets.map((preset) => (
                  <div key={preset.id} className="relative">
                    <PresetButton
                      preset={preset}
                      active={activePresetId === preset.id}
                      onClick={() => applyPreset(preset.id)}
                      darkMode={darkMode}
                    />
                    {preset.id.startsWith('custom-') ? (
                      <button
                        className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[11px] ${
                          darkMode
                            ? 'bg-stone-950/80 text-stone-300 hover:text-white'
                            : 'bg-white/80 text-stone-500 hover:text-stone-800'
                        }`}
                        type="button"
                        onClick={() => deleteCustomPreset(preset.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className={`rounded-[28px] border p-5 backdrop-blur-xl ${shellClass}`}>
              <p className={`text-xs uppercase tracking-[0.24em] ${mutedTextClass}`}>
                Caption & export
              </p>
              <div className="mt-3 space-y-4">
                <label className="block space-y-2">
                  <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>Caption text</span>
                  <textarea
                    className={`min-h-24 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`}
                    placeholder="Type a date, memory, or location..."
                    value={settings.captionText}
                    onChange={(event) =>
                      updateSetting('captionText', event.target.value)
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>Caption font</span>
                  <select
                    className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`}
                    value={settings.captionFont}
                    onChange={(event) =>
                      updateSetting('captionFont', event.target.value)
                    }
                  >
                    {captionFonts.map((font) => (
                      <option key={font.id} value={font.id}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </label>
                <SliderControl
                  label="Caption size"
                  value={settings.captionFontSize}
                  min={16}
                  max={42}
                  onChange={(value) => updateSetting('captionFontSize', value)}
                  suffix="px"
                  darkMode={darkMode}
                />
                <SliderControl
                  label="Softness"
                  value={settings.blur}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(value) => updateSetting('blur', value)}
                  suffix="px"
                  darkMode={darkMode}
                />
                <div className="space-y-2">
                  <div className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>Export size</div>
                  <div className="grid grid-cols-3 gap-2">
                    {exportSizeOptions.map((option) => (
                      <button
                        key={option.id}
                        className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                          exportSizeId === option.id
                            ? darkMode
                              ? 'border-accent bg-accent/15 text-orange-200'
                              : 'border-accent bg-accentSoft text-accent'
                            : darkMode
                              ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                              : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                        }`}
                        type="button"
                        onClick={() => setExportSizeId(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-stone-400 ${
                      darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
                    }`}
                    onClick={() => exportImage('png')}
                    disabled={!hasImage || busy}
                    type="button"
                  >
                    Export PNG
                  </button>
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      darkMode
                        ? 'border-stone-700 bg-stone-900 text-stone-100 hover:border-stone-500 hover:bg-stone-800'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                    onClick={() => exportImage('jpg')}
                    disabled={!hasImage || busy}
                    type="button"
                  >
                    Export JPG
                  </button>
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                  {busy ? 'Working...' : status}
                </div>
                {error ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-rose-400/30 bg-rose-950/50 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-600'}`}>
                    {error}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </main>

        <aside className={`scrollbar-soft flex max-h-[calc(100vh-2rem)] flex-col gap-4 overflow-y-auto rounded-[32px] border p-5 backdrop-blur-xl ${shellClass}`}>
          <div>
            <div className="flex items-center gap-3">
              <img
                className="h-12 w-12 rounded-2xl object-cover shadow-md"
                src={logoImage}
                alt="Polaroid Studio mark"
              />
              <p className={`text-xs uppercase tracking-[0.24em] ${mutedTextClass}`}>
                Workflow
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Beginner guide</h2>
            <p className={`mt-2 text-sm leading-6 ${bodyTextClass}`}>
              Start with one photo, position it inside the square crop, choose a look,
              then export the finished Polaroid as PNG or JPG.
            </p>
          </div>

          <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>How to make a Polaroid</div>
            <ol className={`space-y-3 text-sm leading-6 ${bodyTextClass}`}>
              <li>
                <span className={`font-semibold ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>1. Import a photo.</span>
                <br />
                Drag an image into the upload box or use Choose File.
              </li>
              <li>
                <span className={`font-semibold ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>2. Set the crop.</span>
                <br />
                The Polaroid image area is square. Drag the preview to reposition the photo and use Zoom when you need a tighter frame.
              </li>
              <li>
                <span className={`font-semibold ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>3. Pick a look.</span>
                <br />
                Try a preset first, then adjust brightness, warmth, fade, grain, vignette, border, shadow, and rotation.
              </li>
              <li>
                <span className={`font-semibold ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>4. Add a caption.</span>
                <br />
                Type a date, place, or short memory. Choose a font and size that fits the bottom border.
              </li>
              <li>
                <span className={`font-semibold ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>5. Export.</span>
                <br />
                Use PNG for transparency around the card and JPG for a simple shareable image.
              </li>
            </ol>
          </div>

          {recentImages.length > 0 ? (
            <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
              <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>Recent files</div>
              <div className="grid grid-cols-2 gap-3">
                {recentImages.map((asset) => (
                  <button
                    key={`${asset.name}-${asset.dataUrl.slice(0, 32)}`}
                    className={`overflow-hidden rounded-2xl border text-left transition ${
                      darkMode
                        ? 'border-stone-700 bg-stone-900 hover:border-stone-500'
                        : 'border-stone-200 bg-white hover:border-stone-300'
                    }`}
                    type="button"
                    onClick={() => {
                      setImageAsset(asset);
                      setStatus(`Loaded ${asset.name}`);
                      playSound('shutter');
                    }}
                  >
                    <img
                      className="h-24 w-full object-cover"
                      src={asset.dataUrl}
                      alt=""
                    />
                    <div className={`truncate px-3 py-2 text-xs ${darkMode ? 'text-stone-300' : 'text-stone-600'}`}>
                      {asset.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>Export behavior</div>
            <p className={`text-sm leading-6 ${bodyTextClass}`}>
              PNG keeps transparency around the floating card. JPG renders the same look
              with a flattened background-free card image for easy sharing.
            </p>
          </div>

          <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>Useful controls</div>
            <ul className={`space-y-2 text-sm leading-6 ${bodyTextClass}`}>
              <li>Use Showing final / Showing before to compare the edited look against the original crop.</li>
              <li>Use Undo and Redo if a slider, preset, or crop move does not work.</li>
              <li>Use Save preset when you make a look you want to reuse.</li>
              <li>Shortcuts: Ctrl+O imports, Ctrl+S exports PNG, Ctrl+Z undoes, Ctrl+Shift+Z redoes.</li>
            </ul>
          </div>

          <div className={`rounded-[28px] border p-4 ${surfaceClass}`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>Suggested caption</div>
            <button
              className={`mt-3 w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                darkMode
                  ? 'border-stone-700 text-stone-200 hover:bg-stone-800'
                  : 'border-stone-300 text-stone-700 hover:bg-stone-50'
              }`}
              type="button"
              onClick={() =>
                updateSetting(
                  'captionText',
                  new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }).format(new Date())
                )
              }
            >
              Insert today&apos;s date
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
