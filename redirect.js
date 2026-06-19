/* ============================================================
   Custom New Tab — redirect.js (v1.2)
   ============================================================ */

/* ---------- ext storage (sync) abstraction ---------- */
const hasBrowserSync = (typeof browser !== 'undefined' && browser.storage && browser.storage.sync);
const hasChromeSync = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync);
const SYNC_AVAILABLE = hasBrowserSync || hasChromeSync;
const SYNC_KEY = 'shortcuts_sync';

function syncGet(key) {
    return new Promise((resolve) => {
        try {
            if (hasBrowserSync) {
                browser.storage.sync.get(key).then(resolve, () => resolve(null));
            } else if (hasChromeSync) {
                chrome.storage.sync.get(key, (res) => resolve(chrome.runtime && chrome.runtime.lastError ? null : res));
            } else {
                resolve(null);
            }
        } catch (e) { resolve(null); }
    });
}

function syncSet(obj) {
    return new Promise((resolve) => {
        try {
            if (hasBrowserSync) {
                browser.storage.sync.set(obj).then(() => resolve(true), () => resolve(false));
            } else if (hasChromeSync) {
                chrome.storage.sync.set(obj, () => resolve(!(chrome.runtime && chrome.runtime.lastError)));
            } else {
                resolve(false);
            }
        } catch (e) { resolve(false); }
    });
}

function onSyncChanged(cb) {
    try {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
            browser.storage.onChanged.addListener(cb);
        } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener(cb);
        }
    } catch (e) {}
}

/* ---------- state ---------- */
let shortcuts = [];
try {
    shortcuts = JSON.parse(localStorage.getItem('myShortcuts')) || [];
    if (!Array.isArray(shortcuts)) shortcuts = [];
} catch (e) {
    shortcuts = [];
}

let muted = localStorage.getItem('muted') === '1';
let pendingIconData = null;
let editingIndex = -1;
let dragIndex = null;

const MAX_SHORTCUTS = 27;

