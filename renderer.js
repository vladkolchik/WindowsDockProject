const { ipcRenderer } = require('electron');

// Класс для управления dock панелью
class DockManager {
    constructor() {
        this.apps = this.loadApps();
        this.dragDropIndicator = document.getElementById('drag-drop-indicator');
        this.currentRightClickedItem = null;
        this.dragTimeout = null; // Таймаут для debounce drag-and-drop
        this.isWindowPinned = true; // Состояние закрепления окна
        
        this.initializeEventListeners();
        this.initializeDragDrop();
        this.renderApps();
        this.loadWindowPinState();
        
        // Добавляем небольшую задержку для правильного отображения номеров
        setTimeout(() => {
            this.updateAppNumbers();
            // Изменяем размер окна после полной инициализации
            this.resizeWindowToContent();
        }, 100);
        
        // Обработчик для нативного контекстного меню
        ipcRenderer.on('context-menu-action', (event, action) => {
            this.handleContextMenuAction(action);
        });

        // Обработчик изменения состояния закрепления окна
        ipcRenderer.on('window-pin-changed', (event, isPinned) => {
            this.isWindowPinned = isPinned;
            this.updateWindowPinIndicator();
        });

        // Обработчики для управления приложениями из настроек
        ipcRenderer.on('add-app-from-settings', (event, app) => {
            this.apps.push(app);
            this.saveApps();
            this.renderApps(); // Это уже вызовет resizeWindowToContent()
        });

        ipcRenderer.on('remove-app-from-settings', (event, appId) => {
            this.apps = this.apps.filter(a => a.id !== appId);
            this.saveApps();
            this.renderApps(); // Это уже вызовет resizeWindowToContent()
        });

        // Обработчик обновления настроек (масштаб панели и тема после сохранения в настройках)
        ipcRenderer.on('settings-updated', (event, userSettings) => {
            this.applyDockScale(userSettings.dockScale || 1);
            this.applyTheme(userSettings.theme || 'auto');
        });
        
        // Обработчик изменения размера экрана
        window.addEventListener('resize', () => {
            // Небольшая задержка для завершения изменения размера
            setTimeout(() => {
                this.resizeWindowToContent();
            }, 200);
        });

        // Загрузка и применение сохраненного масштаба при старте
        this.loadAndApplyDockScale();
        
        // Загрузка и применение темы при старте
        this.loadAndApplyTheme();
    }

    // Загрузка приложений из localStorage
    loadApps() {
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
    }

    // Сохранение приложений в localStorage
    saveApps() {
        localStorage.setItem('dockApps', JSON.stringify(this.apps));
    }

    // Загрузка состояния закрепления окна
    async loadWindowPinState() {
        try {
            this.isWindowPinned = await ipcRenderer.invoke('get-window-pin-state');
            this.updateWindowPinIndicator();
        } catch (error) {
            console.error('Ошибка загрузки состояния закрепления окна:', error);
        }
    }

    // Обновление визуального индикатора состояния закрепления
    updateWindowPinIndicator() {
        const dockContainer = document.querySelector('.dock-container');
        const pinButton = document.getElementById('pin-button');
        const pinIcon = pinButton.querySelector('.dock-icon');
        
        if (this.isWindowPinned) {
            dockContainer.classList.remove('unpinned');
            
            // Обновляем кнопку для закреплённого состояния
            pinButton.classList.remove('unpinned');
            pinButton.classList.add('pinned');
            pinIcon.textContent = '📌';
        } else {
            dockContainer.classList.add('unpinned');
            
            // Обновляем кнопку для откреплённого состояния
            pinButton.classList.remove('pinned');
            pinButton.classList.add('unpinned');
            pinIcon.textContent = '🔓';
        }
    }

