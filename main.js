const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  
  // Создаем окно dock панели
  mainWindow = new BrowserWindow({
    width: 600,
    height: 80,
    x: Math.round((screenWidth - 600) / 2), // Центрируем по горизонтали
    y: screenHeight - 80, // Размещаем внизу экрана
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