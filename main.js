const { app, BrowserWindow, screen, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
let settingsWindow;
let isWindowPinned = true; // По умолчанию окно закреплено
let windowPosition = null; // Сохраненная позиция окна

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
      windowPosition: windowPosition || (mainWindow ? { x: mainWindow.getPosition()[0], y: mainWindow.getPosition()[1] } : null)
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error);
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
    maxHeight: 100, // Максимальная высота
    x: x,
    y: y,
    frame: false, // Убираем рамку окна
    transparent: true, // Делаем окно прозрачным
    resizable: true, // Разрешаем изменение размера программно
    alwaysOnTop: true, // Всегда поверх других окон
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
    isWindowPinned: isWindowPinned,
    windowPosition: windowPosition,
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



// Автоматическое изменение размера окна под dock панель
ipcMain.handle('resize-window-to-content', async () => {
  if (!mainWindow) return;
  
  try {
    const display = screen.getPrimaryDisplay();
    
    // Получаем точный размер dock панели
    const dockSize = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const dock = document.querySelector('.dock');
        const container = document.querySelector('.dock-container');
        
        if (!dock || !container) return { width: 200, height: 70 };
        
        // Принудительный reflow для точных размеров
        dock.style.display = 'none';
        dock.offsetHeight;
        dock.style.display = 'flex';
        
        // Получаем реальные размеры dock панели
        const dockRect = dock.getBoundingClientRect();
        
        // Размер окна = размер dock панели + вертикальные отступы контейнера
        const width = Math.ceil(dockRect.width); // без горизонтальных отступов
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
    
    // Получаем текущие размеры и позицию
    const currentBounds = mainWindow.getBounds();
    const currentContentSize = mainWindow.getContentSize();
    
    // Центрируем окно при изменении ширины
    let newX = currentBounds.x;
    let newY = currentBounds.y;
    
    if (Math.abs(currentContentSize[0] - dockSize.width) > 2) {
      // Центрируем по горизонтали
      newX = currentBounds.x + (currentContentSize[0] - dockSize.width) / 2;
      
      // Проверяем границы экрана
      const maxX = display.workAreaSize.width - dockSize.width;
      newX = Math.max(0, Math.min(newX, maxX));
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