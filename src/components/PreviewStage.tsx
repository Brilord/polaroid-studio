import { useEffect, useRef } from 'react';
import { PolaroidSettings } from '../types';
import { renderPolaroid } from '../lib/polaroidRenderer';

type PreviewStageProps = {
  image: HTMLImageElement | null;
  settings: PolaroidSettings;
  ready: boolean;
  error: string | null;
  darkMode?: boolean;
};

export function PreviewStage({
  image,
  settings,
  ready,
  error,
  darkMode = false,
}: PreviewStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!image || !canvasRef.current || !ready) {
      return;
    }

    renderPolaroid(canvasRef.current, image, settings, {
      scale: 0.62,
      applyEffects: true,
    });
  }, [image, settings, ready]);

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
        <canvas
          ref={canvasRef}
          className="relative max-h-full max-w-full animate-floatIn drop-shadow-[0_26px_40px_rgba(32,24,18,0.14)]"
        />
      )}
    </div>
  );
}
