/**
 * Doorway Desktop - Main Process
 *
 * Electron main process with IPC handlers for terminal, git, and database operations.
 */

import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const devServerEnabled =
  process.env.DOORWAY_DESKTOP_DEV_SERVER === '1' || process.env.NODE_ENV === 'development';
const launchCwd = process.env.INIT_CWD?.trim() ? process.env.INIT_CWD : process.cwd();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'Doorway',
    backgroundColor: '#F2F2F2',
    autoHideMenuBar: !devServerEnabled,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.cjs'),
    },
  });

  if (!devServerEnabled) {
    mainWindow.setMenuBarVisibility(false);
  }

  // Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (devServerEnabled) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  console.log('[Main] Window created');
}

import { setupMainHandlers, setMainWindow } from './handlers/index.js';

// Setup IPC handlers
async function setupHandlers() {
  try {
    // Ensure .doorway directory exists
    const dataDir = join(app.getPath('userData'), '.doorway');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    await setupMainHandlers({ cwd: launchCwd, dataDir });
    console.log('[Main] Handlers registered');
  } catch (err) {
    console.error('[Main] Failed to setup handlers:', err);
  }
}

app.whenReady().then(async () => {
  await setupHandlers();
  createWindow();
  if (mainWindow) {
    setMainWindow(mainWindow);
  }

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
