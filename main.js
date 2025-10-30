const { app, BrowserWindow, screen, ipcMain, shell, Menu, nativeImage, globalShortcut, Tray, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let mainWindow;
let settingsWindow;
let tray = null; // Иконка в системном трее
let overlayWindows = []; // Окна ScreenHighlighter overlay
let isWindowPinned = true; // По умолчанию окно закреплено
let windowPosition = null; // Сохраненная позиция окна
let userSettings = {
  alwaysOnTop: true,
  autoHide: false,
  startup: false,
  theme: 'auto',
  position: 'top',
  iconSize: 48,
  dockScale: 1,
  hotkeys: {
    toggleDock: 'Ctrl+H',
    quit: 'Ctrl+Q',
    addApp: 'Ctrl+N',
    help: 'F1'
  }
};

// Путь к файлу настроек
const settingsPath = path.join(os.homedir(), '.windows-dock-settings.json');

// Загрузка настроек
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      isWindowPinned = settings.isWindowPinned !== undefined ? settings.isWindowPinned : true;
      windowPosition = settings.windowPosition || null;
      if (settings.userSettings && typeof settings.userSettings === 'object') {
        userSettings = {
          ...userSettings,
          ...settings.userSettings,
          hotkeys: {
            ...userSettings.hotkeys,
            ...(settings.userSettings.hotkeys || {})
          }
        };
      }
    }
  } catch (error) {
    console.error('Ошибка загрузки настроек:', error);
  }
}

// Сохранение настроек
function saveSettings() {
  try {
    const settings = {
      isWindowPinned,
      windowPosition: windowPosition || (mainWindow ? { x: mainWindow.getPosition()[0], y: mainWindow.getPosition()[1] } : null),
      userSettings
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error);
  }
}

function applyStartupSetting() {
  try {
    // Настройка автозапуска для Windows/macOS (Electron управляет платформенной реализацией)
    app.setLoginItemSettings({
      openAtLogin: !!userSettings.startup,
      path: process.execPath,
      args: []
    });
  } catch (error) {
    console.error('Не удалось применить настройку автозапуска:', error);
  }
}

