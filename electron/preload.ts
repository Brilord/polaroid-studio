import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openImage: () => ipcRenderer.invoke('dialog:open-image'),
  saveImage: (payload: {
    suggestedName: string;
    format: 'png' | 'jpg';
    data: number[];
  }) => ipcRenderer.invoke('dialog:save-image', payload),
});
