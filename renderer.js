const { ipcRenderer } = require('electron');

// Класс для управления dock панелью
class DockManager {
    constructor() {
        this.apps = this.loadApps();
        this.contextMenu = document.getElementById('context-menu');
        this.modal = document.getElementById('add-app-modal');
        this.currentRightClickedItem = null;
        
        this.initializeEventListeners();
        this.renderApps();
        // Добавляем небольшую задержку для правильного отображения номеров
        setTimeout(() => {
            this.updateAppNumbers();
        }, 100);
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

    // Инициализация обработчиков событий
    initializeEventListeners() {
        // Обработка кликов по элементам dock панели
        document.addEventListener('click', (e) => {
            const dockItem = e.target.closest('.dock-item');
            if (dockItem) {
                this.handleDockItemClick(dockItem);
            }
            
            // Скрытие контекстного меню при клике в другом месте
            this.hideContextMenu();
        });

        // Обработка правого клика
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const dockItem = e.target.closest('.dock-item');
            if (dockItem) {
                this.showContextMenu(e, dockItem);
            }
        });

        // Обработка контекстного меню
        this.contextMenu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action) {
                this.handleContextMenuAction(action);
            }
        });

        // Обработка модального окна
        this.setupModalHandlers();

        // Обработка клавиш
        document.addEventListener('keydown', (e) => {
            // Escape - закрыть меню и модальные окна
            if (e.key === 'Escape') {
                this.hideContextMenu();
                this.hideModal();
            }
            
            // Ctrl + H - скрыть/показать dock
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                this.handleSystemAction('toggle-dock');
            }
            
            // Ctrl + Q - выход из приложения
            if (e.ctrlKey && e.key === 'q') {
                e.preventDefault();
                this.handleSystemAction('quit');
            }
            
            // Ctrl + N - добавить новое приложение
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.showModal();
            }
            
            // F1 - показать помощь
            if (e.key === 'F1') {
                e.preventDefault();
                this.showHelp();
            }
            
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
                this.showNotification(`Не удалось запустить ${app.name}`, 'error');
            }
        } catch (error) {
            console.error('Ошибка запуска приложения:', error);
            this.showNotification(`Ошибка при запуске ${app.name}`, 'error');
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
        }
    }

    // Показ контекстного меню
    showContextMenu(e, dockItem) {
        this.currentRightClickedItem = dockItem;
        
        const rect = dockItem.getBoundingClientRect();
        
        let x = rect.left + rect.width / 2;
        let y = rect.bottom + 10; // Размещаем меню снизу от dock панели
        
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.style.transform = 'translateX(-50%)';
        this.contextMenu.classList.add('show');
    }

    // Скрытие контекстного меню
    hideContextMenu() {
        this.contextMenu.classList.remove('show');
        this.currentRightClickedItem = null;
    }

    // Обработка действий контекстного меню
    handleContextMenuAction(action) {
        switch (action) {
            case 'add-app':
                this.showModal();
                break;
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
        this.hideContextMenu();
    }

    // Показ модального окна
    showModal() {
        this.modal.classList.add('show');
        document.getElementById('app-name').focus();
    }

    // Скрытие модального окна
    hideModal() {
        this.modal.classList.remove('show');
        this.clearModalForm();
    }

    // Очистка формы модального окна
    clearModalForm() {
        document.getElementById('app-name').value = '';
        document.getElementById('app-path').value = '';
        document.getElementById('app-icon').value = '';
    }

    // Настройка обработчиков модального окна
    setupModalHandlers() {
        const form = document.getElementById('add-app-form');
        const cancelButton = document.getElementById('cancel-button');
        const browseButton = document.getElementById('browse-button');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addApp();
        });

        cancelButton.addEventListener('click', () => {
            this.hideModal();
        });

        browseButton.addEventListener('click', () => {
            // В реальном приложении здесь будет диалог выбора файла
            this.showNotification('Функция "Обзор" будет доступна в будущих обновлениях');
        });

        // Закрытие модального окна при клике вне его
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });
    }

    // Добавление приложения
    addApp() {
        const name = document.getElementById('app-name').value.trim();
        const path = document.getElementById('app-path').value.trim();
        const icon = document.getElementById('app-icon').value.trim() || '🚀';

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

        this.apps.push(newApp);
        this.saveApps();
        this.renderApps();
        this.hideModal();
        this.showNotification(`Приложение "${name}" добавлено`);
    }

    // Удаление приложения
    removeApp() {
        if (!this.currentRightClickedItem) return;

        const appId = this.currentRightClickedItem.dataset.app;
        const app = this.apps.find(a => a.id === appId);

        if (app) {
            this.apps = this.apps.filter(a => a.id !== appId);
            this.saveApps();
            this.renderApps();
            this.showNotification(`Приложение "${app.name}" удалено`);
        }
    }

    // Отображение приложений
    renderApps() {
        const dockSection = document.querySelector('.dock-section');
        
        // Очищаем существующие элементы (кроме системных)
        const customApps = dockSection.querySelectorAll('.dock-item[data-app]');
        customApps.forEach(item => {
            // Оставляем только системные элементы
            if (!['explorer', 'chrome', 'vscode', 'terminal', 'calculator', 'settings'].includes(item.dataset.app)) {
                item.remove();
            }
        });

        // Добавляем пользовательские приложения
        this.apps.forEach(app => {
            if (!['explorer', 'chrome', 'vscode', 'terminal', 'calculator', 'settings'].includes(app.id)) {
                const dockItem = this.createDockItem(app);
                dockSection.appendChild(dockItem);
            }
        });

        // Добавляем номера для быстрого запуска
        this.updateAppNumbers();
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
        dockItem.title = app.name;

        const dockIcon = document.createElement('div');
        dockIcon.className = 'dock-icon';
        dockIcon.textContent = app.icon;

        const dockTooltip = document.createElement('div');
        dockTooltip.className = 'dock-tooltip';
        dockTooltip.textContent = app.name;

        dockItem.appendChild(dockIcon);
        dockItem.appendChild(dockTooltip);

        return dockItem;
    }

    // Показ уведомлений
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
            background: type === 'error' ? '#ff4444' : '#007ACC',
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

    // Показ настроек
    showSettings() {
        this.showNotification('Настройки будут доступны в будущих обновлениях');
    }

    // Запуск приложения по индексу (для горячих клавиш)
    launchAppByIndex(index) {
        if (index >= 0 && index < this.apps.length) {
            const app = this.apps[index];
            this.launchApp(app.id);
            this.showNotification(`Запуск: ${app.name} (${index + 1})`);
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
• Ctrl + N - Добавить приложение
• F1 - Показать справку

🚀 Быстрый запуск:
• 1-9 - Запуск приложения по номеру
• Левый клик - Запуск приложения
• Правый клик - Контекстное меню

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
}

// Инициализация dock панели после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    new DockManager();
});

// Обработка загрузки страницы
window.addEventListener('load', () => {
    console.log('Windows Dock загружен');
}); 