/* ---------- search engines ---------- */
const ENGINES = {
    google: { label: 'Google', url: 'https://www.google.com/search?q=' },
    ddg:    { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    brave:  { label: 'Brave', url: 'https://search.brave.com/search?q=' }
};
let engine = localStorage.getItem('searchEngine') || 'google';
if (!ENGINES[engine]) engine = 'google';

const ENGINE_SVG = {
    google: `<svg xmlns="http://www.w3.org/2000/svg" width="705.6" height="720" viewBox="0 0 186.69 190.5" xmlns:v="https://vecta.io/nano"><g transform="translate(1184.583 765.171)"><path clip-path="none" mask="none" d="M-1089.333-687.239v36.888h51.262c-2.251 11.863-9.006 21.908-19.137 28.662l30.913 23.986c18.011-16.625 28.402-41.044 28.402-70.052 0-6.754-.606-13.249-1.732-19.483z" fill="#4285f4"/><path clip-path="none" mask="none" d="M-1142.714-651.791l-6.972 5.337-24.679 19.223h0c15.673 31.086 47.796 52.561 85.03 52.561 25.717 0 47.278-8.486 63.038-23.033l-30.913-23.986c-8.486 5.715-19.31 9.179-32.125 9.179-24.765 0-45.806-16.712-53.34-39.226z" fill="#34a853"/><path clip-path="none" mask="none" d="M-1174.365-712.61c-6.494 12.815-10.217 27.276-10.217 42.689s3.723 29.874 10.217 42.689c0 .086 31.693-24.592 31.693-24.592-1.905-5.715-3.031-11.776-3.031-18.098s1.126-12.383 3.031-18.098z" fill="#fbbc05"/><path d="M-1089.333-727.244c14.028 0 26.497 4.849 36.455 14.201l27.276-27.276c-16.539-15.413-38.013-24.852-63.731-24.852-37.234 0-69.359 21.388-85.032 52.561l31.692 24.592c7.533-22.514 28.575-39.226 53.34-39.226z" fill="#ea4335" clip-path="none" mask="none"/></g></svg>`,
    ddg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.88 122.88"><defs><style>.a{fill:#d53;}.b{fill:#fff;}.c{fill:#ddd;}.d{fill:#fc0;}.e{fill:#6b5;}.f{fill:#4a4;}.g{fill:#148;}</style></defs><title>duckduckgo</title><path class="a" d="M122.88,61.44a61.44,61.44,0,1,0-61.44,61.44,61.44,61.44,0,0,0,61.44-61.44Z"/><path class="b" d="M114.37,61.44a52.92,52.92,0,1,0-15.5,37.43,52.76,52.76,0,0,0,15.5-37.43Zm-13.12-39.8A56.29,56.29,0,1,1,61.44,5.15a56.12,56.12,0,0,1,39.81,16.49Z"/><path class="c" d="M43.24,30.15C26.17,34.13,32.43,58,32.43,58l10.81,52.9,4,1.71-4-82.49Zm-4-10.24H34.7L41,22.19s-6.26,0-6.26,4C48.36,25.6,54.61,29,54.61,29l-15.36-9.1Zm0,0Z"/><path class="b" d="M75.66,115.48S62,93.87,62,79.64c0-26.73,17.63-4,17.63-25S62,28.44,62,28.44c-8.53-10.8-25-8.53-25-8.53l4,2.28s-4,1.13-5.12,2.27,10.81-1.7,15.93,2.85C30.72,29,34.13,46.08,34.13,46.08l11.95,68.27,29.58,1.13Zm0,0Z"/><path class="d" d="M75.66,60.87l21.62-5.69C116.62,58,80.78,68.84,78.51,68.27c-17.07-2.85-12,11.37,8.53,6.82s5.12,11.38-13.65,5.12c-26.74-7.39-12.52-20.48,2.27-19.34Z"/><path class="e" d="M70,105.81l1.14-1.7c12.52,4.55,13.09,6.25,12.52-5.12s0-11.38-13.09-1.71c0-2.84-7.39-1.71-8.53,0-11.95-5.12-13.09-6.83-12.52,1.14,1.14,16.5.57,13.65,11.95,8l8.53-.57Zm0,0Z"/><path class="f" d="M60.87,99.56v6.82c.57,1.14,9.67,1.14,9.67-1.14s-4.55,1.71-7.39.57S62,98.42,62,98.42l-1.14,1.14Zm0,0Z"/><path class="g" d="M48.36,43.24c-2.85-3.42-10.24-.57-8.54,4,.57-2.28,4.55-5.69,8.54-4Zm18.2,0c.57-3.42,6.26-4,8-.57a8,8,0,0,0-8,.57Zm-18.77,9.1a1.14,1.14,0,1,1,0,.57v-.57Zm-4.55,2.27a4,4,0,1,0,0-.57v.57Zm29.58-4a1.14,1.14,0,1,1,0,.57v-.57ZM69.4,52.91a3.42,3.42,0,1,0,0-.57v.57Zm0,0Z"/></svg>`,
    brave: `<svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 436.49 511.97"><defs><style>.cls-1{fill:url(#linear-gradient);}.cls-2{fill:#fff;}</style><linearGradient id="linear-gradient" x1="-18.79" y1="359.73" x2="194.32" y2="359.73" gradientTransform="matrix(2.05, 0, 0, -2.05, 38.49, 992.77)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f1562b"/><stop offset="0.3" stop-color="#f1542b"/><stop offset="0.41" stop-color="#f04d2a"/><stop offset="0.49" stop-color="#ef4229"/><stop offset="0.5" stop-color="#ef4029"/><stop offset="0.56" stop-color="#e83e28"/><stop offset="0.67" stop-color="#e13c26"/><stop offset="1" stop-color="#df3c26"/></linearGradient></defs><title>brave-browser</title><path class="cls-1" d="M436.49,165.63,420.7,122.75l11-24.6A8.47,8.47,0,0,0,430,88.78L400.11,58.6a48.16,48.16,0,0,0-50.23-11.66l-8.19,2.89L296.09.43,218.25,0,140.4.61,94.85,50.41l-8.11-2.87A48.33,48.33,0,0,0,36.19,59.3L5.62,90.05a6.73,6.73,0,0,0-1.36,7.47l11.47,25.56L0,165.92,56.47,380.64a89.7,89.7,0,0,0,34.7,50.23l111.68,75.69a24.73,24.73,0,0,0,30.89,0l111.62-75.8A88.86,88.86,0,0,0,380,380.53l46.07-176.14Z"/><path class="cls-2" d="M231,317.33a65.61,65.61,0,0,0-9.11-3.3h-5.49a66.08,66.08,0,0,0-9.11,3.3l-13.81,5.74-15.6,7.18-25.4,13.24a4.84,4.84,0,0,0-.62,9l22.06,15.49q7,5,13.55,10.76l6.21,5.35,13,11.37,5.89,5.2a10.15,10.15,0,0,0,12.95,0l25.39-22.18,13.6-10.77,22.06-15.79a4.8,4.8,0,0,0-.68-8.93l-25.36-12.8L244.84,323ZM387.4,175.2l.8-2.3a61.26,61.26,0,0,0-.57-9.18,73.51,73.51,0,0,0-8.19-15.44l-14.35-21.06-10.22-13.88-19.23-24a69.65,69.65,0,0,0-5.7-6.67h-.4L321,84.25l-42.27,8.14a33.49,33.49,0,0,1-12.59-1.84l-23.21-7.5-16.61-4.59a70.52,70.52,0,0,0-14.67,0L195,83.1l-23.21,7.54a33.89,33.89,0,0,1-12.59,1.84l-42.22-8-8.54-1.58h-.4a65.79,65.79,0,0,0-5.7,6.67l-19.2,24Q77.81,120.32,73,127.45L58.61,148.51l-6.78,11.31a51,51,0,0,0-1.94,13.35l.8,2.3A34.51,34.51,0,0,0,52,179.81l11.33,13,50.23,53.39a14.31,14.31,0,0,1,2.55,14.34L107.68,280a25.23,25.23,0,0,0-.39,16l1.64,4.52a43.58,43.58,0,0,0,13.39,18.76l7.89,6.43a15,15,0,0,0,14.35,1.72L172.62,314A70.38,70.38,0,0,0,187,304.52l22.46-20.27a9,9,0,0,0,3-6.36,9.08,9.08,0,0,0-2.5-6.56L159.2,237.18a9.83,9.83,0,0,1-3.09-12.45l19.66-36.95a19.21,19.21,0,0,0,1-14.67A22.37,22.37,0,0,0,165.58,163L103.94,139.8c-4.44-1.6-4.2-3.6.51-3.88l36.2-3.59a55.9,55.9,0,0,1,16.9,1.5l31.5,8.8a9.64,9.64,0,0,1,6.74,10.76L183.42,221a34.72,34.72,0,0,0-.61,11.41c.5,1.61,4.73,3.6,9.36,4.73l19.19,4a46.38,46.38,0,0,0,16.86,0l17.26-4c4.64-1,8.82-3.23,9.35-4.85a34.94,34.94,0,0,0-.63-11.4l-12.45-67.59a9.66,9.66,0,0,1,6.74-10.76l31.5-8.83a55.87,55.87,0,0,1,16.9-1.5l36.2,3.37c4.74.44,5,2.2.54,3.88L272,162.79a22.08,22.08,0,0,0-11.16,10.12,19.3,19.3,0,0,0,1,14.67l19.69,36.95A9.84,9.84,0,0,1,278.45,237l-50.66,34.23a9,9,0,0,0,.32,12.78l.15.14,22.49,20.27a71.46,71.46,0,0,0,14.35,9.47l28.06,13.35a14.89,14.89,0,0,0,14.34-1.76l7.9-6.45a43.53,43.53,0,0,0,13.38-18.8l1.65-4.52a25.27,25.27,0,0,0-.39-16l-8.26-19.49a14.4,14.4,0,0,1,2.55-14.35l50.23-53.45,11.3-13a35.8,35.8,0,0,0,1.54-4.24Z"/></svg>`
};

function engineIcon(e) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ENGINE_SVG[e] || ENGINE_SVG.google);
}

