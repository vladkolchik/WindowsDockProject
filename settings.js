const { ipcRenderer } = require('electron');

class SettingsManager {
    constructor() {
        this.settings = {};
        this.currentHotkeyAction = null;
        this.isCapturingHotkey = false;
        
        this.initializeElements();
        this.loadSettings();
        this.setupEventListeners();
    }

    initializeElements() {
        // Основные элементы
        this.alwaysOnTopCheckbox = document.getElementById('always-on-top');
        this.autoHideCheckbox = document.getElementById('auto-hide');
        this.startupCheckbox = document.getElementById('startup');
        this.themeSelect = document.getElementById('theme');
        this.positionSelect = document.getElementById('position');
        this.dockScaleSlider = document.getElementById('dock-scale');
        this.dockScaleValue = document.getElementById('dock-scale-value');

        // Горячие клавиши
        this.hotkeyInputs = {
            'toggle-dock': document.getElementById('hotkey-toggle'),
            'quit': document.getElementById('hotkey-quit'),
            'add-app': document.getElementById('hotkey-add'),
            'help': document.getElementById('hotkey-help')
        };

        // Кнопки
        this.saveBtn = document.getElementById('save-btn');
        this.cancelBtn = document.getElementById('cancel-btn');
        this.resetBtn = document.getElementById('reset-btn');

        // Модальное окно для горячих клавиш
        this.hotkeyModal = document.getElementById('hotkey-modal');
        this.hotkeyDisplay = document.getElementById('hotkey-display');
        this.hotkeySaveBtn = document.getElementById('hotkey-save');
        this.hotkeyCancelBtn = document.getElementById('hotkey-cancel');
    }

    async loadSettings() {
        try {
            this.settings = await ipcRenderer.invoke('get-settings');
            this.apps = await ipcRenderer.invoke('get-apps');
            
            // Отладочная информация
            console.log('Загруженные приложения:', this.apps);
            console.log('Количество приложений:', this.apps ? this.apps.length : 0);
            
            this.updateUI();
            this.renderApps();
        } catch (error) {
            console.error('Ошибка загрузки настроек:', error);
        }
    }

    updateUI() {
        // Обновляем чекбоксы
        this.alwaysOnTopCheckbox.checked = this.settings.alwaysOnTop;
        this.autoHideCheckbox.checked = this.settings.autoHide || false;
        this.startupCheckbox.checked = this.settings.startup || false;

        // Обновляем селекты
        this.themeSelect.value = this.settings.theme || 'auto';
        this.positionSelect.value = this.settings.position || 'top';

        // Обновляем слайдер масштаба панели (преобразуем из десятичного в проценты)
        const scalePercent = Math.round((this.settings.dockScale || 1) * 100);
        this.dockScaleSlider.value = scalePercent;
        this.dockScaleValue.textContent = `${scalePercent}%`;

        // Обновляем горячие клавиши
        if (this.settings.hotkeys) {
            this.hotkeyInputs['toggle-dock'].value = this.settings.hotkeys.toggleDock || 'Ctrl+H';
            this.hotkeyInputs['quit'].value = this.settings.hotkeys.quit || 'Ctrl+Q';
            this.hotkeyInputs['add-app'].value = this.settings.hotkeys.addApp || 'Ctrl+N';
            this.hotkeyInputs['help'].value = this.settings.hotkeys.help || 'F1';
        }
    }