// Применение позиции окна согласно настройке
function applyWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const bounds = mainWindow.getBounds();
  
  let x, y;
  const margin = 10;
  
  switch (userSettings.position) {
    case 'top':
      x = workArea.x + Math.round((workArea.width - bounds.width) / 2);
      y = workArea.y + margin;
      break;
    case 'bottom':
      x = workArea.x + Math.round((workArea.width - bounds.width) / 2);
      y = workArea.y + workArea.height - bounds.height - margin;
      break;
    case 'left':
      x = workArea.x + margin;
      y = workArea.y + Math.round((workArea.height - bounds.height) / 2);
      break;
    case 'right':
      x = workArea.x + workArea.width - bounds.width - margin;
      y = workArea.y + Math.round((workArea.height - bounds.height) / 2);
      break;
    default:
      // Используем сохраненную позицию или позицию по умолчанию
      if (windowPosition) {
        x = windowPosition.x;
        y = windowPosition.y;
      } else {
        x = workArea.x + Math.round((workArea.width - bounds.width) / 2);
        y = workArea.y + margin;
      }
  }
  
  mainWindow.setPosition(x, y);
  windowPosition = { x, y };
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  
  // Загружаем настройки
  loadSettings();
  
  // Определяем начальную позицию окна
  let x, y;
  if (windowPosition && userSettings.position === 'top') {
    // Используем сохраненную позицию только если позиция не изменилась
    x = windowPosition.x;
    y = windowPosition.y;
  } else {
    // Позиция будет применена после создания окна через applyWindowPosition
    x = Math.round((screenWidth - 600) / 2);
    y = 10;
  }
  
  // Создаем окно dock панели
  mainWindow = new BrowserWindow({
    width: 400, // Начальная ширина
    height: 70, // Начальная высота
    minWidth: 180, // Минимальная ширина
    minHeight: 50, // Минимальная высота
    maxWidth: screenWidth, // Максимальная ширина = ширина экрана
    maxHeight: screenHeight, // Разрешаем большую высоту для вертикального дока
    x: x,
    y: y,
    frame: false, // Убираем рамку окна
    transparent: true, // Делаем окно прозрачным
    resizable: true, // Разрешаем изменение размера программно
    alwaysOnTop: !!userSettings.alwaysOnTop, // Всегда поверх других окон
    skipTaskbar: true, // Не показывать в панели задач
    movable: !isWindowPinned, // Устанавливаем возможность перетаскивания
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');
  
  // Убираем меню
  mainWindow.setMenu(null);
  
  // Показываем окно без анимации
  mainWindow.showInactive();
  
  // Применяем позицию согласно настройке (после того как окно создано и размер установлен)
  mainWindow.once('ready-to-show', () => {
    // Подождем немного чтобы окно полностью загрузилось
    setTimeout(() => {
      applyWindowPosition();
    }, 100);
  });
  
  // Обработчик перемещения окна
  mainWindow.on('moved', () => {
    if (!isWindowPinned) {
      const position = mainWindow.getPosition();
      windowPosition = { x: position[0], y: position[1] };
      saveSettings();
    }
  });
  
  // Автоскрытие панели при потере фокуса (если включено в настройках)
  mainWindow.on('blur', () => {
    if (userSettings.autoHide && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  // Обновление меню трея при изменении видимости окна
  mainWindow.on('show', () => {
    if (tray) updateTrayMenu();
  });
  
  mainWindow.on('hide', () => {
    if (tray) updateTrayMenu();
  });

  // Обработка закрытия окна
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Обновляем меню трея после закрытия окна
    if (tray) updateTrayMenu();
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 600,
    x: Math.round((screenWidth - 500) / 2),
    y: Math.round((screenHeight - 600) / 2),
    frame: true,
    transparent: false,
    resizable: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: 'Настройки Windows Dock',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  settingsWindow.loadFile('settings.html');
  settingsWindow.setMenu(null);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Создание нативного контекстного меню
function createContextMenu(hasSelectedItem = false) {
  const template = [
    {
      label: 'Удалить',
      enabled: hasSelectedItem, // Активен только если выбран элемент
      click: () => {
        mainWindow.webContents.send('context-menu-action', 'remove-app');
      }
    },
    { type: 'separator' },
    {
      label: isWindowPinned ? '📌 Открепить окно' : '📌 Закрепить окно',
      type: 'checkbox',
      checked: isWindowPinned,
      click: () => {
        toggleWindowPin();
      }
    },
    { type: 'separator' },
    {
      label: '🎯 ScreenHighlighter',
      click: () => {
        toggleScreenHighlighter();
      }
    },
    { type: 'separator' },
    {
      label: 'Горячие клавиши',
      click: () => {
        mainWindow.webContents.send('context-menu-action', 'help');
      }
    },
    {
      label: 'Настройки',
      click: () => {
        mainWindow.webContents.send('context-menu-action', 'settings');
      }
    }
  ];

  return Menu.buildFromTemplate(template);
}

/**
 * Создает полноэкранные прозрачные overlay окна для каждого дисплея.
 * Окна по умолчанию пропускают клики через себя; при начале выделения включается захват мыши.
 */
function createOverlayWindows() {
  const displays = screen.getAllDisplays();
  const windows = [];

  for (const display of displays) {
    const { bounds } = display;
    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      hasShadow: false,
      show: false,
      type: process.platform === 'darwin' ? 'panel' : 'toolbar',
      webPreferences: {
        preload: path.join(__dirname, 'overlay-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        devTools: true,
      },
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true, { forward: true });

    win.loadFile(path.join(__dirname, 'overlay.html'));
    win.once('ready-to-show', () => {
      win.showInactive();
    });

    windows.push(win);
  }
  return windows;
}

// Регистрация IPC обработчиков для overlay окон
function registerOverlayIpc() {
  ipcMain.on('overlay:set-ignore-mouse', (_evt, ignore) => {
    for (const w of overlayWindows) {
      if (!w.isDestroyed()) {
        w.setIgnoreMouseEvents(!!ignore, { forward: !!ignore });
      }
    }
  });

  ipcMain.on('overlay:show', () => {
    for (const w of overlayWindows) {
      if (!w.isDestroyed()) w.showInactive();
    }
  });

  ipcMain.on('overlay:hide', () => {
    for (const w of overlayWindows) {
      if (!w.isDestroyed()) w.hide();
    }
  });
}

// Преобразование строки горячей клавиши в формат globalShortcut
function parseHotkey(hotkeyString) {
  if (!hotkeyString) return null;
  
  // Преобразуем Ctrl в CommandOrControl для кроссплатформенности
  let parsed = hotkeyString.replace(/Ctrl/gi, 'CommandOrControl');
  
  // Убираем пробелы
  parsed = parsed.replace(/\s+/g, '');
  
  return parsed;
}

// Регистрация глобальных горячих клавиш из настроек
function registerHotkeys() {
  // Отменяем только горячие клавиши из настроек (не ScreenHighlighter)
  // Отменяем все перед регистрацией новых
  globalShortcut.unregisterAll();
  
  if (!userSettings.hotkeys) {
    // Регистрируем только ScreenHighlighter если нет настроек
    registerScreenHighlighterShortcuts();
    return;
  }
  
  // Регистрируем горячую клавишу для показа/скрытия dock
  const toggleDockHotkey = parseHotkey(userSettings.hotkeys.toggleDock);
  if (toggleDockHotkey) {
    try {
      globalShortcut.register(toggleDockHotkey, () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
          }
        }
      });
    } catch (error) {
      console.error('Ошибка регистрации горячей клавиши toggleDock:', error);
    }
  }
  
  // Регистрируем горячую клавишу для выхода
  const quitHotkey = parseHotkey(userSettings.hotkeys.quit);
  if (quitHotkey) {
    try {
      globalShortcut.register(quitHotkey, () => {
        app.quit();
      });
    } catch (error) {
      console.error('Ошибка регистрации горячей клавиши quit:', error);
    }
  }
  
  // Регистрируем горячую клавишу для помощи
  const helpHotkey = parseHotkey(userSettings.hotkeys.help);
  if (helpHotkey) {
    try {
      globalShortcut.register(helpHotkey, () => {
        if (mainWindow) {
          mainWindow.webContents.send('context-menu-action', 'help');
        }
      });
    } catch (error) {
      console.error('Ошибка регистрации горячей клавиши help:', error);
    }
  }
  
  // Горячая клавиша для добавления приложения регистрируется только если окно настроек открыто
  // (так как требует UI взаимодействия)
  
  // Регистрируем горячие клавиши ScreenHighlighter после основных
  registerScreenHighlighterShortcuts();
}

// Регистрация глобальных горячих клавиш для ScreenHighlighter
function registerScreenHighlighterShortcuts() {
  // Переключение видимости overlay
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    const anyVisible = overlayWindows.some(w => w.isVisible());
    for (const w of overlayWindows) {
      if (anyVisible) w.hide(); else w.showInactive();
    }
  });

  // Очистка выделения
  globalShortcut.register('Escape', () => {
    for (const w of overlayWindows) {
      if (!w.isDestroyed()) w.webContents.send('overlay:clear');
    }
  });
}

