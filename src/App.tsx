import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { PresetButton } from './components/PresetButton';
import { PreviewStage } from './components/PreviewStage';
import { SliderControl } from './components/SliderControl';
import logoImage from './assets/logo.png';
import { defaultSettings, presets } from './data/presets';
import { fileToImageAsset, loadImage } from './lib/image';
import {
  bytesToBlob,
  copyBlobToClipboard,
  downloadBlob,
  downloadTextFile,
  selectTextFile,
} from './lib/browserFiles';
import {
  exportCanvasBlob,
  getAutoCropZoom,
  getExportDimensions,
} from './lib/polaroidRenderer';
import {
  ExportFormat,
  ExportSettings,
  ImageAsset,
  PolaroidProject,
  PolaroidPreset,
  PolaroidSettings,
} from './types';
import { translations, type Language } from './i18n';

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

const captionColors = ['#362d23', '#1f2937', '#7c2d12', '#14532d', '#f5eee1'];

const frameThemes: { id: PolaroidSettings['frameTheme']; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'cream', label: 'Cream' },
  { id: 'black', label: 'Black' },
  { id: 'aged', label: 'Aged' },
  { id: 'pink', label: 'Pink' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
];

const overlays: { id: PolaroidSettings['overlay']; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'tape', label: 'Tape' },
  { id: 'dust', label: 'Dust' },
  { id: 'scratches', label: 'Scratches' },
  { id: 'fingerprints', label: 'Fingerprints' },
  { id: 'lightleak', label: 'Light leak' },
];

const cleanExportName = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();

const greatestCommonDivisor = (a: number, b: number): number =>
  b === 0 ? a : greatestCommonDivisor(b, a % b);

const exportMimeTypes: Record<ExportFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
};

