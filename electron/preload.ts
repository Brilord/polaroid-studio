import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openImage: () => ipcRenderer.invoke('dialog:open-image'),
  openImages: () => ipcRenderer.invoke('dialog:open-images'),
  saveImage: (payload: {
    suggestedName: string;
    format: 'png' | 'jpg';
    data: number[];
  }) => ipcRenderer.invoke('dialog:save-image', payload),
  saveImagesToFolder: (payload: {
    files: { suggestedName: string; data: number[] }[];
  }) => ipcRenderer.invoke('dialog:save-images-to-folder', payload),
  copyImage: (payload: { data: number[] }) =>
    ipcRenderer.invoke('clipboard:copy-image', payload),
  startImageDrag: (payload: { suggestedName: string; data: number[] }) =>
    ipcRenderer.invoke('drag:start-image', payload),
  openPresetFile: () => ipcRenderer.invoke('dialog:open-preset-file'),
  savePresetFile: (payload: { suggestedName: string; json: string }) =>
    ipcRenderer.invoke('dialog:save-preset-file', payload),
});
