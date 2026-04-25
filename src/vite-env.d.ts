/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI?: {
      openImage: () => Promise<{
        name: string;
        path?: string;
        dataUrl: string;
      } | null>;
      saveImage: (payload: {
        suggestedName: string;
        format: 'png' | 'jpg';
        data: number[];
      }) => Promise<{ canceled: boolean; filePath?: string }>;
    };
  }
}

export {};
