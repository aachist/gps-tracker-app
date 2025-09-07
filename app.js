// Ждем, пока загрузится DOM и инициализируются плагины Capacitor
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    
    // Проверка наличия необходимых элементов
    const requiredElements = [
        'toggleTrackBtn', 'clearTrackBtn', 'saveTrackBtn', 'centerMapBtn',
        'coords', 'distance', 'map'
    ];
    
    requiredElements.forEach(id => {
        const element = document.getElementById(id);
        if (!element) {
            console.error(`Element with id '${id}' not found!`);
        } else {
            console.log(`Element '${id}' found`);
        }
    });

    // === Инициализация плагинов Capacitor ===
    const { Geolocation } = Capacitor.Plugins;
    const { Filesystem } = Capacitor.Plugins;
    const { LocalNotifications } = Capacitor.Plugins;
    const { App } = Capacitor.Plugins;

    // === Переменные состояния приложения ===
    let map;
    let userMarker;
    let trackPolyline;
    let trackPoints = [];
    let isTracking = false;
    let watchId = null;
    let totalDistance = 0;
    let currentPosition = null;

    // === Элементы интерфейса ===
    const toggleBtn = document.getElementById('toggleTrackBtn');
    const clearBtn = document.getElementById('clearTrackBtn');
    const saveBtn = document.getElementById('saveTrackBtn');
    const centerBtn = document.getElementById('centerMapBtn');
    const coordsDisplay = document.getElementById('coords');
    const distanceDisplay = document.getElementById('distance');

    // === Основная функция инициализации ===
    function initialize() {
        // Инициализация карты Leaflet с координатами по умолчанию
        map = L.map('map').setView([55.751244, 37.618423], 13);
        
        // Добавление слоя OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // Обработчик ошибок загрузки карты
        map.on('loaderror', function(e) {
            console.error('Map load error:', e);
        });

        // Создание маркера для текущего местоположения
        userMarker = L.marker([0, 0], {
            icon: L.divIcon({
                className: 'user-marker',
                html: '<div class="pulse"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(map);
        
        // Инициализация линии трека
        trackPolyline = L.polyline([], {
            color: '#007bff',
            weight: 4,
            opacity: 0.7,
            lineJoin: 'round'
        }).addTo(map);

        // Запрос геолокации при запуске
        requestLocation();

        // Загрузка трека из localStorage при запуске
        loadTrackFromStorage();
        updateUI();

        // Назначение обработчиков событий на кнопки
        toggleBtn.addEventListener('click', toggleTracking);
        clearBtn.addEventListener('click', clearTrack);
        saveBtn.addEventListener('click', saveTrackToFile);
        centerBtn.addEventListener('click', centerMap);
        
        console.log('App initialized successfully');
    }

    // === Функции для работы с геолокацией ===
    async function requestLocation() {
        try {
            const position = await Geolocation.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 10000
            });
            
            const { latitude, longitude } = position.coords;
            currentPosition = [latitude, longitude];
            updateMap(latitude, longitude, false);
        } catch (error) {
            console.error('Ошибка получения местоположения:', error);
        }
    }

    async function startTracking() {
        try {
            // Проверяем текущие разрешения
            let permissions;
            try {
                permissions = await Geolocation.checkPermissions();
                console.log('Текущие разрешения:', permissions);
            } catch (error) {
                console.error('Ошибка проверки разрешений:', error);
                permissions = { location: 'prompt' };
            }
            
            // Если разрешения не предоставлены, запрашиваем их
            if (permissions.location !== 'granted') {
                try {
                    permissions = await Geolocation.requestPermissions();
                    console.log('Разрешения после запроса:', permissions);
                } catch (error) {
                    console.error('Ошибка запроса разрешений:', error);
                    alert('Не удалось запросить разрешение на геолокацию. Пожалуйста, предоставьте разрешение в настройках приложения.');
                    try {
                        await App.openAppSettings();
                    } catch (e) {
                        console.error('Не удалось открыть настройки:', e);
                    }
                    return;
                }
            }

            if (permissions.location !== 'granted') {
                alert('Для работы приложения необходимо разрешение на геолокацию. Пожалуйста, предоставьте разрешение в настройках приложения.');
                try {
                    await App.openAppSettings();
                } catch (e) {
                    console.error('Не удалось открыть настройки:', e);
                }
                return;
            }

            isTracking = true;
            toggleBtn.classList.add('recording');
            
            // Запускаем отслеживание с интервалом
            watchId = await Geolocation.watchPosition({
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }, (position, err) => {
                if (err) {
                    console.error('Ошибка геолокации:', err);
                    return;
                }

                const { latitude, longitude } = position.coords;
                const newPoint = [latitude, longitude];
                currentPosition = [latitude, longitude];

                // Добавляем точку в трек
                trackPoints.push(newPoint);

                // Обновляем расстояние, если это не первая точка
                if (trackPoints.length > 1) {
                    const prevPoint = trackPoints[trackPoints.length - 2];
                    totalDistance += calculateDistance(prevPoint[0], prevPoint[1], newPoint[0], newPoint[1]);
                }
                
                // Обновляем карту и интерфейс
                updateMap(latitude, longitude, false);
                saveTrackToStorage();
                updateUI();
            });

            // Показываем уведомление о фоновой работе
            await showTrackingNotification();
        } catch (error) {
            console.error('Ошибка запуска отслеживания:', error);
            alert('Не удалось запустить отслеживание геолокации.');
            isTracking = false;
            toggleBtn.classList.remove('recording');
        }
    }

    async function stopTracking() {
        isTracking = false;
        toggleBtn.classList.remove('recording');
        if (watchId) {
            try {
                await Geolocation.clearWatch({ id: watchId });
            } catch (error) {
                console.error('Ошибка остановки отслеживания:', error);
            }
            watchId = null;
        }
        updateUI();
        // Скрываем уведомление
        try {
            await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
        } catch (error) {
            console.error('Ошибка отмены уведомления:', error);
        }
    }

    function toggleTracking() {
        if (isTracking) {
            stopTracking();
        } else {
            startTracking();
        }
    }

    // Функция центрирования карты на текущем местоположении
    function centerMap() {
        if (currentPosition) {
            map.setView(currentPosition, 16);
        } else {
            requestLocation();
        }
    }

    // === Функции для работы с картой и интерфейсом ===
    function updateMap(lat, lng, center = false) {
        // Обновляем маркер пользователя
        userMarker.setLatLng([lat, lng]);
        
        // Обновляем линию трека
        trackPolyline.setLatLngs(trackPoints);
        
        // Центрируем карту только если явно указано
        if (center) {
            map.setView([lat, lng], 16);
        }
    }
    
    function updateUI() {
        // Обновляем текст на кнопке
        toggleBtn.textContent = isTracking ? '⏹' : '●';
        
        // Обновляем информацию о расстоянии
        distanceDisplay.textContent = `Расстояние: ${totalDistance.toFixed(2)} км`;

        // Обновляем информацию о координатах
        if (trackPoints.length > 0) {
            const lastPoint = trackPoints[trackPoints.length - 1];
            coordsDisplay.textContent = `Координаты: ${lastPoint[0].toFixed(5)}, ${lastPoint[1].toFixed(5)}`;
        } else {
            coordsDisplay.textContent = 'Координаты: --';
        }
    }
    
    // === Функции для работы с треком ===
    function clearTrack() {
        if (isTracking) {
            stopTracking();
        }
        trackPoints = [];
        totalDistance = 0;
        trackPolyline.setLatLngs([]);
        localStorage.removeItem('gpsTrack');
        updateUI();
        alert('Трек очищен.');
    }

    function saveTrackToStorage() {
        const trackData = {
            points: trackPoints,
            distance: totalDistance
        };
        localStorage.setItem('gpsTrack', JSON.stringify(trackData));
    }

    function loadTrackFromStorage() {
        const savedTrack = localStorage.getItem('gpsTrack');
        if (savedTrack) {
            try {
                const trackData = JSON.parse(savedTrack);
                trackPoints = trackData.points || [];
                totalDistance = trackData.distance || 0;

                if (trackPoints.length > 0) {
                    trackPolyline.setLatLngs(trackPoints);
                    const lastPoint = trackPoints[trackPoints.length - 1];
                    updateMap(lastPoint[0], lastPoint[1], false);
                }
            } catch (error) {
                console.error('Ошибка загрузки трека из хранилища:', error);
                localStorage.removeItem('gpsTrack');
            }
        }
    }
    
    // === Функции для сохранения файла ===
    async function saveTrackToFile() {
        if (trackPoints.length === 0) {
            alert('Трек пуст. Нечего сохранять.');
            return;
        }

        const gpxData = generateGPX();
        const fileName = `track_${new Date().toISOString().replace(/:/g, '-')}.gpx`;

        try {
            // Сохраняем файл в папку Documents
            await Filesystem.writeFile({
                path: fileName,
                data: gpxData,
                directory: 'DOCUMENTS',
                encoding: 'utf-8'
            });
            alert(`Трек сохранен в файл: ${fileName}\n(в папке "Документы" вашего телефона)`);
        } catch (e) {
            console.error('Ошибка сохранения файла', e);
            alert('Не удалось сохранить файл.');
        }
    }
    
    function generateGPX() {
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MyGPSApp" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>GPS Track</name>
    <trkseg>`;
        
        trackPoints.forEach(point => {
            gpx += `
      <trkpt lat="${point[0]}" lon="${point[1]}">
        <time>${new Date().toISOString()}</time>
      </trkpt>`;
        });

        gpx += `
    </trkseg>
  </trk>
</gpx>`;
        return gpx;
    }

    // === Вспомогательные функции ===
    
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async function showTrackingNotification() {
        try {
            await LocalNotifications.schedule({
                notifications: [
                    {
                        title: "GPS Трекер активен",
                        body: "Идет запись вашего маршрута.",
                        id: 1,
                        ongoing: true,
                        smallIcon: 'ic_stat_location_on'
                    }
                ]
            });
        } catch (error) {
            console.error('Ошибка показа уведомления:', error);
        }
    }

    // Запускаем инициализацию
    initialize();
});