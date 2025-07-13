const { app, BrowserWindow, screen, ipcMain, shell, Menu } = require('electron');
const path = require('path');

let mainWindow;
let settingsWindow;

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  
  // Создаем окно dock панели
  mainWindow = new BrowserWindow({
    width: 600,
    height: 80,
    x: Math.round((screenWidth - 600) / 2), // Центрируем по горизонтали
    y: 10, // Размещаем в верхней части экрана с небольшим отступом
    frame: false, // Убираем рамку окна
    transparent: true, // Делаем окно прозрачным
    resizable: false, // Запрещаем изменение размера
    alwaysOnTop: true, // Всегда поверх других окон
    skipTaskbar: true, // Не показывать в панели задач
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

// Обработка готовности приложения
app.whenReady().then(() => {
  createWindow();
  
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
    alwaysOnTop: mainWindow?.isAlwaysOnTop() || true,
    hotkeys: {
      toggleDock: 'Ctrl+H',
      quit: 'Ctrl+Q',
      addApp: 'Ctrl+N',
      help: 'F1'
    }
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
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
    }
    
    // Сохраняем настройки (в реальном приложении можно использовать файл)
    // В этой реализации настройки будут сохранены в памяти
    
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

// Предотвращение закрытия приложения по умолчанию
app.on('before-quit', (event) => {
  // Можно добавить логику для сохранения состояния
}); 