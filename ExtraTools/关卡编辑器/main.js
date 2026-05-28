/**
 * 关卡编辑器主逻辑
 */
(() => {
    const S = LevelEditorSchema;
    const canvas = document.getElementById('level-canvas');
    const ctx = canvas.getContext('2d');
    const viewport = document.getElementById('viewport-scroll');

    let level = S.createEmptyLevel(1);
    let levelsCache = [];
    let selection = null;
    let tool = 'select';
    let zoom = 1;
    let panning = false;
    let panStart = null;
    let dragState = null;
    let resizeState = null;
    let paletteKind = null;
    let bgImage = null;
    let animTime = 0;
    let lastCursorX = 0;
    let lastCursorY = 0;
    let undoStack = [];
    let redoStack = [];
    let clipboard = null;
    let pasteGeneration = 0;
    let stackClickState = null;
    const MAX_UNDO = 40;

    const MANIFEST_URL = '../../assets/levels/manifest.json';
    const IDB_NAME = 'level-editor';
    const IDB_STORE = 'file-handles';

    let currentFileHandle = null;
    let currentFileLabel = '';
    let levelSourcePaths = {};

    function resolveProjectUrl(url) {
        if (!url || url.startsWith('http') || url.startsWith('/')) return url;
        return '../../' + url.replace(/^\.\.\//, '');
    }

    function defaultFileName(levelId) {
        return `level_${levelId}.json`;
    }

    function getLevelH() {
        return S.levelHeight(level);
    }

    function setSaveStatus(text, isError = false) {
        const el = document.getElementById('save-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('error', isError);
    }

    function openIdb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function storeFileHandle(levelId, handle) {
        if (!handle || !window.indexedDB) return;
        const db = await openIdb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(handle, String(levelId));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }

    async function restoreFileHandle(levelId) {
        if (!window.indexedDB) return null;
        const db = await openIdb();
        const handle = await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(String(levelId));
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return handle || null;
    }

    async function verifyWritePermission(handle) {
        if (!handle) return false;
        const opts = { mode: 'readwrite' };
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        if ((await handle.requestPermission(opts)) === 'granted') return true;
        return false;
    }

    async function writeToHandle(handle, text) {
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
    }

    function downloadJson(json, filename) {
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function bindFileHandleForLevel(levelId) {
        currentFileHandle = await restoreFileHandle(levelId);
        if (currentFileHandle) {
            currentFileLabel = currentFileHandle.name;
            setSaveStatus(`已关联 · ${currentFileLabel}`);
        } else {
            currentFileLabel = levelSourcePaths[levelId] || defaultFileName(levelId);
            setSaveStatus('');
        }
    }

    function cloneLevel() {
        return S.normalizeLevel(JSON.parse(JSON.stringify(level)));
    }

    function pushUndo() {
        undoStack.push(JSON.stringify(level));
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack = [];
    }

    function undo() {
        if (!undoStack.length) return;
        redoStack.push(JSON.stringify(level));
        level = S.normalizeLevel(JSON.parse(undoStack.pop()));
        selection = null;
        refreshAll();
    }

    function redo() {
        if (!redoStack.length) return;
        undoStack.push(JSON.stringify(level));
        level = S.normalizeLevel(JSON.parse(redoStack.pop()));
        selection = null;
        refreshAll();
    }

    function screenToWorld(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        // getBoundingClientRect 已包含 scroll 偏移，不可再加 scrollLeft/Top
        const x = (clientX - rect.left) / zoom;
        const y = (clientY - rect.top) / zoom;
        return { x, y };
    }

    function getSelectionData() {
        if (!selection) return null;
        const { category, index } = selection;
        if (category === 'playerStart') return level.playerStart;
        if (category === 'boss') return level.boss;
        if (category === 'bossTriggerZone') return level.bossTriggerZone;
        if (category === 'finish') return level.finish;
        const arr = level[category];
        if (!arr || index < 0 || index >= arr.length) return null;
        return arr[index];
    }

    function setSelectionData(data) {
        if (!selection) return;
        const { category, index } = selection;
        if (category === 'playerStart') {
            level.playerStart = { ...level.playerStart, ...data };
            return;
        }
        if (category === 'boss') {
            level.boss = { ...level.boss, ...data };
            return;
        }
        if (category === 'bossTriggerZone') {
            level.bossTriggerZone = { ...level.bossTriggerZone, ...data };
            return;
        }
        if (category === 'finish') {
            level.finish = { ...level.finish, ...data };
            return;
        }
        level[category][index] = data;
    }

    function hitTestAll(worldX, worldY) {
        const hits = [];
        const items = S.listAllItems(level).reverse();
        for (const item of items) {
            if (item.category === 'spawns') {
                if (S.hitTestSpawn(worldX, worldY, item.data, level)) {
                    hits.push({ category: item.category, index: item.index });
                }
                continue;
            }
            const b = S.getItemBounds(item.category, item.data, level);
            if (worldX >= b.x && worldX <= b.x + b.w && worldY >= b.y && worldY <= b.y + b.h) {
                hits.push({ category: item.category, index: item.index });
            }
        }
        return hits;
    }

    function pickSelectionFromHits(hits, preferCurrent) {
        if (!hits.length) return null;
        if (hits.length === 1) return hits[0];
        if (preferCurrent && selection) {
            const current = hits.find(h => h.category === selection.category && h.index === selection.index);
            if (current) return current;
        }
        return hits[0];
    }

    function hitTest(worldX, worldY) {
        const hits = hitTestAll(worldX, worldY);
        return hits[0] ?? null;
    }

    function cloneSelectionData(data, category) {
        if (category === 'platforms') return [...data];
        return JSON.parse(JSON.stringify(data));
    }

    function applyOffsetToData(data, category, dx, dy) {
        const d = cloneSelectionData(data, category);
        if (category === 'platforms') {
            d[0] += dx;
            d[1] += dy;
            return d;
        }
        if (category === 'playerStart') {
            d.x = (d.x ?? 0) + dx;
            d.yOffset = (d.yOffset ?? 120) - dy;
            return d;
        }
        if (category === 'boss') {
            d.xOffset = (d.xOffset ?? 240) - dx;
            d.yOffset = (d.yOffset ?? 80) - dy;
            return d;
        }
        if (typeof d === 'object' && d !== null) {
            if (typeof d.x === 'number') d.x += dx;
            if (typeof d.y === 'number') d.y += dy;
        }
        return d;
    }

    function getDataAnchor(category, data) {
        if (!data) return { x: 0, y: 0 };
        if (category === 'platforms') return { x: data[0], y: data[1] };
        if (category === 'playerStart') return { x: data.x, y: S.playerY(level) };
        if (category === 'boss') {
            return {
                x: level.width - (data.xOffset ?? 240),
                y: getLevelH() - (data.yOffset ?? 80)
            };
        }
        if (category === 'finish') return { x: data.x, y: data.y };
        if (category === 'bossTriggerZone') return { x: data.x, y: data.y };
        if (category === 'spawns' || category === 'pickups') {
            return { x: data.x, y: S.getSpawnFeetY(level, data) };
        }
        if (typeof data === 'object') {
            return {
                x: typeof data.x === 'number' ? data.x : 0,
                y: typeof data.y === 'number' ? data.y : 0
            };
        }
        return { x: 0, y: 0 };
    }

    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function pastedBoundsOverlapLevel(category, pastedData) {
        const pastedBounds = S.getItemBounds(category, pastedData, level);
        const items = S.listAllItems(level);
        for (const item of items) {
            if (item.category === category && category === 'playerStart') continue;
            if (item.category === category && category === 'boss') continue;
            if (item.category === category && category === 'bossTriggerZone') continue;
            if (item.category === category && category === 'finish') continue;
            const bounds = S.getItemBounds(item.category, item.data, level);
            if (rectsOverlap(pastedBounds, bounds)) return true;
        }
        return false;
    }

    function resolvePasteOffset(category, data, baseDx, baseDy) {
        const step = S.getGridSize();
        let dx = baseDx;
        let dy = baseDy;
        for (let i = 0; i < 256; i++) {
            const copy = applyOffsetToData(data, category, dx, dy);
            if (!pastedBoundsOverlapLevel(category, copy)) {
                return { dx, dy, copy };
            }
            dx += step;
        }
        return { dx: baseDx, dy: baseDy, copy: applyOffsetToData(data, category, baseDx, baseDy) };
    }

    function insertPastedCopy(category, copy) {
        if (category === 'playerStart') {
            level.playerStart = copy;
            selection = { category, index: 0 };
        } else if (category === 'boss') {
            level.boss = copy;
            selection = { category, index: 0 };
        } else if (category === 'bossTriggerZone') {
            level.bossTriggerZone = copy;
            selection = { category, index: 0 };
        } else if (category === 'finish') {
            level.finish = copy;
            selection = { category, index: 0 };
        } else {
            level[category].push(copy);
            selection = { category, index: level[category].length - 1 };
        }
        refreshAll();
        return true;
    }

    function pasteAtWorld(worldX, worldY) {
        if (!clipboard) return false;
        pushUndo();
        const { category, data } = clipboard;
        const anchor = clipboard.anchor || getDataAnchor(category, data);
        const baseDx = S.snap(worldX) - anchor.x;
        const baseDy = S.snap(worldY) - anchor.y;
        const { copy } = resolvePasteOffset(category, data, baseDx, baseDy);
        return insertPastedCopy(category, copy);
    }

    function copySelection() {
        if (!selection) return false;
        const data = getSelectionData();
        if (!data) return false;
        clipboard = {
            category: selection.category,
            data: cloneSelectionData(data, selection.category),
            anchor: getDataAnchor(selection.category, data)
        };
        pasteGeneration = 0;
        return true;
    }

    function duplicateSelection(offsetX, offsetY) {
        if (!clipboard) return false;
        if (offsetX === undefined && offsetY === undefined) {
            return pasteAtWorld(lastCursorX, lastCursorY);
        }
        pushUndo();
        pasteGeneration += 1;
        const dx = offsetX ?? S.getGridSize() * pasteGeneration;
        const dy = offsetY ?? 0;
        const { category, data } = clipboard;
        const copy = applyOffsetToData(data, category, dx, dy);
        return insertPastedCopy(category, copy);
    }

    function getResizeHandle(worldX, worldY) {
        if (!selection) return null;
        const data = getSelectionData();
        if (!data) return null;
        const b = S.getItemBounds(selection.category, data, level);
        const hs = 8 / zoom;
        const handles = [
            { id: 'e', x: b.x + b.w, y: b.y + b.h / 2 },
            { id: 'se', x: b.x + b.w, y: b.y + b.h },
            { id: 's', x: b.x + b.w / 2, y: b.y + b.h }
        ];
        if (selection.category === 'platforms') {
            handles.length = 3;
        } else if (selection.category === 'pickups') {
            handles.length = 0;
        }
        for (const h of handles) {
            if (Math.abs(worldX - h.x) <= hs && Math.abs(worldY - h.y) <= hs) return h.id;
        }
        return null;
    }

    function resizeCanvas() {
        const h = getLevelH();
        const w = Math.max(level.width, 1280);
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${w * zoom}px`;
        canvas.style.height = `${h * zoom}px`;
    }

    function drawGrid() {
        const gs = S.getGridSize();
        const h = getLevelH();
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= level.width; x += gs) {
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, h);
            ctx.stroke();
        }
        for (let y = 0; y <= h; y += gs) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(level.width, y + 0.5);
            ctx.stroke();
        }
    }

    function drawGround() {
        const tile = S.GROUND_TILE;
        const groundY = S.groundY(level);
        for (let i = 0; i < Math.ceil(level.width / tile); i++) {
            const gx = i * tile;
            ctx.fillStyle = '#3d4a5c';
            ctx.fillRect(gx, groundY, tile, tile);
            ctx.fillStyle = '#5a7088';
            ctx.fillRect(gx, groundY, tile, 4);
            ctx.strokeStyle = '#2a3340';
            ctx.strokeRect(gx + 0.5, groundY + 0.5, tile - 1, tile - 1);
        }
    }

    function drawBackground() {
        const h = getLevelH();
        if (bgImage && bgImage.complete) {
            ctx.globalAlpha = 0.45;
            const imgW = bgImage.naturalWidth || bgImage.width;
            const imgH = bgImage.naturalHeight || bgImage.height;
            // 与 GameScene._createParallaxBackground 一致：按高度等比缩放，水平平铺
            const tileScale = imgH > 0 ? h / imgH : 1;
            const tileW = imgW * tileScale;
            for (let x = 0; x < level.width; x += tileW) {
                ctx.drawImage(bgImage, x, 0, tileW, h);
            }
            ctx.globalAlpha = 1;
        } else {
            const grd = ctx.createLinearGradient(0, 0, 0, h);
            grd.addColorStop(0, '#1a1520');
            grd.addColorStop(1, '#0d0a12');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, level.width, h);
        }
    }

    function drawBossTrigger() {
        if (!S.isBossLevel(level)) return;
        const h = getLevelH();
        if (S.hasBossTriggerZone(level)) {
            const z = level.bossTriggerZone;
            const sel = selection?.category === 'bossTriggerZone';
            ctx.fillStyle = sel ? 'rgba(255,100,100,0.35)' : 'rgba(255,100,100,0.18)';
            ctx.strokeStyle = sel ? '#ff8888' : '#ff6644';
            ctx.lineWidth = sel ? 3 : 2;
            ctx.setLineDash([6, 4]);
            ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
            ctx.strokeRect(z.x - z.w / 2 + 0.5, z.y - z.h / 2 + 0.5, z.w - 1, z.h - 1);
            ctx.setLineDash([]);
            ctx.fillStyle = sel ? '#ffaaaa' : '#ff8866';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Boss 触发框', z.x, z.y + 4);
            ctx.textAlign = 'left';
            return;
        }
        const tx = S.bossTriggerX(level);
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, 0);
        ctx.lineTo(tx, h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,100,100,0.7)';
        ctx.font = '12px sans-serif';
        ctx.fillText('Boss 触发线', tx + 6, 18);
    }

    function drawPlatforms() {
        level.platforms.forEach(([x, y, count, ph], i) => {
            const sel = selection?.category === 'platforms' && selection.index === i;
            const h = ph ?? S.PLATFORM_H;
            for (let n = 0; n < count; n++) {
                const px = x + n * S.PLATFORM_W;
                ctx.fillStyle = sel ? '#9b7ec8' : (h > S.PLATFORM_H ? '#6a4a92' : '#7b5ea7');
                ctx.fillRect(px - S.PLATFORM_W / 2, y - h / 2, S.PLATFORM_W, h);
                ctx.strokeStyle = sel ? '#c8b0e8' : '#5a4080';
                ctx.strokeRect(px - S.PLATFORM_W / 2 + 0.5, y - h / 2 + 0.5, S.PLATFORM_W - 1, h - 1);
            }
        });
    }

    function drawWalls() {
        level.walls.forEach((w, i) => {
            const sel = selection?.category === 'walls' && selection.index === i;
            ctx.fillStyle = sel ? '#728498' : '#566578';
            ctx.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
            ctx.strokeStyle = sel ? '#9ab0c4' : '#3e4a5a';
            ctx.lineWidth = sel ? 2 : 1;
            ctx.strokeRect(w.x - w.w / 2 + 0.5, w.y - w.h / 2 + 0.5, w.w - 1, w.h - 1);
            ctx.lineWidth = 1;
        });
    }

    function drawDestructibleWalls() {
        level.destructibleWalls.forEach((w, i) => {
            const sel = selection?.category === 'destructibleWalls' && selection.index === i;
            ctx.fillStyle = sel ? '#a89880' : '#8a7a62';
            ctx.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
            ctx.strokeStyle = sel ? '#c4b498' : '#5c5042';
            ctx.lineWidth = sel ? 2 : 1;
            ctx.strokeRect(w.x - w.w / 2 + 0.5, w.y - w.h / 2 + 0.5, w.w - 1, w.h - 1);
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#5c5042';
            ctx.globalAlpha = 0.55;
            const lx = w.x - w.w / 2;
            const ty = w.y - w.h / 2;
            ctx.beginPath();
            ctx.moveTo(lx + w.w * 0.35, ty + 8);
            ctx.lineTo(lx + w.w * 0.42, ty + w.h * 0.35);
            ctx.lineTo(lx + w.w * 0.28, ty + w.h * 0.62);
            ctx.moveTo(lx + w.w * 0.65, ty + 12);
            ctx.lineTo(lx + w.w * 0.58, ty + w.h * 0.45);
            ctx.lineTo(lx + w.w * 0.72, ty + w.h * 0.78);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffddaa';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`HP${w.hp ?? 3}`, w.x, w.y + 4);
            ctx.textAlign = 'left';
        });
    }

    function drawSystemWalls() {
        level.systemWalls.forEach((w, i) => {
            const sel = selection?.category === 'systemWalls' && selection.index === i;
            ctx.fillStyle = sel ? '#88aacc' : '#6688aa';
            ctx.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
            ctx.strokeStyle = sel ? '#aaccee' : '#446688';
            ctx.lineWidth = sel ? 2 : 1;
            ctx.strokeRect(w.x - w.w / 2 + 0.5, w.y - w.h / 2 + 0.5, w.w - 1, w.h - 1);
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = sel ? 'rgba(170,204,238,0.85)' : 'rgba(100,140,180,0.65)';
            ctx.strokeRect(w.x - w.w / 2 + 6, w.y - w.h / 2 + 6, w.w - 12, w.h - 12);
            ctx.setLineDash([]);
            ctx.fillStyle = '#eef6ff';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            const bind = w.bindEnemyId != null && w.bindEnemyId !== '' ? w.bindEnemyId : '?';
            ctx.fillText(`⛨${bind}`, w.x, w.y + 4);
            ctx.textAlign = 'left';
        });
    }

    function drawPickups() {
        level.pickups.forEach((p, i) => {
            const sel = selection?.category === 'pickups' && selection.index === i;
            const y = p.y ?? (S.groundY(level) - 4);
            const half = S.PICKUP_SIZE / 2;
            const isEnergy = p.type === 'energy';
            ctx.fillStyle = sel ? (isEnergy ? '#88ccff' : '#66ffaa') : (isEnergy ? '#44aaff' : '#44dd88');
            ctx.beginPath();
            ctx.arc(p.x, y, half - 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = sel ? (isEnergy ? '#cceeff' : '#aaffcc') : (isEnergy ? '#2266aa' : '#228855');
            ctx.lineWidth = sel ? 2 : 1;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = isEnergy ? '13px sans-serif' : 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(isEnergy ? '⚡' : '+', p.x, y + 4);
            ctx.textAlign = 'left';
        });
    }

    function drawHazards() {
        level.hazards.forEach((h, i) => {
            const sel = selection?.category === 'hazards' && selection.index === i;
            if (h.type === 'electric') {
                const active = S.electricIsActive(animTime, h.period, h.activeDuration);
                ctx.fillStyle = active ? 'rgba(0,229,255,0.35)' : 'rgba(0,229,255,0.08)';
                ctx.strokeStyle = active ? '#66ffff' : 'rgba(0,229,255,0.4)';
                ctx.lineWidth = sel ? 3 : 2;
                ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
            } else if (h.type === 'checkpoint') {
                const b = S.checkpointBounds(h.x, h.y, h.w ?? 80, h.h ?? 60);
                ctx.fillStyle = '#66ffaa';
                ctx.font = 'bold 22px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('⛳', h.x, h.y);
                ctx.textBaseline = 'alphabetic';
                ctx.textAlign = 'left';
                if (sel) {
                    ctx.strokeStyle = 'rgba(102,255,170,0.55)';
                    ctx.setLineDash([4, 4]);
                    ctx.strokeRect(b.x, b.y, b.w, b.h);
                    ctx.setLineDash([]);
                }
            } else if (h.type === 'death') {
                ctx.fillStyle = sel ? 'rgba(255,34,68,0.45)' : 'rgba(255,34,68,0.28)';
                ctx.strokeStyle = sel ? '#ff6688' : '#ff2244';
                ctx.lineWidth = sel ? 3 : 2;
                ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.strokeStyle = 'rgba(255,100,120,0.6)';
                ctx.beginPath();
                for (let sx = h.x - h.w / 2; sx < h.x + h.w / 2; sx += 12) {
                    ctx.moveTo(sx, h.y - h.h / 2);
                    ctx.lineTo(sx + 6, h.y + h.h / 2);
                }
                ctx.stroke();
            } else if (h.type === 'hint') {
                ctx.fillStyle = sel ? 'rgba(255,221,68,0.22)' : 'rgba(255,221,68,0.12)';
                ctx.strokeStyle = sel ? '#ffee88' : '#ffdd44';
                ctx.lineWidth = sel ? 3 : 2;
                ctx.setLineDash([5, 5]);
                ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.setLineDash([]);
                ctx.fillStyle = '#ffdd44';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                const preview = (h.text || '提示').slice(0, 16);
                ctx.fillText(preview, h.x, h.y - 4);
                if (h.bindEnemyId != null && h.bindEnemyId !== '') {
                    ctx.font = '10px sans-serif';
                    ctx.fillStyle = '#ffe066';
                    ctx.fillText(`→ ${h.bindEnemyId}`, h.x, h.y + 12);
                }
                ctx.textAlign = 'left';
            } else if (h.type === 'wind') {
                ctx.fillStyle = 'rgba(170,204,255,0.08)';
                ctx.strokeStyle = '#8899bb';
                ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.fillStyle = '#aaccff';
                ctx.font = '11px sans-serif';
                ctx.fillText(h.dir > 0 ? '→' : '←', h.x - 4, h.y + 4);
            } else if (h.type === 'energy_drain') {
                ctx.fillStyle = sel ? 'rgba(204,102,238,0.28)' : 'rgba(170,68,204,0.16)';
                ctx.strokeStyle = sel ? '#ee88ff' : '#cc66ee';
                ctx.lineWidth = sel ? 3 : 2;
                ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.lineWidth = 1;
                ctx.fillStyle = '#eeccff';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`-${h.drainRate ?? 15}/s`, h.x, h.y + 4);
                ctx.textAlign = 'left';
            } else if (h.type === 'missile') {
                const b = S.getItemBounds('hazards', h, level);
                ctx.fillStyle = 'rgba(255,100,60,0.15)';
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.strokeStyle = '#ff6644';
                ctx.strokeRect(b.x, b.y, b.w, b.h);
                ctx.fillStyle = '#ff6644';
                ctx.font = '14px sans-serif';
                ctx.fillText('⚠', h.x - 7, h.y + 5);
            } else if (h.type === 'crumble') {
                const b = S.getItemBounds('hazards', h, level);
                ctx.fillStyle = sel ? '#ffaa44' : '#ff8800';
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.strokeStyle = '#cc6600';
                ctx.strokeRect(b.x, b.y, b.w, b.h);
            }
            if (sel) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                const b = S.getItemBounds('hazards', h, level);
                ctx.strokeRect(b.x, b.y, b.w, b.h);
                ctx.lineWidth = 1;
            }
        });
    }

    function spawnColor(type, selected) {
        if (type === 'flying') return selected ? '#88ccff' : '#66bbff';
        if (type === 'ranged') return selected ? '#ffaa88' : '#ff8866';
        return selected ? '#ff7788' : '#ff5566';
    }

    function spawnLabel(type) {
        if (type === 'flying') return '飞';
        if (type === 'ranged') return '远';
        return '近';
    }

    function drawSpawns() {
        const r = S.SPAWN_RADIUS;
        level.spawns.forEach((s, i) => {
            const sel = selection?.category === 'spawns' && selection.index === i;
            const y = S.getSpawnFeetY(level, s);
            ctx.fillStyle = spawnColor(s.type, sel);
            ctx.beginPath();
            // 圆底边 = y（与游戏内脚底坐标一致）
            ctx.arc(s.x, y - r, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(spawnLabel(s.type), s.x, y - r + 4);
            if (s.id != null && s.id !== '') {
                ctx.font = '9px sans-serif';
                ctx.fillStyle = '#ffe066';
                ctx.fillText(String(s.id), s.x, y - r - 6);
            }
            ctx.textAlign = 'left';
        });
    }

    function drawMarkers() {
        const px = level.playerStart.x;
        const py = S.playerY(level);
        const pSel = selection?.category === 'playerStart';
        ctx.fillStyle = pSel ? '#66ffaa' : '#44ff88';
        ctx.beginPath();
        ctx.moveTo(px, py - 20);
        ctx.lineTo(px - 12, py + 8);
        ctx.lineTo(px + 12, py + 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '11px sans-serif';
        ctx.fillText('出生', px + 14, py);

        if (S.isBossLevel(level)) {
            const bx = level.width - (level.boss.xOffset || 240);
            const by = getLevelH() - (level.boss.yOffset || 80);
            const bSel = selection?.category === 'boss';
            ctx.fillStyle = bSel ? '#dd66ff' : '#cc44ff';
            ctx.fillRect(bx - 20, by - 20, 40, 40);
            ctx.fillStyle = '#fff';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Boss', bx, by + 4);
            ctx.textAlign = 'left';
        }

        if (S.isFinishLevel(level)) {
            const f = level.finish;
            const fSel = selection?.category === 'finish';
            ctx.fillStyle = fSel ? 'rgba(255,204,68,0.35)' : 'rgba(255,204,68,0.18)';
            ctx.strokeStyle = fSel ? '#ffee88' : '#ffcc44';
            ctx.lineWidth = fSel ? 3 : 2;
            ctx.setLineDash([6, 4]);
            ctx.fillRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
            ctx.strokeRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
            ctx.setLineDash([]);
            ctx.fillStyle = '#ffdd44';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🏁', f.x, f.y + 8);
            ctx.font = '11px sans-serif';
            ctx.fillText('终点', f.x, f.y + f.h / 2 + 14);
            ctx.textAlign = 'left';
        }
    }

    function drawSelectionHandles() {
        if (!selection) return;
        const data = getSelectionData();
        if (!data) return;
        const b = S.getItemBounds(selection.category, data, level);
        ctx.strokeStyle = '#5a9fd4';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);

        const handles = [{ x: b.x + b.w, y: b.y + b.h / 2 }];
        if (selection.category === 'platforms') {
            handles.push({ x: b.x + b.w, y: b.y + b.h }, { x: b.x + b.w / 2, y: b.y + b.h });
        } else if (selection.category !== 'pickups') {
            handles.push({ x: b.x + b.w, y: b.y + b.h }, { x: b.x + b.w / 2, y: b.y + b.h });
        }
        ctx.fillStyle = '#5a9fd4';
        handles.forEach(h => {
            ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
        });
    }

    function render() {
        resizeCanvas();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        drawGrid();
        drawBossTrigger();
        drawGround();
        drawPlatforms();
        drawWalls();
        drawDestructibleWalls();
        drawSystemWalls();
        drawPickups();
        drawHazards();
        drawSpawns();
        drawMarkers();
        drawSelectionHandles();
    }

    function clearPaletteSelection() {
        paletteKind = null;
        document.querySelectorAll('.palette-item').forEach(n => n.classList.remove('selected-palette'));
    }

    function selectPaletteItem(el, kind) {
        document.querySelectorAll('.palette-item').forEach(n => n.classList.remove('selected-palette'));
        el.classList.add('selected-palette');
        paletteKind = kind;
    }

    function buildPalette() {
        const root = document.getElementById('palette-root');
        root.innerHTML = '';
        S.PALETTE.forEach(group => {
            const sec = document.createElement('div');
            sec.className = 'palette-category';
            sec.innerHTML = `<h3>${group.category}</h3>`;
            group.items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'palette-item';
                el.dataset.kind = item.kind;
                el.draggable = true;
                el.innerHTML = `<span class="palette-icon" style="background:${item.color}22;color:${item.color}">${item.icon}</span><span class="palette-label">${item.label}</span>`;
                el.addEventListener('click', () => {
                    if (paletteKind === item.kind && el.classList.contains('selected-palette')) {
                        clearPaletteSelection();
                        return;
                    }
                    selectPaletteItem(el, item.kind);
                });
                el.addEventListener('dragstart', e => {
                    e.dataTransfer.setData('text/plain', item.kind);
                    selectPaletteItem(el, item.kind);
                });
                sec.appendChild(el);
            });
            root.appendChild(sec);
        });
    }

    function placePaletteItem(kind, wx, wy) {
        if (kind === 'player_start') {
            pushUndo();
            level.playerStart.x = S.snap(wx);
            level.playerStart.yOffset = getLevelH() - S.snap(wy);
            selection = { category: 'playerStart', index: 0 };
            refreshAll();
            return;
        }
        if (kind === 'boss') {
            pushUndo();
            level.finish = null;
            if (!level.boss) {
                level.boss = { type: 'steelTriceratops', xOffset: 240, yOffset: 80 };
            }
            level.boss.xOffset = level.width - S.snap(wx);
            level.boss.yOffset = getLevelH() - S.snap(wy);
            selection = { category: 'boss', index: 0 };
            refreshAll();
            return;
        }
        if (kind === 'boss_trigger') {
            if (!S.isBossLevel(level)) {
                alert('须先为关卡设置 Boss（Boss 关卡）');
                return;
            }
            pushUndo();
            level.bossTriggerZone = { x: S.snap(wx), y: S.snap(wy), w: 160, h: 120 };
            selection = { category: 'bossTriggerZone', index: 0 };
            refreshAll();
            return;
        }
        if (kind === 'finish') {
            pushUndo();
            level.boss = null;
            level.bossTriggerZone = null;
            level.finish = { x: S.snap(wx), y: S.snap(wy), w: 80, h: 80 };
            selection = { category: 'finish', index: 0 };
            refreshAll();
            return;
        }
        if (kind === 'checkpoint') {
            pushUndo();
            const sx = S.snap(wx);
            const sy = S.snap(wy);
            level.hazards.push({ type: 'checkpoint', x: sx, y: sy, w: 80, h: 60, feetAnchor: true, respawnHpPercent: 100, respawnEnergyPercent: 100 });
            selection = { category: 'hazards', index: level.hazards.length - 1 };
            refreshAll();
            return;
        }
        const created = S.createFromPalette(kind, wx, wy);
        if (!created) return;
        pushUndo();
        const arr = level[created.category];
        arr.push(created.data);
        selection = { category: created.category, index: arr.length - 1 };
        refreshAll();
    }

    function buildPropsForm() {
        const form = document.getElementById('props-form');
        const empty = document.getElementById('props-empty');
        if (!selection) {
            form.hidden = true;
            empty.hidden = false;
            return;
        }
        const data = getSelectionData();
        if (!data) {
            form.hidden = true;
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        form.hidden = false;
        form.innerHTML = '';

        const addField = (label, key, type = 'number', opts = {}) => {
            const row = document.createElement('div');
            row.className = 'field-row';
            const id = `prop-${key}`;
            if (type === 'select') {
                row.innerHTML = `<label for="${id}">${label}</label><select id="${id}">${opts.options.map(o => `<option value="${o.v}"${o.v === opts.value ? ' selected' : ''}>${o.t}</option>`).join('')}</select>`;
                form.appendChild(row);
                row.querySelector('select').addEventListener('change', e => {
                    pushUndo();
                    applyPropChange(key, type === 'select' ? e.target.value : parseFloat(e.target.value));
                    if (selection?.category === 'boss' && key === 'type') {
                        buildPropsForm();
                    }
                });
                return;
            }
            const val = opts.value !== undefined ? opts.value : (Array.isArray(data) ? data[opts.idx] : data[key]);
            const placeholder = opts.placeholder ? ` placeholder="${opts.placeholder}"` : '';
            const step = opts.step ? ` step="${opts.step}"` : '';
            row.innerHTML = `<label for="${id}">${label}</label><input id="${id}" type="${type}" value="${val ?? ''}"${placeholder}${step}>`;
            form.appendChild(row);
            row.querySelector('input').addEventListener('change', e => {
                pushUndo();
                let v = type === 'number' ? parseFloat(e.target.value) : e.target.value;
                if (type === 'number' && e.target.value.trim() === '') v = '';
                applyPropChange(key, v, opts.idx);
            });
        };

        const applyPropChange = (key, v, idx) => {
            if (selection.category === 'platforms') {
                const p = [...level.platforms[selection.index]];
                if (key === 'x') p[0] = S.snap(v);
                else if (key === 'y') p[1] = S.snap(v);
                else if (key === 'count') p[2] = Math.max(1, Math.round(v));
                else if (key === 'height') {
                    const h = Math.max(S.PLATFORM_H, Math.round(v));
                    if (h > S.PLATFORM_H) p[3] = h;
                    else p.length = 3;
                }
                level.platforms[selection.index] = p;
            } else if (selection.category === 'playerStart') {
                if (key === 'x') level.playerStart.x = S.snap(v);
                else if (key === 'yOffset') level.playerStart.yOffset = v;
            } else if (selection.category === 'boss') {
                if (key === 'hp' || key === 'damageMult') {
                    if (v === '' || v == null || Number.isNaN(v)) {
                        delete level.boss[key];
                    } else {
                        level.boss[key] = Math.max(0, v);
                    }
                } else {
                    level.boss[key] = v;
                }
                refreshAll(false);
                return;
            } else if (selection.category === 'finish') {
                if (key === 'x' || key === 'y') level.finish[key] = S.snap(v);
                else level.finish[key] = v;
            } else if (selection.category === 'bossTriggerZone') {
                if (key === 'x' || key === 'y') level.bossTriggerZone[key] = S.snap(v);
                else level.bossTriggerZone[key] = v;
                updateBossTriggerHint();
            } else if (selection.category === 'hazards' && level.hazards[selection.index].type === 'checkpoint') {
                const item = { ...level.hazards[selection.index], feetAnchor: true };
                if (key === 'x') item[key] = S.snap(v);
                else if (key === 'w' || key === 'h' || key === 'id' || key === 'respawnHpPercent' || key === 'respawnEnergyPercent') {
                    if (key === 'respawnHpPercent' || key === 'respawnEnergyPercent') {
                        item[key] = Number.isNaN(v) ? 100 : Math.max(0, Math.min(100, v));
                    } else {
                        item[key] = Number.isNaN(v) ? undefined : v;
                    }
                } else item[key] = v;
                level.hazards[selection.index] = item;
            } else if (selection.category === 'spawns') {
                const item = { ...level.spawns[selection.index] };
                if (key === 'x') item.x = S.snap(v);
                else if (key === 'y') item.y = S.snap(v);
                else if (key === 'type') item.type = v;
                else if (key === 'hp') {
                    if (v === '' || Number.isNaN(v)) delete item.hp;
                    else item.hp = Math.max(1, Math.round(v));
                } else if (key === 'killEnergy') {
                    if (v === '' || Number.isNaN(v)) delete item.killEnergy;
                    else item.killEnergy = Math.max(0, Math.round(v));
                } else if (key === 'id') {
                    if (v === '' || v == null) delete item.id;
                    else item.id = String(v);
                } else item[key] = v;
                level.spawns[selection.index] = item;
            } else if (selection.category === 'systemWalls') {
                const item = { ...level.systemWalls[selection.index] };
                if (key === 'x' || key === 'y' || key === 'w' || key === 'h') item[key] = S.snap(v);
                else if (key === 'bindEnemyId') {
                    item.bindEnemyId = v === '' || v == null ? '' : String(v);
                } else item[key] = v;
                level.systemWalls[selection.index] = item;
            } else {
                const item = { ...getSelectionData() };
                if (key === 'dir') item[key] = parseInt(v, 10);
                else if (key === 'once') item[key] = v === '1' || v === 1 || v === true;
                else if (key === 'bindEnemyId') {
                    if (v === '' || v == null) delete item.bindEnemyId;
                    else item.bindEnemyId = String(v);
                }
                else if (typeof v === 'number' && key !== 'type' && !['hp', 'amount', 'period', 'activeDuration', 'damage', 'delay', 'respawn', 'interval', 'startDelay', 'force', 'id'].includes(key)) {
                    item[key] = S.snap(v);
                }
                else if (key === 'period' || key === 'activeDuration' || key === 'damage' || key === 'id') {
                    item[key] = Number.isNaN(v) ? undefined : v;
                }
                else if (key === 'drainRate') {
                    item[key] = Number.isNaN(v) ? 15 : Math.max(0, v);
                }
                else item[key] = v;
                setSelectionData(item);
            }
            refreshAll(false);
        };

        if (selection.category === 'platforms') {
            addField('X（首块中心）', 'x', 'number', { value: data[0] });
            addField('Y', 'y', 'number', { value: data[1] });
            addField('段数 count（横向）', 'count', 'number', { value: data[2] });
            addField('高度 h（纵向，>20 当墙；L 冲刺可穿）', 'height', 'number', { value: S.platformHeight(data) });
        } else if (selection.category === 'walls' || selection.category === 'destructibleWalls') {
            addField('X', 'x', 'number', { value: data.x });
            addField('Y', 'y', 'number', { value: data.y });
            addField('宽度 w', 'w', 'number', { value: data.w });
            addField('高度 h', 'h', 'number', { value: data.h });
            if (selection.category === 'destructibleWalls') {
                addField('耐久 hp', 'hp', 'number', { value: data.hp ?? 3 });
            }
        } else if (selection.category === 'systemWalls') {
            addField('X', 'x', 'number', { value: data.x });
            addField('Y', 'y', 'number', { value: data.y });
            addField('宽度 w', 'w', 'number', { value: data.w });
            addField('高度 h', 'h', 'number', { value: data.h });
            addField('绑定小怪 id bindEnemyId', 'bindEnemyId', 'text', { value: data.bindEnemyId ?? '' });
            const swHint = document.createElement('p');
            swHint.className = 'field-hint';
            swHint.textContent = '对应 id 的小怪被击杀后，此墙会消失。小怪在「实体 → 敌人生成点」里设置 id。';
            form.appendChild(swHint);
        } else if (selection.category === 'pickups') {
            addField('类型', 'type', 'select', {
                value: data.type || 'health',
                options: [
                    { v: 'health', t: '回血' },
                    { v: 'energy', t: '回能量' }
                ]
            });
            addField('X', 'x', 'number', { value: data.x });
            addField('Y', 'y', 'number', { value: data.y ?? (S.groundY(level) - 4) });
            const amountLabel = data.type === 'energy' ? '回能量 amount' : '回血量 amount';
            const amountDefault = data.type === 'energy' ? 25 : 30;
            addField(amountLabel, 'amount', 'number', { value: data.amount ?? amountDefault });
        } else if (selection.category === 'spawns') {
            addField('X', 'x', 'number', { value: data.x });
            addField('Y', 'y', 'number', { value: data.y ?? (S.groundY(level) - 4) });
            addField('类型', 'type', 'select', {
                value: data.type,
                options: [
                    { v: 'melee', t: '近战' },
                    { v: 'ranged', t: '远程' },
                    { v: 'flying', t: '飞行' }
                ]
            });
            const defaultHp = S.spawnDefaultHp(data.type);
            addField(`血量 hp（默认 ${defaultHp}）`, 'hp', 'number', { value: data.hp ?? '' });
            addField(`击杀回能（默认 ${level.enemyKillEnergy ?? 10}）`, 'killEnergy', 'number', { value: data.killEnergy ?? '' });
            addField('小怪 id（可选，供系统墙绑定）', 'id', 'text', { value: data.id ?? '' });
        } else if (selection.category === 'hazards') {
            if (data.type === 'electric') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w });
                addField('高 h', 'h', 'number', { value: data.h });
                addField('周期 period (ms，0=常开)', 'period', 'number', { value: data.period ?? 2400 });
                addField('激活时长 activeDuration (ms)', 'activeDuration', 'number', { value: data.activeDuration ?? 1000 });
                addField('伤害 damage', 'damage', 'number', { value: data.damage ?? 6 });
            } else if (data.type === 'checkpoint') {
                addField('X（脚底）', 'x', 'number', { value: data.x });
                addField('Y（脚底）', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w ?? 80 });
                addField('高 h（向上）', 'h', 'number', { value: data.h ?? 60 });
                addField('ID（可选，区分多个复活点）', 'id', 'number', { value: data.id ?? '' });
                addField('复活血量 (%)', 'respawnHpPercent', 'number', { value: data.respawnHpPercent ?? 100 });
                addField('复活能量 (%)', 'respawnEnergyPercent', 'number', { value: data.respawnEnergyPercent ?? 100 });
                const cpHint = document.createElement('p');
                cpHint.className = 'field-hint';
                cpHint.textContent = '点击放置 = 脚底落点（与敌人生成点相同）。⛳ 即复活位置，虚线框为触发区。';
                form.appendChild(cpHint);
            } else if (data.type === 'death') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w ?? 96 });
                addField('高 h', 'h', 'number', { value: data.h ?? 24 });
            } else if (data.type === 'hint') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w ?? 180 });
                addField('高 h', 'h', 'number', { value: data.h ?? 100 });
                const textRow = document.createElement('div');
                textRow.className = 'field-row';
                textRow.innerHTML = `<label for="prop-text">提示文字</label><input id="prop-text" type="text" value="${(data.text || '').replace(/"/g, '&quot;')}">`;
                form.appendChild(textRow);
                textRow.querySelector('input').addEventListener('change', e => {
                    pushUndo();
                    applyPropChange('text', e.target.value);
                });
                addField('仅显示一次', 'once', 'select', {
                    value: data.once !== false ? '1' : '0',
                    options: [{ v: '1', t: '是' }, { v: '0', t: '否' }]
                });
                addField('绑定小怪 id bindEnemyId（可选）', 'bindEnemyId', 'text', { value: data.bindEnemyId ?? '' });
                const hintBindNote = document.createElement('p');
                hintBindNote.className = 'field-hint';
                hintBindNote.textContent = '若填写 bindEnemyId，对应小怪被击杀后此提示区失效（正在显示的文字也会立即关闭）。';
                form.appendChild(hintBindNote);
            } else if (data.type === 'wind') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w });
                addField('高 h', 'h', 'number', { value: data.h });
                addField('力度 force', 'force', 'number', { value: data.force });
                addField('方向 dir', 'dir', 'select', { value: data.dir, options: [{ v: '1', t: '向右 →' }, { v: '-1', t: '向左 ←' }] });
            } else if (data.type === 'energy_drain') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w ?? 140 });
                addField('高 h', 'h', 'number', { value: data.h ?? 80 });
                addField('损失速率 drainRate (/秒)', 'drainRate', 'number', { value: data.drainRate ?? 15 });
                const drainHint = document.createElement('p');
                drainHint.className = 'field-hint';
                drainHint.textContent = '玩家处于区域内时持续扣能量，速率单位与关卡「回能量速度」相同（能量/秒）。';
                form.appendChild(drainHint);
            } else if (data.type === 'missile') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w ?? 160 });
                addField('高 h', 'h', 'number', { value: data.h ?? 60 });
                addField('间隔 interval (ms)', 'interval', 'number', { value: data.interval ?? 3000 });
                addField('启动延迟 startDelay (ms)', 'startDelay', 'number', { value: data.startDelay ?? 0 });
                addField('伤害 damage', 'damage', 'number', { value: data.damage ?? 12 });
                const missileHint = document.createElement('p');
                missileHint.className = 'field-hint';
                missileHint.textContent = '在矩形区域内随机选取落点；多个导弹设置相同间隔与不同启动延迟，可实现错相但同周期打击。';
                form.appendChild(missileHint);
            } else if (data.type === 'crumble') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w ?? S.PLATFORM_W });
                addField('高 h', 'h', 'number', { value: data.h ?? S.PLATFORM_H });
                addField('延迟 delay (ms)', 'delay', 'number', { value: data.delay });
                addField('重生 respawn (ms)', 'respawn', 'number', { value: data.respawn });
            }
        } else if (selection.category === 'playerStart') {
            addField('X', 'x', 'number', { value: data.x });
            addField('yOffset（距底边）', 'yOffset', 'number', { value: data.yOffset });
        } else if (selection.category === 'boss') {
            const bossDefaults = S.getBossTypeDefaults(data.type);
            addField('Boss 类型', 'type', 'select', {
                value: data.type,
                options: S.BOSS_TYPE_OPTIONS.map(o => ({ v: o.id, t: o.label }))
            });
            addField('xOffset（距右边缘）', 'xOffset', 'number', { value: data.xOffset });
            addField('yOffset（距底边）', 'yOffset', 'number', { value: data.yOffset });
            addField(`血量（默认 ${bossDefaults.hp}）`, 'hp', 'number', {
                value: data.hp ?? '',
                placeholder: '留空=默认'
            });
            addField('攻击伤害倍率（默认 1）', 'damageMult', 'number', {
                value: data.damageMult ?? '',
                placeholder: '留空=1',
                step: '0.1'
            });
            const bossHint = document.createElement('p');
            bossHint.className = 'field-hint';
            bossHint.textContent = `当前类型默认：HP ${bossDefaults.hp}，接触伤害 ${bossDefaults.contactDamage}；倍率作用于接触伤害、技能伤害与弹幕。留空使用默认。`;
            form.appendChild(bossHint);
        } else if (selection.category === 'finish') {
            addField('X', 'x', 'number', { value: data.x });
            addField('Y', 'y', 'number', { value: data.y });
            addField('宽 w', 'w', 'number', { value: data.w ?? 80 });
            addField('高 h', 'h', 'number', { value: data.h ?? 80 });
        } else if (selection.category === 'bossTriggerZone') {
            addField('X', 'x', 'number', { value: data.x });
            addField('Y', 'y', 'number', { value: data.y });
            addField('宽 w', 'w', 'number', { value: data.w ?? 160 });
            addField('高 h', 'h', 'number', { value: data.h ?? 120 });
            const triggerHint = document.createElement('p');
            triggerHint.className = 'field-hint';
            triggerHint.textContent = '玩家进入此矩形区域且清完小怪后触发 Boss；设置后 Boss 触发线（bossTriggerOffset）不再生效。';
            form.appendChild(triggerHint);
        }

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn copy-btn';
        copyBtn.textContent = selection.category === 'playerStart' || selection.category === 'boss'
            ? '复制并偏移'
            : '复制到旁边';
        copyBtn.addEventListener('click', () => {
            if (!copySelection()) return;
            duplicateSelection(S.getGridSize(), 0);
        });
        form.appendChild(copyBtn);

        if (selection.category !== 'playerStart' && selection.category !== 'boss') {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'btn delete-btn';
            del.textContent = '删除此元素';
            del.addEventListener('click', () => {
                pushUndo();
                if (selection.category === 'finish') {
                    level.finish = null;
                } else if (selection.category === 'bossTriggerZone') {
                    level.bossTriggerZone = null;
                } else {
                    level[selection.category].splice(selection.index, 1);
                }
                selection = null;
                refreshAll();
            });
            form.appendChild(del);
        }

        if (selection.category === 'finish') {
            const note = document.createElement('p');
            note.className = 'field-hint';
            note.textContent = '终点与 Boss 互斥；放置 Boss 将自动移除终点。';
            form.appendChild(note);
        }
        if (selection.category === 'boss') {
            const note = document.createElement('p');
            note.className = 'field-hint';
            note.textContent = 'Boss 与终点互斥；放置终点将自动移除 Boss。';
            form.appendChild(note);
        }
    }

    function formatPlayerConfigDefault(field) {
        const def = S.PLAYER_CONFIG_DEFAULTS[field.key];
        const unit = field.unit ? ` ${field.unit}` : '';
        return `默认 ${def}${unit}`;
    }

    function normalizePlayerFieldValue(key, raw, field) {
        if (field.optional && (raw === '' || raw == null)) return null;
        let v = typeof raw === 'number' ? raw : parseFloat(raw);
        if (Number.isNaN(v)) return undefined;
        if (field.integer) v = Math.round(v);
        if (field.clamp) v = Math.max(field.clamp[0], Math.min(field.clamp[1], v));
        if (field.min != null) v = Math.max(field.min, v);
        if (field.max != null) v = Math.min(field.max, v);
        if (key === 'maxJumps') {
            v = Math.round(v);
            if (v >= 0) v = Math.max(0, Math.min(10, v));
        }
        if (key === 'jumpVelocity' || key === 'secondJumpVelocity') v = Math.min(0, v);
        if (key === 'moveSpeed') v = Math.max(0, v);
        if (key === 'gravity' || key === 'maxFallVelocity') v = Math.max(0, v);
        if (key === 'energyStartPercent' || key === 'hpStartPercent') v = Math.max(0, Math.min(100, v));
        if (key === 'energyRegenRate') v = Math.max(0, v);
        return v;
    }

    function getPlayerConfigSummaryText() {
        const parts = [];
        S.PLAYER_CONFIG_FIELDS.forEach(field => {
            if (!field.key) return;
            const def = S.PLAYER_CONFIG_DEFAULTS[field.key];
            const val = level[field.key];
            if (field.optional) {
                if (val != null) {
                    if (field.key === 'maxJumps' && val < 0) parts.push('跳跃次数 无限');
                    else parts.push(`${field.label} ${val}`);
                }
                return;
            }
            const effective = val ?? def;
            if (effective !== def) parts.push(`${field.label} ${effective}${field.unit || ''}`);
        });
        return parts.length ? parts.join(' · ') : '全部使用默认值';
    }

    function updatePlayerConfigSummary() {
        const el = document.getElementById('player-config-summary');
        if (el) el.textContent = getPlayerConfigSummaryText();
    }

    function buildPlayerSettingsForm() {
        const form = document.getElementById('player-settings-form');
        if (!form) return;
        form.innerHTML = '';

        S.PLAYER_CONFIG_FIELDS.forEach(field => {
            if (field.section) {
                const title = document.createElement('div');
                title.className = 'section-title';
                title.textContent = field.section;
                form.appendChild(title);
                return;
            }

            const row = document.createElement('div');
            row.className = 'player-settings-field';
            const val = level[field.key];
            const display = val === null || val === undefined ? '' : val;
            const placeholder = field.optional ? '留空=默认' : String(S.PLAYER_CONFIG_DEFAULTS[field.key]);
            row.innerHTML = `
                <div class="player-settings-field-head">
                    <span class="player-settings-field-name">${field.label}${field.unit ? ` (${field.unit})` : ''}${field.hint ? ` · ${field.hint}` : ''}</span>
                    <span class="player-settings-field-default">${formatPlayerConfigDefault(field)}</span>
                </div>
                <input type="number" data-key="${field.key}" value="${display}" placeholder="${placeholder}">
            `;
            form.appendChild(row);

            row.querySelector('input').addEventListener('change', e => {
                pushUndo();
                const k = e.target.dataset.key;
                const meta = S.PLAYER_CONFIG_FIELDS.find(item => item.key === k);
                const next = normalizePlayerFieldValue(k, e.target.value.trim(), meta || {});
                if (next === undefined) return;
                level[k] = next;
                if (next === null) e.target.value = '';
                else e.target.value = next;
                updatePlayerConfigSummary();
            });
        });
    }

    function openPlayerSettingsModal() {
        const modal = document.getElementById('player-settings-modal');
        if (!modal) return;
        buildPlayerSettingsForm();
        modal.hidden = false;
    }

    function closePlayerSettingsModal() {
        const modal = document.getElementById('player-settings-modal');
        if (modal) modal.hidden = true;
    }

    function setupPlayerSettingsModal() {
        const modal = document.getElementById('player-settings-modal');
        if (!modal) return;

        document.getElementById('tab-level').addEventListener('click', e => {
            if (e.target.id === 'btn-open-player-settings') openPlayerSettingsModal();
        });
        document.getElementById('btn-player-settings-close').addEventListener('click', closePlayerSettingsModal);
        modal.addEventListener('click', e => {
            if (e.target === modal) closePlayerSettingsModal();
        });
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !modal.hidden) closePlayerSettingsModal();
        });
    }

    function updateBossTriggerHint() {
        const el = document.getElementById('boss-trigger-offset-hint');
        if (!el) return;
        if (S.hasBossTriggerZone(level)) {
            el.textContent = '已设置 Boss 触发框，触发线（bossTriggerOffset）在游戏中不生效。';
        } else {
            el.textContent = '未设置触发框时，玩家越过距右边缘该距离的竖线即进入 Boss 触发判定（须先清完小怪）。';
        }
    }

    function buildLevelForm() {
        const form = document.getElementById('level-form');
        const fields = [
            { section: '基本信息', items: [
                ['id', '关卡 ID', 'number'],
                ['title', '标题', 'text'],
                ['subtitle', '副标题', 'text'],
                ['width', '关卡宽度 (px)', 'number'],
                ['height', '关卡高度 (px)', 'number']
            ]},
            { section: 'Boss', items: [
                ['bossTriggerOffset', 'Boss 触发距右边缘 (px)', 'number']
            ]},
            { isPlayerSection: true },
            { section: '小怪', items: [
                ['enemyKillEnergy', '击杀回能（默认）', 'number']
            ]},
            { section: '媒体资源', items: [
                ['startVideoUrl', '开场 PV URL', 'text'],
                ['endVideoUrl', '终结 PV URL', 'text'],
                ['normalBgmUrl', '普通 BGM URL', 'text'],
                ['bossBgmUrl', 'Boss BGM URL', 'text'],
                ['bgUrl', '关卡背景图 URL', 'text'],
                ['resultBgUrl', '结算背景 URL', 'text']
            ]}
        ];

        form.innerHTML = '';
        fields.forEach(sec => {
            if (sec.isPlayerSection) {
                const title = document.createElement('div');
                title.className = 'section-title';
                title.textContent = '角色数值';
                form.appendChild(title);

                const wrap = document.createElement('div');
                wrap.className = 'level-player-section';
                wrap.innerHTML = `
                    <p class="field-hint" id="player-config-summary">—</p>
                    <button type="button" class="btn player-settings-open-btn" id="btn-open-player-settings">编辑角色数值…</button>
                `;
                form.appendChild(wrap);
                updatePlayerConfigSummary();
                return;
            }

            const title = document.createElement('div');
            title.className = 'section-title';
            title.textContent = sec.section;
            form.appendChild(title);
            sec.items.forEach(([key, label, type]) => {
                const row = document.createElement('div');
                row.className = 'field-row';
                const val = level[key];
                const display = val === null || val === undefined ? '' : val;
                row.innerHTML = `<label>${label}</label><input type="${type}" data-key="${key}" value="${display}">`;
                form.appendChild(row);
                row.querySelector('input').addEventListener('change', e => {
                    pushUndo();
                    const k = e.target.dataset.key;
                    let v = e.target.value;
                    if (type === 'number') v = parseFloat(v);
                    if (Number.isNaN(v)) return;
                    if (k === 'enemyKillEnergy') v = Math.max(0, v);
                    if (k === 'height') {
                        v = Math.max(S.MIN_LEVEL_HEIGHT, v);
                        S.setLevelHeight(level, v);
                        resizeCanvas();
                        refreshAll(false);
                        return;
                    }
                    if (v === '' && k.includes('Url')) level[k] = null;
                    else level[k] = v;
                    if (k === 'bgUrl') loadBgForLevel();
                    if (k === 'width') resizeCanvas();
                    refreshAll(false);
                });
            });
            if (sec.section === 'Boss') {
                const triggerHint = document.createElement('p');
                triggerHint.className = 'field-hint';
                triggerHint.id = 'boss-trigger-offset-hint';
                form.appendChild(triggerHint);
                updateBossTriggerHint();
            }
        });

    }

    function setupSceneToolsModal() {
        const modal = document.getElementById('scene-tools-modal');
        const widthLabel = document.getElementById('scene-tools-level-width');
        const heightLabel = document.getElementById('scene-tools-level-height');

        function openSceneToolsModal() {
            if (widthLabel) widthLabel.textContent = `${level.width}px`;
            if (heightLabel) heightLabel.textContent = `${getLevelH()}px`;
            modal.hidden = false;
        }

        function closeSceneToolsModal() {
            modal.hidden = true;
        }

        document.getElementById('btn-scene-tools').addEventListener('click', openSceneToolsModal);
        document.getElementById('btn-scene-tools-close').addEventListener('click', closeSceneToolsModal);
        modal.addEventListener('click', e => {
            if (e.target === modal) closeSceneToolsModal();
        });
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !modal.hidden) closeSceneToolsModal();
        });

        document.getElementById('btn-insert-cursor-x').addEventListener('click', () => {
            document.getElementById('insert-at-x').value = S.snap(lastCursorX);
        });
        document.getElementById('btn-insert-sel-x').addEventListener('click', () => {
            const x = getSelectionWorldX();
            if (x == null) {
                alert('请先在地图上选中一个元素');
                return;
            }
            document.getElementById('insert-at-x').value = S.snap(x);
        });
        document.getElementById('btn-insert-blank').addEventListener('click', () => {
            const atX = parseFloat(document.getElementById('insert-at-x').value);
            const len = parseFloat(document.getElementById('insert-length-h').value);
            if (Number.isNaN(atX) || Number.isNaN(len)) {
                alert('请填写有效的插入位置与长度');
                return;
            }
            if (len <= 0) {
                alert('插入长度须大于 0');
                return;
            }
            if (atX < 0 || atX > level.width) {
                if (!confirm(`插入位置 X=${atX} 在关卡宽度 ${level.width}px 之外，仍要继续？`)) return;
            }
            pushUndo();
            S.insertBlankSpace(level, atX, len);
            selection = null;
            refreshAll();
            closeSceneToolsModal();
        });

        document.getElementById('btn-insert-cursor-y').addEventListener('click', () => {
            document.getElementById('insert-at-y').value = S.snap(lastCursorY);
        });
        document.getElementById('btn-insert-sel-y').addEventListener('click', () => {
            const y = getSelectionWorldY();
            if (y == null) {
                alert('请先在地图上选中一个元素');
                return;
            }
            document.getElementById('insert-at-y').value = S.snap(y);
        });
        document.getElementById('btn-insert-blank-v').addEventListener('click', () => {
            const atY = parseFloat(document.getElementById('insert-at-y').value);
            const len = parseFloat(document.getElementById('insert-length-v').value);
            if (Number.isNaN(atY) || Number.isNaN(len)) {
                alert('请填写有效的插入位置与长度');
                return;
            }
            if (len <= 0) {
                alert('插入长度须大于 0');
                return;
            }
            if (atY < 0 || atY > getLevelH()) {
                if (!confirm(`插入位置 Y=${atY} 在关卡高度 ${getLevelH()}px 之外，仍要继续？`)) return;
            }
            pushUndo();
            S.insertBlankSpaceVertical(level, atY, len);
            selection = null;
            refreshAll();
            closeSceneToolsModal();
        });
    }

    function getSelectionWorldX() {
        if (!selection) return null;
        const data = getSelectionData();
        if (!data) return null;
        if (selection.category === 'platforms') return data[0];
        if (selection.category === 'playerStart') return data.x;
        if (selection.category === 'boss') {
            return level.width - (data.xOffset || 240);
        }
        if (selection.category === 'finish') return data.x;
        if (typeof data.x === 'number') return data.x;
        return null;
    }

    function getSelectionWorldY() {
        if (!selection) return null;
        const data = getSelectionData();
        if (!data) return null;
        const anchor = getDataAnchor(selection.category, data);
        return typeof anchor.y === 'number' ? anchor.y : null;
    }

    function buildHierarchy() {
        const list = document.getElementById('hierarchy-list');
        list.innerHTML = '';
        S.listAllItems(level).forEach(item => {
            const li = document.createElement('li');
            const sel = selection?.category === item.category && selection?.index === item.index;
            if (sel) li.classList.add('selected');
            li.innerHTML = `<span>${S.getItemLabel(item.category, item.data, item.index)}</span><span class="tag">${item.category}</span>`;
            li.addEventListener('click', () => {
                selection = { category: item.category, index: item.index };
                document.querySelector('.tab[data-tab="props"]').click();
                refreshAll(false);
            });
            list.appendChild(li);
        });
    }

    function updateLevelSelect() {
        const sel = document.getElementById('level-select');
        sel.innerHTML = levelsCache.map((l, i) =>
            `<option value="${i}"${l.id === level.id ? ' selected' : ''}>${l.id}: ${l.title}</option>`
        ).join('');
    }

    function updateInfo() {
        document.getElementById('level-info').textContent =
            `${level.title} · 宽 ${level.width}px · 高 ${getLevelH()}px · 平台 ${level.platforms.length} · 墙 ${level.walls.length} · 可破坏 ${level.destructibleWalls.length} · 系统墙 ${level.systemWalls.length} · 道具 ${level.pickups.length} · 机关 ${level.hazards.length}`;
    }

    function loadBgForLevel() {
        const url = level.bgUrl ? resolveProjectUrl(level.bgUrl) : null;
        if (!url) {
            bgImage = null;
            render();
            return;
        }
        const img = new Image();
        img.onload = () => {
            if (level.bgUrl && resolveProjectUrl(level.bgUrl) === url) {
                bgImage = img;
                render();
            }
        };
        img.onerror = () => {
            if (level.bgUrl && resolveProjectUrl(level.bgUrl) === url) {
                bgImage = null;
                render();
            }
        };
        img.src = url;
    }

    function refreshAll(rebuildForms = true) {
        render();
        updateInfo();
        updateBossTriggerHint();
        if (rebuildForms) {
            buildPropsForm();
            buildLevelForm();
            buildHierarchy();
        }
    }

    async function loadManifest() {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) throw new Error('无法加载 manifest.json，请通过 HTTP 服务打开编辑器');
        const manifest = await res.json();
        levelsCache = await Promise.all(manifest.levels.map(async url => {
            const r = await fetch(resolveProjectUrl(url));
            const data = S.normalizeLevel(await r.json());
            levelSourcePaths[data.id] = url;
            return data;
        }));
        levelsCache.sort((a, b) => a.id - b.id);
        updateLevelSelect();
    }

    async function loadLevel(data, options = {}) {
        level = S.normalizeLevel(data);
        selection = null;
        undoStack = [];
        redoStack = [];
        currentFileHandle = options.fileHandle || null;
        currentFileLabel = options.fileLabel || levelSourcePaths[level.id] || defaultFileName(level.id);
        if (!currentFileHandle) {
            await bindFileHandleForLevel(level.id);
        } else {
            await storeFileHandle(level.id, currentFileHandle);
            setSaveStatus(`已关联 · ${currentFileLabel}`);
        }
        loadBgForLevel();
        refreshAll();
    }

    async function saveLevel() {
        const errors = S.validateLevel(level);
        if (errors.length) {
            alert('校验失败:\n' + errors.join('\n'));
            return;
        }

        const json = S.exportLevel(level);
        let handle = currentFileHandle || await restoreFileHandle(level.id);

        if (handle && await verifyWritePermission(handle)) {
            try {
                await writeToHandle(handle, json);
                currentFileHandle = handle;
                currentFileLabel = handle.name;
                await storeFileHandle(level.id, handle);
                const idx = levelsCache.findIndex(l => l.id === level.id);
                if (idx >= 0) levelsCache[idx] = S.normalizeLevel(JSON.parse(json));
                setSaveStatus(`已保存 · ${handle.name}`);
                return;
            } catch (err) {
                console.warn('[saveLevel] 写入失败，尝试重新选择文件', err);
                currentFileHandle = null;
            }
        }

        if (window.showSaveFilePicker) {
            try {
                handle = await window.showSaveFilePicker({
                    suggestedName: defaultFileName(level.id),
                    types: [{
                        description: '关卡 JSON',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                await writeToHandle(handle, json);
                currentFileHandle = handle;
                currentFileLabel = handle.name;
                await storeFileHandle(level.id, handle);
                const idx = levelsCache.findIndex(l => l.id === level.id);
                if (idx >= 0) levelsCache[idx] = S.normalizeLevel(JSON.parse(json));
                setSaveStatus(`已保存 · ${handle.name}`);
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.warn('[saveLevel] showSaveFilePicker 失败', err);
            }
        }

        downloadJson(json, defaultFileName(level.id));
        setSaveStatus('已下载（浏览器不支持直接覆盖，请手动替换文件）', true);
    }

    async function openLevelFile() {
        if (window.showOpenFilePicker) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: '关卡 JSON',
                        accept: { 'application/json': ['.json'] }
                    }],
                    multiple: false
                });
                const file = await handle.getFile();
                const data = JSON.parse(await file.text());
                await loadLevel(data, { fileHandle: handle, fileLabel: handle.name });
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.warn('[openLevelFile] showOpenFilePicker 失败，回退到 input', err);
            }
        }
        document.getElementById('file-input').click();
    }

    /** 计算拖动时鼠标相对元素锚点的偏移（松开时保持该偏移） */
    function getDragGrabOffset(category, data, worldX, worldY) {
        if (!data) return { x: 0, y: 0 };
        if (category === 'platforms') {
            return { x: worldX - data[0], y: worldY - data[1] };
        }
        if (category === 'playerStart') {
            return {
                x: worldX - level.playerStart.x,
                y: worldY - S.playerY(level)
            };
        }
        if (category === 'boss') {
            const bx = level.width - (level.boss.xOffset || 240);
            const by = getLevelH() - (level.boss.yOffset || 80);
            return { x: worldX - bx, y: worldY - by };
        }
        if (category === 'finish') {
            return { x: worldX - level.finish.x, y: worldY - level.finish.y };
        }
        if (category === 'bossTriggerZone') {
            return { x: worldX - level.bossTriggerZone.x, y: worldY - level.bossTriggerZone.y };
        }
        if (category === 'spawns' || category === 'pickups') {
            const feetY = S.getSpawnFeetY(level, data);
            return { x: worldX - data.x, y: worldY - feetY };
        }
        if (category === 'hazards' && data.type === 'checkpoint') {
            return { x: worldX - data.x, y: worldY - data.y };
        }
        if (typeof data === 'object') {
            return {
                x: data.x !== undefined ? worldX - data.x : 0,
                y: data.y !== undefined ? worldY - data.y : 0
            };
        }
        return { x: 0, y: 0 };
    }

    function applyDragAtCursor(worldX, worldY) {
        const data = getSelectionData();
        if (!data || !selection || !dragState) return;
        const ox = dragState.grabOffsetX ?? 0;
        const oy = dragState.grabOffsetY ?? 0;

        if (selection.category === 'platforms') {
            const h = S.platformHeight(data);
            level.platforms[selection.index] = h > S.PLATFORM_H
                ? [worldX - ox, worldY - oy, data[2], h]
                : [worldX - ox, worldY - oy, data[2]];
        } else if (selection.category === 'playerStart') {
            level.playerStart.x = worldX - ox;
            level.playerStart.yOffset = getLevelH() - (worldY - oy);
        } else if (selection.category === 'boss') {
            level.boss.xOffset = level.width - (worldX - ox);
            level.boss.yOffset = getLevelH() - (worldY - oy);
        } else if (selection.category === 'finish') {
            level.finish.x = worldX - ox;
            level.finish.y = worldY - oy;
        } else if (selection.category === 'bossTriggerZone') {
            level.bossTriggerZone.x = worldX - ox;
            level.bossTriggerZone.y = worldY - oy;
        } else if (selection.category === 'spawns') {
            const item = { ...data };
            item.x = worldX - ox;
            item.y = worldY - oy;
            setSelectionData(item);
        } else if (selection.category === 'hazards' && data.type === 'checkpoint') {
            const item = { ...data, feetAnchor: true };
            item.x = worldX - ox;
            item.y = worldY - oy;
            level.hazards[selection.index] = item;
        } else if (typeof data === 'object') {
            const item = { ...data };
            if (item.x !== undefined) item.x = worldX - ox;
            if (item.y !== undefined) item.y = worldY - oy;
            setSelectionData(item);
        }
    }

    function moveSelection(dx, dy) {
        const data = getSelectionData();
        if (!data) return;
        if (selection.category === 'platforms') {
            const h = S.platformHeight(data);
            level.platforms[selection.index] = h > S.PLATFORM_H
                ? [data[0] + dx, data[1] + dy, data[2], h]
                : [data[0] + dx, data[1] + dy, data[2]];
        } else if (selection.category === 'playerStart') {
            level.playerStart.x = level.playerStart.x + dx;
            level.playerStart.yOffset = level.playerStart.yOffset - dy;
        } else if (selection.category === 'boss') {
            level.boss.xOffset = level.boss.xOffset - dx;
            level.boss.yOffset = level.boss.yOffset - dy;
        } else if (selection.category === 'finish') {
            level.finish.x = level.finish.x + dx;
            level.finish.y = level.finish.y + dy;
        } else if (selection.category === 'bossTriggerZone') {
            level.bossTriggerZone.x = level.bossTriggerZone.x + dx;
            level.bossTriggerZone.y = level.bossTriggerZone.y + dy;
        } else if (selection.category === 'spawns') {
            const item = { ...data };
            item.x = item.x + dx;
            item.y = S.getSpawnFeetY(level, item) + dy;
            setSelectionData(item);
        } else if (typeof data === 'object') {
            const item = { ...data };
            if (item.x !== undefined) item.x = item.x + dx;
            if (item.y !== undefined) item.y = item.y + dy;
            setSelectionData(item);
        }
    }

    function snapSelection() {
        const data = getSelectionData();
        if (!data || !selection) return;
        if (selection.category === 'platforms') {
            const h = S.platformHeight(data);
            level.platforms[selection.index] = h > S.PLATFORM_H
                ? [S.snap(data[0]), S.snap(data[1]), data[2], h]
                : [S.snap(data[0]), S.snap(data[1]), data[2]];
        } else if (selection.category === 'playerStart') {
            level.playerStart.x = S.snap(level.playerStart.x);
            level.playerStart.yOffset = getLevelH() - S.snap(S.playerY(level));
        } else if (selection.category === 'boss') {
            const bx = level.width - level.boss.xOffset;
            const by = getLevelH() - level.boss.yOffset;
            level.boss.xOffset = level.width - S.snap(bx);
            level.boss.yOffset = getLevelH() - S.snap(by);
        } else if (selection.category === 'spawns') {
            const item = { ...data };
            item.x = S.snap(item.x);
            item.y = S.snap(S.getSpawnFeetY(level, item));
            setSelectionData(item);
        } else if (selection.category === 'hazards' && data.type === 'checkpoint') {
            const item = { ...data, feetAnchor: true };
            item.x = S.snap(item.x);
            level.hazards[selection.index] = item;
        } else if (typeof data === 'object') {
            const item = { ...data };
            if (item.x !== undefined) item.x = S.snap(item.x);
            if (item.y !== undefined) item.y = S.snap(item.y);
            setSelectionData(item);
        }
    }

    function startPan(e) {
        panning = true;
        panStart = {
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
            x: e.clientX,
            y: e.clientY
        };
        viewport.classList.add('panning');
    }

    function endInteraction(e) {
        if (dragState?.moved && selection) {
            const w = screenToWorld(e.clientX, e.clientY);
            applyDragAtCursor(w.x, w.y);
            snapSelection();
            render();
            buildPropsForm();
            buildHierarchy();
        } else if (stackClickState && selection && !dragState?.moved) {
            const { hits } = stackClickState;
            const idx = hits.findIndex(h => h.category === selection.category && h.index === selection.index);
            if (idx >= 0) {
                selection = hits[(idx + 1) % hits.length];
                render();
                buildPropsForm();
                buildHierarchy();
            }
        } else if (resizeState) {
            render();
            buildPropsForm();
        }

        stackClickState = null;
        panning = false;
        panStart = null;
        dragState = null;
        resizeState = null;
        viewport.classList.remove('panning');
    }

    function applyResize(handle, wx, wy) {
        const data = getSelectionData();
        if (!data) return;
        if (selection.category === 'platforms') {
            const b = S.getItemBounds('platforms', data, level);
            let count = data[2];
            let h = S.platformHeight(data);
            let centerY = data[1];
            if (handle === 'e' || handle === 'se') {
                count = Math.max(1, Math.round((S.snap(wx) - (data[0] - S.PLATFORM_W / 2)) / S.PLATFORM_W));
            }
            if (handle === 's' || handle === 'se') {
                h = Math.max(S.PLATFORM_H, S.snap(wy) - b.y);
                centerY = b.y + h / 2;
            }
            level.platforms[selection.index] = h > S.PLATFORM_H
                ? [data[0], centerY, count, h]
                : [data[0], centerY, count];
            return;
        }
        const item = { ...data };
        const b = S.getItemBounds(selection.category, data, level);

        if (selection.category === 'hazards' && item.type === 'checkpoint') {
            const feetX = item.x;
            const feetY = item.y;
            if (handle === 'e' || handle === 'se') {
                item.w = Math.max(16, S.snap(wx) - b.x);
            }
            if (handle === 's' || handle === 'se') {
                item.h = Math.max(16, feetY - S.snap(wy));
            }
            item.feetAnchor = true;
            level.hazards[selection.index] = item;
            return;
        }

        if (handle === 'e' || handle === 'se') {
            const newW = Math.max(16, S.snap(wx) - b.x);
            item.w = newW;
            item.x = b.x + newW / 2;
        }
        if (handle === 's' || handle === 'se') {
            const newH = Math.max(16, S.snap(wy) - b.y);
            item.h = newH;
            item.y = b.y + newH / 2;
        }
        setSelectionData(item);
    }

    // --- Events ---
    viewport.addEventListener('mousedown', e => {
        if (e.button === 1) {
            e.preventDefault();
            startPan(e);
            return;
        }
        if (tool === 'pan' && e.button === 0) {
            startPan(e);
            return;
        }
        if (e.button !== 0) return;
        const w = screenToWorld(e.clientX, e.clientY);

        const handle = getResizeHandle(w.x, w.y);
        if (handle) {
            pushUndo();
            resizeState = { handle, startX: w.x, startY: w.y };
            return;
        }

        const hits = hitTestAll(w.x, w.y);
        if (hits.length) {
            stackClickState = null;
            if (selection && hits.length > 1) {
                const idx = hits.findIndex(h => h.category === selection.category && h.index === selection.index);
                if (idx >= 0) {
                    stackClickState = { hits };
                }
            }
            selection = pickSelectionFromHits(hits, !!stackClickState);
            const hitData = selection.category === 'playerStart'
                ? level.playerStart
                : selection.category === 'boss'
                    ? level.boss
                    : selection.category === 'bossTriggerZone'
                        ? level.bossTriggerZone
                    : selection.category === 'finish'
                        ? level.finish
                    : level[selection.category]?.[selection.index];
            const grab = getDragGrabOffset(selection.category, hitData, w.x, w.y);
            dragState = {
                startX: w.x,
                startY: w.y,
                grabOffsetX: grab.x,
                grabOffsetY: grab.y,
                moved: false,
                undoSaved: false
            };
            refreshAll(false);
            buildPropsForm();
            buildHierarchy();
            return;
        }

        if (paletteKind && tool === 'select') {
            placePaletteItem(paletteKind, w.x, w.y);
            return;
        }

        selection = null;
        stackClickState = null;
        refreshAll(false);
        buildPropsForm();
        buildHierarchy();
    });

    viewport.addEventListener('auxclick', e => {
        if (e.button === 1) e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
        const w = screenToWorld(e.clientX, e.clientY);
        lastCursorX = w.x;
        lastCursorY = w.y;
        document.getElementById('cursor-pos').textContent = `X: ${Math.round(w.x)}  Y: ${Math.round(w.y)}`;

        if (panning && panStart) {
            viewport.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x);
            viewport.scrollTop = panStart.scrollTop - (e.clientY - panStart.y);
            return;
        }
        if (resizeState) {
            applyResize(resizeState.handle, w.x, w.y);
            render();
            return;
        }
        if (dragState && selection) {
            const dx = w.x - dragState.startX;
            const dy = w.y - dragState.startY;
            if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
                if (!dragState.undoSaved) {
                    pushUndo();
                    dragState.undoSaved = true;
                }
                applyDragAtCursor(w.x, w.y);
                dragState.moved = true;
                render();
            }
        }
    });

    window.addEventListener('mouseup', endInteraction);

    viewport.addEventListener('wheel', e => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            zoom = Math.min(2, Math.max(0.25, zoom + delta));
            document.getElementById('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
            render();
        }
    }, { passive: false });

    viewport.addEventListener('dragover', e => e.preventDefault());
    viewport.addEventListener('drop', e => {
        e.preventDefault();
        const kind = e.dataTransfer.getData('text/plain') || paletteKind;
        const w = screenToWorld(e.clientX, e.clientY);
        if (kind) placePaletteItem(kind, w.x, w.y);
    });

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tool = btn.dataset.tool;
            viewport.classList.toggle('pan-mode', tool === 'pan');
        });
    });

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    document.getElementById('grid-size').addEventListener('change', e => {
        S.setGridSize(parseInt(e.target.value, 10));
        render();
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        zoom = Math.min(2, zoom + 0.1);
        document.getElementById('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
        render();
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        zoom = Math.max(0.25, zoom - 0.1);
        document.getElementById('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
        render();
    });
    document.getElementById('btn-zoom-fit').addEventListener('click', () => {
        zoom = Math.min(1, viewport.clientWidth / level.width, viewport.clientHeight / getLevelH());
        document.getElementById('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
        render();
    });

    document.getElementById('btn-clear-scene').addEventListener('click', () => {
        if (!confirm('清空场景？\n将删除所有平台、墙、敌人、道具、机关等。\n关卡 ID、宽度、高度、Boss 与媒体设置会保留。')) return;
        pushUndo();
        S.clearLevelContent(level);
        selection = null;
        refreshAll();
    });

    document.getElementById('btn-new').addEventListener('click', async () => {
        if (!confirm('新建空白关卡？未保存的更改将丢失。')) return;
        const newId = Math.max(1, ...levelsCache.map(l => l.id), level.id) + 1;
        currentFileHandle = null;
        currentFileLabel = defaultFileName(newId);
        setSaveStatus('');
        await loadLevel(S.createEmptyLevel(newId));
    });

    document.getElementById('btn-open').addEventListener('click', () => openLevelFile());
    document.getElementById('file-input').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                await loadLevel(JSON.parse(reader.result), { fileLabel: file.name });
            } catch (err) {
                alert('JSON 解析失败: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    document.getElementById('btn-save').addEventListener('click', () => saveLevel());

    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);

    document.getElementById('level-select').addEventListener('change', async e => {
        const idx = parseInt(e.target.value, 10);
        if (levelsCache[idx]) await loadLevel(levelsCache[idx]);
    });

    window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveLevel(); return; }
        if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); copySelection(); return; }
        if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); duplicateSelection(); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selection && selection.category === 'finish') {
                pushUndo();
                level.finish = null;
                selection = null;
                refreshAll();
                return;
            }
            if (selection && selection.category !== 'playerStart' && selection.category !== 'boss') {
                pushUndo();
                level[selection.category].splice(selection.index, 1);
                selection = null;
                refreshAll();
            }
        }
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
        if (!e.ctrlKey && (e.key === 'v' || e.key === 'V')) document.querySelector('[data-tool="select"]').click();
        if (e.key === 'h' || e.key === 'H') document.querySelector('[data-tool="pan"]').click();
    });

    function tick(ts) {
        animTime = ts;
        render();
        requestAnimationFrame(tick);
    }

    async function init() {
        buildPalette();
        buildLevelForm();
        setupSceneToolsModal();
        setupPlayerSettingsModal();
        S.setGridSize(parseInt(document.getElementById('grid-size').value, 10));

        if (LevelEditorPlayerMode.isEnabled()) {
            const playerCtx = {
                getLevel: () => level,
                saveDraftLocal: savePlayerDraft,
                startTestPlay: startPlayerTestPlay
            };
            const playerUi = LevelEditorPlayerMode.setupUi(playerCtx);
            playerCtx.loadPublishedLevel = async (levelData, meta) => {
                await loadLevel(LevelEditorPlayerMode.stripMedia(levelData));
                sessionStorage.removeItem('editor-test-pass');
                await LevelEditorPlayerMode.refreshUploadState(playerUi.uploadBtn, level);
                try {
                    await savePlayerDraft();
                } catch {
                    // 加载成功即可继续编辑
                }
                setSaveStatus(`已加载 · ${meta?.title || level.title || ''}`);
            };
            playerCtx.refreshPublishedLevels = () => playerUi.refreshPublishedLevels();
            LevelEditorPlayerMode.hideMediaSection();

            const draftId = LevelEditorPlayerMode.getOrCreateDraftId();
            const saved = await LevelEditorPlayerMode.loadDraft(draftId);
            try {
                if (saved && saved.levelJson) {
                    await loadLevel(LevelEditorPlayerMode.stripMedia(saved.levelJson));
                } else {
                    await loadLevel(await LevelEditorPlayerMode.loadTemplate());
                }
            } catch (err) {
                console.warn(err);
                await loadLevel(S.createEmptyLevel(1));
                alert('未能加载玩家模板：' + err.message);
            }

            await playerUi.refreshAuth();
            await LevelEditorPlayerMode.refreshUploadState(playerUi.uploadBtn, level);
            requestAnimationFrame(tick);
            return;
        }

        try {
            await loadManifest();
            if (levelsCache.length) await loadLevel(levelsCache[0]);
            else await loadLevel(S.createEmptyLevel(1));
        } catch (err) {
            console.warn(err);
            await loadLevel(S.createEmptyLevel(1));
            alert('未能自动加载关卡 JSON。\n请通过 HTTP 服务打开（如项目根目录 npx serve），或使用「打开」手动加载。\n\n' + err.message);
        }
        requestAnimationFrame(tick);
    }

    async function savePlayerDraft() {
        const draftId = LevelEditorPlayerMode.getOrCreateDraftId();
        await LevelEditorPlayerMode.saveDraft(draftId, level);
        setSaveStatus('草稿已保存到本地');
    }

    async function startPlayerTestPlay() {
        const errors = S.validateLevel(level);
        if (errors.length) {
            alert('请先修正以下问题再试玩：\n\n' + errors.join('\n'));
            return;
        }

        try {
            await savePlayerDraft();
        } catch (err) {
            alert('保存草稿失败，无法开始试玩：\n' + (err.message || err));
            return;
        }

        const draftId = LevelEditorPlayerMode.getOrCreateDraftId();
        const payload = LevelEditorPlayerMode.stripMedia(level);
        sessionStorage.setItem('editor-test-level', JSON.stringify(payload));
        sessionStorage.setItem('editor-draft-id', draftId);
        sessionStorage.removeItem('editor-test-pass');
        window.location.href = `/?testPlay=1&draftId=${encodeURIComponent(draftId)}`;
    }

    init();
})();