function lightForSync(list) {
    return list.map((it) => {
        const o = { name: it.name, url: it.url };
        if (it.iconData && !/^data:/i.test(it.iconData)) o.iconData = it.iconData;
        return o;
    });
}

function mergeSynced(syncList) {
    const localIcons = {};
    shortcuts.forEach((it) => { if (it.iconData) localIcons[it.url] = it.iconData; });
    return syncList
        .filter((it) => it && it.name && it.url)
        .map((it) => {
            const o = { name: String(it.name).slice(0, 12), url: String(it.url) };
            if (it.iconData) o.iconData = it.iconData;
            else if (localIcons[it.url]) o.iconData = localIcons[it.url];
            return o;
        });
}

function saveShortcuts(push = true) {
    try {
        localStorage.setItem('myShortcuts', JSON.stringify(shortcuts));
    } catch (e) {
        alert('Could not save: storage is full. Try smaller custom icons.');
    }
    if (push && SYNC_AVAILABLE) {
        setSyncStatus('saving\u2026');
        syncSet({ [SYNC_KEY]: lightForSync(shortcuts) }).then((ok) => {
            setSyncStatus(ok ? 'synced' : 'sync error');
        });
    }
}

function setSyncStatus(text) {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = SYNC_AVAILABLE ? ('\u21bb ' + text) : 'local only (open as extension to sync)';
}