function App() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [imageAsset, setImageAsset] = useState<ImageAsset | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [settings, setSettings] = useState<PolaroidSettings>(defaultSettings);
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  const [customPresets, setCustomPresets] = useState<PolaroidPreset[]>([]);
  const [recentImages, setRecentImages] = useState<ImageAsset[]>([]);
  const [batchImages, setBatchImages] = useState<ImageAsset[]>([]);
  const [exportSizeId, setExportSizeId] = useState('print');
  const [previewMode, setPreviewMode] = useState<'final' | 'before' | 'split'>(
    'final'
  );
  const [activePresetId, setActivePresetId] = useState<string>('classic');
  const [darkMode, setDarkMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [language, setLanguage] = useState<Language>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Import a photo to begin.');
  const t = translations[language];

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('polaroid-studio-theme');
    if (storedTheme === 'dark') {
      setDarkMode(true);
    }

    const storedSound = window.localStorage.getItem('polaroid-studio-sound');
    if (storedSound === 'off') {
      setSoundEnabled(false);
    }

    const storedLanguage = window.localStorage.getItem('polaroid-studio-language');
    if (storedLanguage === 'ko' || storedLanguage === 'en') {
      setLanguage(storedLanguage);
      setStatus(
        storedLanguage === 'ko' ? '시작하려면 사진을 가져오세요.' : 'Import a photo to begin.'
      );
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

    const storedProject = window.localStorage.getItem('polaroid-studio-project');
    if (storedProject) {
      try {
        const project = JSON.parse(storedProject) as PolaroidProject;
        setSettings({ ...defaultSettings, ...project.settings });
        setActivePresetId(project.activePresetId || 'custom');
        if (project.image) {
          setImageAsset(project.image);
          setBatchImages([project.image]);
          setStatus(`Restored ${project.image.name}`);
        }
      } catch {
        window.localStorage.removeItem('polaroid-studio-project');
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
    window.localStorage.setItem('polaroid-studio-language', language);
    document.documentElement.lang = language === 'ko' ? 'ko' : 'en';
  }, [language]);

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
    const project: PolaroidProject = {
      image: imageAsset,
      settings,
      activePresetId,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem('polaroid-studio-project', JSON.stringify(project));
  }, [imageAsset, settings, activePresetId]);

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
    () =>
      [...presets, ...customPresets].map((preset) => ({
        ...preset,
        ...(preset.id in t.presetCopy
          ? t.presetCopy[preset.id as keyof typeof t.presetCopy]
          : {}),
      })),
    [customPresets, t.presetCopy]
  );
  const exportMeta = useMemo(
    () => getExportDimensions(settings, exportSettings),
    [settings, exportSettings]
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
        previous.cropX !== next.cropX ||
        previous.cropY !== next.cropY ||
        previous.cropZoom !== next.cropZoom;

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
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    try {
      const assets = await Promise.all(selectedFiles.map(fileToImageAsset));
      const [asset] = assets;
      setBatchImages(assets);
      setImageAsset(asset);
      assets.forEach(rememberImage);
      setStatus(
        assets.length === 1
          ? language === 'ko'
            ? `${asset.name} 불러옴`
            : `Loaded ${asset.name}`
          : language === 'ko'
            ? `일괄 내보내기용 사진 ${assets.length}장을 불러왔습니다.`
            : `Loaded ${assets.length} photos for batch export.`
      );
      playSound('shutter');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import file.');
    }
  };

  const openNativePicker = async () => {
    try {
      if (!window.electronAPI?.openImages) {
        setStatus(
          language === 'ko'
            ? '파일 선택 버튼을 사용해 사진을 가져오세요.'
            : 'Use Choose Files to import photos on this platform.'
        );
        return;
      }

      const results = await window.electronAPI?.openImages();
      if (!results || results.length === 0) {
        return;
      }

      setBatchImages(results);
      setImageAsset(results[0]);
      results.forEach(rememberImage);
      setStatus(
        results.length === 1
          ? language === 'ko'
            ? `${results[0].name} 불러옴`
            : `Loaded ${results[0].name}`
          : language === 'ko'
            ? `일괄 내보내기용 사진 ${results.length}장을 불러왔습니다.`
            : `Loaded ${results.length} photos for batch export.`
      );
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
      setStatus(
        language === 'ko'
          ? `${format.toUpperCase()} 내보내기를 렌더링 중...`
          : `Rendering ${format.toUpperCase()} export...`
      );
      const blob = await exportCanvasBlob(
        imageElement,
        settings,
        format,
        exportSettings
      );
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      const cleanName = cleanExportName(imageAsset?.name || 'polaroid');
      const filename = `${cleanName || 'polaroid-studio'}-${Date.now()}.${format}`;

      if (!window.electronAPI?.saveImage) {
        downloadBlob(blob, filename);
        setStatus(language === 'ko' ? `${filename} 다운로드됨` : `Downloaded ${filename}`);
        playSound('success');
        return;
      }

      const result = await window.electronAPI?.saveImage({
        suggestedName: filename,
        format,
        data: bytes,
      });

      if (!result || result.canceled) {
        setStatus(language === 'ko' ? '내보내기가 취소되었습니다.' : 'Export canceled.');
      } else {
        setStatus(
          language === 'ko' ? `${result.filePath}에 저장됨` : `Saved to ${result.filePath}`
        );
        playSound('success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
      setStatus(language === 'ko' ? '내보내기에 실패했습니다.' : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const renderAssetBytes = async (asset: ImageAsset, format: ExportFormat) => {
    const image = await loadImage(asset.dataUrl);
    const blob = await exportCanvasBlob(image, settings, format, exportSettings);
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  };

  const exportBatch = async (format: ExportFormat) => {
    if (batchImages.length === 0) {
      return;
    }

    try {
      setBusy(true);
      setStatus(
        language === 'ko'
          ? `${format.toUpperCase()} 파일 ${batchImages.length}개를 렌더링 중...`
          : `Rendering ${batchImages.length} ${format.toUpperCase()} files...`
      );
      const files = [];
      for (let index = 0; index < batchImages.length; index += 1) {
        const asset = batchImages[index];
        const data = await renderAssetBytes(asset, format);
        files.push({
          suggestedName: `${cleanExportName(asset.name) || 'polaroid'}-${index + 1}.${format}`,
          data,
        });
      }

      if (!window.electronAPI?.saveImagesToFolder) {
        files.forEach((file) => {
          downloadBlob(
            bytesToBlob(file.data, exportMimeTypes[format]),
            file.suggestedName
          );
        });
        setStatus(
          language === 'ko'
            ? `${files.length}개 파일을 다운로드했습니다.`
            : `Downloaded ${files.length} files.`
        );
        playSound('success');
        return;
      }

      const result = await window.electronAPI?.saveImagesToFolder({ files });
      if (!result || result.canceled) {
        setStatus(
          language === 'ko' ? '일괄 내보내기가 취소되었습니다.' : 'Batch export canceled.'
        );
      } else {
        setStatus(
          language === 'ko'
            ? `${files.length}개 파일을 ${result.folderPath}에 내보냈습니다.`
            : `Exported ${files.length} files to ${result.folderPath}`
        );
        playSound('success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch export failed.');
      setStatus(language === 'ko' ? '일괄 내보내기에 실패했습니다.' : 'Batch export failed.');
    } finally {
      setBusy(false);
    }
  };

  const copyCurrentImage = async () => {
    if (!imageElement) {
      return;
    }

    try {
      const blob = await exportCanvasBlob(imageElement, settings, 'png', exportSettings);
      const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
      if (window.electronAPI?.copyImage) {
        await window.electronAPI.copyImage({ data });
      } else {
        await copyBlobToClipboard(blob);
      }
      setStatus(
        language === 'ko'
          ? '렌더링된 폴라로이드를 클립보드에 복사했습니다.'
          : 'Copied rendered Polaroid to clipboard.'
      );
      playSound('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copy failed.');
    }
  };

  const startDragExport = async () => {
    if (!imageElement) {
      return;
    }

    const blob = await exportCanvasBlob(imageElement, settings, 'png', exportSettings);
    const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
    const suggestedName = `${cleanExportName(imageAsset?.name || 'polaroid') || 'polaroid'}-drag.png`;

    if (!window.electronAPI?.startImageDrag) {
      downloadBlob(blob, suggestedName);
      return;
    }

    await window.electronAPI.startImageDrag({
      suggestedName,
      data,
    });
  };

  const randomizeLook = () => {
    commitSettings((current) => ({
      ...current,
      warmth: Math.round(8 + Math.random() * 34),
      fade: Math.round(8 + Math.random() * 34),
      grain: Math.round(4 + Math.random() * 22),
      vignette: Math.round(6 + Math.random() * 25),
      rotation: Math.round((Math.random() * 12 - 6) * 10) / 10,
      shadowIntensity: Math.round(40 + Math.random() * 42),
      overlay: overlays[Math.floor(Math.random() * overlays.length)].id,
    }));
    setStatus(language === 'ko' ? '아날로그 룩을 무작위로 적용했습니다.' : 'Randomized the analog look.');
    playSound('click');
  };

  const resetCrop = () => {
    commitSettings((current) => ({
      ...current,
      cropZoom: 1,
      cropX: 0,
      cropY: 0,
      cropRotation: 0,
      flipX: false,
      flipY: false,
    }));
  };

  const fitCrop = () => updateSetting('cropZoom', 1);
  const fillCrop = () => updateSetting('cropZoom', 1.6);
  const autoFitCrop = () => {
    if (!imageElement) {
      return;
    }

    commitSettings((current) => ({
      ...current,
      cropZoom: getAutoCropZoom(imageElement, current),
      cropX: 0,
      cropY: 0,
    }));
    setStatus(language === 'ko' ? '자르기 프레이밍을 자동으로 맞췄습니다.' : 'Auto matched the crop framing.');
  };

  const exportPresetFile = async () => {
    const json = JSON.stringify(
      {
        version: 1,
        presets: customPresets.length > 0 ? customPresets : [
          {
            id: `custom-${Date.now()}`,
            name: t.currentLook,
            description: t.exportedLook,
            settings,
          },
        ],
      },
      null,
      2
    );

    if (!window.electronAPI?.savePresetFile) {
      downloadTextFile(json, 'polaroid-studio-presets.json');
      setStatus(
        language === 'ko'
          ? '프리셋 파일을 다운로드했습니다.'
          : 'Downloaded preset file.'
      );
      return;
    }

    const result = await window.electronAPI?.savePresetFile({
      suggestedName: 'polaroid-studio-presets.json',
      json,
    });
    if (result && !result.canceled) {
      setStatus(
        language === 'ko'
          ? `프리셋을 ${result.filePath}에 내보냈습니다.`
          : `Exported presets to ${result.filePath}`
      );
    }
  };

  const importPresetFile = async () => {
    try {
      const json = window.electronAPI?.openPresetFile
        ? await window.electronAPI.openPresetFile()
        : await selectTextFile();
      if (!json) {
        return;
      }
      const parsed = JSON.parse(json) as { presets?: PolaroidPreset[] };
      const incoming = (parsed.presets ?? []).filter(
        (preset) => preset.name && preset.settings
      );
      setCustomPresets((current) => [
        ...current,
        ...incoming.map((preset) => ({
          ...preset,
          id: preset.id.startsWith('custom-')
            ? `${preset.id}-${Date.now()}`
            : `custom-${preset.id}-${Date.now()}`,
        })),
      ]);
      setStatus(
        language === 'ko'
          ? `프리셋 ${incoming.length}개를 가져왔습니다.`
          : `Imported ${incoming.length} presets.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preset import failed.');
    }
  };

  const saveCustomPreset = () => {
    const name = window.prompt(t.presetPrompt);
    if (!name?.trim()) {
      return;
    }

    const id = `custom-${Date.now()}`;
    setCustomPresets((current) => [
      ...current,
      {
        id,
        name: name.trim(),
        description: language === 'ko' ? '저장한 사용자 룩.' : 'Saved custom look.',
        settings,
      },
    ]);
    setActivePresetId(id);
    setStatus(
      language === 'ko'
        ? `${name.trim()} 프리셋을 저장했습니다.`
        : `Saved preset ${name.trim()}.`
    );
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
                  <h1 className="mt-2 text-3xl font-semibold">{t.heroTitle}</h1>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className={`grid grid-cols-2 gap-1 rounded-full border p-1 text-xs ${darkMode ? 'border-stone-700 bg-stone-900' : 'border-stone-300 bg-white/70'}`}>
                  {(['en', 'ko'] as const).map((nextLanguage) => (
                    <button
                      key={nextLanguage}
                      className={`rounded-full px-3 py-1.5 font-medium transition ${
                        language === nextLanguage
                          ? darkMode
                            ? 'bg-accent text-white'
                            : 'bg-ink text-white'
                          : darkMode
                            ? 'text-stone-300 hover:bg-stone-800'
                            : 'text-stone-600 hover:bg-stone-100'
                      }`}
                      onClick={() => setLanguage(nextLanguage)}
                      type="button"
                      title={t.language}
                    >
                      {nextLanguage === 'ko' ? 'KO' : 'EN'}
                    </button>
                  ))}
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
                  {darkMode ? t.lightMode : t.darkMode}
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
                  {soundEnabled ? t.soundOn : t.soundOff}
                </button>
              </div>
            </div>
            <p className={`mt-2 text-sm leading-6 ${bodyTextClass}`}>
              {t.heroDescription}
            </p>
          </div>

            <Dropzone
              onSelectFiles={importFirstFile}
              onOpenNativeDialog={openNativePicker}
              darkMode={darkMode}
              copy={t.dropzone}
            />

          {batchImages.length > 1 ? (
            <div className={`rounded-[26px] border p-4 ${surfaceClass}`}>
              <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>
                {t.batchQueue}: {batchImages.length} {t.photos}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {batchImages.slice(0, 8).map((asset) => (
                  <button
                    key={`${asset.name}-${asset.dataUrl.slice(0, 20)}`}
                    className={`overflow-hidden rounded-xl border ${imageAsset?.dataUrl === asset.dataUrl ? 'border-accent' : darkMode ? 'border-stone-700' : 'border-stone-200'}`}
                    type="button"
                    onClick={() => setImageAsset(asset)}
                    title={asset.name}
                  >
                    <img className="h-14 w-full object-cover" src={asset.dataUrl} alt="" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

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
                      {t.originalRatio} {cropRatioMeta.originalRatio}; {t.polaroidCrop}
                    </div>
                  ) : null}
                  <div className={`mt-3 text-xs uppercase tracking-[0.24em] ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>
                    {t.originalPreview}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className={`space-y-5 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div>
              <h2 className={`text-sm font-semibold uppercase tracking-[0.24em] ${mutedTextClass}`}>
                {t.crop}
              </h2>
              {cropRatioMeta ? (
                <p className={`mt-2 text-sm leading-6 ${cropRatioMeta.isSquare ? bodyTextClass : darkMode ? 'text-orange-200' : 'text-amber-700'}`}>
                  {cropRatioMeta.isSquare
                    ? t.cropSquare
                    : t.cropDifferent(cropRatioMeta.originalRatio)}
                </p>
              ) : null}
            </div>
            <SliderControl
              label={t.zoom}
              value={settings.cropZoom}
              min={1}
              max={3}
              step={0.05}
              onChange={(value) => updateSetting('cropZoom', value)}
              suffix="x"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.horizontal}
              value={settings.cropX}
              min={-100}
              max={100}
              onChange={(value) => updateSetting('cropX', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.vertical}
              value={settings.cropY}
              min={-100}
              max={100}
              onChange={(value) => updateSetting('cropY', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.cropRotation}
              value={settings.cropRotation}
              min={-45}
              max={45}
              onChange={(value) => updateSetting('cropRotation', value)}
              suffix="deg"
              darkMode={darkMode}
            />
            <label className="space-y-2">
              <div className={`flex items-center justify-between text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>
                <span>{t.numericZoom}</span>
                <span className={mutedTextClass}>{settings.cropZoom.toFixed(2)}x</span>
              </div>
              <input
                className={`w-full rounded-2xl border px-3 py-2 text-sm outline-none ${fieldClass}`}
                type="number"
                min={1}
                max={3}
                step={0.05}
                value={settings.cropZoom}
                onChange={(event) => updateSetting('cropZoom', Number(event.target.value))}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                [t.autoFit, autoFitCrop],
                [t.fit, fitCrop],
                [t.fill, fillCrop],
                [t.flipH, () => updateSetting('flipX', !settings.flipX)],
                [t.flipV, () => updateSetting('flipY', !settings.flipY)],
              ].map(([label, handler]) => (
                <button
                  key={label as string}
                  className={`rounded-2xl border px-3 py-2 text-sm transition ${darkMode ? 'border-stone-700 text-stone-300 hover:bg-stone-800' : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}
                  type="button"
                  onClick={handler as () => void}
                >
                  {label as string}
                </button>
              ))}
            </div>
            <button
              className={`w-full rounded-2xl border px-3 py-2 text-sm transition ${darkMode ? 'border-stone-700 text-stone-300 hover:bg-stone-800' : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}
              type="button"
              onClick={resetCrop}
            >
              {t.resetCrop}
            </button>
          </div>

          <div className={`space-y-5 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div>
              <h2 className={`text-sm font-semibold uppercase tracking-[0.24em] ${mutedTextClass}`}>
                {t.toneFrame}
              </h2>
            </div>
            <SliderControl
              label={t.brightness}
              value={settings.brightness}
              min={70}
              max={140}
              onChange={(value) => updateSetting('brightness', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.contrast}
              value={settings.contrast}
              min={60}
              max={130}
              onChange={(value) => updateSetting('contrast', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.saturation}
              value={settings.saturation}
              min={40}
              max={140}
              onChange={(value) => updateSetting('saturation', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.warmth}
              value={settings.warmth}
              min={0}
              max={45}
              onChange={(value) => updateSetting('warmth', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.fade}
              value={settings.fade}
              min={0}
              max={45}
              onChange={(value) => updateSetting('fade', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.grain}
              value={settings.grain}
              min={0}
              max={30}
              onChange={(value) => updateSetting('grain', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.vignette}
              value={settings.vignette}
              min={0}
              max={35}
              onChange={(value) => updateSetting('vignette', value)}
              darkMode={darkMode}
            />
            <div className="space-y-2">
              <div className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.frameTheme}</div>
              <div className="grid grid-cols-2 gap-2">
                {frameThemes.map((theme) => (
                  <button
                    key={theme.id}
                    className={`rounded-2xl border px-3 py-2 text-sm transition ${
                      settings.frameTheme === theme.id
                        ? darkMode
                          ? 'border-accent bg-accent/15 text-orange-200'
                          : 'border-accent bg-accentSoft text-accent'
                        : darkMode
                          ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                          : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                    }`}
                    type="button"
                    onClick={() => updateSetting('frameTheme', theme.id)}
                  >
                    {t.frameThemes[theme.id]}
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-2">
              <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.overlay}</span>
              <select
                className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`}
                value={settings.overlay}
                onChange={(event) =>
                  updateSetting('overlay', event.target.value as PolaroidSettings['overlay'])
                }
              >
                {overlays.map((overlay) => (
                  <option key={overlay.id} value={overlay.id}>
                    {t.overlays[overlay.id]}
                  </option>
                ))}
              </select>
            </label>
            <SliderControl
              label={t.topBorder}
              value={settings.borderTop}
              min={2}
              max={30}
              onChange={(value) => updateSetting('borderTop', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.sideBorder}
              value={settings.borderSide}
              min={2}
              max={30}
              onChange={(value) => updateSetting('borderSide', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.bottomBorder}
              value={settings.borderBottom}
              min={8}
              max={50}
              onChange={(value) => updateSetting('borderBottom', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.shadow}
              value={settings.shadowIntensity}
              min={0}
              max={100}
              onChange={(value) => updateSetting('shadowIntensity', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.rotation}
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
                {t.undo}
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
                {t.redo}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['final', 'before', 'split'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`rounded-full border px-4 py-2 text-sm font-medium capitalize transition ${
                    previewMode === mode
                      ? darkMode
                        ? 'border-accent bg-accent/15 text-orange-200'
                        : 'border-accent bg-accentSoft text-accent'
                      : darkMode
                        ? 'border-stone-700 text-stone-200 hover:bg-stone-900'
                        : 'border-stone-300 text-stone-700 hover:bg-stone-50'
                  }`}
                  type="button"
                  onClick={() => setPreviewMode(mode)}
                >
                  {t.previewModes[mode]}
                </button>
              ))}
            </div>
          </div>
          <PreviewStage
            image={imageElement}
            settings={settings}
            ready={hasImage}
            error={error}
            previewMode={previewMode}
            onCropPreview={previewCropDrag}
            onCropCommit={commitCropDrag}
            darkMode={darkMode}
          />

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className={`rounded-[28px] border p-5 backdrop-blur-xl ${shellClass}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`text-xs uppercase tracking-[0.24em] ${mutedTextClass}`}>
                    {t.presets}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">{t.analogLooks}</h2>
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
                    {t.savePreset}
                  </button>
                  <button
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      darkMode
                        ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                        : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                    }`}
                    type="button"
                    onClick={importPresetFile}
                  >
                    {t.import}
                  </button>
                  <button
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      darkMode
                        ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                        : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                    }`}
                    type="button"
                    onClick={exportPresetFile}
                  >
                    {t.export}
                  </button>
                  <button
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      darkMode
                        ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                        : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                    }`}
                    type="button"
                    onClick={randomizeLook}
                  >
                    {t.randomize}
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
                      setStatus(
                        language === 'ko'
                          ? '설정을 기본값으로 초기화했습니다.'
                          : 'Settings reset to default.'
                      );
                      playSound('click');
                    }}
                  >
                    {t.reset}
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
                        {t.remove}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className={`rounded-[28px] border p-5 backdrop-blur-xl ${shellClass}`}>
              <p className={`text-xs uppercase tracking-[0.24em] ${mutedTextClass}`}>
                {t.captionExport}
              </p>
              <div className="mt-3 space-y-4">
                <label className="block space-y-2">
                  <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.captionText}</span>
                  <textarea
                    className={`min-h-24 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`}
                    placeholder={t.captionPlaceholder}
                    value={settings.captionText}
                    onChange={(event) =>
                      updateSetting('captionText', event.target.value)
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.captionFont}</span>
                  <select
                    className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`}
                    value={settings.captionFont}
                    onChange={(event) =>
                      updateSetting('captionFont', event.target.value)
                    }
                  >
                    {captionFonts.map((font) => (
                      <option key={font.id} value={font.id}>
                        {t.captionFonts[font.id as keyof typeof t.captionFonts]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm transition ${darkMode ? 'border-stone-700 text-stone-300 hover:bg-stone-900' : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}
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
                    {t.insertDate}
                  </button>
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm transition ${darkMode ? 'border-stone-700 text-stone-300 hover:bg-stone-900' : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}
                    type="button"
                    onClick={() => {
                      const location = window.prompt(t.locationPrompt);
                      if (location?.trim()) {
                        updateSetting('captionText', location.trim());
                      }
                    }}
                  >
                    {t.locationStamp}
                  </button>
                </div>
                <div className="space-y-2">
                  <div className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.captionColor}</div>
                  <div className="flex flex-wrap gap-2">
                    {captionColors.map((color) => (
                      <button
                        key={color}
                        className={`h-9 w-9 rounded-full border-2 ${settings.captionColor === color ? 'border-accent' : darkMode ? 'border-stone-700' : 'border-stone-200'}`}
                        style={{ backgroundColor: color }}
                        type="button"
                        title={color}
                        onClick={() => updateSetting('captionColor', color)}
                      />
                    ))}
                    <input
                      className="h-9 w-12 rounded-lg border border-stone-300 bg-transparent"
                      type="color"
                      value={settings.captionColor}
                      onChange={(event) => updateSetting('captionColor', event.target.value)}
                      title={t.customCaptionColor}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      className={`rounded-2xl border px-3 py-2 text-sm capitalize transition ${
                        settings.captionAlign === align
                          ? darkMode
                            ? 'border-accent bg-accent/15 text-orange-200'
                            : 'border-accent bg-accentSoft text-accent'
                          : darkMode
                            ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                            : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                      }`}
                      type="button"
                      onClick={() => updateSetting('captionAlign', align)}
                    >
                      {t.captionAlign[align]}
                    </button>
                  ))}
                </div>
                <SliderControl
                  label={t.captionSize}
                  value={settings.captionFontSize}
                  min={16}
                  max={42}
                  onChange={(value) => updateSetting('captionFontSize', value)}
                  suffix="px"
                  darkMode={darkMode}
                />
                <SliderControl
                  label={t.softness}
                  value={settings.blur}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(value) => updateSetting('blur', value)}
                  suffix="px"
                  darkMode={darkMode}
                />
                <label className="block space-y-2">
                  <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.watermark}</span>
                  <input
                    className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`}
                    value={settings.watermarkText}
                    onChange={(event) => updateSetting('watermarkText', event.target.value)}
                    placeholder={t.optionalSignature}
                  />
                </label>
                <SliderControl
                  label={t.watermarkOpacity}
                  value={settings.watermarkOpacity}
                  min={0}
                  max={100}
                  onChange={(value) => updateSetting('watermarkOpacity', value)}
                  suffix="%"
                  darkMode={darkMode}
                />
                <div className="space-y-2">
                  <div className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.exportSize}</div>
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
                        {t.exportSizes[option.id as keyof typeof t.exportSizes]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                  {t.exportPreview}: {exportMeta.width} x {exportMeta.height}px
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
                    {t.exportPng}
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
                    {t.exportJpg}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      darkMode
                        ? 'border-stone-700 bg-stone-900 text-stone-100 hover:border-stone-500 hover:bg-stone-800'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                    type="button"
                    disabled={!hasImage || busy}
                    onClick={copyCurrentImage}
                  >
                    {t.copyPng}
                  </button>
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      darkMode
                        ? 'border-stone-700 bg-stone-900 text-stone-100 hover:border-stone-500 hover:bg-stone-800'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                    type="button"
                    draggable={hasImage}
                    disabled={!hasImage || busy}
                    onDragStart={() => void startDragExport()}
                  >
                    {t.dragPngOut}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      darkMode
                        ? 'border-stone-700 bg-stone-900 text-stone-100 hover:border-stone-500 hover:bg-stone-800'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                    type="button"
                    disabled={batchImages.length === 0 || busy}
                    onClick={() => exportBatch('png')}
                  >
                    {t.batchPng}
                  </button>
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      darkMode
                        ? 'border-stone-700 bg-stone-900 text-stone-100 hover:border-stone-500 hover:bg-stone-800'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                    type="button"
                    disabled={batchImages.length === 0 || busy}
                    onClick={() => exportBatch('jpg')}
                  >
                    {t.batchJpg}
                  </button>
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                  {busy ? t.working : status}
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
                {t.workflow}
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-semibold">{t.beginnerGuide}</h2>
            <p className={`mt-2 text-sm leading-6 ${bodyTextClass}`}>
              {t.guideIntro}
            </p>
          </div>

          <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>{t.howToTitle}</div>
            <ol className={`space-y-3 text-sm leading-6 ${bodyTextClass}`}>
              {t.guideSteps.map(([title, description]) => (
                <li key={title}>
                  <span className={`font-semibold ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{title}</span>
                  <br />
                  {description}
                </li>
              ))}
            </ol>
          </div>

          {recentImages.length > 0 ? (
            <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
              <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>{t.recentFiles}</div>
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
                      setStatus(language === 'ko' ? `${asset.name} 불러옴` : `Loaded ${asset.name}`);
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
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>{t.exportBehavior}</div>
            <p className={`text-sm leading-6 ${bodyTextClass}`}>
              {t.exportBehaviorText}
            </p>
          </div>

          <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>{t.usefulControls}</div>
            <ul className={`space-y-2 text-sm leading-6 ${bodyTextClass}`}>
              {t.usefulControlItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className={`rounded-[28px] border p-4 ${surfaceClass}`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>{t.suggestedCaption}</div>
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
              {t.insertToday}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;