    // Инициализация обработчиков событий
    initializeEventListeners() {
        // Обработка кликов по элементам dock панели
        document.addEventListener('click', (e) => {
            const dockItem = e.target.closest('.dock-item');
            if (dockItem) {
                this.handleDockItemClick(dockItem);
            }
        });

        // Смена ориентации по событию из main, если нужно
        ipcRenderer.on('window-snapped', (event, data) => {
            if (data && data.orientation) {
                this.setOrientation(data.orientation);
            }
        });

        // Обработка правого клика
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const dockContainer = e.target.closest('.dock-container');
            if (dockContainer) {
                const dockItem = e.target.closest('.dock-item');
                this.showContextMenu(e, dockItem); // dockItem может быть null
            }
        });

        // Обработка drag & drop
        this.setupDragDropHandlers();
        
        // Обработка перетаскивания окна
        this.setupWindowDragHandlers();

        // Обработка клавиш
        document.addEventListener('keydown', (e) => {
            // Escape - закрыть drag & drop индикатор
            if (e.key === 'Escape') {
                if (this.dragTimeout) {
                    clearTimeout(this.dragTimeout);
                    this.dragTimeout = null;
                }
                this.hideDragDropIndicator();
            }
            
            // Глобальные горячие клавиши теперь регистрируются в main.js
            // Здесь оставляем только цифры 1-9 для быстрого запуска приложений
            // (они работают только когда окно в фокусе)
            
            // Цифры 1-9 - быстрый запуск приложений
            if (e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key) - 1;
                this.launchAppByIndex(index);
            }
        });

        // Предотвращение перетаскивания
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });
    }

    // Обработка кликов по элементам dock панели
    handleDockItemClick(dockItem) {
        const appId = dockItem.dataset.app;
        const action = dockItem.dataset.action;

        if (action) {
            this.handleSystemAction(action);
        } else if (appId) {
            this.launchApp(appId);
        }
    }

    // Запуск приложения
    async launchApp(appId) {
        const app = this.apps.find(a => a.id === appId);
        if (!app) return;

        try {
            // Добавляем визуальную обратную связь
            const dockItem = document.querySelector(`[data-app="${appId}"]`);
            if (dockItem) {
                dockItem.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    dockItem.style.transform = '';
                }, 150);
            }

            // Запускаем приложение
            const result = await ipcRenderer.invoke('launch-app', app.path);
            
            if (!result.success) {
                console.error(`Не удалось запустить ${app.name}`);
            }
        } catch (error) {
            console.error('Ошибка запуска приложения:', error);
        }
    }

    // Обработка системных действий
    async handleSystemAction(action) {
        switch (action) {
            case 'toggle-dock':
                await ipcRenderer.invoke('toggle-dock');
                break;
            case 'quit':
                await ipcRenderer.invoke('quit-app');
                break;
            case 'toggle-screen-highlighter':
                await ipcRenderer.invoke('toggle-screen-highlighter');
                break;
            case 'toggle-pin':
                await this.toggleWindowPin();
                break;
        }
    }

    // Переключение состояния закрепления окна
    async toggleWindowPin() {
        try {
            await ipcRenderer.invoke('toggle-window-pin');
        } catch (error) {
            console.error('Ошибка переключения состояния закрепления:', error);
        }
    }

    // Показ контекстного меню
    showContextMenu(e, dockItem) {
        this.currentRightClickedItem = dockItem;
        
        let x, y;
        
        if (dockItem) {
            // Если клик по элементу, позиционируем меню относительно элемента
            const rect = dockItem.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.bottom + 10; // Размещаем меню снизу от элемента
        } else {
            // Если клик по свободному месту, позиционируем меню относительно курсора
            x = e.clientX;
            y = e.clientY + 10; // Размещаем меню чуть ниже курсора
        }
        
        // Показываем нативное контекстное меню
        ipcRenderer.invoke('show-context-menu', x, y, !!dockItem);
    }

    // Обработка действий контекстного меню
    handleContextMenuAction(action) {
        switch (action) {
            case 'remove-app':
                this.removeApp();
                break;
            case 'help':
                this.showHelp();
                break;
            case 'settings':
                this.showSettings();
                break;
        }
    }

    // Инициализация drag & drop
    initializeDragDrop() {
        const dockContainer = document.querySelector('.dock-container');
        
        // Предотвращаем стандартное поведение для drag & drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dockContainer.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        // Показываем индикатор при входе в зону или движении над ней
        ['dragenter', 'dragover'].forEach(eventName => {
            dockContainer.addEventListener(eventName, (e) => {
                this.showDragDropIndicator();
                // Сбрасываем таймаут скрытия
                if (this.dragTimeout) {
                    clearTimeout(this.dragTimeout);
                    this.dragTimeout = null;
                }
            }, false);
        });

        // Скрываем индикатор при выходе из зоны с небольшой задержкой
        dockContainer.addEventListener('dragleave', (e) => {
            // Используем debounce для предотвращения мигания
            if (this.dragTimeout) {
                clearTimeout(this.dragTimeout);
            }
            this.dragTimeout = setTimeout(() => {
                this.hideDragDropIndicator();
            }, 50); // Небольшая задержка в 50ms
        }, false);

        // Обработка drop события - сразу скрываем индикатор
        dockContainer.addEventListener('drop', (e) => {
            if (this.dragTimeout) {
                clearTimeout(this.dragTimeout);
                this.dragTimeout = null;
            }
            this.hideDragDropIndicator();
            this.handleDrop(e);
        }, false);

        // Сброс при потере фокуса окна
        window.addEventListener('blur', () => {
            if (this.dragTimeout) {
                clearTimeout(this.dragTimeout);
                this.dragTimeout = null;
            }
            this.hideDragDropIndicator();
        });
    }

    // Предотвращение стандартного поведения
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Показ drag & drop индикатора
    showDragDropIndicator() {
        this.dragDropIndicator.classList.add('show');
    }

    // Скрытие drag & drop индикатора
    hideDragDropIndicator() {
        this.dragDropIndicator.classList.remove('show');
        // Сбрасываем таймаут для безопасности
        if (this.dragTimeout) {
            clearTimeout(this.dragTimeout);
            this.dragTimeout = null;
        }
    }

    // Настройка обработчиков drag & drop
    setupDragDropHandlers() {
        // Дополнительные обработчики при необходимости
    }

    // Обработка drop события
    handleDrop(e) {
        const files = e.dataTransfer.files;
        
        if (files.length > 0) {
            const file = files[0];
            this.addAppFromFile(file);
        }
    }

    // Автоматическое изменение размера окна (с дебаунсом и без скрытия контента)
    async resizeWindowToContent(anchorEdge) {
        // Дебаунсируем частые вызовы, чтобы избежать мигания
        if (this._resizeDebounceTimer) {
            clearTimeout(this._resizeDebounceTimer);
        }
        this._resizeDebounceTimer = setTimeout(async () => {
            try {
                // Гарантируем наличие класса ориентации (по умолчанию горизонтальная)
                const dock = document.querySelector('.dock');
                if (dock && !dock.classList.contains('horizontal') && !dock.classList.contains('vertical')) {
                    dock.classList.add('horizontal');
                }

                // Определяем текущую ориентацию дока
                const orientation = dock && dock.classList.contains('vertical') ? 'vertical' : 'horizontal';
                console.log('Определена ориентация:', orientation, 'Классы dock:', dock ? dock.className : 'no dock');
                
                const result = await ipcRenderer.invoke('resize-window-to-content', { 
                    anchor: anchorEdge || this._lastSnapEdge || null,
                    orientation: orientation
                });
                if (!result || !result.success) {
                    console.error('Ошибка изменения размера окна:', result && result.error);
                }
            } catch (error) {
                console.error('Ошибка вызова изменения размера окна:', error);
            }
        }, 120);
    }



    // Добавление приложения из файла
    addAppFromFile(file) {
        const path = file.path;
        const name = file.name.replace(/\.[^/.]+$/, ""); // Убираем расширение
        const icon = this.getIconForFile(file);

        const newApp = {
            id: `app_${Date.now()}`,
            name,
            icon,
            path
        };

        this.apps.push(newApp);
        this.saveApps();
        this.renderApps(); // Это уже вызовет resizeWindowToContent()
    }

    // Получение иконки для файла
    getIconForFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        
        const iconMap = {
            'exe': '🚀',
            'msi': '📦',
            'bat': '⚡',
            'cmd': '⚡',
            'lnk': '🔗',
            'app': '📱',
            'deb': '📦',
            'rpm': '📦',
            'dmg': '💿',
            'zip': '📁',
            'rar': '📁',
            'tar': '📁',
            'gz': '📁'
        };

        return iconMap[extension] || '🚀';
    }

    // Умное определение эмоджи по названию приложения и пути
    getEmojiForApp(appName, appPath) {
        if (!appName && !appPath) return '📱';

        const name = (appName || appPath || '').toLowerCase();
        const path = (appPath || '').toLowerCase();

        // Точные совпадения для популярных приложений
        const exactMatches = {
            'chrome': '🌐',
            'google chrome': '🌐',
            'firefox': '🦊',
            'safari': '🧭',
            'edge': '🌀',
            'explorer': '📁',
            'file explorer': '📁',
            'проводник': '📁',
            'terminal': '⚡',
            'cmd': '⚡',
            'powershell': '⚡',
            'консоль': '⚡',
            'command prompt': '⚡',
            'vs code': '💻',
            'visual studio code': '💻',
            'vscode': '💻',
            'sublime': '✏️',
            'notepad': '📝',
            'notepad++': '📝',
            'discord': '💬',
            'slack': '💬',
            'telegram': '✈️',
            'whatsapp': '💬',
            'skype': '📞',
            'zoom': '🎥',
            'google meet': '🎥',
            'steam': '🎮',
            'epic': '🎮',
            'valorant': '🎮',
            'league of legends': '🎮',
            'obs': '🎬',
            'davinci': '🎬',
            'photoshop': '🖼️',
            'figma': '🎨',
            'blender': '🎨',
            'visual studio': '📊',
            'intellij': '📊',
            'pycharm': '🐍',
            'git': '🌳',
            'github desktop': '🌳',
            'docker': '🐳',
            'vbox': '💾',
            'virtualbox': '💾',
            'vmware': '💾',
            'qemu': '💾',
            'hyper-v': '💾',
            'winrar': '📁',
            '7-zip': '📁',
            'winzip': '📁',
            'potplayer': '🎵',
            'vlc': '🎵',
            'foobar': '🎵',
            'audacity': '🎵',
            'spotify': '🎵',
            'youtube': '📺',
            'twitch': '📺',
            'netflix': '📺',
            'chrome': '🌐',
            'calculator': '🔢',
            'калькулятор': '🔢',
            'settings': '⚙️',
            'параметры': '⚙️',
            'панель управления': '⚙️',
            'control panel': '⚙️',
            'cursor': '👆',
            'notion': '📋',
            'obsidian': '🧠',
            'roam': '🧠',
            'evernote': '📔',
            'onenote': '📔',
            'notion': '📋',
            'trello': '✅',
            'asana': '✅',
            'jira': '✅',
            'monday': '✅',
            'notion': '📋',
            'dropbox': '☁️',
            'onedrive': '☁️',
            'google drive': '☁️',
            'icloud': '☁️',
            'synology': '☁️',
            'nextcloud': '☁️',
            'seafile': '☁️'
        };

        // Проверяем точные совпадения
        for (const [key, emoji] of Object.entries(exactMatches)) {
            if (name.includes(key) || path.includes(key)) {
                return emoji;
            }
        }

        // Паттерны по типам приложений (без точных совпадений)
        const patternMatches = [
            // Браузеры
            { patterns: ['browser', 'navigator', 'минет'], emoji: '🌐' },
            // Редакторы кода
            { patterns: ['studio', 'editor', 'editor', 'ide'], emoji: '💻' },
            // Мультимедиа
            { patterns: ['media', 'player', 'video', 'audio', 'фильм', 'видео', 'музык'], emoji: '🎵' },
            // Графика
            { patterns: ['design', 'paint', 'graphics', 'рисунок', 'граф'], emoji: '🎨' },
            // Архиватор
            { patterns: ['zip', 'rar', 'archive', 'архив'], emoji: '📁' },
            // Коммуникация
            { patterns: ['mail', 'email', 'messenger', 'chat', 'почт'], emoji: '💬' },
            // Облако/синхронизация
            { patterns: ['cloud', 'sync', 'drive', 'облак'], emoji: '☁️' },
            // Виртуализация
            { patterns: ['virtual', 'machine', 'vm', 'hyper', 'виртуальн'], emoji: '💾' },
            // Учет/документы
            { patterns: ['office', 'word', 'excel', 'writer', 'документ'], emoji: '📄' },
            // Безопасность
            { patterns: ['antivirus', 'security', 'vpn', 'защит', 'безопас'], emoji: '🔒' },
            // Система/утилиты
            { patterns: ['tool', 'utility', 'system', 'admin', 'утилит'], emoji: '🔧' },
            // Игры
            { patterns: ['game', 'play', 'launcher', 'игр'], emoji: '🎮' },
            // Разработка
            { patterns: ['dev', 'code', 'build', 'compile', 'разрабо', 'программ'], emoji: '⚙️' }
        ];

        for (const { patterns, emoji } of patternMatches) {
            if (patterns.some(p => name.includes(p) || path.includes(p))) {
                return emoji;
            }
        }

        // Проверяем расширение файла в пути
        const extension = path.split('.').pop();
        const extEmojiMap = {
            'exe': '🚀',
            'msi': '📦',
            'bat': '⚡',
            'cmd': '⚡',
            'lnk': '🔗',
            'app': '📱',
            'deb': '📦',
            'rpm': '📦',
            'dmg': '💿',
            'sh': '⚡',
            'py': '🐍',
            'js': '⚡',
            'java': '☕'
        };

        if (extEmojiMap[extension]) {
            return extEmojiMap[extension];
        }

        // Универсальный fallback для неизвестных приложений
        const fallbackEmojis = ['📱', '📦', '🔧', '📋', '✨', '🎯', '💡', '🌟'];
        const hash = (appName + appPath).charCodeAt(0) + (appName + appPath).charCodeAt((appName + appPath).length - 1);
        return fallbackEmojis[hash % fallbackEmojis.length];
    }

    // Удаление приложения
    removeApp() {
        if (!this.currentRightClickedItem) return;

        const appId = this.currentRightClickedItem.dataset.app;
        const app = this.apps.find(a => a.id === appId);

        if (app) {
            this.apps = this.apps.filter(a => a.id !== appId);
            this.saveApps();
            this.renderApps(); // Это уже вызовет resizeWindowToContent()
        }
    }

    // Отображение приложений
    renderApps() {
        const dockSection = document.querySelector('.dock-section');
        
        // Полностью очищаем все элементы приложений
        const allApps = dockSection.querySelectorAll('.dock-item[data-app]');
        allApps.forEach(item => item.remove());

        // Заново отрисовываем все приложения из массива this.apps
        this.apps.forEach(app => {
            const dockItem = this.createDockItem(app);
            dockSection.appendChild(dockItem);
        });

        // Добавляем номера для быстрого запуска
        this.updateAppNumbers();
        
        // Автоматически изменяем размер окна под содержимое
        // Добавляем дополнительную задержку для завершения анимаций
        setTimeout(() => {
            this.resizeWindowToContent();
        }, 100);
    }

    // Обновление номеров приложений для быстрого запуска
    updateAppNumbers() {
        const dockItems = document.querySelectorAll('.dock-item[data-app]');
        dockItems.forEach((item, index) => {
            if (index < 9) { // Показываем номера только для первых 9 приложений
                item.setAttribute('data-number', index + 1);
            } else {
                item.removeAttribute('data-number');
            }
        });
    }

    // Создание элемента dock панели
    createDockItem(app) {
        const dockItem = document.createElement('div');
        dockItem.className = 'dock-item';
        dockItem.dataset.app = app.id;
        // Нативная (системная) подсказка через атрибут title
        try {
            const pathMod = require('path');
            const fileName = app?.path ? pathMod.basename(app.path) : (app?.name || '');
            dockItem.title = fileName || app?.name || '';
        } catch {
            dockItem.title = app?.name || '';
        }

        const dockIcon = document.createElement('div');
        dockIcon.className = 'dock-icon';
        // Если у приложения есть путь — пробуем подгрузить нативную иконку только для "иконосодержащих" типов
        if (app.path && this.shouldUseNativeIcon(app.path)) {
            this.loadNativeIcon(app.path)
                .then((dataUrl) => {
                    if (dataUrl) {
                        const img = document.createElement('img');
                        img.src = dataUrl;
                        img.alt = app.name || '';
                        img.draggable = false;
                        img.className = 'dock-icon-img';
                        dockIcon.replaceChildren(img);
                    } else {
                        // Fallback: умный выбор эмоджи по названию и пути
                        dockIcon.textContent = this.getEmojiForApp(app.name, app.path);
                    }
                })
                .catch(() => {
                    // Fallback: умный выбор эмоджи по названию и пути
                    dockIcon.textContent = this.getEmojiForApp(app.name, app.path);
                });
        } else {
            // Если пути нет, используем умный выбор эмоджи
            dockIcon.textContent = this.getEmojiForApp(app.name, app.path) || app.icon || '🚀';
        }

        dockItem.appendChild(dockIcon);

        return dockItem;
    }

    // Запрос нативной иконки через main процесс
    async loadNativeIcon(filePath) {
        try {
            const result = await ipcRenderer.invoke('get-native-icon', filePath, 'large');
            if (result && result.success && result.dataUrl) {
                return result.dataUrl;
            }
            return null;
        } catch (error) {
            console.error('Ошибка загрузки нативной иконки:', error);
            return null;
        }
    }

    // Решаем, имеет ли смысл пытаться грузить нативную иконку
    // Для многих типов Windows возвращает "пустую" иконку-файл — тогда лучше сразу эмоджи
    shouldUseNativeIcon(filePath) {
        try {
            const pathMod = require('path');
            const ext = (pathMod.extname(filePath) || '').toLowerCase().replace('.', '');
            // Список типов, у которых обычно есть собственная иконка
            const preferred = new Set(['exe', 'lnk', 'msi', 'bat', 'cmd', 'app', 'scr', 'com', 'dll', 'ico']);
            return preferred.has(ext);
        } catch {
            return true;
        }
    }


    // Показ настроек
    async showSettings() {
        try {
            await ipcRenderer.invoke('open-settings');
        } catch (error) {
            console.error('Ошибка открытия настроек:', error);
        }
    }

    // Запуск приложения по индексу (для горячих клавиш)
    launchAppByIndex(index) {
        if (index >= 0 && index < this.apps.length) {
            const app = this.apps[index];
            this.launchApp(app.id);
        }
    }

    // Показ справки по горячим клавишам
    showHelp() {
        const helpText = `
🎯 ГОРЯЧИЕ КЛАВИШИ WINDOWS DOCK:

⌨️ Управление:
• Escape - Закрыть меню/окна
• Ctrl + H - Скрыть/показать панель
• Ctrl + Q - Выход из приложения
• F1 - Показать справку

🚀 Быстрый запуск:
• 1-9 - Запуск приложения по номеру
• Левый клик - Запуск приложения
• Правый клик - Контекстное меню

📁 Добавление приложений:
• Перетащите файл (.exe/.lnk) на dock панель
• Или используйте раздел "Управление приложениями" в настройках

📌 Управление окном:
• Кнопка 📌/🔓 - быстрое переключение режима перетаскивания
• Правый клик → "Закрепить окно" - альтернативный способ
• Когда окно не закреплено, его можно перетаскивать по экрану
• Зеленый цвет 📌 = окно закреплено (стабильное положение)
• Жёлтый цвет 🔓 = окно можно перетаскивать

💡 Навигация:
• Enter - Подтвердить в формах
• Tab - Переключение между полями
• Наведение - Показать подсказку
        `;
        
        // Создаем модальное окно для справки
        const helpModal = document.createElement('div');
        helpModal.className = 'modal show';
        helpModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <h3>📖 Справка по горячим клавишам</h3>
                <pre style="font-family: 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.4; color: #333; background: rgba(0,0,0,0.05); padding: 15px; border-radius: 8px; white-space: pre-wrap; margin: 15px 0;">${helpText}</pre>
                <div class="form-buttons">
                    <button type="button" onclick="this.closest('.modal').remove()">Закрыть</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(helpModal);
        
        // Закрытие по клику вне модального окна
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.remove();
            }
        });
    }

    // Настройка обработчиков перетаскивания окна
    setupWindowDragHandlers() {
        const dockContainer = document.querySelector('.dock-container');
        let isDragging = false;
        let mouseOffset = { x: 0, y: 0 }; // Смещение курсора относительно окна
        
        dockContainer.addEventListener('mousedown', async (e) => {
            // Проверяем, что окно не закреплено и клик не по элементу dock-item
            if (!this.isWindowPinned && !e.target.closest('.dock-item')) {
                isDragging = true;
                
                // Получаем текущую позицию окна
                try {
                    const windowPos = await ipcRenderer.invoke('get-window-position');
                    
                    // Вычисляем смещение курсора относительно окна (один раз)
                    mouseOffset.x = e.screenX - windowPos.x;
                    mouseOffset.y = e.screenY - windowPos.y;
                } catch (error) {
                    console.error('Ошибка получения позиции окна:', error);
                    mouseOffset = { x: 0, y: 0 };
                }
                
                // Добавляем визуальные классы для перетаскивания
                dockContainer.classList.add('dragging');
                
                // Отключаем анимации и переходы для стабильности
                const style = document.createElement('style');
                style.id = 'drag-disable-transitions';
                style.textContent = `
                    * {
                        transition: none !important;
                        animation: none !important;
                    }
                `;
                document.head.appendChild(style);
                
                dockContainer.style.cursor = 'grabbing';
                dockContainer.style.userSelect = 'none';
                e.preventDefault();
                
                // Отключаем стандартное перетаскивание
                document.body.style.pointerEvents = 'none';
                dockContainer.style.pointerEvents = 'auto';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                // Просто устанавливаем окно в позицию курсора минус смещение
                const windowX = e.screenX - mouseOffset.x;
                const windowY = e.screenY - mouseOffset.y;
                
                try {
                    ipcRenderer.sendSync('move-window-absolute', windowX, windowY);
                } catch (error) {
                    console.error('Ошибка перемещения окна:', error);
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                dockContainer.classList.remove('dragging');
                
                // Восстанавливаем анимации и переходы
                const disableStyle = document.getElementById('drag-disable-transitions');
                if (disableStyle) {
                    disableStyle.remove();
                }
                
                dockContainer.style.cursor = '';
                dockContainer.style.userSelect = '';
                document.body.style.pointerEvents = '';
                dockContainer.style.pointerEvents = '';

                // После завершения перетаскивания сразу пробуем прилипнуть к ближайшему краю
                setTimeout(() => this.snapToEdge(), 0);
            }
        });

        // Отмена перетаскивания при потере фокуса
        window.addEventListener('blur', () => {
            if (isDragging) {
                isDragging = false;
                dockContainer.classList.remove('dragging');
                
                // Восстанавливаем анимации и переходы
                const disableStyle = document.getElementById('drag-disable-transitions');
                if (disableStyle) {
                    disableStyle.remove();
                }
                
                dockContainer.style.cursor = '';
                dockContainer.style.userSelect = '';
                document.body.style.pointerEvents = '';
                dockContainer.style.pointerEvents = '';

                // Попытка снапа при потере фокуса (на всякий случай)
                setTimeout(() => this.snapToEdge(), 0);
            }
        });

        // Обработка Escape для отмены перетаскивания
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isDragging) {
                isDragging = false;
                dockContainer.classList.remove('dragging');
                
                // Восстанавливаем анимации и переходы
                const disableStyle = document.getElementById('drag-disable-transitions');
                if (disableStyle) {
                    disableStyle.remove();
                }
                
                dockContainer.style.cursor = '';
                dockContainer.style.userSelect = '';
                document.body.style.pointerEvents = '';
                dockContainer.style.pointerEvents = '';

                // Попытка снапа по Esc
                setTimeout(() => this.snapToEdge(), 0);
            }
        });
    }

    // Вызов прилипания и установка ориентации
    async snapToEdge() {
        try {
            const result = await ipcRenderer.invoke('snap-window');
            // Меняем ориентацию ТОЛЬКО при реальном прилипания к краю
            if (result && result.snapped && result.orientation) {
                this._lastSnapEdge = result.edge || null;
                this.setOrientation(result.orientation);
            }
        } catch (error) {
            console.error('Ошибка снапа окна:', error);
        }
    }

    // Установка ориентации дока: horizontal | vertical
    setOrientation(orientation) {
        const dock = document.querySelector('.dock');
        const container = document.querySelector('.dock-container');
        if (!dock) return;
        dock.classList.toggle('vertical', orientation === 'vertical');
        dock.classList.toggle('horizontal', orientation !== 'vertical');
        if (container) {
            container.classList.toggle('vertical', orientation === 'vertical');
            container.classList.toggle('horizontal', orientation !== 'vertical');
        }
        // Пересчитать и подогнать окно под контент
        this.resizeWindowToContent(this._lastSnapEdge);
    }

    // Загрузка и применение сохраненного масштаба панели
    async loadAndApplyDockScale() {
        try {
            const settings = await ipcRenderer.invoke('get-settings');
            const scale = settings.dockScale || 1;
            this.applyDockScale(scale);
        } catch (error) {
            console.error('Ошибка загрузки масштаба панели:', error);
        }
    }

    // Применение масштаба к dock панели
    applyDockScale(scale) {
        document.documentElement.style.setProperty('--dock-scale', String(scale || 1));
        // Пересчитываем размер окна с новым масштабом
        setTimeout(() => {
            this.resizeWindowToContent();
        }, 50);
    }

    // Определение системной темы (для auto режима)
    getSystemTheme() {
        // Используем matchMedia для определения системной темы
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    // Применение темы
    applyTheme(theme) {
        const body = document.body;
        
        // Удаляем все классы тем
        body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
        
        if (theme === 'auto') {
            // Определяем системную тему
            const systemTheme = this.getSystemTheme();
            body.classList.add('theme-auto', `theme-${systemTheme}`);
            
            // Слушаем изменения системной темы
            if (window.matchMedia) {
                const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
                const handleThemeChange = (e) => {
                    body.classList.remove('theme-light', 'theme-dark');
                    body.classList.add(`theme-${e.matches ? 'dark' : 'light'}`);
                };
                
                // Удаляем старый слушатель если есть
                if (this.themeMediaQueryListener) {
                    // Используем removeEventListener для современных браузеров
                    if (mediaQuery.removeEventListener) {
                        mediaQuery.removeEventListener('change', this.themeMediaQueryListener);
                    } else if (mediaQuery.removeListener) {
                        mediaQuery.removeListener(this.themeMediaQueryListener);
                    }
                }
                
                // Добавляем новый слушатель
                this.themeMediaQueryListener = handleThemeChange;
                if (mediaQuery.addEventListener) {
                    mediaQuery.addEventListener('change', handleThemeChange);
                } else if (mediaQuery.addListener) {
                    mediaQuery.addListener(handleThemeChange);
                }
            }
        } else {
            body.classList.add(`theme-${theme}`);
        }
    }

    // Загрузка и применение сохраненной темы
    async loadAndApplyTheme() {
        try {
            const settings = await ipcRenderer.invoke('get-settings');
            const theme = settings.theme || 'auto';
            this.applyTheme(theme);
        } catch (error) {
            console.error('Ошибка загрузки темы:', error);
            // Применяем тему по умолчанию
            this.applyTheme('auto');
        }
    }
}

// Инициализация dock панели после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    window.dockManager = new DockManager();
});

// Обработка загрузки страницы
window.addEventListener('load', () => {
    console.log('Windows Dock загружен');
    // Дополнительный вызов изменения размера окна после полной загрузки
    if (window.dockManager) {
        setTimeout(() => {
            window.dockManager.resizeWindowToContent();
        }, 300);
    }
}); 