async function initSync() {
    if (!SYNC_AVAILABLE) { setSyncStatus(''); return; }
    setSyncStatus('syncing\u2026');
    const res = await syncGet(SYNC_KEY);
    if (res && Array.isArray(res[SYNC_KEY])) {
        shortcuts = mergeSynced(res[SYNC_KEY]);
        saveShortcuts(false);
        renderShortcuts();
        setSyncStatus('synced');
    } else if (shortcuts.length) {
        saveShortcuts(true);
    } else {
        setSyncStatus('synced');
    }

    onSyncChanged((changes, area) => {
        if (area !== 'sync' || !changes[SYNC_KEY]) return;
        const nv = changes[SYNC_KEY].newValue;
        if (Array.isArray(nv)) {
            shortcuts = mergeSynced(nv);
            saveShortcuts(false);
            renderShortcuts();
            setSyncStatus('synced');
        }
    });
}

function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clock').textContent = `${h}:${m}:${s}`;

    const dateEl = document.getElementById('date');
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    }
}
updateClock();
setInterval(updateClock, 1000);

const searchBar = document.getElementById('searchBar');
searchBar.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    let v = searchBar.value.trim();
    if (!v) return;
    let url = '';
    if (v.startsWith('!d ')) url = 'https://duckduckgo.com/?q=' + encodeURIComponent(v.replace('!d ', '').trim());
    else if (v.startsWith('!y ')) url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(v.replace('!y ', '').trim());
    else if (v.startsWith('!w ')) url = 'https://ru.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(v.replace('!w ', '').trim());
    else url = ENGINES[engine].url + encodeURIComponent(v);
    window.location.href = url;
    searchBar.value = '';
});

function applyEngine() {
    if (!ENGINES[engine]) engine = 'google';
    searchBar.placeholder = 'Search ' + ENGINES[engine].label + '\u2026';
    const ic = document.querySelector('.search-icon');
    if (ic) {
        ic.src = engineIcon(engine);
        ic.alt = ENGINES[engine].label;
    }
    document.querySelectorAll('#engineRow .seg-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.engine === engine);
    });
}

function applyBackground(value) {
    const img = value ? `url('${value}')` : '';
    document.body.style.backgroundImage = img;
    document.documentElement.style.backgroundImage = img;
}

