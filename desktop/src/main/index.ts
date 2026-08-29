import { app, BrowserWindow, dialog } from 'electron';
import { t } from './i18n.js';
import { log } from './logger.js';
import { buildMenu } from './menu.js';
import { APP_NAME } from './paths.js';
import { shutdownServer, startServer } from './server.js';
import { createWindow, mainWindow, persistWindowState, showApp, showError, showLoading } from './window.js';

// 必须赶在任何 app.getPath() 之前，否则 userData 会落到 "@agent-mock/desktop" 这种带斜杠的目录。
app.setName(APP_NAME);
app.setAppUserModelId('com.agentmocker.app');

// Mock 服务要独占端口，多开没有意义：第二个实例把已有窗口唤到前台就退出。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = mainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(bootstrap).catch((error) => {
    log.error('启动失败', error);
    dialog.showErrorBox(t('dialog.startFailed.title'), describe(error));
    app.quit();
  });

  app.on('activate', () => {
    // macOS 点 Dock 图标时窗口可能已经关了，但服务还在跑，重建窗口即可。
    if (BrowserWindow.getAllWindows().length === 0) void bootstrap();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    // 先让 Fastify 收尾、SQLite 落盘，再真正退出。
    event.preventDefault();
    quitting = true;
    void (async () => {
      // app.exit() 不会走窗口的 close 事件，窗口位置得在这里显式存一次。
      persistWindowState();
      await shutdownServer();
      log.close();
      app.exit(0);
    })();
  });
}

async function bootstrap(): Promise<void> {
  buildMenu();
  createWindow();
  await showLoading();

  try {
    const info = await startServer();
    await showApp(info);
    if (info.requestedPort !== null) notifyPortFallback(info.requestedPort, info.port, info.url);
  } catch (error) {
    log.error('Mock 服务启动失败', error);
    await showError(describe(error));
  }
}

function notifyPortFallback(wanted: number, actual: number, url: string): void {
  void dialog.showMessageBox({
    type: 'warning',
    title: t('dialog.portBusy.title'),
    message: t('dialog.portBusy.message', { wanted, actual }),
    detail: t('dialog.portBusy.detail', { url }),
    buttons: [t('dialog.ok')],
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

process.on('uncaughtException', (error) => log.error('未捕获异常', error));
process.on('unhandledRejection', (reason) => log.error('未处理的 Promise 拒绝', reason));