    setupEventListeners() {
        // Слайдер размера иконок
        this.dockScaleSlider.addEventListener('input', (e) => {
            this.dockScaleValue.textContent = `${e.target.value}%`;
        });

        // Кнопки горячих клавиш
        document.querySelectorAll('.hotkey-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.openHotkeyModal(action);
            });
        });

        // Кнопки управления
        this.saveBtn.addEventListener('click', () => this.saveSettings());
        this.cancelBtn.addEventListener('click', () => this.closeWindow());
        this.resetBtn.addEventListener('click', () => this.resetSettings());

        // Управление приложениями
        document.getElementById('settings-add-app-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addAppFromSettings();
        });

        document.getElementById('settings-browse-button').addEventListener('click', async () => {
            try {
                const result = await ipcRenderer.invoke('browse-app-file');
                if (result.success && result.filePath) {
                    document.getElementById('settings-app-path').value = result.filePath;
                }
            } catch (error) {
                console.error('Ошибка выбора файла:', error);
            }
        });

        // Модальное окно горячих клавиш
        this.hotkeySaveBtn.addEventListener('click', () => this.saveHotkey());
        this.hotkeyCancelBtn.addEventListener('click', () => this.closeHotkeyModal());

        // Закрытие модального окна по клику вне его
        this.hotkeyModal.addEventListener('click', (e) => {
            if (e.target === this.hotkeyModal) {
                this.closeHotkeyModal();
            }
        });

        // Глобальные горячие клавиши
        document.addEventListener('keydown', (e) => {
            if (this.isCapturingHotkey) {
                e.preventDefault();
                this.captureHotkey(e);
            } else if (e.key === 'Escape') {
                this.closeHotkeyModal();
            }
        });
    }

    openHotkeyModal(action) {
        this.currentHotkeyAction = action;
        this.hotkeyModal.classList.add('show');
        this.hotkeyDisplay.textContent = 'Нажмите клавиши...';
        this.isCapturingHotkey = true;
    }

    closeHotkeyModal() {
        this.hotkeyModal.classList.remove('show');
        this.currentHotkeyAction = null;
        this.isCapturingHotkey = false;
    }

    captureHotkey(e) {
        const keys = [];
        
        if (e.ctrlKey) keys.push('Ctrl');
        if (e.altKey) keys.push('Alt');
        if (e.shiftKey) keys.push('Shift');
        if (e.metaKey) keys.push('Meta');

        const key = e.key;
        if (key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta') {
            if (key === ' ') {
                keys.push('Space');
            } else if (key.length === 1) {
                keys.push(key.toUpperCase());
            } else {
                keys.push(key);
            }
        }

        if (keys.length > 0) {
            const hotkeyString = keys.join('+');
            this.hotkeyDisplay.textContent = hotkeyString;
        }
    }

    saveHotkey() {
        if (this.currentHotkeyAction && this.hotkeyDisplay.textContent !== 'Нажмите клавиши...') {
            const hotkeyString = this.hotkeyDisplay.textContent;
            const input = this.hotkeyInputs[this.currentHotkeyAction];
            
            if (input) {
                input.value = hotkeyString;
            }
        }
        
        this.closeHotkeyModal();
    }

    async saveSettings() {
        try {
            const newSettings = {
                alwaysOnTop: this.alwaysOnTopCheckbox.checked,
                autoHide: this.autoHideCheckbox.checked,
                startup: this.startupCheckbox.checked,
                theme: this.themeSelect.value,
                position: this.positionSelect.value,
                dockScale: parseInt(this.dockScaleSlider.value, 10) / 100,
                hotkeys: {
                    toggleDock: this.hotkeyInputs['toggle-dock'].value,
                    quit: this.hotkeyInputs['quit'].value,
                    addApp: this.hotkeyInputs['add-app'].value,
                    help: this.hotkeyInputs['help'].value
                }
            };

            const result = await ipcRenderer.invoke('save-settings', newSettings);
            
            if (!result.success) {
                console.error('Ошибка сохранения настроек');
            }
        } catch (error) {
            console.error('Ошибка сохранения настроек:', error);
        }
    }

    resetSettings() {
        const confirmReset = confirm('Вы уверены, что хотите сбросить все настройки к значениям по умолчанию?');
        
        if (confirmReset) {
            // Значения по умолчанию
            this.alwaysOnTopCheckbox.checked = true;
            this.autoHideCheckbox.checked = false;
            this.startupCheckbox.checked = false;
            this.themeSelect.value = 'auto';
            this.positionSelect.value = 'top';
            this.dockScaleSlider.value = 100;
            this.dockScaleValue.textContent = '100%';

            // Горячие клавиши по умолчанию
            this.hotkeyInputs['toggle-dock'].value = 'Ctrl+H';
            this.hotkeyInputs['quit'].value = 'Ctrl+Q';
            this.hotkeyInputs['add-app'].value = 'Ctrl+N';
            this.hotkeyInputs['help'].value = 'F1';
        }
    }

    closeWindow() {
        window.close();
    }

    // Отображение приложений в настройках
    renderApps() {
        const appsGrid = document.getElementById('settings-apps-list');
        if (!appsGrid) {
            console.error('Элемент settings-apps-list не найден!');
            return;
        }
        
        appsGrid.innerHTML = '';

        // Отладочная информация
        console.log('renderApps вызван с:', {
            apps: this.apps,
            isArray: Array.isArray(this.apps),
            length: this.apps ? this.apps.length : 'undefined'
        });

        if (!this.apps || !Array.isArray(this.apps) || this.apps.length === 0) {
            console.log('Показываем "Нет приложений" - условие:', !this.apps, !Array.isArray(this.apps), this.apps ? this.apps.length === 0 : 'undefined');
            appsGrid.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Нет приложений</p>';
            return;
        }

        console.log('Отображаем приложения:', this.apps.length);
        this.apps.forEach((app, index) => {
            console.log(`Создаем элемент для приложения ${index}:`, app);
            
            if (!app || !app.id || !app.name) {
                console.warn('Пропускаем некорректное приложение:', app);
                return;
            }
            
            const appItem = document.createElement('div');
            appItem.className = 'app-item';
            appItem.innerHTML = `
                <div class="app-item-icon"></div>
                <div class="app-item-name">${app.name}</div>
                <button class="app-item-remove" data-app-id="${app.id}">×</button>
            `;

            // Подгружаем нативную иконку если есть путь
            const iconHolder = appItem.querySelector('.app-item-icon');
            if (iconHolder) {
                const shouldUseNative = (() => {
                    try {
                        const pathMod = require('path');
                        const ext = (pathMod.extname(app.path || '') || '').toLowerCase().replace('.', '');
                        const preferred = new Set(['exe', 'lnk', 'msi', 'bat', 'cmd', 'app', 'scr', 'com', 'dll', 'ico']);
                        return !!app.path && preferred.has(ext);
                    } catch {
                        return !!app.path;
                    }
                })();

                if (shouldUseNative) {
                    ipcRenderer
                        .invoke('get-native-icon', app.path, 'large')
                        .then((res) => {
                            if (res && res.success && res.dataUrl) {
                                const img = document.createElement('img');
                                img.src = res.dataUrl;
                                img.alt = app.name || '';
                                img.draggable = false;
                                img.style.width = '24px';
                                img.style.height = '24px';
                                img.style.verticalAlign = 'middle';
                                iconHolder.replaceChildren(img);
                            } else {
                                iconHolder.textContent = this.getEmojiForApp(app.name, app.path);
                            }
                        })
                        .catch(() => {
                            iconHolder.textContent = this.getEmojiForApp(app.name, app.path);
                        });
                } else {
                    iconHolder.textContent = this.getEmojiForApp(app.name, app.path);
                }
            }

            // Обработчик удаления
            const removeBtn = appItem.querySelector('.app-item-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeAppFromSettings(app.id);
                });
            }

            appsGrid.appendChild(appItem);
        });
        
        console.log('renderApps завершен, элементов в сетке:', appsGrid.children.length);
    }

    // Добавление приложения из настроек
    async addAppFromSettings() {
        const name = document.getElementById('settings-app-name').value.trim();
        const path = document.getElementById('settings-app-path').value.trim();
        const icon = document.getElementById('settings-app-icon').value.trim() || '🚀';

        if (!name || !path) {
            return;
        }

        const newApp = {
            id: `app_${Date.now()}`,
            name,
            icon,
            path
        };

        try {
            const result = await ipcRenderer.invoke('add-app', newApp);
            if (result.success) {
                this.apps.push(newApp);
                this.renderApps();
                this.clearAddAppForm();
            }
        } catch (error) {
            console.error('Ошибка добавления приложения:', error);
        }
    }

    // Удаление приложения из настроек
    async removeAppFromSettings(appId) {
        const app = this.apps.find(a => a.id === appId);
        if (!app) return;

        const confirmDelete = confirm(`Удалить приложение "${app.name}"?`);
        if (!confirmDelete) return;

        try {
            const result = await ipcRenderer.invoke('remove-app', appId);
            if (result.success) {
                this.apps = this.apps.filter(a => a.id !== appId);
                this.renderApps();
            }
        } catch (error) {
            console.error('Ошибка удаления приложения:', error);
        }
    }

    // Очистка формы добавления приложения
    clearAddAppForm() {
        document.getElementById('settings-app-name').value = '';
        document.getElementById('settings-app-path').value = '';
        document.getElementById('settings-app-icon').value = '';
    }

    // Умное определение эмоджи по названию приложения и пути
    getEmojiForApp(appName, appPath) {
        if (!appName && !appPath) return '📱';

        const name = (appName || appPath || '').toLowerCase();
        const path = (appPath || '').toLowerCase();

        // Точные совпадения для популярных приложений
        const exactMatches = {
            'chrome': '🌐', 'google chrome': '🌐', 'firefox': '🦊', 'safari': '🧭', 'edge': '🌀',
            'explorer': '📁', 'file explorer': '📁', 'проводник': '📁',
            'terminal': '⚡', 'cmd': '⚡', 'powershell': '⚡', 'консоль': '⚡', 'command prompt': '⚡',
            'vs code': '💻', 'visual studio code': '💻', 'vscode': '💻',
            'sublime': '✏️', 'notepad': '📝', 'notepad++': '📝',
            'discord': '💬', 'slack': '💬', 'telegram': '✈️', 'whatsapp': '💬', 'skype': '📞',
            'zoom': '🎥', 'google meet': '🎥',
            'steam': '🎮', 'epic': '🎮', 'valorant': '🎮', 'league of legends': '🎮',
            'obs': '🎬', 'davinci': '🎬',
            'photoshop': '🖼️', 'figma': '🎨', 'blender': '🎨',
            'visual studio': '📊', 'intellij': '📊', 'pycharm': '🐍',
            'git': '🌳', 'github desktop': '🌳', 'docker': '🐳',
            'vbox': '💾', 'virtualbox': '💾', 'vmware': '💾', 'qemu': '💾', 'hyper-v': '💾',
            'winrar': '📁', '7-zip': '📁', 'winzip': '📁',
            'potplayer': '🎵', 'vlc': '🎵', 'foobar': '🎵', 'audacity': '🎵', 'spotify': '🎵',
            'youtube': '📺', 'twitch': '📺', 'netflix': '📺',
            'calculator': '🔢', 'калькулятор': '🔢',
            'settings': '⚙️', 'параметры': '⚙️', 'панель управления': '⚙️', 'control panel': '⚙️',
            'cursor': '👆',
            'notion': '📋', 'obsidian': '🧠', 'roam': '🧠', 'evernote': '📔', 'onenote': '📔',
            'trello': '✅', 'asana': '✅', 'jira': '✅', 'monday': '✅',
            'dropbox': '☁️', 'onedrive': '☁️', 'google drive': '☁️', 'icloud': '☁️', 'synology': '☁️', 'nextcloud': '☁️', 'seafile': '☁️'
        };

        for (const [key, emoji] of Object.entries(exactMatches)) {
            if (name.includes(key) || path.includes(key)) {
                return emoji;
            }
        }

        // Паттерны по типам приложений
        const patternMatches = [
            { patterns: ['browser', 'navigator', 'минет'], emoji: '🌐' },
            { patterns: ['studio', 'editor', 'editor', 'ide'], emoji: '💻' },
            { patterns: ['media', 'player', 'video', 'audio', 'фильм', 'видео', 'музык'], emoji: '🎵' },
            { patterns: ['design', 'paint', 'graphics', 'рисунок', 'граф'], emoji: '🎨' },
            { patterns: ['zip', 'rar', 'archive', 'архив'], emoji: '📁' },
            { patterns: ['mail', 'email', 'messenger', 'chat', 'почт'], emoji: '💬' },
            { patterns: ['cloud', 'sync', 'drive', 'облак'], emoji: '☁️' },
            { patterns: ['virtual', 'machine', 'vm', 'hyper', 'виртуальн'], emoji: '💾' },
            { patterns: ['office', 'word', 'excel', 'writer', 'документ'], emoji: '📄' },
            { patterns: ['antivirus', 'security', 'vpn', 'защит', 'безопас'], emoji: '🔒' },
            { patterns: ['tool', 'utility', 'system', 'admin', 'утилит'], emoji: '🔧' },
            { patterns: ['game', 'play', 'launcher', 'игр'], emoji: '🎮' },
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
            'exe': '🚀', 'msi': '📦', 'bat': '⚡', 'cmd': '⚡', 'lnk': '🔗', 'app': '📱',
            'deb': '📦', 'rpm': '📦', 'dmg': '💿', 'sh': '⚡', 'py': '🐍', 'js': '⚡', 'java': '☕'
        };

        if (extEmojiMap[extension]) {
            return extEmojiMap[extension];
        }

        // Универсальный fallback для неизвестных приложений
        const fallbackEmojis = ['📱', '📦', '🔧', '📋', '✨', '🎯', '💡', '🌟'];
        const hash = (appName + appPath).charCodeAt(0) + (appName + appPath).charCodeAt((appName + appPath).length - 1);
        return fallbackEmojis[hash % fallbackEmojis.length];
    }
}

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    new SettingsManager();
});

// Обработка загрузки страницы
window.addEventListener('load', () => {
    console.log('Окно настроек загружено');
}); 