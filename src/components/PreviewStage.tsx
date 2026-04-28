import { PointerEvent, useEffect, useRef, useState } from 'react';
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
  darkMode?: boolean;
};

type CropDragMode = 'move' | 'resize';

export function PreviewStage({
  image,
  settings,
  ready,
  error,
  previewMode = 'final',
  onCropPreview,
  onCropCommit,
  darkMode = false,
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
    });

    if (beforeCanvasRef.current) {
      renderPolaroid(beforeCanvasRef.current, image, settings, {
        scale: 0.62,
        applyEffects: false,
      });
    }
  }, [image, settings, ready, previewMode]);

  const getPointerDistanceFromCenter = (
    event: PointerEvent<HTMLElement>,
    rect: DOMRect
  ) => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.hypot(event.clientX - centerX, event.clientY - centerY);
  };

  const beginCropDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || !image || !canvasRef.current || splitting) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      mode: 'move',
      startX: event.clientX,
      startY: event.clientY,
      startDistance: getPointerDistanceFromCenter(event, rect),
      startSettings: settings,
      latestSettings: settings,
    };
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
    setDragging(true);
  };

  const moveCropDrag = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current || !canvasRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    let nextSettings: PolaroidSettings;

    if (dragRef.current.mode === 'resize') {
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

    if (event.currentTarget.hasPointerCapture(dragRef.current.pointerId)) {
      event.currentTarget.releasePointerCapture(dragRef.current.pointerId);
    }
    onCropCommit?.(
      dragRef.current.startSettings,
      dragRef.current.latestSettings
    );
    dragRef.current = null;
    setDragging(false);
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
      className={`relative flex h-full min-h-[520px] items-center justify-center overflow-hidden rounded-[34px] border p-8 shadow-panel ${
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
          className="relative flex max-h-full max-w-full items-center justify-center"
          onPointerMove={moveSplit}
          onPointerUp={() => setSplitting(false)}
          onPointerCancel={() => setSplitting(false)}
        >
          {previewMode === 'split' ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            >
              <canvas
                ref={beforeCanvasRef}
                className="max-h-full max-w-full animate-floatIn touch-none drop-shadow-[0_26px_40px_rgba(32,24,18,0.14)]"
              />
            </div>
          ) : (
            <canvas ref={beforeCanvasRef} className="hidden" />
          )}
          {previewMode === 'split' ? (
            <div
              className="absolute bottom-6 top-6 z-20 w-1 cursor-ew-resize rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.16),0_8px_20px_rgba(0,0,0,0.2)]"
              style={{ left: `${split}%` }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setSplitting(true);
              }}
              title="Drag to compare before and after"
            >
              <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-200 bg-white text-center text-xs font-semibold leading-9 text-stone-600 shadow-md">
                ||
              </div>
            </div>
          ) : null}
          <div className="relative max-h-full max-w-full">
            <canvas
              ref={canvasRef}
              className={`relative max-h-full max-w-full animate-floatIn touch-none drop-shadow-[0_26px_40px_rgba(32,24,18,0.14)] ${
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              title="Drag to reposition the photo crop"
              onPointerDown={beginCropDrag}
              onPointerMove={moveCropDrag}
              onPointerUp={endCropDrag}
              onPointerCancel={endCropDrag}
            />
            {(['left-4 top-4 cursor-nwse-resize', 'right-4 top-4 cursor-nesw-resize', 'bottom-4 left-4 cursor-nesw-resize', 'bottom-4 right-4 cursor-nwse-resize'] as const).map(
              (position) => (
                <button
                  key={position}
                  aria-label="Resize photo crop"
                  className={`absolute z-30 h-5 w-5 rounded-full border-2 shadow-md transition ${
                    darkMode
                      ? 'border-stone-950 bg-orange-300 hover:bg-orange-200'
                      : 'border-white bg-accent hover:bg-orange-500'
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
