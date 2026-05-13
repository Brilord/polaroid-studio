import {
  PointerEvent,
  TouchEvent as ReactTouchEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PolaroidSettings } from '../types';
import { renderPolaroid } from '../lib/polaroidRenderer';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type PreviewStageProps = {
  image: HTMLImageElement | null;
  settings: PolaroidSettings;
  ready: boolean;
  error: string | null;
  previewMode?: 'final' | 'before' | 'split';
  onCropPreview?: (settings: PolaroidSettings) => void;
  onCropCommit?: (
    previous: PolaroidSettings,
    next: PolaroidSettings
  ) => void;
  onSound?: (type: 'dragStart' | 'dragEnd') => void;
  darkMode?: boolean;
  compact?: boolean;
  seed?: string | number;
};

type CropDragMode = 'move' | 'resize' | 'pinch';

export function PreviewStage({
  image,
  settings,
  ready,
  error,
  previewMode = 'final',
  onCropPreview,
  onCropCommit,
  onSound,
  darkMode = false,
  compact = false,
  seed = 'preview',
}: PreviewStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beforeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    mode: CropDragMode;
    startX: number;
    startY: number;
    startDistance: number;
    startSettings: PolaroidSettings;
    latestSettings: PolaroidSettings;
  } | null>(null);
  const touchPinchRef = useRef<{
    startDistance: number;
    startSettings: PolaroidSettings;
    latestSettings: PolaroidSettings;
  } | null>(null);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const splitStartRef = useRef(50);
  const [dragging, setDragging] = useState(false);
  const [split, setSplit] = useState(50);
  const [splitting, setSplitting] = useState(false);

  useEffect(() => {
    if (!image || !canvasRef.current || !ready) {
      return;
    }

    renderPolaroid(canvasRef.current, image, settings, {
      scale: 0.62,
      applyEffects: previewMode !== 'before',
      seed,
    });

    if (beforeCanvasRef.current) {
      renderPolaroid(beforeCanvasRef.current, image, settings, {
        scale: 0.62,
        applyEffects: false,
        seed,
      });
    }
  }, [image, settings, ready, previewMode, seed]);

  const getPointerDistanceFromCenter = (
    event: PointerEvent<HTMLElement>,
    rect: DOMRect
  ) => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.hypot(event.clientX - centerX, event.clientY - centerY);
  };

  const getPointerDistance = () => {
    const points = Array.from(activePointersRef.current.values());
    if (points.length < 2) {
      return 0;
    }

    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };

  const getTouchDistance = (touches: ReactTouchEvent<HTMLCanvasElement>['touches']) => {
    if (touches.length < 2) {
      return 0;
    }

    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  };

  const hasCropChanged = (
    previous: PolaroidSettings,
    next: PolaroidSettings
  ) =>
    previous.cropX !== next.cropX ||
    previous.cropY !== next.cropY ||
    previous.cropZoom !== next.cropZoom;

  const beginTouchPinch = (event: ReactTouchEvent<HTMLCanvasElement>) => {
    if (!ready || !image || event.touches.length < 2) {
      return;
    }

    event.preventDefault();
    touchPinchRef.current = {
      startDistance: Math.max(getTouchDistance(event.touches), 1),
      startSettings: settings,
      latestSettings: settings,
    };
    onSound?.('dragStart');
    setDragging(true);
  };

  const moveTouchPinch = (event: ReactTouchEvent<HTMLCanvasElement>) => {
    if (!touchPinchRef.current || event.touches.length < 2) {
      return;
    }

    event.preventDefault();
    const distance = getTouchDistance(event.touches);
    const nextSettings = {
      ...touchPinchRef.current.startSettings,
      cropZoom: clamp(
        touchPinchRef.current.startSettings.cropZoom *
          (distance / touchPinchRef.current.startDistance),
        1,
        3
      ),
    };

    touchPinchRef.current.latestSettings = nextSettings;
    onCropPreview?.(nextSettings);
  };

  const endTouchPinch = () => {
    if (!touchPinchRef.current) {
      return;
    }

    const { startSettings, latestSettings } = touchPinchRef.current;
    if (hasCropChanged(startSettings, latestSettings)) {
      onSound?.('dragEnd');
    }
    onCropCommit?.(startSettings, latestSettings);
    touchPinchRef.current = null;
    setDragging(false);
  };

  const beginCropDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || !image || !canvasRef.current || splitting) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const rect = canvasRef.current.getBoundingClientRect();
    const pinching = activePointersRef.current.size >= 2;
    dragRef.current = {
      pointerId: event.pointerId,
      mode: pinching ? 'pinch' : 'move',
      startX: event.clientX,
      startY: event.clientY,
      startDistance: pinching
        ? getPointerDistance()
        : getPointerDistanceFromCenter(event, rect),
      startSettings: settings,
      latestSettings: settings,
    };
    onSound?.('dragStart');
    setDragging(true);
  };

  const beginResizeDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!ready || !image || !canvasRef.current || splitting) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      mode: 'resize',
      startX: event.clientX,
      startY: event.clientY,
      startDistance: getPointerDistanceFromCenter(event, rect),
      startSettings: settings,
      latestSettings: settings,
    };
    onSound?.('dragStart');
    setDragging(true);
  };

  const moveCropDrag = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current || !canvasRef.current) {
      return;
    }

    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const rect = canvasRef.current.getBoundingClientRect();
    let nextSettings: PolaroidSettings;

    if (dragRef.current.mode === 'pinch') {
      const distance = getPointerDistance();
      const startDistance = Math.max(dragRef.current.startDistance, 1);
      nextSettings = {
        ...dragRef.current.startSettings,
        cropZoom: clamp(
          dragRef.current.startSettings.cropZoom * (distance / startDistance),
          1,
          3
        ),
      };
    } else if (dragRef.current.mode === 'resize') {
      const distance = getPointerDistanceFromCenter(event, rect);
      const zoomDelta =
        ((distance - dragRef.current.startDistance) /
          Math.max(Math.min(rect.width, rect.height), 1)) *
        2.6;
      nextSettings = {
        ...dragRef.current.startSettings,
        cropZoom: clamp(
          dragRef.current.startSettings.cropZoom + zoomDelta,
          1,
          3
        ),
      };
    } else {
      const deltaX = event.clientX - dragRef.current.startX;
      const deltaY = event.clientY - dragRef.current.startY;
      const sensitivity = 260;
      nextSettings = {
        ...dragRef.current.startSettings,
        cropX: clamp(
          dragRef.current.startSettings.cropX -
            (deltaX / Math.max(rect.width, 1)) * sensitivity,
          -100,
          100
        ),
        cropY: clamp(
          dragRef.current.startSettings.cropY -
            (deltaY / Math.max(rect.height, 1)) * sensitivity,
          -100,
          100
        ),
      };
    }

    dragRef.current.latestSettings = nextSettings;
    onCropPreview?.(nextSettings);
  };

  const endCropDrag = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current) {
      return;
    }

    activePointersRef.current.delete(event.pointerId);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (activePointersRef.current.size > 0) {
      return;
    }

    const { startSettings, latestSettings } = dragRef.current;
    if (hasCropChanged(startSettings, latestSettings)) {
      onSound?.('dragEnd');
    }
    onCropCommit?.(startSettings, latestSettings);
    dragRef.current = null;
    setDragging(false);
  };

  const beginSplitDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    splitStartRef.current = split;
    setSplitting(true);
    onSound?.('dragStart');
  };

  const endSplitDrag = () => {
    if (!splitting) {
      return;
    }

    if (splitStartRef.current !== split) {
      onSound?.('dragEnd');
    }
    setSplitting(false);
  };

  const moveSplit = (event: PointerEvent<HTMLDivElement>) => {
    if (!splitting) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setSplit(clamp(((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100, 8, 92));
  };

  return (
    <div
      aria-label="Polaroid preview stage"
      className={`relative flex items-center justify-center overflow-hidden rounded-[22px] border p-3 shadow-panel transition-[height,min-height] duration-200 sm:h-auto sm:min-h-[420px] sm:rounded-[28px] sm:p-5 lg:min-h-[520px] lg:rounded-[34px] lg:p-8 ${
        compact ? 'h-[190px] min-h-[190px]' : 'h-[240px] min-h-[240px]'
      } ${
        darkMode
          ? 'border-stone-700 bg-[radial-gradient(circle_at_top,_rgba(50,50,56,0.85),_rgba(24,24,29,0.92)_36%,_rgba(14,14,18,0.98)_100%)]'
          : 'border-white/60 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.8),_rgba(246,236,220,0.88)_36%,_rgba(233,221,206,0.92)_100%)]'
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          darkMode
            ? 'bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent_35%,rgba(209,143,99,0.1)_85%)]'
            : 'bg-[linear-gradient(135deg,rgba(255,255,255,0.35),transparent_35%,rgba(209,143,99,0.08)_85%)]'
        }`}
      />
      {!image ? (
        <div className={`relative max-w-sm text-center ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
          <div
            className={`mx-auto mb-4 h-20 w-20 rounded-[28px] border shadow-lg ${
              darkMode
                ? 'border-stone-700 bg-stone-900/70'
                : 'border-white/80 bg-white/70'
            }`}
          />
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-ink'}`}>
            Live Polaroid preview
          </h2>
          <p className="mt-2 text-sm leading-6">
            Import a photo to start building your instant-camera frame, tone,
            caption, and export-ready look.
          </p>
        </div>
      ) : error ? (
        <div className="relative rounded-3xl border border-rose-300/60 bg-stone-950/60 px-6 py-4 text-sm text-rose-300">
          {error}
        </div>
      ) : (
        <div
          className="relative flex h-full max-w-full items-center justify-center"
          onPointerMove={moveSplit}
          onPointerUp={endSplitDrag}
          onPointerCancel={endSplitDrag}
        >
          {previewMode === 'split' ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            >
              <canvas
                ref={beforeCanvasRef}
                className="h-full max-h-full max-w-full animate-floatIn touch-none object-contain drop-shadow-[0_26px_40px_rgba(32,24,18,0.14)]"
              />
            </div>
          ) : (
            <canvas ref={beforeCanvasRef} className="hidden" />
          )}
          {previewMode === 'split' ? (
            <div
              className="absolute bottom-6 top-6 z-20 w-1 cursor-ew-resize rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.16),0_8px_20px_rgba(0,0,0,0.2)]"
              style={{ left: `${split}%` }}
              onPointerDown={beginSplitDrag}
              title="Drag to compare before and after"
            >
              <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-200 bg-white text-center text-xs font-semibold leading-9 text-stone-600 shadow-md">
                ||
              </div>
            </div>
          ) : null}
          <div className="relative flex h-full max-w-full items-center justify-center">
            <canvas
              ref={canvasRef}
              className={`relative h-full max-h-full max-w-full animate-floatIn touch-none object-contain drop-shadow-[0_26px_40px_rgba(32,24,18,0.14)] ${
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              title="Drag to reposition the photo crop"
              onPointerDown={beginCropDrag}
              onPointerMove={moveCropDrag}
              onPointerUp={endCropDrag}
              onPointerCancel={endCropDrag}
              onTouchStart={beginTouchPinch}
              onTouchMove={moveTouchPinch}
              onTouchEnd={endTouchPinch}
              onTouchCancel={endTouchPinch}
            />
            {(['left-2 top-2 cursor-nwse-resize sm:left-4 sm:top-4', 'right-2 top-2 cursor-nesw-resize sm:right-4 sm:top-4', 'bottom-2 left-2 cursor-nesw-resize sm:bottom-4 sm:left-4', 'bottom-2 right-2 cursor-nwse-resize sm:bottom-4 sm:right-4'] as const).map(
              (position) => (
                <button
                  key={position}
                  aria-label="Resize photo crop"
                  className={`absolute z-30 h-11 w-11 rounded-full border-0 bg-transparent p-[10px] shadow-none transition before:block before:h-6 before:w-6 before:rounded-full before:border-2 before:shadow-md ${
                    darkMode
                      ? 'before:border-stone-950 before:bg-orange-300 hover:before:bg-orange-200'
                      : 'before:border-white before:bg-accent hover:before:bg-orange-500'
                  } ${position}`}
                  title="Drag to resize the photo"
                  type="button"
                  onPointerDown={beginResizeDrag}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
