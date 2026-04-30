/// <reference types="vite/client" />

declare global {
  interface Window {
    ClipboardItem?: typeof ClipboardItem;
  }

  interface Window {
    electronAPI?: {
      openImage: () => Promise<{
        name: string;
        path?: string;
        dataUrl: string;
      } | null>;
      openImages: () => Promise<
        {
          name: string;
          path?: string;
          dataUrl: string;
        }[]
      >;
      saveImage: (payload: {
        suggestedName: string;
        format: 'png' | 'jpg';
        data: number[];
      }) => Promise<{ canceled: boolean; filePath?: string }>;
      saveImagesToFolder: (payload: {
        files: { suggestedName: string; data: number[] }[];
      }) => Promise<{
        canceled: boolean;
        folderPath?: string;
        savedPaths?: string[];
      }>;
      copyImage: (payload: { data: number[] }) => Promise<{ ok: boolean }>;
      startImageDrag: (payload: {
        suggestedName: string;
        data: number[];
      }) => Promise<{ filePath: string }>;
      openPresetFile: () => Promise<string | null>;
      savePresetFile: (payload: {
        suggestedName: string;
        json: string;
      }) => Promise<{ canceled: boolean; filePath?: string }>;
    };
  }
}

export {};
