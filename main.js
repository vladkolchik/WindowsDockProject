const { app, BrowserWindow, screen, ipcMain, shell, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
let settingsWindow;
let isWindowPinned = true; // По умолчанию окно закреплено
let windowPosition = null; // Сохраненная позиция окна
let userSettings = {
  alwaysOnTop: true,
  autoHide: false,
  startup: false,
  theme: 'auto',
  position: 'top',
  iconSize: 48,
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

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  
  // Загружаем настройки
  loadSettings();
  
  // Определяем позицию окна
  let x, y;
  if (windowPosition) {
    x = windowPosition.x;
    y = windowPosition.y;
  } else {
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
  
  // Обработчик перемещения окна
  mainWindow.on('moved', () => {
    if (!isWindowPinned) {
      const position = mainWindow.getPosition();
      windowPosition = { x: position[0], y: position[1] };
      saveSettings();
    }
  });
  
  // При клике вне окна, скрываем его
  mainWindow.on('blur', () => {
    // Комментируем автоскрытие для удобства разработки
    // mainWindow.hide();
  });

  // Обработка закрытия окна
  mainWindow.on('closed', () => {
    mainWindow = null;
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
    
    // Уведомляем renderer о смене состояния
    mainWindow.webContents.send('window-pin-changed', isWindowPinned);
  }
}

// Обработка готовности приложения
app.whenReady().then(() => {
  createWindow();
  // Применяем автозапуск согласно сохраненной настройке
  applyStartupSetting();
  
  // На macOS приложения обычно остаются активными даже когда все окна закрыты
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Выход из приложения, когда все окна закрыты
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
    }

    // Применяем автозапуск
    applyStartupSetting();

    // Сохраняем на диск
    saveSettings();

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

    // Electron: app.getFileIcon(path, { size: 'small' | 'normal' | 'large' })
    // На Windows корректно возвращает системную иконку файла/приложения
    let icon = null;
    try {
      icon = await app.getFileIcon(filePath, { size });
    } catch (e) {
      // Fallback: попробовать загрузить как изображение напрямую
      try {
        icon = nativeImage.createFromPath(filePath);
      } catch {
        /* noop */
      }
    }

    if (icon && !icon.isEmpty()) {
      // Немного уменьшим до удобного размера для дока
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
    
    // Получаем точный размер dock панели
    const dockSize = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const dock = document.querySelector('.dock');
        const container = document.querySelector('.dock-container');
        
        if (!dock || !container) return { width: 200, height: 70 };
        
        // Мягкий принудительный reflow без скрытия (избегаем визуального мерцания)
        void dock.offsetWidth;
        
        // Получаем реальные размеры dock панели
        const dockRect = dock.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Размер окна = размер dock панели + отступы контейнера
        const width = Math.ceil(dockRect.width + 20); // 10px отступ с каждой стороны
        const height = Math.ceil(dockRect.height + 20); // 10px отступ сверху и снизу
        
        console.log('Точный размер dock панели:', {
          dockWidth: dockRect.width,
          dockHeight: dockRect.height,
          windowWidth: width,
          windowHeight: height
        });
        
        return { width, height };
      })()
    `);
    
    // Текущий размер контента
    const currentContentSize = mainWindow.getContentSize();
    
    // Центрируем окно при изменении ширины, но сохраняем якорный край если указан
    let newX = currentBounds.x;
    let newY = currentBounds.y;
    
    if (Math.abs(currentContentSize[0] - dockSize.width) > 2) {
      const anchor = opts.anchor; // 'left' | 'right' | 'top' | 'bottom' | null
      if (anchor === 'left') {
        // При левом крае фиксируем левую границу и только меняем ширину
        newX = display.workArea.x + 10; // тот же margin, что и при снапе
      } else if (anchor === 'right') {
        // При правом крае фиксируем правую границу
        newX = display.workArea.x + display.workArea.width - dockSize.width - 10;
      } else {
        // Иначе центрируем по горизонтали относительно текущего положения
        newX = currentBounds.x + (currentContentSize[0] - dockSize.width) / 2;
      }

      // Проверяем границы конкретного дисплея (c учётом workArea.x)
      const maxX = display.workArea.x + display.workArea.width - dockSize.width;
      const minX = display.workArea.x;
      newX = Math.max(minX, Math.min(newX, maxX));
    }
    
    // Устанавливаем размер содержимого точно под dock панель
    mainWindow.setContentSize(dockSize.width, dockSize.height);
    
    // Устанавливаем позицию
    mainWindow.setPosition(Math.round(newX), Math.round(newY));
    
    // Обновляем сохраненную позицию
    windowPosition = { x: Math.round(newX), y: Math.round(newY) };
    
    console.log('Размер окна изменен под dock панель:', dockSize);
    
    return { success: true, size: dockSize };
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



// Предотвращение закрытия приложения по умолчанию
app.on('before-quit', (event) => {
  // Сохраняем настройки перед выходом
  saveSettings();
}); 