// Переключение ScreenHighlighter
function toggleScreenHighlighter() {
  const anyVisible = overlayWindows.some(w => w.isVisible());
  if (anyVisible) {
    for (const w of overlayWindows) {
      if (!w.isDestroyed()) w.hide();
    }
  } else {
    // Если окна еще не созданы, создаем их
    if (overlayWindows.length === 0) {
      overlayWindows = createOverlayWindows();
    }
    for (const w of overlayWindows) {
      if (!w.isDestroyed()) w.showInactive();
    }
  }
}

// Создание иконки в системном трее
function createTrayIcon() {
  // Пробуем загрузить кастомную иконку если она есть
  const iconPath = path.join(__dirname, 'icon.png');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  
  // Создаем простую иконку на основе эмоджи (используем 📌 для dock)
  try {
    // Простая 16x16 иконка с прозрачным фоном
    const icon16 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAVklEQVR4nGNgYGD4z0AAYGL4/58RxkHhDx48+M8ABowMDAwM/xkZGf+D5BiQOCgcBgYG/xlBGhkZ/jMwMDAwMvz/z8jIyMDw/z8jSA8DIwPDP0aYJhQOALW4FPHjregEAAAAAElFTkSuQmCC';
    return nativeImage.createFromDataURL(icon16);
  } catch (e) {
    // Fallback - создаем пустую иконку
    const img = nativeImage.createEmpty();
    return img;
  }
}

// Создание системного трея
function createTray() {
  const image = createTrayIcon();
  tray = new Tray(image);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📌 Windows Dock',
      enabled: false
    },
    { type: 'separator' },
    {
      label: mainWindow && mainWindow.isVisible() ? '🙈 Скрыть панель' : '👁️ Показать панель',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
          }
          updateTrayMenu();
        }
      }
    },
    {
      label: isWindowPinned ? '🔓 Открепить окно' : '📌 Закрепить окно',
      click: () => {
        toggleWindowPin();
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: '🎯 ScreenHighlighter',
      click: () => {
        toggleScreenHighlighter();
      }
    },
    { type: 'separator' },
    {
      label: '⚙️ Настройки',
      click: () => {
        createSettingsWindow();
      }
    },
    { type: 'separator' },
    {
      label: '❌ Выход',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Windows Dock - Панель приложений');
  tray.setContextMenu(contextMenu);
  
  // Клик по иконке трея - показ/скрытие окна
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
      updateTrayMenu();
    }
  });
}

