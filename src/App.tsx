import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { PresetButton } from './components/PresetButton';
import { PreviewStage } from './components/PreviewStage';
import { SliderControl } from './components/SliderControl';
import logoImage from './assets/logo.png';
import { defaultSettings, presets } from './data/presets';
import { fileToImageAsset, loadImage } from './lib/image';
import {
  copyBlobToClipboard,
  downloadBlob,
  downloadTextFile,
  selectTextFile,
} from './lib/browserFiles';
import {
  exportCanvasBlob,
  getAutoCropZoom,
  getExportDimensions,
  renderPolaroid,
} from './lib/polaroidRenderer';
import { renderExportBlobInWorker } from './lib/exportWorkerClient';
import {
  loadImageAsset,
  loadImageAssets,
  saveImageAsset,
  StoredImageRef,
} from './lib/projectStore';
import { createZipBlob } from './lib/zip';
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

type StoredPolaroidProject = {
  imageRef: StoredImageRef | null;
  settings: PolaroidSettings;
  activePresetId: string;
  updatedAt: number;
};

type BatchFailure = {
  name: string;
  error: string;
};

type BatchProgress = {
  active: boolean;
  format: ExportFormat;
  completed: number;
  total: number;
  failures: BatchFailure[];
};

type ExportResult = {
  format: ExportFormat;
  filename: string;
  width: number;
  height: number;
};

type ExportSizeOption = {
  id: string;
  label: string;
  settings: ExportSettings;
};

type MobileTab = 'quick' | 'crop' | 'look' | 'frame' | 'caption' | 'export';
type BeginnerStep = 'choose' | 'look' | 'crop' | 'caption' | 'export';
type SoundType =
  | 'click'
  | 'shutter'
  | 'success'
  | 'tick'
  | 'dragStart'
  | 'dragEnd'
  | 'undo'
  | 'redo'
  | 'error'
  | 'snap';

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

const getStoredLanguage = (): Language => {
  const storedLanguage = window.localStorage.getItem('polaroid-studio-language');
  return storedLanguage === 'ko' || storedLanguage === 'en' ? storedLanguage : 'en';
};

const mobileTabIds: MobileTab[] = [
  'quick',
  'crop',
  'look',
  'frame',
  'caption',
  'export',
];
const beginnerStepIds: BeginnerStep[] = [
  'choose',
  'look',
  'crop',
  'caption',
  'export',
];

const uploadInputId = 'polaroid-studio-upload';

const getStoredMobileTab = (): MobileTab => {
  const storedTab = window.localStorage.getItem('polaroid-studio-mobile-tab');
  return mobileTabIds.includes(storedTab as MobileTab)
    ? (storedTab as MobileTab)
    : 'quick';
};

const getStoredBeginnerStep = (): BeginnerStep => {
  const storedStep = window.localStorage.getItem('polaroid-studio-beginner-step');
  return beginnerStepIds.includes(storedStep as BeginnerStep)
    ? (storedStep as BeginnerStep)
    : 'choose';
};

const getStoredBeginnerMode = () =>
  window.localStorage.getItem('polaroid-studio-mode') !== 'advanced';

const getStoredCompletedBeginnerSteps = (): BeginnerStep[] => {
  const storedSteps = window.localStorage.getItem(
    'polaroid-studio-completed-steps'
  );
  if (!storedSteps) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedSteps) as BeginnerStep[];
    return parsed.filter((step) => beginnerStepIds.includes(step));
  } catch {
    return [];
  }
};

const createDemoPhotoDataUrl = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }

  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#f6b982');
  sky.addColorStop(0.46, '#f5d3a3');
  sky.addColorStop(1, '#6f8f96');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#fff1b8';
  context.beginPath();
  context.arc(900, 220, 92, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#45515a';
  context.beginPath();
  context.moveTo(0, 610);
  context.lineTo(260, 330);
  context.lineTo(520, 610);
  context.closePath();
  context.fill();
  context.fillStyle = '#5f6f6f';
  context.beginPath();
  context.moveTo(330, 620);
  context.lineTo(630, 300);
  context.lineTo(970, 620);
  context.closePath();
  context.fill();
  context.fillStyle = '#e8eef0';
  context.beginPath();
  context.moveTo(630, 300);
  context.lineTo(548, 430);
  context.lineTo(684, 398);
  context.lineTo(746, 490);
  context.closePath();
  context.fill();

  const sea = context.createLinearGradient(0, 560, 0, canvas.height);
  sea.addColorStop(0, '#5c9aa8');
  sea.addColorStop(1, '#264d5c');
  context.fillStyle = sea;
  context.fillRect(0, 575, canvas.width, 325);
  context.fillStyle = 'rgba(255,255,255,0.55)';
  for (let y = 628; y < 835; y += 54) {
    context.fillRect(130, y, 390, 4);
    context.fillRect(690, y + 18, 300, 3);
  }

  return canvas.toDataURL('image/png');
};

