import { useEffect, useMemo, useState } from 'react';
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
  PolaroidSettings,
} from './types';

function App() {
  const [imageAsset, setImageAsset] = useState<ImageAsset | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [settings, setSettings] = useState<PolaroidSettings>(defaultSettings);
  const [exportSettings] = useState<ExportSettings>({
    scale: 1.9,
    quality: 95,
  });
  const [activePresetId, setActivePresetId] = useState<string>('classic');
  const [darkMode, setDarkMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Import a photo to begin.');

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('polaroid-studio-theme');
    if (storedTheme === 'dark') {
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      'polaroid-studio-theme',
      darkMode ? 'dark' : 'light'
    );
  }, [darkMode]);

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

  const originalMeta = useMemo(() => {
    if (!imageElement) {
      return null;
    }

    return `${imageElement.naturalWidth} × ${imageElement.naturalHeight}`;
  }, [imageElement]);

  const applyPreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setActivePresetId(presetId);
    setSettings((current) => ({
      ...current,
      ...preset.settings,
    }));
  };

  const updateSetting = <K extends keyof PolaroidSettings>(
    key: K,
    value: PolaroidSettings[K]
  ) => {
    setActivePresetId('custom');
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const importFirstFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      return;
    }

    try {
      const asset = await fileToImageAsset(file);
      setImageAsset(asset);
      setStatus(`Loaded ${file.name}`);
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
      setStatus(`Loaded ${result.name}`);
      setError(null);
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
      setStatus('Export failed.');
    } finally {
      setBusy(false);
    }
  };

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
              min={5}
              max={30}
              onChange={(value) => updateSetting('borderTop', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label="Side border"
              value={settings.borderSide}
              min={5}
              max={30}
              onChange={(value) => updateSetting('borderSide', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label="Bottom border"
              value={settings.borderBottom}
              min={10}
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
          <PreviewStage
            image={imageElement}
            settings={settings}
            ready={hasImage}
            error={error}
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
                <button
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    darkMode
                      ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                      : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                  }`}
                  type="button"
                  onClick={() => {
                    setSettings(defaultSettings);
                    setActivePresetId('classic');
                    setStatus('Settings reset to default.');
                  }}
                >
                  Reset
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {presets.map((preset) => (
                  <PresetButton
                    key={preset.id}
                    preset={preset}
                    active={activePresetId === preset.id}
                    onClick={() => applyPreset(preset.id)}
                    darkMode={darkMode}
                  />
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
            <h2 className="mt-2 text-2xl font-semibold">Studio notes</h2>
            <p className={`mt-2 text-sm leading-6 ${bodyTextClass}`}>
              The preview uses the same canvas renderer as export, so the saved PNG or
              JPG keeps the full frame, caption, shadow, tone, and texture.
            </p>
          </div>

          <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>What this MVP includes</div>
            <ul className={`space-y-2 text-sm leading-6 ${bodyTextClass}`}>
              <li>Drag-and-drop plus native file import</li>
              <li>Square crop and realistic Polaroid paper frame</li>
              <li>Warm/faded image treatment with grain and vignette</li>
              <li>Live canvas preview and high-resolution export</li>
              <li>Electron Builder packaging for Windows, macOS, and Linux</li>
            </ul>
          </div>

          <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>Export behavior</div>
            <p className={`text-sm leading-6 ${bodyTextClass}`}>
              PNG keeps transparency around the floating card. JPG renders the same look
              with a flattened background-free card image for easy sharing.
            </p>
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