// Обновление меню трея
function updateTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📌 Windows Dock',
      enabled: false
    },
    { type: 'separator' },
    {
      label: mainWindow && mainWindow.isVisible() ? '🙈 Скрыть панель' : '👁️ Показать панель',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
          }
          updateTrayMenu();
        }
      }
    },
    {
      label: isWindowPinned ? '🔓 Открепить окно' : '📌 Закрепить окно',
      click: () => {
        toggleWindowPin();
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: '🎯 ScreenHighlighter',
      click: () => {
        toggleScreenHighlighter();
      }
    },
    { type: 'separator' },
    {
      label: '⚙️ Настройки',
      click: () => {
        createSettingsWindow();
      }
    },
    { type: 'separator' },
    {
      label: '❌ Выход',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

// Переключение состояния закрепления окна
function toggleWindowPin() {
  isWindowPinned = !isWindowPinned;
  
  if (mainWindow) {
    mainWindow.setMovable(!isWindowPinned);
    
    // Сохраняем текущую позицию
    const position = mainWindow.getPosition();
    windowPosition = { x: position[0], y: position[1] };
    
    // Сохраняем настройки
    saveSettings();
    
    // Обновляем меню трея
    updateTrayMenu();
    
    // Уведомляем renderer о смене состояния
    mainWindow.webContents.send('window-pin-changed', isWindowPinned);
  }
}

// Обработка готовности приложения
app.whenReady().then(() => {
  createWindow();
  // Применяем автозапуск согласно сохраненной настройке
  applyStartupSetting();
  
  // Создание иконки в системном трее
  createTray();
  
  // Регистрация IPC обработчиков для ScreenHighlighter (окна создаются по требованию)
  registerOverlayIpc();
  
  // Регистрация глобальных горячих клавиш из настроек (включая ScreenHighlighter)
  registerHotkeys();
  
  // Поддержка overlay окон в фоне
  app.on('browser-window-focus', () => {
    // Поддерживаем overlay окна не фокусируемыми
    for (const w of overlayWindows) { 
      if (!w.isDestroyed()) w.blur(); 
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  // Обработчик изменения размера экрана для обновления позиции
  screen.on('display-metrics-changed', () => {
    if (mainWindow && !mainWindow.isDestroyed() && userSettings.position) {
      applyWindowPosition();
    }
  });
});

// Выход из приложения, когда все окна закрыты
// Не закрываем приложение, так как оно работает из трея
app.on('window-all-closed', () => {
  // Не закрываем приложение - оно должно работать в фоне из трея
  // app.quit() вызывается только из меню трея
});

app.on('will-quit', () => {
  // Отключаем все глобальные горячие клавиши при выходе
  globalShortcut.unregisterAll();
});

// Показ контекстного меню
ipcMain.handle('show-context-menu', (event, x, y, hasSelectedItem = false) => {
  const contextMenu = createContextMenu(hasSelectedItem);
  contextMenu.popup({
    window: mainWindow,
    x: Math.round(x),
    y: Math.round(y)
  });
});

// Открытие окна настроек
ipcMain.handle('open-settings', () => {
  createSettingsWindow();
});

// Управление настройками
ipcMain.handle('get-settings', () => {
  return {
    alwaysOnTop: !!userSettings.alwaysOnTop,
    autoHide: !!userSettings.autoHide,
    startup: !!userSettings.startup,
    theme: userSettings.theme,
    position: userSettings.position,
    iconSize: userSettings.iconSize,
    dockScale: userSettings.dockScale || 1,
    isWindowPinned: isWindowPinned,
    windowPosition: windowPosition,
    hotkeys: userSettings.hotkeys
  };
});

// Получение списка приложений
ipcMain.handle('get-apps', async () => {
  if (mainWindow) {
    try {
      // Получаем приложения напрямую из localStorage
      const apps = await mainWindow.webContents.executeJavaScript(`
        (() => {
          const defaultApps = [
            { id: 'explorer', name: 'Проводник', icon: '📁', path: 'explorer' },
            { id: 'chrome', name: 'Chrome', icon: '🌐', path: 'chrome' },
            { id: 'vscode', name: 'VS Code', icon: '💻', path: 'code' },
            { id: 'terminal', name: 'Терминал', icon: '⚡', path: 'cmd' },
            { id: 'calculator', name: 'Калькулятор', icon: '🔢', path: 'calc' },
            { id: 'settings', name: 'Настройки', icon: '⚙️', path: 'ms-settings:' }
          ];
          
          const saved = localStorage.getItem('dockApps');
          return saved ? JSON.parse(saved) : defaultApps;
        })()
      `);
      return apps || [];
    } catch (error) {
      console.error('Ошибка получения приложений:', error);
      // Возвращаем приложения по умолчанию в случае ошибки
      return [
        { id: 'explorer', name: 'Проводник', icon: '📁', path: 'explorer' },
        { id: 'chrome', name: 'Chrome', icon: '🌐', path: 'chrome' },
        { id: 'vscode', name: 'VS Code', icon: '💻', path: 'code' },
        { id: 'terminal', name: 'Терминал', icon: '⚡', path: 'cmd' },
        { id: 'calculator', name: 'Калькулятор', icon: '🔢', path: 'calc' },
        { id: 'settings', name: 'Настройки', icon: '⚙️', path: 'ms-settings:' }
      ];
    }
  }
  // Возвращаем приложения по умолчанию если нет главного окна
  return [
    { id: 'explorer', name: 'Проводник', icon: '📁', path: 'explorer' },
    { id: 'chrome', name: 'Chrome', icon: '🌐', path: 'chrome' },
    { id: 'vscode', name: 'VS Code', icon: '💻', path: 'code' },
    { id: 'terminal', name: 'Терминал', icon: '⚡', path: 'cmd' },
    { id: 'calculator', name: 'Калькулятор', icon: '🔢', path: 'calc' },
    { id: 'settings', name: 'Настройки', icon: '⚙️', path: 'ms-settings:' }
  ];
});

// Добавление приложения
ipcMain.handle('add-app', (event, app) => {
  try {
    if (mainWindow) {
      mainWindow.webContents.send('add-app-from-settings', app);
    }
    return { success: true };
  } catch (error) {
    console.error('Ошибка добавления приложения:', error);
    return { success: false, error: error.message };
  }
});

// Удаление приложения
ipcMain.handle('remove-app', (event, appId) => {
  try {
    if (mainWindow) {
      mainWindow.webContents.send('remove-app-from-settings', appId);
    }
    return { success: true };
  } catch (error) {
    console.error('Ошибка удаления приложения:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-settings', (event, settings) => {
  try {
    // Обновляем и применяем настройки
    userSettings = {
      ...userSettings,
      ...settings,
      hotkeys: { ...userSettings.hotkeys, ...(settings.hotkeys || {}) }
    };

    if (mainWindow) {
      mainWindow.setAlwaysOnTop(!!userSettings.alwaysOnTop);
      // Автоскрытие уже обрабатывается через событие blur
    }

    // Применяем автозапуск
    applyStartupSetting();
    
    // Перерегистрируем горячие клавиши с новыми настройками (включая ScreenHighlighter)
    registerHotkeys();
    
    // Применяем новую позицию окна если она изменилась
    if (mainWindow && !mainWindow.isDestroyed()) {
      applyWindowPosition();
    }

    // Сохраняем на диск
    saveSettings();

    // Отправляем обновленные настройки в окно dock'а для применения масштаба
    if (mainWindow) {
      mainWindow.webContents.send('settings-updated', userSettings);
    }

    return { success: true };
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error);
    return { success: false, error: error.message };
  }
});

// IPC обработчики
ipcMain.handle('launch-app', async (event, appPath) => {
  try {
    await shell.openPath(appPath);
    return { success: true };
  } catch (error) {
    console.error('Ошибка запуска приложения:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-url', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Ошибка открытия URL:', error);
    return { success: false, error: error.message };
  }
});

// Получение нативной иконки файла (Windows/платформенная)
ipcMain.handle('get-native-icon', async (event, filePath, size = 'large') => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid path' };
    }

    let resolvedPath = filePath;

    // На Windows пробуем раскрыть ярлыки .lnк до корректного источника иконки
    if (process.platform === 'win32') {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.lnk') {
        try {
          const shortcut = shell.readShortcutLink(filePath);

          // Вспомогательная нормализация путей с переменными окружения/индексами
          const expandEnv = (input) => input.replace(/%([^%]+)%/g, (m, name) => process.env[name] || m);
          const normalizeIconPath = (iconStr) => {
            if (!iconStr || typeof iconStr !== 'string') return null;
            let iconPathStr = iconStr.trim();
            // Убираем префикс '@' (формат ресурса)
            if (iconPathStr.startsWith('@')) iconPathStr = iconPathStr.slice(1);
            // Убираем кавычки
            iconPathStr = iconPathStr.replace(/^"|"$/g, '');
            // Убираем индекс ресурса (",0", ",-123") если присутствует
            const commaIdx = iconPathStr.lastIndexOf(',');
            if (commaIdx > 1) {
              iconPathStr = iconPathStr.slice(0, commaIdx).trim();
            }
            // Экспандим %ENV%
            iconPathStr = expandEnv(iconPathStr);
            // Если путь относительный — пробуем разрешить относительно .lnk
            if (!path.isAbsolute(iconPathStr)) {
              const relToLnk = path.resolve(path.dirname(filePath), iconPathStr);
              if (fs.existsSync(relToLnk)) return relToLnk;
              // Пробуем System32, если задано только имя dll/exe
              const systemRoot = process.env.SystemRoot || 'C://Windows';
              const sys32 = path.join(systemRoot, 'System32', iconPathStr);
              if (fs.existsSync(sys32)) return sys32;
            }
            return iconPathStr;
          };

          // Приоритет: заданная иконка ярлыка → целевой exe/файл
          let candidate = null;
          if (shortcut && shortcut.icon) {
            candidate = normalizeIconPath(shortcut.icon);
          }
          if (!candidate && shortcut && shortcut.target) {
            candidate = normalizeIconPath(shortcut.target) || shortcut.target;
          }
          if (candidate) {
            resolvedPath = candidate;
          }
        } catch (e) {
          // Не удалось прочитать ярлык — оставляем исходный путь
        }
      }
    }

    let icon = null;

    // Основная попытка: системная иконка файла/цели
    try {
      icon = await app.getFileIcon(resolvedPath, { size });
    } catch (e) {
      icon = null;
    }

    // Фолбэк: если для раскрытого пути не нашли, пробуем исходный .lnk
    if ((!icon || icon.isEmpty()) && resolvedPath !== filePath) {
      try {
        icon = await app.getFileIcon(filePath, { size });
      } catch (e) {
        icon = null;
      }
    }

    // Дополнительный фолбэк: миниатюра файла (если доступно)
    if ((!icon || icon.isEmpty()) && typeof nativeImage.createThumbnailFromPath === 'function') {
      try {
        const thumb = await nativeImage.createThumbnailFromPath(resolvedPath, { width: 64, height: 64 });
        if (thumb && !thumb.isEmpty()) {
          icon = thumb;
        }
      } catch (e) {
        // пропускаем
      }
    }

    // Последний фолбэк: прямая загрузка как изображения
    if ((!icon || icon.isEmpty())) {
      try {
        const direct = nativeImage.createFromPath(resolvedPath);
        if (direct && !direct.isEmpty()) {
          icon = direct;
        }
      } catch (e) {
        // пропускаем
      }
    }

    if (icon && !icon.isEmpty()) {
      const resized = icon.resize({ width: 32, height: 32 });
      const dataUrl = resized.toDataURL();
      return { success: true, dataUrl };
    }

    return { success: false, error: 'Icon not found' };
  } catch (error) {
    console.error('Ошибка получения нативной иконки:', error);
    return { success: false, error: error.message };
  }
});

// Показать/скрыть dock
ipcMain.handle('toggle-dock', () => {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  }
});

// Выход из приложения
ipcMain.handle('quit-app', () => {
  app.quit();
});

// Получение состояния закрепления
ipcMain.handle('get-window-pin-state', () => {
  return isWindowPinned;
});

// Управление закреплением окна
ipcMain.handle('toggle-window-pin', () => {
  toggleWindowPin();
  return isWindowPinned;
});

// Получение текущей позиции окна
ipcMain.handle('get-window-position', () => {
  if (mainWindow) {
    const position = mainWindow.getPosition();
    return { x: position[0], y: position[1] };
  }
  return { x: 0, y: 0 };
});


// Прилипание окна к краям экрана и ориентация дока
ipcMain.handle('snap-window', () => {
  if (!mainWindow) return { snapped: false };

  try {
    const currentBounds = mainWindow.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: currentBounds.x + Math.floor(currentBounds.width / 2),
      y: currentBounds.y + Math.floor(currentBounds.height / 2)
    });
    const workArea = display.workArea; // { x, y, width, height }
    const bounds = currentBounds;

    const margin = 10;
    // Уменьшаем порог прилипания, чтобы левый край не срабатывал слишком рано
    const threshold = 24; // раньше было 64

    // Используем неотрицательные расстояния: если окно уже заехало за край,
    // считаем расстояние 0, чтобы снап сработал
    const distances = {
      left: Math.max(0, bounds.x - workArea.x),
      right: Math.max(0, (workArea.x + workArea.width) - (bounds.x + bounds.width)),
      top: Math.max(0, bounds.y - workArea.y),
      bottom: Math.max(0, (workArea.y + workArea.height) - (bounds.y + bounds.height))
    };

    let nearestEdge = 'left';
    let minDist = Infinity;
    for (const [edge, dist] of Object.entries(distances)) {
      if (dist < minDist) {
        minDist = dist;
        nearestEdge = edge;
      }
    }

    if (minDist > threshold) {
      // Не меняем ориентацию, пока реально не прилипли
      return { snapped: false };
    }

    let newX = bounds.x;
    let newY = bounds.y;
    let orientation = 'horizontal';

    if (nearestEdge === 'left') {
      newX = workArea.x + margin;
      newY = Math.min(
        Math.max(bounds.y, workArea.y + margin),
        workArea.y + workArea.height - bounds.height - margin
      );
      orientation = 'vertical';
    } else if (nearestEdge === 'right') {
      newX = workArea.x + workArea.width - bounds.width - margin;
      newY = Math.min(
        Math.max(bounds.y, workArea.y + margin),
        workArea.y + workArea.height - bounds.height - margin
      );
      orientation = 'vertical';
    } else if (nearestEdge === 'top') {
      newY = workArea.y + margin;
      newX = Math.min(
        Math.max(bounds.x, workArea.x + margin),
        workArea.x + workArea.width - bounds.width - margin
      );
      orientation = 'horizontal';
    } else if (nearestEdge === 'bottom') {
      newY = workArea.y + workArea.height - bounds.height - margin;
      newX = Math.min(
        Math.max(bounds.x, workArea.x + margin),
        workArea.x + workArea.width - bounds.width - margin
      );
      orientation = 'horizontal';
    }

    mainWindow.setPosition(Math.round(newX), Math.round(newY));

    // Обновляем сохраненную позицию
    windowPosition = { x: Math.round(newX), y: Math.round(newY) };
    saveSettings();

    // Уведомляем renderer
    mainWindow.webContents.send('window-snapped', { edge: nearestEdge, orientation });
    return { snapped: true, edge: nearestEdge, orientation };
  } catch (error) {
    console.error('Ошибка прилипания окна:', error);
    return { snapped: false, error: error.message };
  }
});



// Автоматическое изменение размера окна под dock панель
ipcMain.handle('resize-window-to-content', async (_event, opts = {}) => {
  if (!mainWindow) return;
  
  try {
    // Получаем текущие границы окна
    const currentBounds = mainWindow.getBounds();
    // Определяем дисплей рядом с окном
    const display = screen.getDisplayNearestPoint({
      x: currentBounds.x + Math.floor(currentBounds.width / 2),
      y: currentBounds.y + Math.floor(currentBounds.height / 2)
    });
    
    // Получаем ориентацию и точный размер dock панели
    const orientation = opts.orientation || 'horizontal';
    const dockSize = await mainWindow.webContents.executeJavaScript(`
      ((orientation) => {
        const dock = document.querySelector('.dock');
        const container = document.querySelector('.dock-container');
        
        if (!dock || !container) return { width: 200, height: 70 };
        
        // Мягкий принудительный reflow без скрытия (избегаем визуального мерцания)
        void dock.offsetWidth;
        
        // Получаем реальные размеры dock панели
        const dockRect = dock.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        let width, height;
        
        if (orientation === 'vertical') {
          // В вертикальной ориентации: ширина = ширина одной иконки + отступы
          const firstIcon = dock.querySelector('.dock-item');
          if (firstIcon) {
            const iconRect = firstIcon.getBoundingClientRect();
            width = Math.ceil(iconRect.width + 20); // ширина иконки + отступы
          } else {
            width = Math.ceil(70); // фолбэк для ширины одной иконки
          }
          height = Math.ceil(dockRect.height + 20); // высота всей dock панели + отступы
        } else {
          // В горизонтальной ориентации: используем полный размер dock панели
          width = Math.ceil(dockRect.width + 20); // 10px отступ с каждой стороны
          height = Math.ceil(dockRect.height + 20); // 10px отступ сверху и снизу
        }
        
        console.log('Точный размер dock панели:', {
          orientation: orientation,
          dockWidth: dockRect.width,
          dockHeight: dockRect.height,
          windowWidth: width,
          windowHeight: height,
          dockClasses: dock ? dock.className : 'no dock',
          firstIconFound: !!dock.querySelector('.dock-item')
        });
        
        return { width, height };
      })('${orientation}')
    `);
    
    // Текущий размер контента
    const currentContentSize = mainWindow.getContentSize();
    
    // Центрируем окно при изменении размера, но сохраняем якорный край если указан
    let newX = currentBounds.x;
    let newY = currentBounds.y;
    
    const anchor = opts.anchor; // 'left' | 'right' | 'top' | 'bottom' | null
    const margin = 10; // тот же margin, что и при снапе
    
    if (orientation === 'vertical') {
      // В вертикальной ориентации: ширина окна = ширине док-панели
      if (Math.abs(currentContentSize[0] - dockSize.width) > 2) {
        if (anchor === 'left') {
          // При левом крае фиксируем левую границу
          newX = display.workArea.x + margin;
        } else if (anchor === 'right') {
          // При правом крае фиксируем правую границу
          newX = display.workArea.x + display.workArea.width - dockSize.width - margin;
        } else {
          // Иначе центрируем по горизонтали относительно текущего положения
          newX = currentBounds.x + (currentContentSize[0] - dockSize.width) / 2;
        }

        // Проверяем границы конкретного дисплея
        const maxX = display.workArea.x + display.workArea.width - dockSize.width;
        const minX = display.workArea.x;
        newX = Math.max(minX, Math.min(newX, maxX));
      }
      
      // В вертикальной ориентации высота может изменяться при изменении количества иконок
      if (Math.abs(currentContentSize[1] - dockSize.height) > 2) {
        if (anchor === 'top') {
          // При верхнем крае фиксируем верхнюю границу
          newY = display.workArea.y + margin;
        } else if (anchor === 'bottom') {
          // При нижнем крае фиксируем нижнюю границу
          newY = display.workArea.y + display.workArea.height - dockSize.height - margin;
        } else {
          // Иначе центрируем по вертикали относительно текущего положения
          newY = currentBounds.y + (currentContentSize[1] - dockSize.height) / 2;
        }

        // Проверяем границы конкретного дисплея
        const maxY = display.workArea.y + display.workArea.height - dockSize.height;
        const minY = display.workArea.y;
        newY = Math.max(minY, Math.min(newY, maxY));
      }
    } else {
      // В горизонтальной ориентации: высота окна = высоте док-панели
      if (Math.abs(currentContentSize[0] - dockSize.width) > 2) {
        if (anchor === 'left') {
          // При левом крае фиксируем левую границу
          newX = display.workArea.x + margin;
        } else if (anchor === 'right') {
          // При правом крае фиксируем правую границу
          newX = display.workArea.x + display.workArea.width - dockSize.width - margin;
        } else {
          // Иначе центрируем по горизонтали относительно текущего положения
          newX = currentBounds.x + (currentContentSize[0] - dockSize.width) / 2;
        }

        // Проверяем границы конкретного дисплея
        const maxX = display.workArea.x + display.workArea.width - dockSize.width;
        const minX = display.workArea.x;
        newX = Math.max(minX, Math.min(newX, maxX));
      }
    }
    
    // Устанавливаем размер содержимого точно под dock панель
    mainWindow.setContentSize(dockSize.width, dockSize.height);
    
    // Устанавливаем позицию
    mainWindow.setPosition(Math.round(newX), Math.round(newY));
    
    // Обновляем сохраненную позицию
    windowPosition = { x: Math.round(newX), y: Math.round(newY) };
    
    console.log('Размер окна изменен под dock панель:', { orientation, size: dockSize });
    
    return { success: true, size: dockSize, orientation };
  } catch (error) {
    console.error('Ошибка изменения размера окна:', error);
    return { success: false, error: error.message };
  }
});


// Синхронное перемещение окна (абсолютное позиционирование)
ipcMain.on('move-window-absolute', (event, targetX, targetY) => {
  if (mainWindow && !isWindowPinned) {
    // Просто устанавливаем позицию без округления
    mainWindow.setPosition(targetX, targetY);
    
    // Обновляем сохраненную позицию
    windowPosition = { x: targetX, y: targetY };
    
    event.returnValue = { x: targetX, y: targetY };
  } else {
    event.returnValue = null;
  }
});



// IPC обработчик для переключения ScreenHighlighter
ipcMain.handle('toggle-screen-highlighter', () => {
  toggleScreenHighlighter();
  return { success: true };
});

// IPC обработчик для выбора файла (кнопка "Обзор" в настройках)
ipcMain.handle('browse-app-file', async () => {
  try {
    const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
      title: 'Выберите приложение',
      filters: [
        { name: 'Исполняемые файлы', extensions: ['exe', 'lnk', 'bat', 'cmd', 'msi'] },
        { name: 'Все файлы', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      return { success: true, filePath: result.filePaths[0] };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    console.error('Ошибка выбора файла:', error);
    return { success: false, error: error.message };
  }
});

// Предотвращение закрытия приложения по умолчанию
app.on('before-quit', (event) => {
  // Сохраняем настройки перед выходом
  saveSettings();
  // Закрываем все overlay окна
  for (const w of overlayWindows) {
    if (!w.isDestroyed()) w.close();
  }
}); 