function App() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const batchCancelRef = useRef(false);
  const [imageAsset, setImageAsset] = useState<ImageAsset | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [settings, setSettings] = useState<PolaroidSettings>(defaultSettings);
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  const [customPresets, setCustomPresets] = useState<PolaroidPreset[]>([]);
  const [recentImages, setRecentImages] = useState<ImageAsset[]>([]);
  const [batchImages, setBatchImages] = useState<ImageAsset[]>([]);
  const [batchImageRefs, setBatchImageRefs] = useState<StoredImageRef[]>([]);
  const [recentImageRefs, setRecentImageRefs] = useState<StoredImageRef[]>([]);
  const [imageRef, setImageRef] = useState<StoredImageRef | null>(null);
  const [exportSizeId, setExportSizeId] = useState('print');
  const [previewMode, setPreviewMode] = useState<'final' | 'before' | 'split'>(
    'final'
  );
  const [beginnerMode, setBeginnerMode] = useState(getStoredBeginnerMode);
  const [activeBeginnerStep, setActiveBeginnerStep] = useState<BeginnerStep>(
    getStoredBeginnerStep
  );
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>(
    getStoredMobileTab
  );
  const [mobilePreviewCompact, setMobilePreviewCompact] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string>('classic');
  const [darkMode, setDarkMode] = useState(
    () => window.localStorage.getItem('polaroid-studio-theme') === 'dark'
  );
  const [soundEnabled, setSoundEnabled] = useState(
    () => window.localStorage.getItem('polaroid-studio-sound') !== 'off'
  );
  const [language, setLanguage] = useState<Language>(getStoredLanguage);
  const [busy, setBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string>('');
  const [presetPreviewUrls, setPresetPreviewUrls] = useState<Record<string, string>>({});
  const [samplePresetPreviewUrls, setSamplePresetPreviewUrls] = useState<
    Record<string, string>
  >({});
  const [completedBeginnerSteps, setCompletedBeginnerSteps] = useState<
    BeginnerStep[]
  >(getStoredCompletedBeginnerSteps);
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(() =>
    getStoredLanguage() === 'ko' ? '시작하려면 사진을 가져오세요.' : 'Import a photo to begin.'
  );
  const t = translations[language];

  useEffect(() => {
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

    let cancelled = false;

    const restoreStoredImages = async () => {
      const storedRecent = window.localStorage.getItem('polaroid-studio-recent');
      if (storedRecent) {
        try {
          const parsed = JSON.parse(storedRecent) as Array<ImageAsset | StoredImageRef>;
          const refs = await Promise.all(
            parsed.map((item) =>
              'dataUrl' in item ? saveImageAsset(item) : Promise.resolve(item)
            )
          );
          const assets = await loadImageAssets(refs);
          if (!cancelled) {
            setRecentImageRefs(refs);
            setRecentImages(assets);
          }
          window.localStorage.setItem('polaroid-studio-recent', JSON.stringify(refs));
        } catch {
          window.localStorage.removeItem('polaroid-studio-recent');
        }
      }

      const storedProject = window.localStorage.getItem('polaroid-studio-project');
      if (storedProject) {
        try {
          const project = JSON.parse(storedProject) as
            | StoredPolaroidProject
            | PolaroidProject;
          setSettings({ ...defaultSettings, ...project.settings });
          setActivePresetId(project.activePresetId || 'custom');

          const projectImageRef =
            'imageRef' in project
              ? project.imageRef
              : project.image
                ? await saveImageAsset(project.image)
                : null;
          const asset = await loadImageAsset(projectImageRef);
          if (!cancelled && asset && projectImageRef) {
            setImageRef(projectImageRef);
            setImageAsset(asset);
            setBatchImages([asset]);
            setBatchImageRefs([projectImageRef]);
            setStatus(
              language === 'ko'
                ? `${asset.name} 복원됨`
                : `Restored ${asset.name}`
            );
          }
        } catch {
          window.localStorage.removeItem('polaroid-studio-project');
        }
      }

      if (!cancelled) {
        setStorageReady(true);
      }
    };

    void restoreStoredImages();

    return () => {
      cancelled = true;
    };
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
    window.localStorage.setItem('polaroid-studio-mobile-tab', activeMobileTab);
  }, [activeMobileTab]);

  useEffect(() => {
    window.localStorage.setItem(
      'polaroid-studio-mode',
      beginnerMode ? 'beginner' : 'advanced'
    );
  }, [beginnerMode]);

  useEffect(() => {
    window.localStorage.setItem('polaroid-studio-beginner-step', activeBeginnerStep);
  }, [activeBeginnerStep]);

  useEffect(() => {
    window.localStorage.setItem(
      'polaroid-studio-completed-steps',
      JSON.stringify(completedBeginnerSteps)
    );
  }, [completedBeginnerSteps]);

  useEffect(() => {
    if (beginnerMode && (activeMobileTab === 'look' || activeMobileTab === 'frame')) {
      setActiveMobileTab('quick');
    }
  }, [activeMobileTab, beginnerMode]);

  useEffect(() => {
    const updateMobilePreviewSize = () => {
      setMobilePreviewCompact(window.scrollY > 320);
    };

    updateMobilePreviewSize();
    window.addEventListener('scroll', updateMobilePreviewSize, { passive: true });
    return () => window.removeEventListener('scroll', updateMobilePreviewSize);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      'polaroid-studio-custom-presets',
      JSON.stringify(customPresets)
    );
  }, [customPresets]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(
      'polaroid-studio-recent',
      JSON.stringify(recentImageRefs)
    );
  }, [recentImageRefs, storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    const project: StoredPolaroidProject = {
      imageRef,
      settings,
      activePresetId,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem('polaroid-studio-project', JSON.stringify(project));
  }, [imageRef, settings, activePresetId, storageReady]);

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
  const exportChecklist = [
    {
      label: t.checklist.photoPositioned,
      done: Boolean(hasImage && imageElement),
    },
    {
      label: t.checklist.captionLooksRight,
      done: settings.captionText.trim().length > 0,
    },
    {
      label: t.checklist.sizeSelected,
      done: Boolean(exportSizeId),
    },
  ];
  const renderSeed = useMemo(() => {
    if (imageRef) {
      return imageRef.id;
    }

    if (imageAsset) {
      return `${imageAsset.name}:${imageAsset.dataUrl.length}:${imageAsset.dataUrl.slice(0, 160)}`;
    }

    return 'empty';
  }, [imageAsset, imageRef]);
  const presetPreviewBaseSettings = useMemo(
    () => ({
      ...defaultSettings,
      cropZoom: settings.cropZoom,
      cropX: settings.cropX,
      cropY: settings.cropY,
      cropRotation: settings.cropRotation,
      flipX: settings.flipX,
      flipY: settings.flipY,
    }),
    [
      settings.cropRotation,
      settings.cropX,
      settings.cropY,
      settings.cropZoom,
      settings.flipX,
      settings.flipY,
    ]
  );

  useEffect(() => {
    if (!imageElement || !hasImage) {
      setPresetPreviewUrls({});
      return;
    }

    const previews: Record<string, string> = {};
    allPresets.forEach((preset) => {
      const canvas = document.createElement('canvas');
      renderPolaroid(
        canvas,
        imageElement,
        {
          ...settings,
          ...presetPreviewBaseSettings,
          ...preset.settings,
          captionText: '',
          watermarkText: '',
          rotation: 0,
        },
        {
          scale: 0.13,
          applyEffects: true,
          seed: `${renderSeed}:${preset.id}:preview`,
        }
      );
      previews[preset.id] = canvas.toDataURL('image/jpeg', 0.78);
    });
    setPresetPreviewUrls(previews);
  }, [allPresets, hasImage, imageElement, presetPreviewBaseSettings, renderSeed]);

  useEffect(() => {
    let cancelled = false;
    const buildSamplePreviews = async () => {
      const dataUrl = createDemoPhotoDataUrl();
      if (!dataUrl) {
        return;
      }

      const sampleImage = await loadImage(dataUrl);
      if (cancelled) {
        return;
      }

      const previews: Record<string, string> = {};
      allPresets.slice(0, 5).forEach((preset) => {
        const canvas = document.createElement('canvas');
        renderPolaroid(
          canvas,
          sampleImage,
          {
            ...defaultSettings,
            ...preset.settings,
            captionText: '',
            watermarkText: '',
            rotation: 0,
          },
          {
            scale: 0.13,
            applyEffects: true,
            seed: `sample:${preset.id}:preview`,
          }
        );
        previews[preset.id] = canvas.toDataURL('image/jpeg', 0.78);
      });

      if (!cancelled) {
        setSamplePresetPreviewUrls(previews);
      }
    };

    void buildSamplePreviews();
    return () => {
      cancelled = true;
    };
  }, [allPresets]);

  useEffect(() => {
    if (!imageElement || !hasImage) {
      setExportPreviewUrl('');
      return;
    }

    const canvas = document.createElement('canvas');
    renderPolaroid(canvas, imageElement, settings, {
      scale: 0.18,
      applyEffects: true,
      seed: `${renderSeed}:export-preview`,
    });
    setExportPreviewUrl(canvas.toDataURL('image/png'));
  }, [hasImage, imageElement, renderSeed, settings]);
  const mobileTabs: { id: MobileTab; label: string }[] = beginnerMode
    ? [
        { id: 'quick', label: t.beginnerSteps.look },
        { id: 'crop', label: t.beginnerSteps.crop },
        { id: 'caption', label: t.beginnerSteps.caption },
        { id: 'export', label: t.beginnerSteps.export },
      ]
    : [
        { id: 'quick', label: t.quickMode },
        { id: 'crop', label: t.crop },
        { id: 'look', label: t.analogLooks },
        { id: 'frame', label: t.frameTheme },
        { id: 'caption', label: t.captionText },
        { id: 'export', label: t.export },
      ];
  const mobilePanelClass = `rounded-[22px] border p-4 backdrop-blur-xl ${shellClass}`;
  const mobileChipClass = `snap-start scroll-mt-[420px] whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition`;
  const secondaryButtonClass = `rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
    darkMode
      ? 'border-stone-700 bg-stone-900 text-stone-100 hover:border-stone-500 hover:bg-stone-800'
      : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'
  }`;
  const quickFlow: { id: MobileTab; label: string }[] = [
    { id: 'quick', label: hasImage ? t.quickSteps.look : t.quickSteps.choose },
    { id: 'crop', label: t.quickSteps.crop },
    { id: 'caption', label: t.quickSteps.caption },
    { id: 'export', label: t.quickSteps.export },
  ];
  const beginnerSteps: { id: BeginnerStep; label: string; description: string }[] =
    beginnerStepIds.map((id) => ({
      id,
      label: t.beginnerSteps[id],
      description: t.stepDescriptions[id],
    }));
  const activeBeginnerStepIndex = Math.max(
    beginnerSteps.findIndex((step) => step.id === activeBeginnerStep),
    0
  );
  const nextBeginnerStep =
    beginnerSteps[
      Math.min(activeBeginnerStepIndex + 1, beginnerSteps.length - 1)
    ];
  const nextBeginnerCtaLabel =
    activeBeginnerStep === 'export'
      ? t.exportPng
      : hasImage
        ? t.nextStep(nextBeginnerStep.label)
        : t.startWithPhoto;
  const quickStepIndex = Math.max(
    quickFlow.findIndex((step) => step.id === activeMobileTab),
    0
  );
  const nextQuickStep = quickFlow[Math.min(quickStepIndex + 1, quickFlow.length - 1)];
  const batchProgressPercent = batchProgress
    ? Math.round((batchProgress.completed / Math.max(batchProgress.total, 1)) * 100)
    : 0;
  const batchProgressMessage = batchProgress
    ? language === 'ko'
      ? `${batchProgress.completed}/${batchProgress.total} ${batchProgress.format.toUpperCase()} 렌더링됨`
      : `${batchProgress.completed}/${batchProgress.total} ${batchProgress.format.toUpperCase()} rendered`
    : '';

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
    (type: SoundType) => {
      const context = getAudioContext();
      if (!context) {
        return;
      }

      const now = context.currentTime;
      const output = context.createGain();
      output.connect(context.destination);

      const tone = (
        frequency: number,
        start: number,
        duration: number,
        gainValue: number,
        oscillatorType: OscillatorType = 'sine',
        endFrequency?: number
      ) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = oscillatorType;
        oscillator.frequency.setValueAtTime(frequency, start);
        if (endFrequency) {
          oscillator.frequency.exponentialRampToValueAtTime(
            endFrequency,
            start + duration * 0.72
          );
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(output);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.015);
      };

      const noiseBurst = (
        start: number,
        duration: number,
        gainValue: number,
        filterType: BiquadFilterType,
        filterFrequency: number
      ) => {
        const length = Math.floor(context.sampleRate * duration);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const channel = buffer.getChannelData(0);

        for (let index = 0; index < length; index += 1) {
          const decay = 1 - index / length;
          channel[index] = (Math.random() * 2 - 1) * decay * decay;
        }

        const noise = context.createBufferSource();
        const noiseGain = context.createGain();
        const filter = context.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(filterFrequency, start);
        noise.buffer = buffer;
        noiseGain.gain.setValueAtTime(0.0001, start);
        noiseGain.gain.exponentialRampToValueAtTime(gainValue, start + 0.008);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        noise.connect(filter).connect(noiseGain).connect(output);
        noise.start(start);
        noise.stop(start + duration + 0.01);
      };

      const twoTone = (
        frequencies: [number, number],
        gainValue: number,
        duration = 0.12
      ) => {
        frequencies.forEach((frequency, index) => {
          tone(frequency, now + index * 0.07, duration, gainValue);
        });
      };

      if (type === 'click') {
        tone(620, now, 0.08, 0.05, 'triangle', 380);
      } else if (type === 'success') {
        twoTone([540, 780], 0.045);
      } else if (type === 'tick') {
        tone(960, now, 0.04, 0.024, 'sine', 680);
      } else if (type === 'dragStart') {
        noiseBurst(now, 0.045, 0.035, 'bandpass', 1200);
        tone(180, now, 0.05, 0.018, 'triangle', 130);
      } else if (type === 'dragEnd') {
        noiseBurst(now, 0.055, 0.025, 'lowpass', 900);
        tone(240, now, 0.06, 0.018, 'triangle', 170);
      } else if (type === 'undo') {
        twoTone([520, 360], 0.035, 0.09);
      } else if (type === 'redo') {
        twoTone([360, 520], 0.035, 0.09);
      } else if (type === 'error') {
        tone(180, now, 0.11, 0.045, 'sawtooth', 150);
        tone(112, now + 0.035, 0.09, 0.03, 'square', 96);
      } else if (type === 'snap') {
        noiseBurst(now, 0.08, 0.08, 'highpass', 1300);
        tone(720, now, 0.045, 0.025, 'triangle', 420);
      } else {
        noiseBurst(now, 0.12, 0.16, 'highpass', 900);
        [140, 96].forEach((frequency, index) => {
          tone(frequency, now + index * 0.035, 0.05, 0.04, 'square');
        });
      }
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
        setLastExport(null);
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
      playSound('undo');
      return {
        past: currentHistory.past.slice(0, -1),
        future: [settings, ...currentHistory.future].slice(0, 40),
      };
    });
  }, [playSound, settings]);

  const redoSettings = useCallback(() => {
    setHistory((currentHistory) => {
      const next = currentHistory.future[0];
      if (!next) {
        return currentHistory;
      }

      setSettings(next);
      setActivePresetId('custom');
      playSound('redo');
      return {
        past: [...currentHistory.past, settings].slice(-40),
        future: currentHistory.future.slice(1),
      };
    });
  }, [playSound, settings]);

  const rememberImage = useCallback((asset: ImageAsset, ref: StoredImageRef) => {
    setRecentImages((current) =>
      [
        asset,
        ...current.filter((item) => item.dataUrl !== asset.dataUrl),
      ].slice(0, 4)
    );
    setRecentImageRefs((current) =>
      [
        ref,
        ...current.filter((item) => item.id !== ref.id),
      ].slice(0, 4)
    );
  }, []);

  const markBeginnerStepComplete = useCallback((step: BeginnerStep) => {
    setCompletedBeginnerSteps((current) =>
      current.includes(step) ? current : [...current, step]
    );
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
    markBeginnerStepComplete('look');
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
      const refs = await Promise.all(assets.map(saveImageAsset));
      const [asset] = assets;
      const [ref] = refs;
      setBatchImages(assets);
      setBatchImageRefs(refs);
      setImageAsset(asset);
      setImageRef(ref);
      setLastExport(null);
      markBeginnerStepComplete('choose');
      setActiveBeginnerStep('look');
      setActiveMobileTab('quick');
      assets.forEach((item, index) => rememberImage(item, refs[index]));
      setError(null);
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
      playSound('error');
    }
  };

  const openNativePicker = async () => {
    try {
      if (!window.electronAPI?.openImages) {
        setStatus(
          language === 'ko'
            ? '파일 선택 버튼을 사용해 사진을 가져오세요.'
            : 'Use Choose Photo to import photos on this platform.'
        );
        return;
      }

      const results = await window.electronAPI?.openImages();
      if (!results || results.length === 0) {
        return;
      }

      const refs = await Promise.all(results.map(saveImageAsset));
      setBatchImages(results);
      setBatchImageRefs(refs);
      setImageAsset(results[0]);
      setImageRef(refs[0]);
      setLastExport(null);
      markBeginnerStepComplete('choose');
      setActiveBeginnerStep('look');
      setActiveMobileTab('quick');
      results.forEach((item, index) => rememberImage(item, refs[index]));
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
      playSound('error');
    }
  };

  const startFilePicker = () => {
    const input = document.getElementById(uploadInputId) as HTMLInputElement | null;
    if (input) {
      input.click();
      return;
    }

    void openNativePicker();
  };

  const loadDemoPhoto = async (presetId?: string) => {
    const dataUrl = createDemoPhotoDataUrl();
    if (!dataUrl) {
      return;
    }
    const asset: ImageAsset = {
      name: 'sample-sunset.png',
      dataUrl,
    };
    const ref = await saveImageAsset(asset);
    setBatchImages([asset]);
    setBatchImageRefs([ref]);
    setImageAsset(asset);
    setImageRef(ref);
    setLastExport(null);
    rememberImage(asset, ref);
    markBeginnerStepComplete('choose');
    setActiveBeginnerStep('look');
    setActiveMobileTab('quick');
    if (presetId) {
      const preset = allPresets.find((item) => item.id === presetId);
      if (preset) {
        commitSettings((current) => ({
          ...current,
          ...preset.settings,
        }), presetId);
        markBeginnerStepComplete('look');
      }
    }
    setStatus(language === 'ko' ? '샘플 사진을 불러왔습니다.' : 'Loaded the sample photo.');
    playSound('shutter');
  };

  const renderAssetBlob = async (
    asset: ImageAsset,
    format: ExportFormat,
    fallbackImage?: HTMLImageElement | null
  ) => {
    const seed =
      asset.dataUrl === imageAsset?.dataUrl
        ? renderSeed
        : `${asset.name}:${asset.dataUrl.length}:${asset.dataUrl.slice(0, 160)}`;

    try {
      return await renderExportBlobInWorker(
        asset,
        settings,
        format,
        exportSettings,
        seed
      );
    } catch {
      const image = fallbackImage ?? (await loadImage(asset.dataUrl));
      return exportCanvasBlob(image, settings, format, exportSettings, seed);
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
      const blob = await renderAssetBlob(
        imageAsset ?? {
          name: 'polaroid',
          dataUrl: imageElement.src,
        },
        format,
        imageElement
      );
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      const cleanName = cleanExportName(imageAsset?.name || 'polaroid');
      const filename = `${cleanName || 'polaroid-studio'}-${Date.now()}.${format}`;
      const exportResult = {
        format,
        filename,
        width: exportMeta.width,
        height: exportMeta.height,
      };

      if (!window.electronAPI?.saveImage) {
        downloadBlob(blob, filename);
        setStatus(language === 'ko' ? `${filename} 다운로드됨` : `Downloaded ${filename}`);
        setLastExport(exportResult);
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
        setLastExport({
          ...exportResult,
          filename: result.filePath ?? filename,
        });
        playSound('success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
      setStatus(language === 'ko' ? '내보내기에 실패했습니다.' : 'Export failed.');
      playSound('error');
    } finally {
      setBusy(false);
    }
  };

  const renderAssetBytes = async (asset: ImageAsset, format: ExportFormat) => {
    const blob = await renderAssetBlob(asset, format);
    return new Uint8Array(await blob.arrayBuffer());
  };

  const cancelBatchExport = () => {
    batchCancelRef.current = true;
    setStatus(language === 'ko' ? '일괄 내보내기를 취소하는 중...' : 'Canceling batch export...');
  };

  const exportBatch = async (format: ExportFormat) => {
    if (batchImages.length === 0) {
      return;
    }

    try {
      setBusy(true);
      batchCancelRef.current = false;
      setBatchProgress({
        active: true,
        format,
        completed: 0,
        total: batchImages.length,
        failures: [],
      });
      setStatus(
        language === 'ko'
          ? `${format.toUpperCase()} 파일 ${batchImages.length}개를 렌더링 중...`
          : `Rendering ${batchImages.length} ${format.toUpperCase()} files...`
      );
      const usedNames = new Set<string>();
      const files: { suggestedName: string; data: Uint8Array }[] = [];
      const failures: BatchFailure[] = [];
      for (let index = 0; index < batchImages.length; index += 1) {
        if (batchCancelRef.current) {
          break;
        }

        const asset = batchImages[index];
        try {
          const data = await renderAssetBytes(asset, format);
          const baseName = cleanExportName(asset.name) || 'polaroid';
          let suggestedName = `${baseName}-${index + 1}.${format}`;
          let duplicateIndex = 2;
          while (usedNames.has(suggestedName)) {
            suggestedName = `${baseName}-${index + 1}-${duplicateIndex}.${format}`;
            duplicateIndex += 1;
          }
          usedNames.add(suggestedName);
          files.push({ suggestedName, data });
        } catch (err) {
          failures.push({
            name: asset.name,
            error: err instanceof Error ? err.message : 'Render failed.',
          });
        } finally {
          setBatchProgress({
            active: true,
            format,
            completed: index + 1,
            total: batchImages.length,
            failures: [...failures],
          });
        }
      }

      if (batchCancelRef.current) {
        setStatus(
          language === 'ko'
            ? `${files.length}개 파일 렌더링 후 취소되었습니다.`
            : `Canceled after rendering ${files.length} files.`
        );
        return;
      }

      if (files.length === 0) {
        throw new Error('No files could be rendered for batch export.');
      }

      if (!window.electronAPI?.saveImagesToFolder) {
        const zipBlob = createZipBlob(
          files.map((file) => ({
            name: file.suggestedName,
            data: file.data,
          }))
        );
        downloadBlob(zipBlob, `polaroid-studio-${Date.now()}.zip`);
        setStatus(
          language === 'ko'
            ? `${files.length}개 파일을 ZIP으로 다운로드했습니다.`
            : `Downloaded ${files.length} files as a ZIP.`
        );
        playSound('success');
        return;
      }

      const result = await window.electronAPI?.saveImagesToFolder({
        files: files.map((file) => ({
          suggestedName: file.suggestedName,
          data: Array.from(file.data),
        })),
      });
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
      playSound('error');
    } finally {
      setBusy(false);
      batchCancelRef.current = false;
      setBatchProgress((current) =>
        current
          ? {
              ...current,
              active: false,
            }
          : null
      );
    }
  };

  const copyCurrentImage = async () => {
    if (!imageElement) {
      return;
    }

    try {
      const blob = await renderAssetBlob(
        imageAsset ?? {
          name: 'polaroid',
          dataUrl: imageElement.src,
        },
        'png',
        imageElement
      );
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
      playSound('error');
    }
  };

  const startDragExport = async () => {
    if (!imageElement) {
      return;
    }

    const blob = await renderAssetBlob(
      imageAsset ?? {
        name: 'polaroid',
        dataUrl: imageElement.src,
      },
      'png',
      imageElement
    );
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
    playSound('snap');
  };

  const startAnotherPhoto = () => {
    setImageAsset(null);
    setImageElement(null);
    setImageRef(null);
    setBatchImages([]);
    setBatchImageRefs([]);
    setLastExport(null);
    setActiveBeginnerStep('choose');
    setActiveMobileTab('quick');
    setStatus(
      language === 'ko' ? '시작하려면 사진을 가져오세요.' : 'Import a photo to begin.'
    );
    playSound('click');
  };

  const fitCrop = () => {
    updateSetting('cropZoom', 1);
    playSound('snap');
  };
  const fillCrop = () => {
    updateSetting('cropZoom', 1.6);
    playSound('snap');
  };
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
    playSound('snap');
  };

  const autoMakeItGood = () => {
    if (!imageElement) {
      startFilePicker();
      return;
    }

    const classicPreset = presets.find((preset) => preset.id === 'classic');
    commitSettings((current) => ({
      ...current,
      ...(classicPreset?.settings ?? {}),
      cropZoom: getAutoCropZoom(imageElement, current),
      cropX: 0,
      cropY: 0,
      cropRotation: 0,
      flipX: false,
      flipY: false,
      frameTheme: 'white',
      overlay: 'none',
      captionFontSize: 26,
      watermarkOpacity: 32,
    }), 'classic');
    setExportSizeId('print');
    setActiveBeginnerStep('caption');
    setActiveMobileTab('caption');
    setStatus(
      language === 'ko'
        ? '깔끔한 기본 폴라로이드 룩을 적용했습니다.'
        : 'Applied a clean beginner-friendly Polaroid look.'
    );
    playSound('success');
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
      playSound('error');
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

  const advanceMobileQuickFlow = () => {
    if (!hasImage) {
      startFilePicker();
      return;
    }

    if (activeMobileTab === 'export' || quickStepIndex === quickFlow.length - 1) {
      void exportImage('png');
      return;
    }

    playSound('tick');
    setActiveMobileTab(nextQuickStep.id);
  };

  const selectBeginnerStep = (step: BeginnerStep) => {
    if (step !== activeBeginnerStep) {
      playSound('tick');
    }
    setActiveBeginnerStep(step);
    if (step === 'choose') {
      setActiveMobileTab('quick');
    } else if (step === 'look') {
      setActiveMobileTab('quick');
    } else {
      setActiveMobileTab(step);
    }
  };

  const advanceBeginnerFlow = () => {
    if (!hasImage) {
      startFilePicker();
      return;
    }

    markBeginnerStepComplete(activeBeginnerStep);
    if (activeBeginnerStep === 'export') {
      void exportImage('png');
      return;
    }

    selectBeginnerStep(nextBeginnerStep.id);
  };

  const runGuideAction = (step: BeginnerStep) => {
    selectBeginnerStep(step);
    if (step === 'choose') {
      startFilePicker();
    }
  };

  const toggleBeginnerMode = () => {
    setBeginnerMode((current) => !current);
    playSound('tick');
  };

  const chooseLanguage = (nextLanguage: Language) => {
    if (nextLanguage !== language) {
      playSound('tick');
    }
    setLanguage(nextLanguage);
  };

  const toggleDarkMode = () => {
    playSound('tick');
    setDarkMode((current) => !current);
  };

  const toggleSound = () => {
    if (soundEnabled) {
      playSound('tick');
    }
    setSoundEnabled((current) => !current);
  };

  const selectMobileTab = (tab: MobileTab) => {
    if (tab !== activeMobileTab) {
      playSound('tick');
    }
    setActiveMobileTab(tab);
    if (beginnerMode) {
      if (tab === 'quick' || tab === 'look' || tab === 'frame') {
        setActiveBeginnerStep('look');
      } else {
        setActiveBeginnerStep(tab);
      }
    }
  };

  const selectPreviewMode = (mode: 'final' | 'before' | 'split') => {
    if (mode !== previewMode) {
      playSound('tick');
    }
    setPreviewMode(mode);
  };

  const selectExportSize = (optionId: string) => {
    if (optionId !== exportSizeId) {
      playSound('tick');
    }
    setExportSizeId(optionId);
  };

  const selectFrameTheme = (theme: PolaroidSettings['frameTheme']) => {
    if (theme !== settings.frameTheme) {
      playSound('tick');
    }
    updateSetting('frameTheme', theme);
  };

  const toggleCropFlip = (axis: 'flipX' | 'flipY') => {
    updateSetting(axis, !settings[axis]);
    playSound('snap');
  };

  const dropzoneCopy = {
    ...t.dropzone,
    title: hasImage ? t.dropzone.title : t.startWithPhoto,
    chooseFiles: hasImage ? t.dropzone.chooseFiles : t.startWithPhoto,
  };
  const renderExportSuccessPanel = () => lastExport ? (
    <div className={`rounded-[22px] border px-4 py-4 text-sm shadow-[0_18px_40px_rgba(28,20,12,0.08)] ${
      darkMode
        ? 'border-emerald-400/20 bg-emerald-950/18 text-emerald-100'
        : 'border-emerald-200 bg-emerald-50/90 text-emerald-900'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">
            {t.exported}
          </p>
          <p className="mt-1 text-base font-semibold">
            {lastExport.format.toUpperCase()} · {lastExport.width} x {lastExport.height}
          </p>
          <p className={`mt-1 max-w-full truncate text-xs ${darkMode ? 'text-emerald-200/75' : 'text-emerald-800/70'}`}>
            {lastExport.filename}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              darkMode
                ? 'border-emerald-300/30 bg-emerald-950/40 text-emerald-100 hover:bg-emerald-900/45'
                : 'border-emerald-200 bg-white/75 text-emerald-900 hover:bg-white'
            }`}
            type="button"
            onClick={copyCurrentImage}
          >
            {t.copyPng}
          </button>
          <button
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              darkMode
                ? 'border-stone-700 bg-stone-900 text-stone-100 hover:bg-stone-800'
                : 'border-stone-300 bg-white/75 text-stone-700 hover:bg-white'
            }`}
            type="button"
            onClick={startAnotherPhoto}
          >
            {t.makeAnother}
          </button>
        </div>
      </div>
    </div>
  ) : null;

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
        startFilePicker();
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
  }, [exportImage, redoSettings, startFilePicker, undoSettings]);

  return (
    <div
      className={`min-h-screen px-4 py-4 lg:px-6 ${
        darkMode
          ? 'bg-[radial-gradient(circle_at_top,_rgba(74,74,82,0.32),transparent_28%),linear-gradient(140deg,_#09090b_0%,_#11131a_45%,_#1b160f_100%)] text-stone-100'
          : 'bg-grain text-ink'
      }`}
    >
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1700px] grid-cols-1 gap-4 2xl:grid-cols-[360px_minmax(540px,1fr)_360px]">
        <aside
          aria-label="Editor controls"
          className={`scrollbar-soft flex flex-col gap-3 overflow-y-visible rounded-[24px] border p-4 backdrop-blur-xl sm:gap-4 sm:rounded-[32px] sm:p-5 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto ${shellClass}`}
        >
          <div>
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] p-1.5 ring-1 sm:h-20 sm:w-20 sm:rounded-[24px] sm:p-2 ${
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
                <div className="min-w-0">
                  <p className={`text-[10px] uppercase tracking-[0.22em] sm:text-xs sm:tracking-[0.3em] ${mutedTextClass}`}>
                    Polaroid Studio
                  </p>
                  <h1 className="mt-1 text-xl font-semibold leading-tight sm:mt-2 sm:text-3xl">{t.heroTitle}</h1>
                </div>
              </div>
              <details className="group relative z-[90] sm:hidden">
                <summary aria-label="Mobile settings" className={`flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border text-lg font-semibold [&::-webkit-details-marker]:hidden ${
                  darkMode
                    ? 'border-stone-700 bg-stone-900 text-stone-100'
                    : 'border-stone-300 bg-white/80 text-stone-700'
                }`}>
                  ?
                </summary>
                <div className={`absolute right-0 top-12 z-[90] w-44 space-y-2 rounded-2xl border p-2 shadow-panel ${
                  darkMode ? 'border-stone-700 bg-stone-950' : 'border-stone-200 bg-white'
                }`}>
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
                        onClick={() => chooseLanguage(nextLanguage)}
                        type="button"
                        title={t.language}
                      >
                        {nextLanguage === 'ko' ? 'KO' : 'EN'}
                      </button>
                    ))}
                  </div>
                  <button
                    className={`w-full rounded-full border px-4 py-2 text-sm font-medium transition ${
                      darkMode
                        ? 'border-stone-700 bg-stone-900 text-stone-100 hover:bg-stone-800'
                        : 'border-stone-300 bg-white/70 text-stone-700 hover:bg-white'
                    }`}
                    onClick={toggleDarkMode}
                    type="button"
                  >
                    {darkMode ? t.lightMode : t.darkMode}
                  </button>
                  <button
                    className={`w-full rounded-full border px-4 py-2 text-sm font-medium transition ${
                      soundEnabled
                        ? darkMode
                          ? 'border-accent bg-accent/15 text-orange-200 hover:bg-accent/20'
                          : 'border-accent bg-accentSoft text-accent hover:bg-orange-100'
                        : darkMode
                          ? 'border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800'
                          : 'border-stone-300 bg-white/70 text-stone-600 hover:bg-white'
                    }`}
                    onClick={toggleSound}
                    type="button"
                  >
                    {soundEnabled ? t.soundOn : t.soundOff}
                  </button>
                  <div className={`grid grid-cols-2 gap-1 rounded-full border p-1 text-xs ${darkMode ? 'border-stone-700 bg-stone-900' : 'border-stone-300 bg-white/70'}`}>
                    <button
                      className={`rounded-full px-2 py-1.5 font-semibold transition ${
                        beginnerMode
                          ? darkMode
                            ? 'bg-accent text-white'
                            : 'bg-ink text-white'
                          : darkMode
                            ? 'text-stone-300 hover:bg-stone-800'
                            : 'text-stone-600 hover:bg-stone-100'
                      }`}
                      type="button"
                      onClick={() => {
                        if (!beginnerMode) {
                          toggleBeginnerMode();
                        }
                      }}
                    >
                      {t.beginnerMode}
                    </button>
                    <button
                      className={`rounded-full px-2 py-1.5 font-semibold transition ${
                        !beginnerMode
                          ? darkMode
                            ? 'bg-accent text-white'
                            : 'bg-ink text-white'
                          : darkMode
                            ? 'text-stone-300 hover:bg-stone-800'
                            : 'text-stone-600 hover:bg-stone-100'
                      }`}
                      type="button"
                      onClick={() => {
                        if (beginnerMode) {
                          toggleBeginnerMode();
                        }
                      }}
                    >
                      {t.advancedMode}
                    </button>
                  </div>
                </div>
              </details>
              <div className="hidden flex-col gap-2 sm:flex">
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
                      onClick={() => chooseLanguage(nextLanguage)}
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
                  onClick={toggleDarkMode}
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
                  onClick={toggleSound}
                  type="button"
                >
                  {soundEnabled ? t.soundOn : t.soundOff}
                </button>
              </div>
            </div>
            <p className={`mt-2 hidden text-sm leading-6 sm:block ${bodyTextClass}`}>
              {t.heroDescription}
            </p>
            {beginnerMode && !hasImage ? null : (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className={`rounded-full px-5 py-3 text-sm font-semibold text-white transition ${
                    darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
                  }`}
                  type="button"
                  onClick={hasImage ? () => selectBeginnerStep('look') : startFilePicker}
                >
                  {hasImage ? t.pickALook : t.startWithPhoto}
                </button>
                <button
                  className={`rounded-full border px-5 py-3 text-sm font-semibold transition ${
                    darkMode
                      ? 'border-stone-700 bg-stone-900 text-stone-100 hover:bg-stone-800'
                      : 'border-stone-300 bg-white/70 text-stone-700 hover:bg-white'
                  }`}
                  type="button"
                  onClick={() => loadDemoPhoto()}
                >
                  {t.tryDemoPhoto}
                </button>
              </div>
            )}
            <div className={`mt-3 grid grid-cols-2 gap-1 rounded-full border p-1 text-xs ${darkMode ? 'border-stone-700 bg-stone-900' : 'border-stone-300 bg-white/70'}`}>
              <button
                className={`rounded-full px-3 py-2 font-semibold transition ${
                  beginnerMode
                    ? darkMode
                      ? 'bg-accent text-white'
                      : 'bg-ink text-white'
                    : darkMode
                      ? 'text-stone-300 hover:bg-stone-800'
                      : 'text-stone-600 hover:bg-stone-100'
                }`}
                type="button"
                onClick={() => {
                  if (!beginnerMode) {
                    toggleBeginnerMode();
                  }
                }}
              >
                {t.beginnerMode}
              </button>
              <button
                className={`rounded-full px-3 py-2 font-semibold transition ${
                  !beginnerMode
                    ? darkMode
                      ? 'bg-accent text-white'
                      : 'bg-ink text-white'
                    : darkMode
                      ? 'text-stone-300 hover:bg-stone-800'
                      : 'text-stone-600 hover:bg-stone-100'
                }`}
                type="button"
                onClick={() => {
                  if (beginnerMode) {
                    toggleBeginnerMode();
                  }
                }}
              >
                {t.advancedMode}
              </button>
            </div>
            <p className={`mt-2 text-xs leading-5 ${mutedTextClass}`}>
              {t.modeHint}
            </p>
          </div>

            <Dropzone
              inputId={uploadInputId}
              onSelectFiles={importFirstFile}
              onOpenNativeDialog={openNativePicker}
              darkMode={darkMode}
              copy={dropzoneCopy}
              compact={hasImage}
              inputOnly={beginnerMode && !hasImage}
            />

          {batchImages.length > 1 ? (
            <div className={`rounded-[26px] border p-4 ${surfaceClass}`}>
              <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>
                {t.batchQueue}: {batchImages.length} {t.photos}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {batchImages.slice(0, 8).map((asset, index) => (
                  <button
                    key={`${asset.name}-${asset.dataUrl.slice(0, 20)}`}
                    className={`overflow-hidden rounded-xl border ${imageAsset?.dataUrl === asset.dataUrl ? 'border-accent' : darkMode ? 'border-stone-700' : 'border-stone-200'}`}
                    type="button"
                    onClick={() => {
                      setImageAsset(asset);
                      setImageRef(batchImageRefs[index] ?? null);
                    }}
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

          <div className={`hidden space-y-5 rounded-[28px] border p-4 ${beginnerMode ? 'lg:hidden' : 'lg:block'} ${surfaceClass}`}>
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
                [t.flipH, () => toggleCropFlip('flipX')],
                [t.flipV, () => toggleCropFlip('flipY')],
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

          <div className={`hidden space-y-5 rounded-[28px] border p-4 ${beginnerMode ? 'lg:hidden' : 'lg:block'} ${surfaceClass}`}>
            <div>
              <h2 className={`text-sm font-semibold uppercase tracking-[0.24em] ${mutedTextClass}`}>
                {t.toneFrame}
              </h2>
            </div>
            <SliderControl
              label={t.brightness}
              tooltip={t.controlTooltips.brightness}
              value={settings.brightness}
              min={70}
              max={140}
              onChange={(value) => updateSetting('brightness', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.contrast}
              tooltip={t.controlTooltips.contrast}
              value={settings.contrast}
              min={60}
              max={130}
              onChange={(value) => updateSetting('contrast', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.saturation}
              tooltip={t.controlTooltips.saturation}
              value={settings.saturation}
              min={40}
              max={140}
              onChange={(value) => updateSetting('saturation', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.warmth}
              description={t.sliderHelp.warmth}
              value={settings.warmth}
              min={0}
              max={45}
              onChange={(value) => updateSetting('warmth', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.fade}
              description={t.sliderHelp.fade}
              value={settings.fade}
              min={0}
              max={45}
              onChange={(value) => updateSetting('fade', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.grain}
              description={t.sliderHelp.grain}
              value={settings.grain}
              min={0}
              max={30}
              onChange={(value) => updateSetting('grain', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.vignette}
              description={t.sliderHelp.vignette}
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
                    onClick={() => selectFrameTheme(theme.id)}
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
                onChange={(event) => {
                  const nextOverlay = event.target.value as PolaroidSettings['overlay'];
                  if (nextOverlay !== settings.overlay) {
                    playSound('tick');
                  }
                  updateSetting('overlay', nextOverlay);
                }}
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
              tooltip={t.controlTooltips.border}
              value={settings.borderTop}
              min={2}
              max={30}
              onChange={(value) => updateSetting('borderTop', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.sideBorder}
              tooltip={t.controlTooltips.border}
              value={settings.borderSide}
              min={2}
              max={30}
              onChange={(value) => updateSetting('borderSide', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.bottomBorder}
              tooltip={t.controlTooltips.border}
              value={settings.borderBottom}
              min={8}
              max={50}
              onChange={(value) => updateSetting('borderBottom', value)}
              suffix="%"
              darkMode={darkMode}
            />
            <SliderControl
              label={t.shadow}
              tooltip={t.controlTooltips.shadow}
              value={settings.shadowIntensity}
              min={0}
              max={100}
              onChange={(value) => updateSetting('shadowIntensity', value)}
              darkMode={darkMode}
            />
            <SliderControl
              label={t.rotation}
              tooltip={t.controlTooltips.rotation}
              value={settings.rotation}
              min={-12}
              max={12}
              onChange={(value) => updateSetting('rotation', value)}
              suffix="°"
              darkMode={darkMode}
            />
          </div>
        </aside>

        <main className={`flex flex-col gap-4 pb-24 sm:pb-4 lg:min-h-[calc(100vh-2rem)] ${hasImage ? '' : 'order-2 lg:order-none'}`}>
          <div className={`sticky top-0 z-30 -mx-4 space-y-2 px-4 pb-3 pt-2 backdrop-blur-xl transition-all lg:static lg:mx-0 lg:space-y-3 lg:p-0 lg:backdrop-blur-0 ${
            hasImage && mobilePreviewCompact ? 'pt-1' : ''
          }`}>
          {beginnerMode && !hasImage ? null : (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[22px] border px-3 py-3 backdrop-blur-xl sm:rounded-[28px] sm:px-5 sm:py-4 ${shellClass}`}>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-full border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 sm:px-4 ${
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
                className={`rounded-full border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 sm:px-4 ${
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
            <div className="flex snap-x gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              {(['final', 'before', 'split'] as const).map((mode) => (
                <button
                  key={mode}
                  aria-label={t.previewModes[mode]}
                  className={`snap-start whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium capitalize transition sm:px-4 ${
                    previewMode === mode
                      ? darkMode
                        ? 'border-accent bg-accent/15 text-orange-200'
                        : 'border-accent bg-accentSoft text-accent'
                      : darkMode
                        ? 'border-stone-700 text-stone-200 hover:bg-stone-900'
                        : 'border-stone-300 text-stone-700 hover:bg-stone-50'
                  }`}
                  type="button"
                  title={t.previewModes[mode]}
                  onClick={() => selectPreviewMode(mode)}
                >
                  <span aria-hidden="true" className="sm:hidden">
                    {mode === 'final' ? '●' : mode === 'before' ? '○' : '◐'}
                  </span>
                  <span className="hidden sm:inline">{t.previewModes[mode]}</span>
                </button>
              ))}
            </div>
          </div>
          )}
          <PreviewStage
            image={imageElement}
            settings={settings}
            ready={hasImage}
            error={error}
            previewMode={previewMode}
            onCropPreview={previewCropDrag}
            onCropCommit={commitCropDrag}
            onSound={playSound}
            darkMode={darkMode}
            compact={hasImage && mobilePreviewCompact}
            seed={renderSeed}
            splitLabels={{
              before: t.previewModes.before,
              after: t.previewModes.final,
            }}
          />
          </div>

          <section aria-label="Mobile editor panel" className={`lg:hidden ${mobilePanelClass}`}>
            <div className="mb-4 overflow-x-auto pb-1" role="tablist" aria-label="Mobile editor sections">
              <div className="flex min-w-max snap-x gap-2">
                {mobileTabs.map((tab) => (
                  <button
                    key={tab.id}
                    aria-selected={activeMobileTab === tab.id}
                    role="tab"
                    className={`${mobileChipClass} ${
                      activeMobileTab === tab.id
                        ? darkMode
                          ? 'border-accent bg-accent/15 text-orange-200'
                          : 'border-accent bg-accentSoft text-accent'
                        : darkMode
                          ? 'border-stone-700 text-stone-200'
                          : 'border-stone-300 text-stone-700'
                    }`}
                    type="button"
                    onClick={() => selectMobileTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {activeMobileTab === 'quick' ? (
              <div className="space-y-4">
                <div>
                  <p className={`text-xs uppercase tracking-[0.18em] ${mutedTextClass}`}>
                    {beginnerMode ? t.guidedWorkflow : t.quickMode}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {hasImage ? t.quickPrompt : t.sampleLooks}
                  </h2>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {quickFlow.map((step, index) => (
                    <button
                      key={step.id}
                      className={`rounded-xl border px-2 py-2 text-[11px] font-semibold transition ${
                        index <= quickStepIndex
                          ? darkMode
                            ? 'border-accent bg-accent/15 text-orange-200'
                            : 'border-accent bg-accentSoft text-accent'
                          : darkMode
                            ? 'border-stone-700 text-stone-400'
                            : 'border-stone-200 text-stone-500'
                      }`}
                      type="button"
                      onClick={() => selectMobileTab(step.id)}
                    >
                      {step.label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-2">
                  {allPresets.slice(0, 4).map((preset) => (
                    <PresetButton
                      key={preset.id}
                      preset={preset}
                      active={activePresetId === preset.id}
                      onClick={() =>
                        hasImage ? applyPreset(preset.id) : loadDemoPhoto(preset.id)
                      }
                      darkMode={darkMode}
                      previewSrc={
                        hasImage
                          ? presetPreviewUrls[preset.id]
                          : samplePresetPreviewUrls[preset.id]
                      }
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button className={secondaryButtonClass} type="button" onClick={autoFitCrop}>
                    {t.autoFit}
                  </button>
                  <button className={secondaryButtonClass} type="button" onClick={beginnerMode ? autoMakeItGood : randomizeLook}>
                    {beginnerMode ? t.autoMakeGood : t.randomize}
                  </button>
                  <button
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-stone-600 ${
                      darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
                    }`}
                    onClick={advanceMobileQuickFlow}
                    disabled={busy}
                    type="button"
                  >
                    {hasImage ? t.next : t.startWithPhoto}
                  </button>
                </div>
              </div>
            ) : null}

            {activeMobileTab === 'crop' ? (
              <div className="space-y-5">
                {cropRatioMeta ? (
                  <p className={`text-sm leading-6 ${cropRatioMeta.isSquare ? bodyTextClass : darkMode ? 'text-orange-200' : 'text-amber-700'}`}>
                    {cropRatioMeta.isSquare
                      ? t.cropSquare
                      : t.cropDifferent(cropRatioMeta.originalRatio)}
                  </p>
                ) : null}
                <SliderControl label={t.zoom} value={settings.cropZoom} min={1} max={3} step={0.05} onChange={(value) => updateSetting('cropZoom', value)} suffix="x" darkMode={darkMode} />
                <SliderControl label={t.horizontal} value={settings.cropX} min={-100} max={100} onChange={(value) => updateSetting('cropX', value)} darkMode={darkMode} />
                <SliderControl label={t.vertical} value={settings.cropY} min={-100} max={100} onChange={(value) => updateSetting('cropY', value)} darkMode={darkMode} />
                {!beginnerMode ? (
                  <SliderControl label={t.cropRotation} value={settings.cropRotation} min={-45} max={45} onChange={(value) => updateSetting('cropRotation', value)} suffix="deg" darkMode={darkMode} />
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  {(beginnerMode
                    ? [
                        [t.autoFit, autoFitCrop],
                        [t.resetCrop, resetCrop],
                      ]
                    : [
                        [t.autoFit, autoFitCrop],
                        [t.fit, fitCrop],
                        [t.fill, fillCrop],
                        [t.flipH, () => toggleCropFlip('flipX')],
                        [t.flipV, () => toggleCropFlip('flipY')],
                        [t.resetCrop, resetCrop],
                      ]
                  ).map(([label, handler]) => (
                    <button key={label as string} className={secondaryButtonClass} type="button" onClick={handler as () => void}>
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeMobileTab === 'look' ? (
              <div className="space-y-5">
                <div className="grid gap-2">
                  {allPresets.map((preset) => (
                    <div key={preset.id} className="relative">
                      <PresetButton preset={preset} active={activePresetId === preset.id} onClick={() => applyPreset(preset.id)} darkMode={darkMode} previewSrc={presetPreviewUrls[preset.id]} />
                      {preset.id.startsWith('custom-') ? (
                        <button className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[11px] ${darkMode ? 'bg-stone-950/80 text-stone-300' : 'bg-white/80 text-stone-500'}`} type="button" onClick={() => deleteCustomPreset(preset.id)}>
                          {t.remove}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className={secondaryButtonClass} type="button" onClick={saveCustomPreset}>{t.savePreset}</button>
                  <button className={secondaryButtonClass} type="button" onClick={randomizeLook}>{t.randomize}</button>
                  <button className={secondaryButtonClass} type="button" onClick={importPresetFile}>{t.import}</button>
                  <button className={secondaryButtonClass} type="button" onClick={exportPresetFile}>{t.export}</button>
                </div>
                <SliderControl label={t.brightness} value={settings.brightness} min={70} max={140} onChange={(value) => updateSetting('brightness', value)} suffix="%" darkMode={darkMode} />
                <SliderControl label={t.contrast} value={settings.contrast} min={60} max={130} onChange={(value) => updateSetting('contrast', value)} suffix="%" darkMode={darkMode} />
                <SliderControl label={t.saturation} value={settings.saturation} min={40} max={140} onChange={(value) => updateSetting('saturation', value)} suffix="%" darkMode={darkMode} />
                <SliderControl label={t.warmth} description={t.sliderHelp.warmth} value={settings.warmth} min={0} max={45} onChange={(value) => updateSetting('warmth', value)} darkMode={darkMode} />
                <SliderControl label={t.fade} description={t.sliderHelp.fade} value={settings.fade} min={0} max={45} onChange={(value) => updateSetting('fade', value)} darkMode={darkMode} />
                <SliderControl label={t.grain} description={t.sliderHelp.grain} value={settings.grain} min={0} max={30} onChange={(value) => updateSetting('grain', value)} darkMode={darkMode} />
                <SliderControl label={t.vignette} description={t.sliderHelp.vignette} value={settings.vignette} min={0} max={35} onChange={(value) => updateSetting('vignette', value)} darkMode={darkMode} />
              </div>
            ) : null}

            {activeMobileTab === 'frame' ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.frameTheme}</div>
                  <div className="flex snap-x gap-2 overflow-x-auto pb-1">
                    {frameThemes.map((theme) => (
                      <button
                        key={theme.id}
                        className={`${mobileChipClass} ${
                          settings.frameTheme === theme.id
                            ? darkMode
                              ? 'border-accent bg-accent/15 text-orange-200'
                              : 'border-accent bg-accentSoft text-accent'
                            : darkMode
                              ? 'border-stone-700 text-stone-300'
                              : 'border-stone-300 text-stone-600'
                        }`}
                        type="button"
                        onClick={() => selectFrameTheme(theme.id)}
                      >
                        {t.frameThemes[theme.id]}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block space-y-2">
                  <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.overlay}</span>
                  <select className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`} value={settings.overlay} onChange={(event) => { const nextOverlay = event.target.value as PolaroidSettings['overlay']; if (nextOverlay !== settings.overlay) { playSound('tick'); } updateSetting('overlay', nextOverlay); }}>
                    {overlays.map((overlay) => (
                      <option key={overlay.id} value={overlay.id}>{t.overlays[overlay.id]}</option>
                    ))}
                  </select>
                </label>
                <SliderControl label={t.topBorder} value={settings.borderTop} min={2} max={30} onChange={(value) => updateSetting('borderTop', value)} suffix="%" darkMode={darkMode} />
                <SliderControl label={t.sideBorder} value={settings.borderSide} min={2} max={30} onChange={(value) => updateSetting('borderSide', value)} suffix="%" darkMode={darkMode} />
                <SliderControl label={t.bottomBorder} value={settings.borderBottom} min={8} max={50} onChange={(value) => updateSetting('borderBottom', value)} suffix="%" darkMode={darkMode} />
                <SliderControl label={t.shadow} value={settings.shadowIntensity} min={0} max={100} onChange={(value) => updateSetting('shadowIntensity', value)} darkMode={darkMode} />
                <SliderControl label={t.rotation} value={settings.rotation} min={-12} max={12} onChange={(value) => updateSetting('rotation', value)} suffix="°" darkMode={darkMode} />
              </div>
            ) : null}

            {activeMobileTab === 'caption' ? (
              <div className="space-y-4">
                <label className="block space-y-2">
                  <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.captionText}</span>
                  <textarea className={`min-h-24 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`} placeholder={t.captionPlaceholder} value={settings.captionText} onChange={(event) => updateSetting('captionText', event.target.value)} />
                </label>
                <label className="block space-y-2">
                  <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.captionFont}</span>
                  <select className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`} value={settings.captionFont} onChange={(event) => updateSetting('captionFont', event.target.value)}>
                    {captionFonts.map((font) => (
                      <option key={font.id} value={font.id}>{t.captionFonts[font.id as keyof typeof t.captionFonts]}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button className={secondaryButtonClass} type="button" onClick={() => updateSetting('captionText', new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()))}>{t.insertDate}</button>
                  <button className={secondaryButtonClass} type="button" onClick={() => { const location = window.prompt(t.locationPrompt); if (location?.trim()) updateSetting('captionText', location.trim()); }}>{t.locationStamp}</button>
                </div>
                <div className="space-y-2">
                  <div className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.captionColor}</div>
                  <div className="flex flex-wrap gap-2">
                    {captionColors.map((color) => (
                      <button key={color} className={`h-11 w-11 rounded-full border-2 ${settings.captionColor === color ? 'border-accent' : darkMode ? 'border-stone-700' : 'border-stone-200'}`} style={{ backgroundColor: color }} type="button" title={color} onClick={() => { updateSetting('captionColor', color); playSound('tick'); }} />
                    ))}
                    <input className="h-11 w-14 rounded-lg border border-stone-300 bg-transparent" type="color" aria-label={t.customCaptionColor} value={settings.captionColor} onChange={(event) => updateSetting('captionColor', event.target.value)} onBlur={() => playSound('tick')} title={t.customCaptionColor} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button key={align} className={`${secondaryButtonClass} ${settings.captionAlign === align ? darkMode ? '!border-accent !bg-accent/15 !text-orange-200' : '!border-accent !bg-accentSoft !text-accent' : ''}`} type="button" onClick={() => { updateSetting('captionAlign', align); playSound('tick'); }}>
                      {t.captionAlign[align]}
                    </button>
                  ))}
                </div>
                <SliderControl label={t.captionSize} value={settings.captionFontSize} min={16} max={42} onChange={(value) => updateSetting('captionFontSize', value)} suffix="px" darkMode={darkMode} />
                {!beginnerMode ? (
                  <>
                    <SliderControl label={t.softness} tooltip={t.controlTooltips.softness} value={settings.blur} min={0} max={2} step={0.1} onChange={(value) => updateSetting('blur', value)} suffix="px" darkMode={darkMode} />
                    <label className="block space-y-2">
                      <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.watermark}</span>
                      <input className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`} value={settings.watermarkText} onChange={(event) => updateSetting('watermarkText', event.target.value)} placeholder={t.optionalSignature} />
                    </label>
                    <SliderControl label={t.watermarkOpacity} tooltip={t.controlTooltips.watermark} value={settings.watermarkOpacity} min={0} max={100} onChange={(value) => updateSetting('watermarkOpacity', value)} suffix="%" darkMode={darkMode} />
                  </>
                ) : null}
              </div>
            ) : null}

            {activeMobileTab === 'export' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.exportSize}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {exportSizeOptions.map((option) => (
                      <button key={option.id} className={`${secondaryButtonClass} ${exportSizeId === option.id ? darkMode ? '!border-accent !bg-accent/15 !text-orange-200' : '!border-accent !bg-accentSoft !text-accent' : ''}`} type="button" onClick={() => selectExportSize(option.id)}>
                        <span className="block">{t.exportSizes[option.id as keyof typeof t.exportSizes]}</span>
                        <span className={`mt-1 block text-[11px] font-normal ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                          {t.exportSizeDescriptions[option.id as keyof typeof t.exportSizeDescriptions]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`grid grid-cols-[86px_1fr] gap-4 rounded-2xl border p-3 ${darkMode ? 'border-stone-800 bg-stone-950/35' : 'border-stone-200 bg-stone-50/70'}`}>
                  <div className={`flex min-h-24 items-center justify-center rounded-xl ${darkMode ? 'bg-stone-950/70' : 'bg-white/80'}`}>
                    {exportPreviewUrl ? (
                      <img
                        className="max-h-24 w-full object-contain drop-shadow-[0_12px_18px_rgba(28,20,12,0.16)]"
                        src={exportPreviewUrl}
                        alt=""
                      />
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col justify-center">
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>
                      {t.exportReady}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold">
                      PNG · {t.exportSizes[exportSizeId as keyof typeof t.exportSizes]}
                    </p>
                    <p className={`mt-1 text-xs ${mutedTextClass}`}>
                      {exportMeta.width} x {exportMeta.height}
                    </p>
                  </div>
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                  {t.exportPreview}: {exportMeta.width} x {exportMeta.height}px
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                  <div className={`font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>
                    {t.exportChecklist}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {exportChecklist.map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                          item.done
                            ? darkMode
                              ? 'bg-accent text-white'
                              : 'bg-ink text-white'
                            : darkMode
                              ? 'bg-stone-800 text-stone-500'
                              : 'bg-stone-200 text-stone-500'
                        }`}>
                          {item.done ? '✓' : ''}
                        </span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-stone-600 ${darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'}`} onClick={() => exportImage('png')} disabled={!hasImage || busy} type="button">
                    <span className="block">{t.exportPng}</span>
                    <span className="mt-1 block text-[11px] font-normal text-white/75">
                      {t.formatDescriptions.png}
                    </span>
                  </button>
                  <button className={secondaryButtonClass} onClick={() => exportImage('jpg')} disabled={!hasImage || busy} type="button">
                    <span className="block">{t.exportJpg}</span>
                    <span className={`mt-1 block text-[11px] font-normal ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                      {t.formatDescriptions.jpg}
                    </span>
                  </button>
                  {!beginnerMode ? (
                    <>
                      <button className={secondaryButtonClass} type="button" disabled={!hasImage || busy} onClick={copyCurrentImage}>{t.copyPng}</button>
                      <button className={secondaryButtonClass} type="button" disabled={batchImages.length === 0 || busy} onClick={() => exportBatch('png')}>{t.batchPng}</button>
                      <button className={secondaryButtonClass} type="button" disabled={batchImages.length === 0 || busy} onClick={() => exportBatch('jpg')}>{t.batchJpg}</button>
                    </>
                  ) : null}
                </div>
                {renderExportSuccessPanel()}
                {batchProgress ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span>{batchProgressMessage}</span>
                      {batchProgress.active ? (
                        <button className="font-semibold text-accent" type="button" onClick={cancelBatchExport}>
                          {language === 'ko' ? '취소' : 'Cancel'}
                        </button>
                      ) : null}
                    </div>
                    <div className={`mt-3 h-2 overflow-hidden rounded-full ${darkMode ? 'bg-stone-800' : 'bg-stone-200'}`}>
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${batchProgressPercent}%` }} />
                    </div>
                    {batchProgress.failures.length > 0 ? (
                      <div className={`mt-3 text-xs ${darkMode ? 'text-rose-300' : 'text-rose-600'}`}>
                        {batchProgress.failures.length} {language === 'ko' ? '개 실패' : 'failed'}: {batchProgress.failures.map((failure) => failure.name).join(', ')}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                  {busy ? t.working : status}
                </div>
                {error ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-rose-400/30 bg-rose-950/50 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-600'}`}>
                    {error}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className={`hidden rounded-[28px] border p-5 backdrop-blur-xl ${beginnerMode ? 'lg:block' : 'lg:hidden'} ${shellClass}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={`text-xs uppercase tracking-[0.24em] ${mutedTextClass}`}>
                  {t.guidedWorkflow}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {beginnerSteps[activeBeginnerStepIndex].label}
                </h2>
                <p className={`mt-2 max-w-2xl text-sm leading-6 ${bodyTextClass}`}>
                  {beginnerSteps[activeBeginnerStepIndex].description}
                </p>
              </div>
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  darkMode
                    ? 'border-stone-700 bg-stone-900 text-stone-100 hover:bg-stone-800'
                    : 'border-stone-300 bg-white/70 text-stone-700 hover:bg-white'
                }`}
                type="button"
                onClick={toggleBeginnerMode}
              >
                {t.advancedMode}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-5 gap-2">
              {beginnerSteps.map((step, index) => (
                <button
                  key={step.id}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    activeBeginnerStep === step.id
                      ? darkMode
                        ? 'border-accent bg-accent/15 text-orange-200'
                        : 'border-accent bg-accentSoft text-accent'
                    : completedBeginnerSteps.includes(step.id) ||
                        index < activeBeginnerStepIndex
                        ? darkMode
                          ? 'border-stone-700 bg-stone-900 text-stone-200'
                          : 'border-stone-300 bg-white text-stone-700'
                        : darkMode
                          ? 'border-stone-800 text-stone-500'
                          : 'border-stone-200 text-stone-500'
                  }`}
                  type="button"
                  onClick={() => selectBeginnerStep(step.id)}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {completedBeginnerSteps.includes(step.id) ? '✓' : index + 1}
                  </span>
                  <span className="mt-1 block text-sm font-semibold">{step.label}</span>
                </button>
              ))}
            </div>

            <div key={activeBeginnerStep} className="premium-step mt-6">
              {activeBeginnerStep === 'choose' ? (
                <div className={`rounded-[24px] border p-5 ${surfaceClass}`}>
                  <p className={`text-sm leading-6 ${bodyTextClass}`}>{t.beginWithPhotoHint}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition ${
                        darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
                      }`}
                      type="button"
                      onClick={startFilePicker}
                    >
                      {t.startWithPhoto}
                    </button>
                    <button className={secondaryButtonClass} type="button" onClick={() => loadDemoPhoto()}>
                      {t.tryDemoPhoto}
                    </button>
                  </div>
                  <div className="mt-6">
                    <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>
                      {t.sampleLooks}
                    </div>
                    <p className={`mt-1 text-sm leading-6 ${bodyTextClass}`}>
                      {t.sampleLooksDescription}
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                      {allPresets.slice(0, 5).map((preset) => (
                        <button
                          key={preset.id}
                          className={`group overflow-hidden rounded-2xl border text-left transition ${
                            darkMode
                              ? 'border-stone-700 bg-stone-900/65 hover:border-stone-500'
                              : 'border-stone-200 bg-white/82 hover:border-stone-300 hover:bg-white'
                          }`}
                          type="button"
                          onClick={() => loadDemoPhoto(preset.id)}
                          title={`${t.tryThisLook}: ${preset.name}`}
                        >
                          <span className={`flex h-36 items-center justify-center ${
                            darkMode ? 'bg-stone-950/35' : 'bg-stone-50/80'
                          }`}>
                            {samplePresetPreviewUrls[preset.id] ? (
                              <span className={`flex h-28 w-20 rotate-[-2deg] items-center justify-center rounded-[11px] p-1 shadow-[0_16px_28px_rgba(28,20,12,0.18)] transition group-hover:-translate-y-1 ${
                                darkMode ? 'bg-stone-100' : 'bg-white'
                              }`}>
                                <img
                                  className="h-full w-full object-contain"
                                  src={samplePresetPreviewUrls[preset.id]}
                                  alt=""
                                />
                              </span>
                            ) : (
                              <span className={`h-28 w-20 rounded-[11px] ${darkMode ? 'bg-stone-800' : 'bg-stone-100'}`} />
                            )}
                          </span>
                          <span className="block px-3 py-3">
                            <span className={`block text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>
                              {preset.name}
                            </span>
                            <span className={`mt-1 block text-xs ${mutedTextClass}`}>
                              {t.tryThisLook}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeBeginnerStep === 'look' ? (
                <div className="grid gap-4 xl:grid-cols-[1fr_240px]">
                  <div className="grid gap-3 md:grid-cols-2">
                    {allPresets.map((preset) => (
                      <PresetButton
                        key={preset.id}
                        preset={preset}
                        active={activePresetId === preset.id}
                        onClick={() => applyPreset(preset.id)}
                        darkMode={darkMode}
                        previewSrc={presetPreviewUrls[preset.id]}
                      />
                    ))}
                  </div>
                  <div className={`rounded-[24px] border p-4 ${surfaceClass}`}>
                    <button
                      className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white transition ${
                        darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
                      }`}
                      type="button"
                      onClick={autoMakeItGood}
                    >
                      {t.autoMakeGood}
                    </button>
                    <p className={`mt-3 text-sm leading-6 ${bodyTextClass}`}>
                      {t.autoMakeGoodDescription}
                    </p>
                  </div>
                </div>
              ) : null}

              {activeBeginnerStep === 'crop' ? (
                <div className={`grid gap-5 rounded-[24px] border p-5 ${surfaceClass}`}>
                  {cropRatioMeta ? (
                    <p className={`text-sm leading-6 ${cropRatioMeta.isSquare ? bodyTextClass : darkMode ? 'text-orange-200' : 'text-amber-700'}`}>
                      {cropRatioMeta.isSquare
                        ? t.cropSquare
                        : t.cropDifferent(cropRatioMeta.originalRatio)}
                    </p>
                  ) : null}
                  <div className="grid gap-5 md:grid-cols-3">
                    <SliderControl label={t.zoom} value={settings.cropZoom} min={1} max={3} step={0.05} onChange={(value) => updateSetting('cropZoom', value)} suffix="x" darkMode={darkMode} />
                    <SliderControl label={t.horizontal} value={settings.cropX} min={-100} max={100} onChange={(value) => updateSetting('cropX', value)} darkMode={darkMode} />
                    <SliderControl label={t.vertical} value={settings.cropY} min={-100} max={100} onChange={(value) => updateSetting('cropY', value)} darkMode={darkMode} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button className={secondaryButtonClass} type="button" onClick={autoFitCrop}>{t.autoFit}</button>
                    <button className={secondaryButtonClass} type="button" onClick={resetCrop}>{t.resetCrop}</button>
                  </div>
                </div>
              ) : null}

              {activeBeginnerStep === 'caption' ? (
                <div className={`grid gap-4 rounded-[24px] border p-5 md:grid-cols-[1fr_240px] ${surfaceClass}`}>
                  <label className="block space-y-2">
                    <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.captionText}</span>
                    <textarea
                      className={`min-h-32 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`}
                      placeholder={t.captionPlaceholder}
                      value={settings.captionText}
                      onChange={(event) => updateSetting('captionText', event.target.value)}
                    />
                  </label>
                  <div className="space-y-3">
                    <label className="block space-y-2">
                      <span className={`text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{t.captionFont}</span>
                      <select className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${fieldClass}`} value={settings.captionFont} onChange={(event) => updateSetting('captionFont', event.target.value)}>
                        {captionFonts.map((font) => (
                          <option key={font.id} value={font.id}>{t.captionFonts[font.id as keyof typeof t.captionFonts]}</option>
                        ))}
                      </select>
                    </label>
                    <button className={secondaryButtonClass} type="button" onClick={() => updateSetting('captionText', new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()))}>{t.insertDate}</button>
                    <SliderControl label={t.captionSize} value={settings.captionFontSize} min={16} max={42} onChange={(value) => updateSetting('captionFontSize', value)} suffix="px" darkMode={darkMode} />
                  </div>
                </div>
              ) : null}

              {activeBeginnerStep === 'export' ? (
                <div className={`rounded-[24px] p-5 ${beginnerMode ? 'border-0 bg-transparent shadow-none' : `border ${surfaceClass}`}`}>
                  <div className={`mb-5 grid gap-5 rounded-[28px] border p-5 ${surfaceClass} md:grid-cols-[220px_1fr]`}>
                    <div className={`flex min-h-48 items-center justify-center rounded-[22px] ${darkMode ? 'bg-stone-950/55' : 'bg-stone-50/80'}`}>
                      {exportPreviewUrl ? (
                        <img
                          className="max-h-56 w-full object-contain drop-shadow-[0_20px_30px_rgba(28,20,12,0.18)]"
                          src={exportPreviewUrl}
                          alt=""
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-col justify-center">
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${mutedTextClass}`}>
                        {t.exportReady}
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold">
                        PNG · {t.exportSizes[exportSizeId as keyof typeof t.exportSizes]} · {exportMeta.width} x {exportMeta.height}
                      </h3>
                      <p className={`mt-3 text-sm leading-6 ${bodyTextClass}`}>
                        {t.formatDescriptions.png}. {t.exportSizeDescriptions[exportSizeId as keyof typeof t.exportSizeDescriptions]}.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {exportSizeOptions.map((option) => (
                      <button
                        key={option.id}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                          exportSizeId === option.id
                            ? darkMode
                              ? 'border-accent bg-accent/15 text-orange-200'
                              : 'border-accent bg-accentSoft text-accent'
                            : darkMode
                              ? 'border-stone-700 bg-stone-900 text-stone-100 hover:bg-stone-800'
                              : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                        }`}
                        type="button"
                        onClick={() => selectExportSize(option.id)}
                      >
                        <span className="block">{t.exportSizes[option.id as keyof typeof t.exportSizes]}</span>
                        <span className={`mt-1 block text-xs font-normal ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                          {t.exportSizeDescriptions[option.id as keyof typeof t.exportSizeDescriptions]}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                    {t.exportPreview}: {exportMeta.width} x {exportMeta.height}px
                  </div>
                  <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                    <div className={`font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>
                      {t.exportChecklist}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {exportChecklist.map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                            item.done
                              ? darkMode
                                ? 'bg-accent text-white'
                                : 'bg-ink text-white'
                              : darkMode
                                ? 'bg-stone-800 text-stone-500'
                                : 'bg-stone-200 text-stone-500'
                          }`}>
                            {item.done ? '✓' : ''}
                          </span>
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-stone-600 ${darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'}`}
                      onClick={() => exportImage('png')}
                      disabled={!hasImage || busy}
                      type="button"
                    >
                      <span className="block">{t.exportPng}</span>
                      <span className="mt-1 block text-[11px] font-normal text-white/75">{t.formatDescriptions.png}</span>
                    </button>
                    <button className={secondaryButtonClass} onClick={() => exportImage('jpg')} disabled={!hasImage || busy} type="button">
                      <span className="block">{t.exportJpg}</span>
                      <span className={`mt-1 block text-[11px] font-normal ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>{t.formatDescriptions.jpg}</span>
                    </button>
                  </div>
                  {lastExport ? <div className="mt-4">{renderExportSuccessPanel()}</div> : null}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className={`text-sm ${mutedTextClass}`}>{busy ? t.working : status}</div>
              <button
                className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-stone-600 ${
                  darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
                }`}
                type="button"
                disabled={busy}
                onClick={advanceBeginnerFlow}
              >
                {nextBeginnerCtaLabel}
              </button>
            </div>
          </section>

          <div className={`hidden gap-4 ${beginnerMode ? 'lg:hidden' : 'lg:grid lg:grid-cols-[1.1fr_0.9fr]'}`}>
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
                      previewSrc={presetPreviewUrls[preset.id]}
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
                        onClick={() => {
                          updateSetting('captionColor', color);
                          playSound('tick');
                        }}
                      />
                    ))}
                    <input
                      className="h-9 w-12 rounded-lg border border-stone-300 bg-transparent"
                      type="color"
                      aria-label={t.customCaptionColor}
                      value={settings.captionColor}
                      onChange={(event) => updateSetting('captionColor', event.target.value)}
                      onBlur={() => playSound('tick')}
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
                      onClick={() => {
                        updateSetting('captionAlign', align);
                        playSound('tick');
                      }}
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
                  tooltip={t.controlTooltips.softness}
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
                  tooltip={t.controlTooltips.watermark}
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
                        onClick={() => selectExportSize(option.id)}
                      >
                        <span className="block">{t.exportSizes[option.id as keyof typeof t.exportSizes]}</span>
                        <span className={`mt-1 block text-[11px] font-normal ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                          {t.exportSizeDescriptions[option.id as keyof typeof t.exportSizeDescriptions]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                  {t.exportPreview}: {exportMeta.width} x {exportMeta.height}px
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-stone-600 ${
                      darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
                    }`}
                    onClick={() => exportImage('png')}
                    disabled={!hasImage || busy}
                    type="button"
                  >
                    <span className="block">{t.exportPng}</span>
                    <span className="mt-1 block text-[11px] font-normal text-white/75">
                      {t.formatDescriptions.png}
                    </span>
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
                    <span className="block">{t.exportJpg}</span>
                    <span className={`mt-1 block text-[11px] font-normal ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                      {t.formatDescriptions.jpg}
                    </span>
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
                {renderExportSuccessPanel()}
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
                {batchProgress ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-300' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span>{batchProgressMessage}</span>
                      {batchProgress.active ? (
                        <button className="font-semibold text-accent" type="button" onClick={cancelBatchExport}>
                          {language === 'ko' ? '취소' : 'Cancel'}
                        </button>
                      ) : null}
                    </div>
                    <div className={`mt-3 h-2 overflow-hidden rounded-full ${darkMode ? 'bg-stone-800' : 'bg-stone-200'}`}>
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${batchProgressPercent}%` }} />
                    </div>
                    {batchProgress.failures.length > 0 ? (
                      <div className={`mt-3 text-xs ${darkMode ? 'text-rose-300' : 'text-rose-600'}`}>
                        {batchProgress.failures.length} {language === 'ko' ? '개 실패' : 'failed'}: {batchProgress.failures.map((failure) => failure.name).join(', ')}
                      </div>
                    ) : null}
                  </div>
                ) : null}
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

        <aside
          aria-label="Workflow guide"
          className={`scrollbar-soft hidden max-h-[calc(100vh-2rem)] flex-col gap-4 overflow-y-auto rounded-[32px] border p-5 backdrop-blur-xl lg:flex ${shellClass}`}
        >
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
              {t.guideSteps.map(([title, description], index) => (
                <li key={title}>
                  <button
                    className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                      activeBeginnerStep === beginnerStepIds[index]
                        ? darkMode
                          ? 'border-accent bg-accent/15 text-orange-200'
                          : 'border-accent bg-accentSoft text-accent'
                        : darkMode
                          ? 'border-stone-700 text-stone-300 hover:bg-stone-900'
                          : 'border-stone-300 text-stone-600 hover:bg-stone-50'
                    }`}
                    type="button"
                    onClick={() => runGuideAction(beginnerStepIds[index])}
                  >
                    <span className={`font-semibold ${activeBeginnerStep === beginnerStepIds[index] ? '' : darkMode ? 'text-stone-200' : 'text-stone-700'}`}>{title}</span>
                    <br />
                    <span>{description}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          {recentImages.length > 0 ? (
            <div className={`space-y-3 rounded-[28px] border p-4 ${surfaceClass}`}>
              <div className={`text-sm font-semibold ${darkMode ? 'text-stone-100' : 'text-stone-700'}`}>{t.recentFiles}</div>
              <div className="grid grid-cols-2 gap-3">
                {recentImages.map((asset, index) => (
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
                      setImageRef(recentImageRefs[index] ?? null);
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
      {hasImage ? (
        <aside aria-label="Mobile export actions" className={`fixed inset-x-0 bottom-0 z-50 border-t px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-14px_35px_rgba(0,0,0,0.12)] backdrop-blur-xl sm:hidden ${
          darkMode
            ? 'border-stone-800 bg-stone-950/88'
            : 'border-stone-200 bg-white/88'
        }`}>
          {busy ? (
            <div className={`mx-auto max-w-md rounded-2xl border px-4 py-3 text-center text-sm font-semibold ${
              darkMode
                ? 'border-stone-800 bg-stone-900/80 text-stone-200'
                : 'border-stone-200 bg-white text-stone-700'
            }`}>
              {t.working}
            </div>
          ) : activeMobileTab === 'export' ? (
            <div className={`mx-auto grid max-w-md gap-2 ${beginnerMode ? 'grid-cols-2' : 'grid-cols-[1fr_1fr_auto]'}`}>
              <button
                aria-label={t.exportPng}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-stone-600 ${
                  darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
                }`}
                onClick={() => exportImage('png')}
                type="button"
              >
                PNG
              </button>
              <button
                aria-label={t.exportJpg}
                className={secondaryButtonClass}
                onClick={() => exportImage('jpg')}
                type="button"
              >
                JPG
              </button>
              {!beginnerMode ? (
                <button
                  className={secondaryButtonClass}
                  type="button"
                  onClick={copyCurrentImage}
                >
                  Copy
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto grid max-w-md grid-cols-[auto_1fr_auto] gap-2">
              <button
                className={secondaryButtonClass}
                disabled={history.past.length === 0}
                onClick={undoSettings}
                type="button"
              >
                {t.undo}
              </button>
              <button
                className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition ${
                  darkMode ? 'bg-accent hover:bg-orange-400' : 'bg-ink hover:bg-stone-800'
                }`}
                onClick={() => beginnerMode ? selectBeginnerStep('export') : selectMobileTab('export')}
                type="button"
              >
                {t.exportNow}
              </button>
              <button
                className={secondaryButtonClass}
                onClick={beginnerMode ? advanceBeginnerFlow : advanceMobileQuickFlow}
                type="button"
              >
                {beginnerMode
                  ? nextBeginnerCtaLabel
                  : nextQuickStep.id === activeMobileTab
                    ? t.done
                    : t.next}
              </button>
            </div>
          )}
        </aside>
      ) : null}
    </div>
  );
}

export default App;
