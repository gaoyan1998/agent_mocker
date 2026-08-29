import { app, clipboard, dialog, Menu, type MenuItemConstructorOptions, shell } from 'electron';
import { t } from './i18n.js';
import { log } from './logger.js';
import { dataDir, logFilePath } from './paths.js';
import { restartServer, serverInfo } from './server.js';
import { showApp, showError } from './window.js';

const isMac = process.platform === 'darwin';

function baseUrl(): string {
  return serverInfo()?.url ?? '';
}

function copyBaseUrl(): void {
  const url = baseUrl();
  if (url) clipboard.writeText(`${url}/v1`);
}

async function handleRestart(): Promise<void> {
  try {
    const info = await restartServer();
    await showApp(info);
  } catch (error) {
    log.error('重启 Mock 服务失败', error);
    await showError(error instanceof Error ? error.message : String(error));
  }
}

function showAbout(): void {
  const url = baseUrl();
  dialog.showMessageBox({
    type: 'info',
    title: t('menu.about'),
    message: `${t('menu.app')} ${app.getVersion()}`,
    detail: t('about.detail', {
      url,
      dataDir: dataDir(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    }),
    buttons: [t('dialog.ok')],
  });
}

export function buildMenu(): void {
  const serviceItems: MenuItemConstructorOptions[] = [
    { label: t('menu.copyBaseUrl'), accelerator: 'CmdOrCtrl+Shift+C', click: copyBaseUrl },
    {
      label: t('menu.openInBrowser'),
      click: () => {
        const url = baseUrl();
        if (url) void shell.openExternal(url);
      },
    },
    { type: 'separator' },
    { label: t('menu.openDataDir'), click: () => void shell.openPath(dataDir()) },
    { label: t('menu.openLogFile'), click: () => void shell.openPath(logFilePath()) },
    { type: 'separator' },
    { label: t('menu.restartServer'), accelerator: 'CmdOrCtrl+Shift+R', click: () => void handleRestart() },
  ];

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: t('menu.app'),
      submenu: [
        { label: t('menu.about'), click: showAbout },
        { type: 'separator' },
        { label: t('menu.services'), role: 'services' },
        { type: 'separator' },
        { label: t('menu.hide'), role: 'hide' },
        { label: t('menu.hideOthers'), role: 'hideOthers' },
        { label: t('menu.unhide'), role: 'unhide' },
        { type: 'separator' },
        { label: t('menu.quit'), role: 'quit' },
      ],
    });
  }

  template.push({
    label: t('menu.file'),
    submenu: isMac
      ? serviceItems
      : [...serviceItems, { type: 'separator' }, { label: t('menu.quit'), role: 'quit' }],
  });

  template.push({
    label: t('menu.edit'),
    submenu: [
      { label: t('menu.undo'), role: 'undo' },
      { label: t('menu.redo'), role: 'redo' },
      { type: 'separator' },
      { label: t('menu.cut'), role: 'cut' },
      { label: t('menu.copy'), role: 'copy' },
      { label: t('menu.paste'), role: 'paste' },
      { label: t('menu.selectAll'), role: 'selectAll' },
    ],
  });

  template.push({
    label: t('menu.view'),
    submenu: [
      { label: t('menu.reload'), role: 'reload' },
      { label: t('menu.devTools'), role: 'toggleDevTools' },
      { type: 'separator' },
      { label: t('menu.resetZoom'), role: 'resetZoom' },
      { label: t('menu.zoomIn'), role: 'zoomIn' },
      { label: t('menu.zoomOut'), role: 'zoomOut' },
      { type: 'separator' },
      { label: t('menu.fullscreen'), role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: t('menu.window'),
    submenu: [
      { label: t('menu.minimize'), role: 'minimize' },
      { label: t('menu.close'), role: 'close' },
    ],
  });

  if (!isMac) {
    template.push({
      label: t('menu.help'),
      submenu: [{ label: t('menu.about'), click: showAbout }],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
