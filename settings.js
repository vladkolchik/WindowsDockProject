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
        this.iconSizeSlider = document.getElementById('icon-size');
        this.iconSizeValue = document.getElementById('icon-size-value');

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
            this.updateUI();
            this.renderApps();
        } catch (error) {
            console.error('Ошибка загрузки настроек:', error);
            this.showNotification('Ошибка загрузки настроек', 'error');
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

        // Обновляем слайдер размера иконок
        this.iconSizeSlider.value = this.settings.iconSize || 48;
        this.iconSizeValue.textContent = `${this.iconSizeSlider.value}px`;

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
        this.iconSizeSlider.addEventListener('input', (e) => {
            this.iconSizeValue.textContent = `${e.target.value}px`;
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

        document.getElementById('settings-browse-button').addEventListener('click', () => {
            this.showNotification('Функция "Обзор" будет доступна в будущих обновлениях');
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
                this.showNotification('Горячая клавиша обновлена');
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
                iconSize: parseInt(this.iconSizeSlider.value),
                hotkeys: {
                    toggleDock: this.hotkeyInputs['toggle-dock'].value,
                    quit: this.hotkeyInputs['quit'].value,
                    addApp: this.hotkeyInputs['add-app'].value,
                    help: this.hotkeyInputs['help'].value
                }
            };

            const result = await ipcRenderer.invoke('save-settings', newSettings);
            
            if (result.success) {
                this.showNotification('Настройки сохранены', 'success');
                setTimeout(() => this.closeWindow(), 1000);
            } else {
                this.showNotification('Ошибка сохранения настроек', 'error');
            }
        } catch (error) {
            console.error('Ошибка сохранения настроек:', error);
            this.showNotification('Ошибка сохранения настроек', 'error');
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
            this.iconSizeSlider.value = 48;
            this.iconSizeValue.textContent = '48px';

            // Горячие клавиши по умолчанию
            this.hotkeyInputs['toggle-dock'].value = 'Ctrl+H';
            this.hotkeyInputs['quit'].value = 'Ctrl+Q';
            this.hotkeyInputs['add-app'].value = 'Ctrl+N';
            this.hotkeyInputs['help'].value = 'F1';

            this.showNotification('Настройки сброшены');
        }
    }

    closeWindow() {
        window.close();
    }

    showNotification(message, type = 'info') {
        // Создаем простое уведомление
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Стили для уведомления
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: type === 'error' ? '#ff4444' : type === 'success' ? '#28a745' : '#007ACC',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            zIndex: '3000',
            fontSize: '14px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease'
        });

        document.body.appendChild(notification);

        // Удаляем уведомление через 3 секунды
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Отображение приложений в настройках
    renderApps() {
        const appsGrid = document.getElementById('settings-apps-list');
        appsGrid.innerHTML = '';

        if (!this.apps || this.apps.length === 0) {
            appsGrid.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Нет приложений</p>';
            return;
        }

        this.apps.forEach(app => {
            const appItem = document.createElement('div');
            appItem.className = 'app-item';
            appItem.innerHTML = `
                <div class="app-item-icon">${app.icon}</div>
                <div class="app-item-name">${app.name}</div>
                <button class="app-item-remove" data-app-id="${app.id}">×</button>
            `;

            // Обработчик удаления
            appItem.querySelector('.app-item-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeAppFromSettings(app.id);
            });

            appsGrid.appendChild(appItem);
        });
    }

    // Добавление приложения из настроек
    async addAppFromSettings() {
        const name = document.getElementById('settings-app-name').value.trim();
        const path = document.getElementById('settings-app-path').value.trim();
        const icon = document.getElementById('settings-app-icon').value.trim() || '🚀';

        if (!name || !path) {
            this.showNotification('Заполните все обязательные поля', 'error');
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
                this.showNotification(`Приложение "${name}" добавлено`, 'success');
            } else {
                this.showNotification('Ошибка добавления приложения', 'error');
            }
        } catch (error) {
            console.error('Ошибка добавления приложения:', error);
            this.showNotification('Ошибка добавления приложения', 'error');
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
                this.showNotification(`Приложение "${app.name}" удалено`, 'success');
            } else {
                this.showNotification('Ошибка удаления приложения', 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления приложения:', error);
            this.showNotification('Ошибка удаления приложения', 'error');
        }
    }

    // Очистка формы добавления приложения
    clearAddAppForm() {
        document.getElementById('settings-app-name').value = '';
        document.getElementById('settings-app-path').value = '';
        document.getElementById('settings-app-icon').value = '';
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