function compressBackground(src, cb) {
    const img = new Image();
    img.onload = () => {
        try {
            const maxW = 2560;
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            cb(canvas.toDataURL('image/jpeg', 0.82));
        } catch (e) { cb(src); }
    };
    img.onerror = () => cb(src);
    img.src = src;
}

function setBackgroundData(dataUrl) {
    try {
        localStorage.setItem('customBG', dataUrl);
        applyBackground(dataUrl);
    } catch (e) {
        alert('Image too large to store locally. Try a smaller image.');
    }
}

const WMO = {
    0: ['\u2600\ufe0f', 'Clear sky'],
    1: ['\ud83c\udf24\ufe0f', 'Mainly clear'],
    2: ['\u26c5', 'Partly cloudy'],
    3: ['\u2601\ufe0f', 'Overcast'],
    45: ['\ud83c\udf2b\ufe0f', 'Fog'],
    48: ['\ud83c\udf2b\ufe0f', 'Rime fog'],
    51: ['\ud83c\udf26\ufe0f', 'Light drizzle'],
    53: ['\ud83c\udf26\ufe0f', 'Drizzle'],
    55: ['\ud83c\udf26\ufe0f', 'Dense drizzle'],
    61: ['\ud83c\udf27\ufe0f', 'Light rain'],
    63: ['\ud83c\udf27\ufe0f', 'Rain'],
    65: ['\ud83c\udf27\ufe0f', 'Heavy rain'],
    66: ['\ud83c\udf27\ufe0f', 'Freezing rain'],
    67: ['\ud83c\udf27\ufe0f', 'Freezing rain'],
    71: ['\ud83c\udf28\ufe0f', 'Light snow'],
    73: ['\ud83c\udf28\ufe0f', 'Snow'],
    75: ['\ud83c\udf28\ufe0f', 'Heavy snow'],
    77: ['\ud83c\udf28\ufe0f', 'Snow grains'],
    80: ['\ud83c\udf26\ufe0f', 'Showers'],
    81: ['\ud83c\udf26\ufe0f', 'Showers'],
    82: ['\ud83c\udf26\ufe0f', 'Violent showers'],
    85: ['\ud83c\udf28\ufe0f', 'Snow showers'],
    86: ['\ud83c\udf28\ufe0f', 'Snow showers'],
    95: ['\u26c8\ufe0f', 'Thunderstorm'],
    96: ['\u26c8\ufe0f', 'Thunderstorm w/ hail'],
    99: ['\u26c8\ufe0f', 'Thunderstorm w/ hail']
};

async function loadWeather() {
    const el = document.getElementById('weather');
    if (!el) return;
    const city = (localStorage.getItem('weatherCity') || '').trim();
    if (!city) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    el.textContent = '\u23f3 loading weather\u2026';
    try {
        const geo = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(city)).then((r) => r.json());
        if (!geo.results || !geo.results.length) { el.textContent = '\u26a0 city not found'; return; }
        const g = geo.results[0];
        const w = await fetch('https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code&latitude=' + g.latitude + '&longitude=' + g.longitude).then((r) => r.json());
        const t = Math.round(w.current.temperature_2m);
        const info = WMO[w.current.weather_code] || ['\ud83c\udf21\ufe0f', ''];
        const place = g.name + (g.country_code ? ', ' + g.country_code : '');
        el.textContent = `${info[0]} ${t}\u00b0C \u00b7 ${place}`;
        el.title = info[1];
    } catch (e) {
        el.textContent = '\u26a0 weather unavailable';
    }
}

let notesOn = localStorage.getItem('notesOn') === '1';
let notesTimer = null;

function applyNotes() {
    const panel = document.getElementById('notesPanel');
    if (panel) panel.style.display = notesOn ? 'flex' : 'none';
    const btn = document.getElementById('notesToggleBtn');
    if (btn) btn.textContent = notesOn ? '\ud83d\udcdd Notes: On' : '\ud83d\udcdd Notes: Off';
}

let hintsOn = localStorage.getItem('hintsOn') !== '0';

