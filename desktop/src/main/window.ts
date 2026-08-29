import { BrowserWindow, shell } from 'electron';
import { t } from './i18n.js';
import { log } from './logger.js';
import { preloadPath, rendererFile } from './paths.js';
import type { ServerInfo } from './server.js';
import { loadSettings, updateSettings } from './settings.js';

let win: BrowserWindow | null = null;

export function mainWindow(): BrowserWindow | null {
  return win;
}

export function createWindow(): BrowserWindow {
  const { window: bounds } = loadSettings();

  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // Windows / Linux 不显示窗口菜单栏；buildMenu 设置的应用菜单仅用来注册
  // 快捷键（复制 Mock API 地址、重启服务等），removeMenu 后依然生效。
  // macOS 的菜单在系统顶栏，此调用对它无效。
  win.removeMenu();

  if (bounds.maximized) win.maximize();
  win.once('ready-to-show', () => win?.show());

  // 页面标题固定成“应用名 + base_url”，Mock 服务的地址一眼可见。
  win.on('page-title-updated', (event) => event.preventDefault());

  // 站外链接（文档、GitHub 等）交给系统浏览器，不在应用里开新窗口。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 只允许在本地服务和内置提示页之间跳转。
  win.webContents.on('will-navigate', (event, url) => {
    const current = win?.webContents.getURL() ?? '';
    const sameOrigin = safeOrigin(url) !== null && safeOrigin(url) === safeOrigin(current);
    if (!sameOrigin && !url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  win.on('close', rememberBounds);
  win.on('closed', () => {
    win = null;
  });

  return win;
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function rememberBounds(): void {
  if (!win || win.isDestroyed()) return;
  const maximized = win.isMaximized();
  // 最大化时 getBounds() 返回的是屏幕尺寸，取还原后的尺寸才有意义。
  const { width, height, x, y } = maximized ? win.getNormalBounds() : win.getBounds();
  updateSettings({ window: { width, height, x, y, maximized } });
}

/**
 * 退出流程里会直接 app.exit()，窗口的 close 事件不一定触发，
 * 所以这里给主进程一个显式落盘窗口位置的入口。
 */
export function persistWindowState(): void {
  rememberBounds();
}

export async function showLoading(): Promise<void> {
  if (!win) return;
  win.setTitle(t('loading.title'));
  await win.loadFile(rendererFile('loading'), {
    query: { text: t('loading.text') },
  });
}

export async function showApp(info: ServerInfo): Promise<void> {
  if (!win) return;
  await win.loadURL(info.url);
  win.setTitle(`${t('menu.app')} — ${info.url}`);
}

export async function showError(message: string): Promise<void> {
  if (!win) return;
  log.error('显示启动失败页', message);
  win.setTitle(t('error.title'));
  await win.loadFile(rendererFile('error'), {
    query: { title: t('error.title'), message, hint: t('error.hint') },
  });
  win.show();
}
