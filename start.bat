@echo off
title Windows Dock Launcher
echo.
echo ===============================
echo     Windows Dock Launcher
echo ===============================
echo.
echo Запуск dock панели...
echo.

:: Проверка наличия Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден!
    echo Пожалуйста, установите Node.js с https://nodejs.org/
    pause
    exit /b 1
)

:: Проверка наличия зависимостей
if not exist "node_modules" (
    echo Установка зависимостей...
    call npm install
    if %errorlevel% neq 0 (
        echo [ОШИБКА] Не удалось установить зависимости!
        pause
        exit /b 1
    )
)

:: Запуск приложения
echo Запуск Windows Dock...
call npm start

if %errorlevel% neq 0 (
    echo [ОШИБКА] Не удалось запустить приложение!
    pause
    exit /b 1
)

pause 