function applyHints() {
    const el = document.querySelector('.search-hint');
    if (el) el.style.display = hintsOn ? 'flex' : 'none';
    const btn = document.getElementById('hintsToggleBtn');
    if (btn) btn.textContent = hintsOn ? 'Hints: On' : 'Hints: Off';
}

function playSound(id) {
    if (muted) return;
    const snd = document.getElementById(id);
    if (snd) {
        snd.currentTime = 0;
        snd.volume = 0.45;
        snd.play().catch(() => {});
    }
}

function updateMuteBtn() {
    const btn = document.getElementById('muteBtn');
    if (btn) btn.textContent = muted ? '\uD83D\uDD07 Sound: Off' : '\uD83D\uDD0A Sound: On';
}

function fallbackIcon(name) {
    const letter = ((name || '?').trim().charAt(0) || '?').toUpperCase();
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>` +
        `<rect width='64' height='64' rx='14' fill='#333344'/>` +
        `<text x='50%' y='54%' font-family='Tahoma, sans-serif' font-size='34' font-weight='bold' fill='#ffffff' text-anchor='middle' dominant-baseline='middle'>${letter}</text>` +
        `</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function getIconSrc(item) {
    if (item.iconData) return item.iconData;
    try {
        const host = new URL(item.url).hostname;
        return 'https://www.google.com/s2/favicons?sz=64&domain=' + host;
    } catch (e) {
        return fallbackIcon(item.name);
    }
}

function compressImage(src, cb) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        try {
            const size = 64;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);
            cb(canvas.toDataURL('image/png'));
        } catch (e) {
            cb(src);
        }
    };
    img.onerror = () => cb(src);
    img.src = src;
}

function renderShortcuts() {
    const container = document.getElementById('shortcuts');
    container.innerHTML = '';

    shortcuts.forEach((item, index) => {
        const a = document.createElement('a');
        a.href = item.url;
        a.className = 'shortcut';
        a.draggable = true;

        a.addEventListener('click', (e) => {
            if (a.dataset.dragged === '1') {
                e.preventDefault();
                a.dataset.dragged = '';
                return;
            }
            playSound('clickSound');
        });
        a.addEventListener('mouseenter', () => playSound('hoverSound'));

        a.addEventListener('dragstart', (e) => {
            dragIndex = index;
            a.classList.add('dragging');
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });
        a.addEventListener('dragend', () => {
            dragIndex = null;
            a.classList.remove('dragging');
            a.dataset.dragged = '1';
        });
        a.addEventListener('dragover', (e) => {
            e.preventDefault();
            a.classList.add('drag-over');
        });
        a.addEventListener('dragleave', () => a.classList.remove('drag-over'));
        a.addEventListener('drop', (e) => {
            e.preventDefault();
            a.classList.remove('drag-over');
            if (dragIndex === null || dragIndex === index) return;
            const [moved] = shortcuts.splice(dragIndex, 1);
            shortcuts.splice(index, 0, moved);
            saveShortcuts();
            renderShortcuts();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'del-btn';
        delBtn.title = 'Delete';
        delBtn.setAttribute('aria-label', 'Delete ' + item.name);
        delBtn.textContent = '\u00D7';
        delBtn.addEventListener('click', (e) => deleteShortcut(e, index));

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.title = 'Edit';
        editBtn.setAttribute('aria-label', 'Edit ' + item.name);
        editBtn.textContent = '\u270E';
        editBtn.addEventListener('click', (e) => openEditModal(e, index));

        const img = document.createElement('img');
        img.src = getIconSrc(item);
        img.alt = item.name;
        img.draggable = false;
        img.addEventListener('error', function handleErr() {
            img.removeEventListener('error', handleErr);
            img.src = fallbackIcon(item.name);
        });

        const p = document.createElement('p');
        p.textContent = item.name;

        a.appendChild(delBtn);
        a.appendChild(editBtn);
        a.appendChild(img);
        a.appendChild(p);
        container.appendChild(a);
    });

    if (shortcuts.length < MAX_SHORTCUTS) {
        const addBtn = document.createElement('div');
        addBtn.className = 'shortcut add-btn';
        addBtn.id = 'addShortcutBtn';
        addBtn.innerHTML = '<div class="add-icon">+</div><p>Add</p>';
        addBtn.addEventListener('click', openAddModal);
        container.appendChild(addBtn);
    }
}

function openAddModal() {
    pendingIconData = null;
    document.getElementById('shortcutName').value = '';
    document.getElementById('shortcutUrl').value = '';
    document.getElementById('addIconUrl').value = '';
    document.getElementById('addIconFile').value = '';
    resetIconPreview('add');
    document.getElementById('addModal').style.display = 'flex';
    document.getElementById('shortcutName').focus();
}

function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
    pendingIconData = null;
}

function saveShortcut() {
    let name = document.getElementById('shortcutName').value.trim();
    let url = document.getElementById('shortcutUrl').value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const item = { name, url };
    if (pendingIconData) item.iconData = pendingIconData;
    shortcuts.push(item);
    saveShortcuts();
    renderShortcuts();
    closeAddModal();
}

function openEditModal(e, index) {
    e.preventDefault();
    e.stopPropagation();
    editingIndex = index;
    pendingIconData = null;
    const item = shortcuts[index];
    document.getElementById('editName').value = item.name;
    document.getElementById('editUrl').value = item.url;
    document.getElementById('editIconUrl').value = '';
    document.getElementById('editIconFile').value = '';
    const preview = document.getElementById('editIconPreview');
    preview.src = getIconSrc(item);
    preview.style.display = 'block';
    document.getElementById('editModal').style.display = 'flex';
    document.getElementById('editName').focus();
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    editingIndex = -1;
    pendingIconData = null;
}

function saveEdit() {
    if (editingIndex < 0) return;
    let name = document.getElementById('editName').value.trim();
    let url = document.getElementById('editUrl').value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    shortcuts[editingIndex].name = name;
    shortcuts[editingIndex].url = url;
    if (pendingIconData) shortcuts[editingIndex].iconData = pendingIconData;
    saveShortcuts();
    renderShortcuts();
    closeEditModal();
}

function deleteShortcut(e, index) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete "' + shortcuts[index].name + '"?')) return;
    shortcuts.splice(index, 1);
    saveShortcuts();
    renderShortcuts();
}

