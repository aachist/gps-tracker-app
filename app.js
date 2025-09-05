document.addEventListener('DOMContentLoaded', () => {
    // === 1. Базовая инициализация карты (этот код работает везде) ===
    // Сначала мы просто создаем карту, чтобы она была видна в любом окружении.
    const map = L.map('map').setView([55.751244, 37.618423], 13); // Начальные координаты (Москва)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // === 2. Проверяем, запущено ли приложение на телефоне ===
    // Эта проверка определяет, нужно ли включать GPS и другие нативные функции.
    if (window.Capacitor && Capacitor.isNativePlatform()) {
        // Если да, то запускаем всю логику мобильного приложения.
        initializeNativeApp();
    } else {
        // Если нет (мы в обычном браузере), выводим сообщение в консоль.
        console.log("Приложение запущено в браузере. Функции GPS-трекинга недоступны.");
    }

    // === 3. Вся логика для телефона в одной функции ===
    // Мы поместили весь наш предыдущий код сюда.
    // Он будет выполнен только если проверка выше прошла успешно.
    function initializeNativeApp() {
        console.log("Приложение запущено на нативной платформе. Инициализация GPS...");

        // --- Инициализация плагинов Capacitor ---
        const { Geolocation } = Capacitor.Plugins;
        const { Filesystem } = Capacitor.Plugins;
        const { LocalNotifications } = Capacitor.Plugins;

        // --- Переменные состояния приложения ---
        let userMarker;
        let trackPolyline = L.polyline([], { color: 'blue' }).addTo(map);
        let trackPoints = [];
        let isTracking = false;
        let watchId = null;
        let totalDistance = 0;

        // --- Элементы интерфейса ---
        const toggleBtn = document.getElementById('toggleTrackBtn');
        const clearBtn = document.getElementById('clearTrackBtn');
        const saveBtn = document.getElementById('saveTrackBtn');
        const coordsDisplay = document.getElementById('coords');
        const distanceDisplay = document.getElementById('distance');

        // --- Загрузка и настройка при старте ---
        loadTrackFromStorage();
        updateUI();

        // --- Обработчики событий кнопок ---
        toggleBtn.addEventListener('click', toggleTracking);
        clearBtn.addEventListener('click', clearTrack);
        saveBtn.addEventListener('click', saveTrackToFile);

        // --- Функции геолокации ---
        async function startTracking() {
            const permissions = await Geolocation.requestPermissions();
            if (permissions.location !== 'granted') {
                alert('Для работы приложения необходимо разрешение на геолокацию.');
                return;
            }

            isTracking = true;
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
                trackPoints.push(newPoint);

                if (trackPoints.length > 1) {
                    const prevPoint = trackPoints[trackPoints.length - 2];
                    totalDistance += calculateDistance(prevPoint[0], prevPoint[1], newPoint[0], newPoint[1]);
                }
                
                updateMap(latitude, longitude);
                saveTrackToStorage();
                updateUI();
            });

            await showTrackingNotification();
        }

        async function stopTracking() {
            isTracking = false;
            if (watchId) {
                await Geolocation.clearWatch({ id: watchId });
                watchId = null;
            }
            updateUI();
            await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
        }

        function toggleTracking() {
            if (isTracking) {
                stopTracking();
            } else {
                startTracking();
            }
        }

        // --- Функции карты и интерфейса ---
        function updateMap(lat, lng) {
            if (!userMarker) {
                userMarker = L.marker([lat, lng]).addTo(map);
            } else {
                userMarker.setLatLng([lat, lng]);
            }
            map.setView([lat, lng], 16);
            trackPolyline.setLatLngs(trackPoints);
        }
        
        function updateUI() {
            toggleBtn.textContent = isTracking ? 'Остановить запись' : 'Начать запись';
            distanceDisplay.textContent = `Расстояние: ${totalDistance.toFixed(2)} км`;

            if (trackPoints.length > 0) {
                const lastPoint = trackPoints[trackPoints.length - 1];
                coordsDisplay.textContent = `Координаты: ${lastPoint[0].toFixed(5)}, ${lastPoint[1].toFixed(5)}`;
            } else {
                coordsDisplay.textContent = 'Координаты: --';
            }
        }
        
        // --- Функции работы с треком ---
        function clearTrack() {
            if (isTracking) {
                stopTracking();
            }
            trackPoints = [];
            totalDistance = 0;
            trackPolyline.setLatLngs([]);
            if (userMarker) {
                map.removeLayer(userMarker);
                userMarker = null;
            }
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
                const trackData = JSON.parse(savedTrack);
                trackPoints = trackData.points || [];
                totalDistance = trackData.distance || 0;

                if (trackPoints.length > 0) {
                    trackPolyline.setLatLngs(trackPoints);
                    const lastPoint = trackPoints[trackPoints.length - 1];
                    updateMap(lastPoint[0], lastPoint[1]);
                    map.fitBounds(trackPolyline.getBounds());
                }
            }
        }
        
        // --- Функции сохранения файла ---
        async function saveTrackToFile() {
            if (trackPoints.length === 0) {
                alert('Трек пуст. Нечего сохранять.');
                return;
            }

            const gpxData = generateGPX();
            const fileName = `track_${new Date().toISOString().replace(/:/g, '-')}.gpx`;

            try {
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
                gpx += `<trkpt lat="${point[0]}" lon="${point[1]}"><time>${new Date().toISOString()}</time></trkpt>`;
            });

            gpx += `</trkseg></trk>
</gpx>`;
            return gpx;
        }

        // --- Вспомогательные функции ---
        function calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371; // Радиус Земли в км
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c; // Расстояние в км
        }

        async function showTrackingNotification() {
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
        }
    }
});