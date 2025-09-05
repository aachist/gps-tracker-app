document.addEventListener('DOMContentLoaded', () => {
    // === Базовая инициализация карты (этот код работает везде) ===
    let map = L.map('map').setView([55.751244, 37.618423], 13); // Начальные координаты (Москва)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // === Проверяем, запущено ли приложение на телефоне ===
    if (window.Capacitor && Capacitor.isNativePlatform()) {
        // Этот код будет выполняться ТОЛЬКО на телефоне или в эмуляторе
        runNativeAppLogic();
    } else {
        // Этот код выполнится в обычном браузере
        console.log("Приложение запущено в браузере. Функции GPS недоступны.");
        // Здесь можно, например, показать какой-то демонстрационный трек или сообщение
    }


    // === Вся логика для телефона перенесена в отдельную функцию ===
    function runNativeAppLogic() {
        const { Geolocation } = Capacitor.Plugins;
        const { Filesystem } = Capacitor.Plugins;
        const { LocalNotifications } = Capacitor.Plugins;

        // === Переменные состояния приложения ===
        let userMarker;
        let trackPolyline;
        let trackPoints = []; 
        let isTracking = false;
        let watchId = null;
        let totalDistance = 0;

        // === Элементы интерфейса ===
        const toggleBtn = document.getElementById('toggleTrackBtn');
        const clearBtn = document.getElementById('clearTrackBtn');
        const saveBtn = document.getElementById('saveTrackBtn');
        const coordsDisplay = document.getElementById('coords');
        const distanceDisplay = document.getElementById('distance');

        // Инициализация линии трека
        trackPolyline = L.polyline([], { color: 'blue' }).addTo(map);
        loadTrackFromStorage();
        updateUI();

        // Назначение обработчиков событий на кнопки
        toggleBtn.addEventListener('click', toggleTracking);
        clearBtn.addEventListener('click', clearTrack);
        saveBtn.addEventListener('click', saveTrackToFile);

        // ... и здесь весь остальной код из вашего app.js, который мы писали ранее ...
        // (функции startTracking, stopTracking, updateMap, updateUI, и т.д.)
    }

    // Если вы хотите, чтобы остальной код тоже был здесь, просто скопируйте его
    // внутрь функции runNativeAppLogic(). Я не стал его дублировать для краткости.
});