function showIconPreview(mode, src) {
    const preview = document.getElementById(mode + 'IconPreview');
    preview.src = src;
    preview.style.display = 'block';
}

function resetIconPreview(mode) {
    const preview = document.getElementById(mode + 'IconPreview');
    preview.src = '';
    preview.style.display = 'none';
}

function setPendingIcon(mode, src) {
    compressImage(src, (out) => {
        pendingIconData = out;
        showIconPreview(mode, out);
    });
}

function exportShortcuts() {
    const blob = new Blob([JSON.stringify(shortcuts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shortcuts.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function importShortcuts(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error('bad');
            shortcuts = data
                .filter((it) => it && it.name && it.url)
                .map((it) => ({
                    name: String(it.name).slice(0, 12),
                    url: String(it.url),
                    ...(it.iconData ? { iconData: String(it.iconData) } : {})
                }));
            saveShortcuts();
            renderShortcuts();
        } catch (err) {
            alert('Invalid shortcuts file.');
        }
    };
    reader.readAsText(file);
}

function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.style.display = (panel.style.display === 'flex') ? 'none' : 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
    updateMuteBtn();
    applyEngine();
    applyNotes();
    applyHints();

    const savedBg = localStorage.getItem('customBG');
    if (savedBg) applyBackground(savedBg);
    if (savedBg && !/^data:/i.test(savedBg)) document.getElementById('bgInput').value = savedBg;

    const notesArea = document.getElementById('notesArea');
    if (notesArea) {
        notesArea.value = localStorage.getItem('notes') || '';
        notesArea.addEventListener('input', () => {
            clearTimeout(notesTimer);
            notesTimer = setTimeout(() => {
                try { localStorage.setItem('notes', notesArea.value); } catch (e) {}
            }, 300);
        });
    }

    const weatherCity = document.getElementById('weatherCity');
    if (weatherCity) weatherCity.value = localStorage.getItem('weatherCity') || '';
    loadWeather();
    setInterval(loadWeather, 15 * 60 * 1000);

    document.getElementById('settingsBtn').addEventListener('click', toggleSettings);

    document.getElementById('saveShortcutBtn').addEventListener('click', saveShortcut);
    document.getElementById('closeAddModalBtn').addEventListener('click', closeAddModal);
    document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
    document.getElementById('closeEditModalBtn').addEventListener('click', closeEditModal);

    document.getElementById('applyAddIconBtn').addEventListener('click', () => {
        const val = document.getElementById('addIconUrl').value.trim();
        if (!val) return;
        setPendingIcon('add', val);
    });

    document.getElementById('applyEditIconBtn').addEventListener('click', () => {
        const val = document.getElementById('editIconUrl').value.trim();
        if (!val) return;
        setPendingIcon('edit', val);
    });

    document.getElementById('addIconFile').addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => setPendingIcon('add', e.target.result);
        reader.readAsDataURL(file);
    });

    document.getElementById('editIconFile').addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => setPendingIcon('edit', e.target.result);
        reader.readAsDataURL(file);
    });

    document.getElementById('shortcutName').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('shortcutUrl').focus(); });
    document.getElementById('shortcutUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveShortcut(); });
    document.getElementById('editName').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('editUrl').focus(); });
    document.getElementById('editUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveEdit(); });

    document.getElementById('addModal').addEventListener('click', function (e) { if (e.target === this) closeAddModal(); });
    document.getElementById('editModal').addEventListener('click', function (e) { if (e.target === this) closeEditModal(); });

    document.querySelectorAll('#engineRow .seg-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            engine = btn.dataset.engine;
            localStorage.setItem('searchEngine', engine);
            applyEngine();
        });
    });

    document.getElementById('bgInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter' && this.value.trim()) {
            const v = this.value.trim();
            applyBackground(v);
            try { localStorage.setItem('customBG', v); } catch (err) {}
        }
    });
    document.getElementById('bgFile').addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => compressBackground(e.target.result, setBackgroundData);
        reader.readAsDataURL(file);
        this.value = '';
    });
    document.getElementById('clearBgBtn').addEventListener('click', () => {
        localStorage.removeItem('customBG');
        applyBackground('');
        document.getElementById('bgInput').value = '';
    });

    function saveCity() {
        const c = document.getElementById('weatherCity').value.trim();
        if (c) localStorage.setItem('weatherCity', c);
        else localStorage.removeItem('weatherCity');
        loadWeather();
    }
    document.getElementById('weatherSaveBtn').addEventListener('click', saveCity);
    document.getElementById('weatherCity').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCity(); });

    document.getElementById('notesToggleBtn').addEventListener('click', () => {
        notesOn = !notesOn;
        localStorage.setItem('notesOn', notesOn ? '1' : '0');
        applyNotes();
        if (notesOn && notesArea) notesArea.focus();
    });

    document.getElementById('hintsToggleBtn').addEventListener('click', () => {
        hintsOn = !hintsOn;
        localStorage.setItem('hintsOn', hintsOn ? '1' : '0');
        applyHints();
    });

    document.getElementById('muteBtn').addEventListener('click', () => {
        muted = !muted;
        localStorage.setItem('muted', muted ? '1' : '0');
        updateMuteBtn();
        if (!muted) playSound('clickSound');
    });

    document.getElementById('exportBtn').addEventListener('click', exportShortcuts);
    document.getElementById('importFile').addEventListener('change', function () {
        if (this.files[0]) importShortcuts(this.files[0]);
        this.value = '';
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (document.getElementById('addModal').style.display === 'flex') closeAddModal();
        else if (document.getElementById('editModal').style.display === 'flex') closeEditModal();
        else document.getElementById('settingsPanel').style.display = 'none';
    });

    renderShortcuts();
    initSync();
});
