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
    let undoStack = [];
    let redoStack = [];
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
        level[category][index] = data;
    }

    function hitTest(worldX, worldY) {
        const items = S.listAllItems(level).reverse();
        for (const item of items) {
            const b = S.getItemBounds(item.category, item.data, level);
            if (worldX >= b.x && worldX <= b.x + b.w && worldY >= b.y && worldY <= b.y + b.h) {
                return { category: item.category, index: item.index };
            }
        }
        return null;
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
            handles.length = 1;
        } else if (selection.category === 'pickups') {
            handles.length = 0;
        }
        for (const h of handles) {
            if (Math.abs(worldX - h.x) <= hs && Math.abs(worldY - h.y) <= hs) return h.id;
        }
        return null;
    }

    function resizeCanvas() {
        const w = Math.max(level.width, 1280);
        canvas.width = w;
        canvas.height = S.GAME_HEIGHT;
        canvas.style.width = `${w * zoom}px`;
        canvas.style.height = `${S.GAME_HEIGHT * zoom}px`;
    }

    function drawGrid() {
        const gs = S.getGridSize();
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= level.width; x += gs) {
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, S.GAME_HEIGHT);
            ctx.stroke();
        }
        for (let y = 0; y <= S.GAME_HEIGHT; y += gs) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(level.width, y + 0.5);
            ctx.stroke();
        }
    }

    function drawGround() {
        const tile = S.GROUND_TILE;
        const groundY = S.GROUND_Y;
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
        if (bgImage && bgImage.complete) {
            ctx.globalAlpha = 0.45;
            const imgW = bgImage.naturalWidth || bgImage.width;
            const imgH = bgImage.naturalHeight || bgImage.height;
            // 与 GameScene._createParallaxBackground 一致：按高度等比缩放，水平平铺
            const tileScale = imgH > 0 ? S.GAME_HEIGHT / imgH : 1;
            const tileW = imgW * tileScale;
            for (let x = 0; x < level.width; x += tileW) {
                ctx.drawImage(bgImage, x, 0, tileW, S.GAME_HEIGHT);
            }
            ctx.globalAlpha = 1;
        } else {
            const grd = ctx.createLinearGradient(0, 0, 0, S.GAME_HEIGHT);
            grd.addColorStop(0, '#1a1520');
            grd.addColorStop(1, '#0d0a12');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, level.width, S.GAME_HEIGHT);
        }
    }

    function drawBossTrigger() {
        const tx = S.bossTriggerX(level);
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, 0);
        ctx.lineTo(tx, S.GAME_HEIGHT);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,100,100,0.7)';
        ctx.font = '12px sans-serif';
        ctx.fillText('Boss 触发线', tx + 6, 18);
    }

    function drawPlatforms() {
        level.platforms.forEach(([x, y, count], i) => {
            const sel = selection?.category === 'platforms' && selection.index === i;
            for (let n = 0; n < count; n++) {
                const px = x + n * S.PLATFORM_W;
                ctx.fillStyle = sel ? '#9b7ec8' : '#7b5ea7';
                ctx.fillRect(px - S.PLATFORM_W / 2, y - S.PLATFORM_H / 2, S.PLATFORM_W, S.PLATFORM_H);
                ctx.strokeStyle = sel ? '#c8b0e8' : '#5a4080';
                ctx.strokeRect(px - S.PLATFORM_W / 2 + 0.5, y - S.PLATFORM_H / 2 + 0.5, S.PLATFORM_W - 1, S.PLATFORM_H - 1);
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

    function drawPickups() {
        level.pickups.forEach((p, i) => {
            const sel = selection?.category === 'pickups' && selection.index === i;
            const y = p.y ?? (S.GROUND_Y - 4);
            const half = S.PICKUP_SIZE / 2;
            ctx.fillStyle = sel ? '#66ffaa' : '#44dd88';
            ctx.beginPath();
            ctx.arc(p.x, y, half - 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = sel ? '#aaffcc' : '#228855';
            ctx.lineWidth = sel ? 2 : 1;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('+', p.x, y + 4);
            ctx.textAlign = 'left';
        });
    }

    function drawHazards() {
        level.hazards.forEach((h, i) => {
            const sel = selection?.category === 'hazards' && selection.index === i;
            if (h.type === 'electric') {
                const phase = animTime % (h.period || 2400);
                const active = phase < (h.activeDuration || 1000);
                ctx.fillStyle = active ? 'rgba(0,229,255,0.35)' : 'rgba(0,229,255,0.08)';
                ctx.strokeStyle = active ? '#66ffff' : 'rgba(0,229,255,0.4)';
                ctx.lineWidth = sel ? 3 : 2;
                ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
            } else if (h.type === 'wind') {
                ctx.fillStyle = 'rgba(170,204,255,0.08)';
                ctx.strokeStyle = '#8899bb';
                ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
                ctx.fillStyle = '#aaccff';
                ctx.font = '11px sans-serif';
                ctx.fillText(h.dir > 0 ? '→' : '←', h.x - 4, h.y + 4);
            } else if (h.type === 'missile') {
                const y = h.y ?? (S.GROUND_Y - 4);
                ctx.fillStyle = 'rgba(255,100,60,0.15)';
                ctx.fillRect(h.xMin, y - 30, h.xMax - h.xMin, 60);
                ctx.strokeStyle = '#ff6644';
                ctx.strokeRect(h.xMin, y - 30, h.xMax - h.xMin, 60);
                ctx.fillStyle = '#ff6644';
                ctx.font = '14px sans-serif';
                ctx.fillText('⚠', (h.xMin + h.xMax) / 2 - 7, y - 10);
            } else if (h.type === 'crumble') {
                ctx.fillStyle = sel ? '#ffaa44' : '#ff8800';
                ctx.fillRect(h.x - S.PLATFORM_W / 2, h.y - S.PLATFORM_H / 2, S.PLATFORM_W, S.PLATFORM_H);
                ctx.strokeStyle = '#cc6600';
                ctx.strokeRect(h.x - S.PLATFORM_W / 2, h.y - S.PLATFORM_H / 2, S.PLATFORM_W, S.PLATFORM_H);
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
        level.spawns.forEach((s, i) => {
            const sel = selection?.category === 'spawns' && selection.index === i;
            const y = s.y ?? (S.GROUND_Y - 4);
            const r = 14;
            ctx.fillStyle = spawnColor(s.type, sel);
            ctx.beginPath();
            // 圆底边 = y（与游戏内脚底坐标一致）
            ctx.arc(s.x, y - r, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(spawnLabel(s.type), s.x, y - r + 4);
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

        const bx = level.width - (level.boss.xOffset || 240);
        const by = S.GAME_HEIGHT - (level.boss.yOffset || 80);
        const bSel = selection?.category === 'boss';
        ctx.fillStyle = bSel ? '#dd66ff' : '#cc44ff';
        ctx.fillRect(bx - 20, by - 20, 40, 40);
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Boss', bx, by + 4);
        ctx.textAlign = 'left';
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
        if (selection.category !== 'platforms' && selection.category !== 'pickups') {
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
            level.playerStart.yOffset = S.GAME_HEIGHT - S.snap(wy);
            selection = { category: 'playerStart', index: 0 };
            refreshAll();
            return;
        }
        if (kind === 'boss') {
            pushUndo();
            level.boss.xOffset = level.width - S.snap(wx);
            level.boss.yOffset = S.GAME_HEIGHT - S.snap(wy);
            selection = { category: 'boss', index: 0 };
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
                });
                return;
            }
            const val = opts.value !== undefined ? opts.value : (Array.isArray(data) ? data[opts.idx] : data[key]);
            row.innerHTML = `<label for="${id}">${label}</label><input id="${id}" type="${type}" value="${val ?? ''}"${opts.step ? ` step="${opts.step}"` : ''}>`;
            form.appendChild(row);
            row.querySelector('input').addEventListener('change', e => {
                pushUndo();
                const v = type === 'number' ? parseFloat(e.target.value) : e.target.value;
                applyPropChange(key, v, opts.idx);
            });
        };

        const applyPropChange = (key, v, idx) => {
            if (selection.category === 'platforms') {
                const p = [...level.platforms[selection.index]];
                if (key === 'x') p[0] = S.snap(v);
                else if (key === 'y') p[1] = S.snap(v);
                else if (key === 'count') p[2] = Math.max(1, Math.round(v));
                level.platforms[selection.index] = p;
            } else if (selection.category === 'playerStart') {
                if (key === 'x') level.playerStart.x = S.snap(v);
                else if (key === 'yOffset') level.playerStart.yOffset = v;
            } else if (selection.category === 'boss') {
                level.boss[key] = v;
            } else if (selection.category === 'hazards' && level.hazards[selection.index].type === 'missile') {
                const h = { ...level.hazards[selection.index] };
                h[key] = S.snap(v);
                level.hazards[selection.index] = h;
            } else {
                const item = { ...getSelectionData() };
                if (key === 'dir') item[key] = parseInt(v, 10);
                else if (typeof v === 'number' && key !== 'type' && !['hp', 'amount', 'period', 'activeDuration', 'damage', 'delay', 'respawn', 'interval', 'force'].includes(key)) {
                    item[key] = S.snap(v);
                }
                else item[key] = v;
                setSelectionData(item);
            }
            refreshAll(false);
        };

        if (selection.category === 'platforms') {
            addField('X（首块中心）', 'x', 'number', { value: data[0] });
            addField('Y', 'y', 'number', { value: data[1] });
            addField('段数 count', 'count', 'number', { value: data[2] });
        } else if (selection.category === 'walls' || selection.category === 'destructibleWalls') {
            addField('X', 'x', 'number', { value: data.x });
            addField('Y', 'y', 'number', { value: data.y });
            addField('宽度 w', 'w', 'number', { value: data.w });
            addField('高度 h', 'h', 'number', { value: data.h });
            if (selection.category === 'destructibleWalls') {
                addField('耐久 hp', 'hp', 'number', { value: data.hp ?? 3 });
            }
        } else if (selection.category === 'pickups') {
            addField('X', 'x', 'number', { value: data.x });
            addField('Y', 'y', 'number', { value: data.y ?? (S.GROUND_Y - 4) });
            addField('回血量 amount', 'amount', 'number', { value: data.amount ?? 30 });
        } else if (selection.category === 'spawns') {
            addField('X', 'x', 'number', { value: data.x });
            addField('Y', 'y', 'number', { value: data.y ?? (S.GROUND_Y - 4) });
            addField('类型', 'type', 'select', {
                value: data.type,
                options: [
                    { v: 'melee', t: '近战' },
                    { v: 'ranged', t: '远程' },
                    { v: 'flying', t: '飞行' }
                ]
            });
        } else if (selection.category === 'hazards') {
            if (data.type === 'electric') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w });
                addField('高 h', 'h', 'number', { value: data.h });
                addField('周期 period (ms)', 'period', 'number', { value: data.period });
                addField('激活时长 activeDuration (ms)', 'activeDuration', 'number', { value: data.activeDuration });
                addField('伤害 damage', 'damage', 'number', { value: data.damage });
            } else if (data.type === 'wind') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('宽 w', 'w', 'number', { value: data.w });
                addField('高 h', 'h', 'number', { value: data.h });
                addField('力度 force', 'force', 'number', { value: data.force });
                addField('方向 dir', 'dir', 'select', { value: data.dir, options: [{ v: '1', t: '向右 →' }, { v: '-1', t: '向左 ←' }] });
            } else if (data.type === 'missile') {
                addField('X 最小 xMin', 'xMin', 'number', { value: data.xMin });
                addField('X 最大 xMax', 'xMax', 'number', { value: data.xMax });
                addField('Y', 'y', 'number', { value: data.y ?? (S.GROUND_Y - 4) });
                addField('间隔 interval (ms)', 'interval', 'number', { value: data.interval });
                addField('伤害 damage', 'damage', 'number', { value: data.damage });
            } else if (data.type === 'crumble') {
                addField('X', 'x', 'number', { value: data.x });
                addField('Y', 'y', 'number', { value: data.y });
                addField('延迟 delay (ms)', 'delay', 'number', { value: data.delay });
                addField('重生 respawn (ms)', 'respawn', 'number', { value: data.respawn });
            }
        } else if (selection.category === 'playerStart') {
            addField('X', 'x', 'number', { value: data.x });
            addField('yOffset（距底边）', 'yOffset', 'number', { value: data.yOffset });
        } else if (selection.category === 'boss') {
            addField('Boss 类型', 'type', 'select', {
                value: data.type,
                options: [
                    { v: 'steelTriceratops', t: 'steelTriceratops' },
                    { v: 'mechanicalDino', t: 'mechanicalDino' }
                ]
            });
            addField('xOffset（距右边缘）', 'xOffset', 'number', { value: data.xOffset });
            addField('yOffset（距底边）', 'yOffset', 'number', { value: data.yOffset });
        }

        if (selection.category !== 'playerStart' && selection.category !== 'boss') {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'btn delete-btn';
            del.textContent = '删除此元素';
            del.addEventListener('click', () => {
                pushUndo();
                level[selection.category].splice(selection.index, 1);
                selection = null;
                refreshAll();
            });
            form.appendChild(del);
        }
    }

    function buildLevelForm() {
        const form = document.getElementById('level-form');
        const fields = [
            { section: '基本信息', items: [
                ['id', '关卡 ID', 'number'],
                ['title', '标题', 'text'],
                ['subtitle', '副标题', 'text'],
                ['width', '关卡宽度 (px)', 'number']
            ]},
            { section: 'Boss', items: [
                ['bossTriggerOffset', 'Boss 触发距右边缘 (px)', 'number']
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
                    if (v === '' && k.includes('Url')) level[k] = null;
                    else level[k] = v;
                    if (k === 'bgUrl') loadBgForLevel();
                    refreshAll(false);
                });
            });
        });
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
            `${level.title} · 宽 ${level.width}px · 平台 ${level.platforms.length} · 墙 ${level.walls.length} · 可破坏 ${level.destructibleWalls.length} · 道具 ${level.pickups.length} · 机关 ${level.hazards.length}`;
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
            const by = S.GAME_HEIGHT - (level.boss.yOffset || 80);
            return { x: worldX - bx, y: worldY - by };
        }
        if (category === 'hazards' && data.type === 'missile') {
            const cy = (data.y ?? (S.GROUND_Y - 4));
            return { x: worldX - (data.xMin + data.xMax) / 2, y: worldY - cy };
        }
        if (category === 'spawns' || category === 'pickups') {
            return {
                x: worldX - data.x,
                y: worldY - (data.y ?? (S.GROUND_Y - 4))
            };
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
            level.platforms[selection.index] = [worldX - ox, worldY - oy, data[2]];
        } else if (selection.category === 'playerStart') {
            level.playerStart.x = worldX - ox;
            level.playerStart.yOffset = S.GAME_HEIGHT - (worldY - oy);
        } else if (selection.category === 'boss') {
            level.boss.xOffset = level.width - (worldX - ox);
            level.boss.yOffset = S.GAME_HEIGHT - (worldY - oy);
        } else if (selection.category === 'hazards' && data.type === 'missile') {
            const h = { ...data };
            const halfW = (h.xMax - h.xMin) / 2;
            const cx = worldX - ox;
            const cy = worldY - oy;
            h.xMin = cx - halfW;
            h.xMax = cx + halfW;
            h.y = cy;
            level.hazards[selection.index] = h;
        } else if (selection.category === 'spawns') {
            const item = { ...data };
            item.x = worldX - ox;
            item.y = worldY - oy;
            setSelectionData(item);
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
            level.platforms[selection.index] = [data[0] + dx, data[1] + dy, data[2]];
        } else if (selection.category === 'playerStart') {
            level.playerStart.x = level.playerStart.x + dx;
            level.playerStart.yOffset = level.playerStart.yOffset - dy;
        } else if (selection.category === 'boss') {
            level.boss.xOffset = level.boss.xOffset - dx;
            level.boss.yOffset = level.boss.yOffset - dy;
        } else if (selection.category === 'hazards' && data.type === 'missile') {
            const h = { ...data };
            h.xMin = h.xMin + dx;
            h.xMax = h.xMax + dx;
            h.y = (h.y ?? (S.GROUND_Y - 4)) + dy;
            level.hazards[selection.index] = h;
        } else if (selection.category === 'spawns') {
            const item = { ...data };
            item.x = item.x + dx;
            item.y = (item.y ?? (S.GROUND_Y - 4)) + dy;
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
            level.platforms[selection.index] = [S.snap(data[0]), S.snap(data[1]), data[2]];
        } else if (selection.category === 'playerStart') {
            level.playerStart.x = S.snap(level.playerStart.x);
            level.playerStart.yOffset = S.GAME_HEIGHT - S.snap(S.playerY(level));
        } else if (selection.category === 'boss') {
            const bx = level.width - level.boss.xOffset;
            const by = S.GAME_HEIGHT - level.boss.yOffset;
            level.boss.xOffset = level.width - S.snap(bx);
            level.boss.yOffset = S.GAME_HEIGHT - S.snap(by);
        } else if (selection.category === 'hazards' && data.type === 'missile') {
            const h = { ...data };
            h.xMin = S.snap(h.xMin);
            h.xMax = S.snap(h.xMax);
            h.y = S.snap(h.y ?? (S.GROUND_Y - 4));
            level.hazards[selection.index] = h;
        } else if (selection.category === 'spawns') {
            const item = { ...data };
            item.x = S.snap(item.x);
            // Y 不吸附网格，避免松手时与拖动位置上下错位（平台/飞行高度）
            item.y = item.y ?? (S.GROUND_Y - 4);
            setSelectionData(item);
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
        } else if (resizeState) {
            render();
            buildPropsForm();
        }

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
            const newCount = Math.max(1, Math.round((S.snap(wx) - (data[0] - S.PLATFORM_W / 2)) / S.PLATFORM_W));
            level.platforms[selection.index] = [data[0], data[1], newCount];
            return;
        }
        const item = { ...data };
        const b = S.getItemBounds(selection.category, data, level);
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
        if (selection.category === 'hazards' && item.type === 'missile') {
            if (handle === 'e') item.xMax = S.snap(wx);
        } else {
            setSelectionData(item);
        }
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

        const hit = hitTest(w.x, w.y);
        if (hit) {
            selection = hit;
            const hitData = hit.category === 'playerStart'
                ? level.playerStart
                : hit.category === 'boss'
                    ? level.boss
                    : level[hit.category]?.[hit.index];
            const grab = getDragGrabOffset(hit.category, hitData, w.x, w.y);
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
        refreshAll(false);
        buildPropsForm();
        buildHierarchy();
    });

    viewport.addEventListener('auxclick', e => {
        if (e.button === 1) e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
        const w = screenToWorld(e.clientX, e.clientY);
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
        zoom = Math.min(1, viewport.clientWidth / level.width);
        document.getElementById('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
        render();
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
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selection && selection.category !== 'playerStart' && selection.category !== 'boss') {
                pushUndo();
                level[selection.category].splice(selection.index, 1);
                selection = null;
                refreshAll();
            }
        }
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
        if (e.key === 'v' || e.key === 'V') document.querySelector('[data-tool="select"]').click();
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

    init();
})();
