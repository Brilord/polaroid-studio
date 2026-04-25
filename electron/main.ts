import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow() {
  const iconPath = isDev
    ? path.join(app.getAppPath(), 'public', 'logo.png')
    : path.join(__dirname, '../dist/logo.png');

  const win = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: '#f3ece2',
    title: 'Polaroid Studio',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        dialog.showErrorBox(
          'Renderer Load Error',
          `Failed to load the app UI.\n\nCode: ${errorCode}\nReason: ${errorDescription}\nURL: ${validatedURL}`
        );
      }
    );

    win.loadFile(path.join(__dirname, '../dist/index.html')).catch((error) => {
      dialog.showErrorBox(
        'Startup Error',
        `Polaroid Studio could not start.\n\n${error instanceof Error ? error.message : String(error)}`
      );
    });
  }
}

app.whenReady().then(() => {
  ipcMain.handle('dialog:open-image', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const fileBuffer = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase().replace('.', '');
    const mime =
      extension === 'jpg' || extension === 'jpeg'
        ? 'image/jpeg'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/png';

    return {
      name: path.basename(filePath),
      path: filePath,
      dataUrl: `data:${mime};base64,${fileBuffer.toString('base64')}`,
    };
  });

  ipcMain.handle(
    'dialog:save-image',
    async (
      _event,
      payload: { suggestedName: string; format: 'png' | 'jpg'; data: number[] }
    ) => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export Polaroid',
        defaultPath: payload.suggestedName,
        filters: [
          payload.format === 'png'
            ? { name: 'PNG Image', extensions: ['png'] }
            : { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
        ],
      });

      if (canceled || !filePath) {
        return { canceled: true };
      }

      await fs.writeFile(filePath, Buffer.from(payload.data));
      return { canceled: false, filePath };
    }
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
