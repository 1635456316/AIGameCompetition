/**
 * 关卡编辑器 — 常量、元素定义、导入导出
 */
const LevelEditorSchema = (() => {
    const GAME_HEIGHT = 720;
    const GROUND_TILE = 64;
    const GROUND_Y = GAME_HEIGHT - GROUND_TILE;
    const PLATFORM_W = 96;
    const PLATFORM_H = 20;

    function platformHeight(entry) {
        return entry[3] ?? PLATFORM_H;
    }

    function platformSegmentCount(entry) {
        return entry[2] ?? 1;
    }

    const PICKUP_SIZE = 28;

    const PALETTE = [
        {
            category: '地形',
            items: [
                { kind: 'platform', label: '浮空平台', icon: '▬', color: '#7b5ea7' },
                { kind: 'wall', label: '竖墙', icon: '▮', color: '#566578' },
                { kind: 'destructible_wall', label: '可破坏墙', icon: '▨', color: '#8a7a62' },
                { kind: 'system_wall', label: '系统墙', icon: '⛨', color: '#6688aa' }
            ]
        },
        {
            category: '道具',
            items: [
                { kind: 'health_pickup', label: '回血道具', icon: '♥', color: '#44dd88' },
                { kind: 'energy_pickup', label: '回能量道具', icon: '⚡', color: '#44aaff' }
            ]
        },
        {
            category: '机关',
            items: [
                { kind: 'electric', label: '电磁区', icon: '⚡', color: '#00e5ff' },
                { kind: 'wind', label: '风力区', icon: '💨', color: '#aaccff' },
                { kind: 'missile', label: '导弹打击', icon: '🚀', color: '#ff6644' },
                { kind: 'crumble', label: '坍塌平台', icon: '▧', color: '#ff8800' },
                { kind: 'death', label: '必死区', icon: '☠', color: '#ff2244' },
                { kind: 'hint', label: '提示区', icon: '💬', color: '#ffdd44' }
            ]
        },
        {
            category: '实体',
            items: [
                { kind: 'spawn_melee', label: '近战敌人', icon: '⚔', color: '#ff5566' },
                { kind: 'spawn_ranged', label: '远程敌人', icon: '🏹', color: '#ff8866' },
                { kind: 'spawn_flying', label: '飞行敌人', icon: '🪽', color: '#66bbff' }
            ]
        },
        {
            category: '标记',
            items: [
                { kind: 'player_start', label: '玩家出生', icon: '★', color: '#44ff88' },
                { kind: 'checkpoint', label: '复活点', icon: '⛳', color: '#44cc88' },
                { kind: 'boss', label: 'Boss 位置', icon: '👹', color: '#cc44ff' },
                { kind: 'finish', label: '终点', icon: '🏁', color: '#ffcc44' }
            ]
        }
    ];

    const ENEMY_DEFAULT_HP = { melee: 50, ranged: 35, flying: 30 };

    function spawnDefaultHp(type) {
        return ENEMY_DEFAULT_HP[type] ?? ENEMY_DEFAULT_HP.melee;
    }

    function createEmptyLevel(id = 1) {
        return {
            id,
            title: `第 ${id} 关 · 新关卡`,
            subtitle: '',
            width: 2400,
            playerStart: { x: 160, yOffset: 120 },
            energyStartPercent: 0,
            energyRegenRate: 0,
            hpStartPercent: 100,
            enemyKillEnergy: 10,
            bossTriggerOffset: 600,
            boss: { type: 'steelTriceratops', xOffset: 240, yOffset: 80 },
            finish: null,
            startVideoUrl: null,
            endVideoUrl: null,
            normalBgmUrl: null,
            bossBgmUrl: null,
            bgUrl: null,
            resultBgUrl: null,
            platforms: [],
            walls: [],
            destructibleWalls: [],
            systemWalls: [],
            pickups: [],
            spawns: [],
            hazards: []
        };
    }

    function normalizeLevel(raw) {
        const level = { ...createEmptyLevel(raw.id || 1), ...raw };
        level.playerStart = { x: 160, yOffset: 120, ...(raw.playerStart || {}) };
        level.energyStartPercent = hazardNumber(raw.energyStartPercent, 0);
        level.energyRegenRate = hazardNumber(raw.energyRegenRate, 0);
        level.hpStartPercent = hazardNumber(raw.hpStartPercent, 100);
        level.enemyKillEnergy = hazardNumber(raw.enemyKillEnergy, 10);
        if (level.enemyKillEnergy < 0) level.enemyKillEnergy = 0;
        if (isFinishLevel(raw)) {
            level.finish = { w: 80, h: 80, ...(raw.finish || {}) };
            level.boss = null;
        } else {
            level.finish = null;
            level.boss = { type: 'steelTriceratops', xOffset: 240, yOffset: 80, ...(raw.boss || {}) };
        }
        level.platforms = (raw.platforms || []).map(p => [...p]);
        level.walls = (raw.walls || []).map(w => ({ ...w }));
        level.destructibleWalls = (raw.destructibleWalls || []).map(w => ({
            hp: 3,
            ...w
        }));
        level.systemWalls = (raw.systemWalls || []).map(w => ({ ...w }));
        level.pickups = (raw.pickups || []).map(p => {
            const type = p.type || 'health';
            const defaults = type === 'energy'
                ? { type: 'energy', amount: 25 }
                : { type: 'health', amount: 30 };
            return { ...defaults, ...p, type };
        });
        level.spawns = (raw.spawns || []).map(s => {
            const type = s.type || 'melee';
            const out = {
                type,
                x: s.x,
                y: s.y != null ? s.y : GROUND_Y - 4
            };
            if (s.hp != null && !Number.isNaN(s.hp)) out.hp = Math.max(1, s.hp);
            if (s.killEnergy != null && !Number.isNaN(s.killEnergy)) {
                out.killEnergy = Math.max(0, s.killEnergy);
            }
            if (s.id != null && s.id !== '') out.id = String(s.id);
            return out;
        });
        level.hazards = (raw.hazards || []).map(h => normalizeCheckpoint({ ...h }));
        return level;
    }

    /** 复活点：x,y = 脚底（与出生点/敌人生成一致）；旧版中心坐标自动迁移 */
    function normalizeCheckpoint(h) {
        if (h.type !== 'checkpoint') return h;
        const out = {
            ...h,
            respawnHpPercent: hazardNumber(h.respawnHpPercent, 100),
            respawnEnergyPercent: hazardNumber(h.respawnEnergyPercent, 100)
        };
        if (out.feetAnchor) return out;
        const hh = h.h ?? 120;
        return {
            ...out,
            y: h.y + hh / 2,
            feetAnchor: true
        };
    }

    function checkpointBounds(feetX, feetY, w, h) {
        return { x: feetX - w / 2, y: feetY - h, w, h };
    }

    /** 编辑器内：把点击位置吸附到脚下平台顶面（仅编辑器放置辅助） */
    function resolveStandingFeetY(level, feetX, hintY) {
        const tops = [];
        (level.platforms || []).forEach(([px, py, count, ph]) => {
            const h = ph ?? PLATFORM_H;
            for (let i = 0; i < count; i++) {
                const platX = px + i * PLATFORM_W;
                if (feetX < platX - PLATFORM_W / 2 - 6 || feetX > platX + PLATFORM_W / 2 + 6) continue;
                tops.push(py - h / 2);
            }
        });
        tops.push(GROUND_Y);
        let best = hintY;
        let bestScore = Infinity;
        for (const top of tops) {
            const score = Math.abs(top - hintY) + (top > hintY + 24 ? 800 : 0);
            if (score < bestScore) {
                bestScore = score;
                best = top;
            }
        }
        return best;
    }

    function createFromPalette(kind, x, y) {
        const sx = snap(x);
        const sy = snap(y);
        switch (kind) {
            case 'platform':
                return { category: 'platforms', data: [sx, sy, 1] };
            case 'wall':
                return { category: 'walls', data: { x: sx, y: sy, w: 32, h: 200 } };
            case 'destructible_wall':
                return { category: 'destructibleWalls', data: { x: sx, y: sy, w: 32, h: 200, hp: 3 } };
            case 'system_wall':
                return { category: 'systemWalls', data: { x: sx, y: sy, w: 32, h: 200, bindEnemyId: '' } };
            case 'health_pickup':
                return { category: 'pickups', data: { type: 'health', x: sx, y: sy, amount: 30 } };
            case 'energy_pickup':
                return { category: 'pickups', data: { type: 'energy', x: sx, y: sy, amount: 25 } };
            case 'electric':
                return { category: 'hazards', data: { type: 'electric', x: sx, y: sy, w: 140, h: 60, period: 2400, activeDuration: 1000, damage: 6 } };
            case 'wind':
                return { category: 'hazards', data: { type: 'wind', x: sx, y: sy, w: 200, h: 300, force: 180, dir: 1 } };
            case 'missile':
                return { category: 'hazards', data: { type: 'missile', xMin: sx - 80, xMax: sx + 80, y: GROUND_Y - 4, interval: 3000, damage: 12 } };
            case 'crumble':
                return { category: 'hazards', data: { type: 'crumble', x: sx, y: sy, delay: 800, respawn: 4000 } };
            case 'death':
                return { category: 'hazards', data: { type: 'death', x: sx, y: sy, w: 96, h: 24 } };
            case 'hint':
                return { category: 'hazards', data: { type: 'hint', x: sx, y: sy, w: 180, h: 100, text: '操作提示', once: true } };
            case 'checkpoint':
                return { category: 'hazards', data: { type: 'checkpoint', x: sx, y: sy, w: 80, h: 60, feetAnchor: true, respawnHpPercent: 100, respawnEnergyPercent: 100 } };
            case 'spawn_melee':
                return { category: 'spawns', data: { type: 'melee', x: sx, y: sy } };
            case 'spawn_ranged':
                return { category: 'spawns', data: { type: 'ranged', x: sx, y: sy } };
            case 'spawn_flying':
                return { category: 'spawns', data: { type: 'flying', x: sx, y: sy - 120 } };
            default:
                return null;
        }
    }

    let gridSize = 8;
    function snap(v) {
        return Math.round(v / gridSize) * gridSize;
    }
    function setGridSize(n) {
        gridSize = n;
    }
    function getGridSize() {
        return gridSize;
    }

    function getItemBounds(category, data, level) {
        switch (category) {
            case 'platforms': {
                const [x, y, count] = data;
                const h = platformHeight(data);
                const w = count * PLATFORM_W;
                return { x: x - PLATFORM_W / 2, y: y - h / 2, w, h };
            }
            case 'walls':
            case 'destructibleWalls':
            case 'systemWalls':
                return { x: data.x - data.w / 2, y: data.y - data.h / 2, w: data.w, h: data.h };
            case 'pickups': {
                const y = data.y ?? (GROUND_Y - 4);
                return { x: data.x - PICKUP_SIZE / 2, y: y - PICKUP_SIZE / 2, w: PICKUP_SIZE, h: PICKUP_SIZE };
            }
            case 'hazards':
                if (data.type === 'missile') {
                    const y = data.y ?? (GROUND_Y - 4);
                    return { x: data.xMin, y: y - 30, w: data.xMax - data.xMin, h: 60 };
                }
                if (data.type === 'crumble') {
                    return { x: data.x - PLATFORM_W / 2, y: data.y - PLATFORM_H / 2, w: PLATFORM_W, h: PLATFORM_H };
                }
                if (data.type === 'checkpoint') {
                    const w = data.w ?? 80;
                    const h = data.h ?? 60;
                    return checkpointBounds(data.x, data.y, w, h);
                }
                if (data.type === 'death' || data.type === 'hint' || data.type === 'electric' || data.type === 'wind') {
                    return { x: data.x - data.w / 2, y: data.y - data.h / 2, w: data.w, h: data.h };
                }
                return { x: data.x - data.w / 2, y: data.y - data.h / 2, w: data.w, h: data.h };
            case 'spawns': {
                const y = data.y ?? (GROUND_Y - 4);
                // y 为脚底坐标，与画布圆点底边对齐
                return { x: data.x - 16, y: y - 28, w: 32, h: 28 };
            }
            case 'playerStart': {
                const px = level.playerStart.x;
                const py = GAME_HEIGHT - level.playerStart.yOffset;
                return { x: px - 16, y: py - 24, w: 32, h: 32 };
            }
            case 'boss': {
                const bx = level.width - (level.boss.xOffset || 240);
                const by = GAME_HEIGHT - (level.boss.yOffset || 80);
                return { x: bx - 24, y: by - 24, w: 48, h: 48 };
            }
            case 'finish': {
                const f = level.finish || data;
                return { x: f.x - f.w / 2, y: f.y - f.h / 2, w: f.w, h: f.h };
            }
            default:
                return { x: 0, y: 0, w: 0, h: 0 };
        }
    }

    function getItemLabel(category, data, index) {
        switch (category) {
            case 'platforms': {
                const h = platformHeight(data);
                const extra = h > PLATFORM_H ? ` · 高 ${h}` : '';
                return `平台 #${index + 1} (${data[2]}段${extra})`;
            }
            case 'walls':
                return `竖墙 #${index + 1}`;
            case 'destructibleWalls':
                return `可破坏墙 #${index + 1} (HP ${data.hp ?? 3})`;
            case 'systemWalls': {
                const bind = data.bindEnemyId != null && data.bindEnemyId !== ''
                    ? ` → ${data.bindEnemyId}`
                    : '（未绑定）';
                return `系统墙 #${index + 1}${bind}`;
            }
            case 'pickups':
                if (data.type === 'energy') return `回能量 #${index + 1} (+${data.amount ?? 25})`;
                return data.type === 'health' ? `回血 #${index + 1} (+${data.amount ?? 30})` : `道具 #${index + 1}`;
            case 'spawns': {
                const labels = { melee: '近战', ranged: '远程', flying: '飞行' };
                const hp = data.hp ?? spawnDefaultHp(data.type);
                const en = data.killEnergy;
                let extra = ` HP${hp}`;
                if (en != null) extra += ` +${en}EN`;
                if (data.id != null && data.id !== '') extra += ` id:${data.id}`;
                return `${labels[data.type] || data.type} #${index + 1} (${extra.trim()})`;
            }
            case 'hazards': {
                const labels = {
                    electric: '电磁区', wind: '风力区', missile: '导弹', crumble: '坍塌',
                    checkpoint: '复活点', death: '必死区', hint: '提示区'
                };
                const name = labels[data.type] || data.type;
                if (data.type === 'checkpoint') {
                    const hp = data.respawnHpPercent ?? 100;
                    const en = data.respawnEnergyPercent ?? 100;
                    const notes = [];
                    if (hp !== 100) notes.push(`HP ${hp}%`);
                    if (en !== 100) notes.push(`EN ${en}%`);
                    const extra = notes.length ? ` · 复活 ${notes.join(' · ')}` : '';
                    return `${name} #${index + 1}${extra}`;
                }
                if (data.type === 'hint') {
                    const preview = data.text ? `: ${data.text.slice(0, 12)}` : '';
                    const bind = data.bindEnemyId != null && data.bindEnemyId !== ''
                        ? ` → ${data.bindEnemyId}`
                        : '';
                    return `${name} #${index + 1}${preview}${bind}`;
                }
                return `${name} #${index + 1}`;
            }
            case 'playerStart':
                return '玩家出生点';
            case 'boss':
                return 'Boss 位置';
            case 'finish':
                return '终点';
            default:
                return `#${index + 1}`;
        }
    }

    function listAllItems(level) {
        const items = [];
        level.platforms.forEach((data, index) => items.push({ category: 'platforms', index, data }));
        level.walls.forEach((data, index) => items.push({ category: 'walls', index, data }));
        level.destructibleWalls.forEach((data, index) => items.push({ category: 'destructibleWalls', index, data }));
        level.systemWalls.forEach((data, index) => items.push({ category: 'systemWalls', index, data }));
        level.pickups.forEach((data, index) => items.push({ category: 'pickups', index, data }));
        level.spawns.forEach((data, index) => items.push({ category: 'spawns', index, data }));
        level.hazards.forEach((data, index) => items.push({ category: 'hazards', index, data }));
        items.push({ category: 'playerStart', index: 0, data: level.playerStart });
        if (isBossLevel(level)) {
            items.push({ category: 'boss', index: 0, data: level.boss });
        }
        if (isFinishLevel(level)) {
            items.push({ category: 'finish', index: 0, data: level.finish });
        }
        return items;
    }

    function isFinishLevel(level) {
        const f = level?.finish;
        return f != null && typeof f.x === 'number' && !Number.isNaN(f.x);
    }

    function isBossLevel(level) {
        return !isFinishLevel(level) && level?.boss != null;
    }

    function exportLevel(level) {
        const out = normalizeLevel(level);
        const payload = { ...out };
        if (isFinishLevel(payload)) {
            delete payload.boss;
        } else {
            delete payload.finish;
        }
        return JSON.stringify(payload, null, 2);
    }

    function validateLevel(level) {
        const errors = [];
        const normalized = normalizeLevel(level);

        if (!normalized.id) errors.push('缺少关卡 id');
        if (!normalized.width || normalized.width < 800) errors.push('关卡宽度 width 应 >= 800');
        if (!normalized.playerStart) {
            errors.push('缺少玩家出生点');
        } else {
            if (typeof normalized.playerStart.x !== 'number' || Number.isNaN(normalized.playerStart.x)) {
                errors.push('玩家出生点 X 无效');
            }
            if (typeof normalized.playerStart.yOffset !== 'number' || Number.isNaN(normalized.playerStart.yOffset)) {
                errors.push('玩家出生点 yOffset 无效');
            }
        }

        const boss = isBossLevel(normalized);
        const finish = isFinishLevel(normalized);
        if (boss && finish) errors.push('Boss 与终点不能同时存在');
        if (!boss && !finish) errors.push('须设置 Boss 或终点之一作为通关条件');

        if (finish) {
            const f = normalized.finish;
            if (typeof f.y !== 'number' || Number.isNaN(f.y)) errors.push('终点 Y 无效');
            if (!f.w || f.w < 16) errors.push('终点宽度 w 应 >= 16');
            if (!f.h || f.h < 16) errors.push('终点高度 h 应 >= 16');
        }

        if (boss) {
            const b = normalized.boss;
            if (!b.type) errors.push('Boss 缺少 type');
            if (typeof b.xOffset !== 'number' || Number.isNaN(b.xOffset)) errors.push('Boss xOffset 无效');
            if (typeof b.yOffset !== 'number' || Number.isNaN(b.yOffset)) errors.push('Boss yOffset 无效');
        }

        if (normalized.energyStartPercent < 0 || normalized.energyStartPercent > 100) {
            errors.push('能量初始百分比 energyStartPercent 应在 0–100');
        }
        if (normalized.hpStartPercent < 0 || normalized.hpStartPercent > 100) {
            errors.push('血量初始百分比 hpStartPercent 应在 0–100');
        }
        if (normalized.energyRegenRate < 0) {
            errors.push('回能量速度 energyRegenRate 不能为负');
        }
        if (normalized.enemyKillEnergy < 0) {
            errors.push('小怪击杀回能 enemyKillEnergy 不能为负');
        }

        const spawnIds = new Set(
            (normalized.spawns || [])
                .map(s => s.id)
                .filter(id => id != null && id !== '')
                .map(id => String(id))
        );
        const seenSpawnIds = new Set();
        (normalized.spawns || []).forEach((s, i) => {
            if (s.id == null || s.id === '') return;
            const id = String(s.id);
            if (seenSpawnIds.has(id)) errors.push(`小怪 id 重复: "${id}"（生成点 #${i + 1}）`);
            seenSpawnIds.add(id);
        });
        (normalized.systemWalls || []).forEach((w, i) => {
            const bind = w.bindEnemyId != null && w.bindEnemyId !== '' ? String(w.bindEnemyId) : '';
            if (!bind) {
                errors.push(`系统墙 #${i + 1} 未设置 bindEnemyId`);
            } else if (!spawnIds.has(bind)) {
                errors.push(`系统墙 #${i + 1} 绑定了不存在的小怪 id: "${bind}"`);
            }
        });
        (normalized.hazards || []).forEach((h, i) => {
            if (h.type !== 'hint') return;
            const bind = h.bindEnemyId != null && h.bindEnemyId !== '' ? String(h.bindEnemyId) : '';
            if (!bind) return;
            if (!spawnIds.has(bind)) {
                errors.push(`提示区 #${i + 1} 绑定了不存在的小怪 id: "${bind}"`);
            }
        });

        return errors;
    }

    function hazardNumber(value, fallback) {
        return typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
    }

    /** period <= 0 表示常开 */
    function electricIsActive(time, period, activeDuration) {
        const p = hazardNumber(period, 2400);
        const d = hazardNumber(activeDuration, 1000);
        if (p <= 0) return true;
        return (time % p) < Math.min(d, p);
    }

    function bossTriggerX(level) {
        return level.width - (level.bossTriggerOffset || 600);
    }

    function playerY(level) {
        return GAME_HEIGHT - (level.playerStart?.yOffset || 120);
    }

    /** 清空地图元素，保留关卡 ID、宽度、Boss/媒体等元数据 */
    function clearLevelContent(level) {
        level.platforms = [];
        level.walls = [];
        level.destructibleWalls = [];
        level.systemWalls = [];
        level.pickups = [];
        level.spawns = [];
        level.hazards = [];
        level.playerStart = { x: 160, yOffset: 120 };
        level.finish = null;
        return level;
    }

    /**
     * 在 atX 处插入空白段：关卡宽度 +length，所有锚点 x >= atX 的元素右移 length。
     * Boss 以 xOffset 存于右缘；仅当插入点在 Boss 左侧时才随宽度右移。
     */
    function insertBlankSpace(level, atX, length) {
        const P = snap(atX);
        const L = Math.max(snap(length), getGridSize());
        if (L <= 0) return level;

        const shiftIf = (x) => (typeof x === 'number' && !Number.isNaN(x) && x >= P ? x + L : x);

        level.platforms = level.platforms.map(p => {
            if (p[0] >= P) {
                const out = [p[0] + L, p[1], p[2]];
                if (p[3] != null) out[3] = p[3];
                return out;
            }
            return p;
        });
        level.walls = level.walls.map(w => (w.x >= P ? { ...w, x: w.x + L } : w));
        level.destructibleWalls = level.destructibleWalls.map(w => (w.x >= P ? { ...w, x: w.x + L } : w));
        level.systemWalls = level.systemWalls.map(w => (w.x >= P ? { ...w, x: w.x + L } : w));
        level.pickups = level.pickups.map(p => (p.x >= P ? { ...p, x: p.x + L } : p));
        level.spawns = level.spawns.map(s => (s.x >= P ? { ...s, x: s.x + L } : s));
        level.hazards = level.hazards.map(h => {
            if (h.type === 'missile') {
                if (h.xMin >= P) return { ...h, xMin: h.xMin + L, xMax: h.xMax + L };
                return h;
            }
            if (typeof h.x === 'number' && h.x >= P) return { ...h, x: h.x + L };
            return h;
        });

        if (level.playerStart?.x >= P) {
            level.playerStart = { ...level.playerStart, x: shiftIf(level.playerStart.x) };
        }
        if (level.finish?.x >= P) {
            level.finish = { ...level.finish, x: shiftIf(level.finish.x) };
        }
        if (isBossLevel(level) && level.boss) {
            const bossX = level.width - (level.boss.xOffset || 240);
            if (bossX >= P) {
                // 宽度增加后 Boss 自然右移
            } else {
                level.boss = { ...level.boss, xOffset: (level.boss.xOffset || 240) + L };
            }
        }

        level.width = (level.width || 2400) + L;
        return level;
    }

    return {
        GAME_HEIGHT,
        GROUND_TILE,
        GROUND_Y,
        PLATFORM_W,
        PLATFORM_H,
        platformHeight,
        platformSegmentCount,
        PICKUP_SIZE,
        PALETTE,
        createEmptyLevel,
        normalizeLevel,
        createFromPalette,
        snap,
        setGridSize,
        getGridSize,
        getItemBounds,
        getItemLabel,
        listAllItems,
        exportLevel,
        validateLevel,
        isFinishLevel,
        isBossLevel,
        bossTriggerX,
        playerY,
        checkpointBounds,
        normalizeCheckpoint,
        resolveStandingFeetY,
        electricIsActive,
        spawnDefaultHp,
        ENEMY_DEFAULT_HP,
        clearLevelContent,
        insertBlankSpace
    };
})();
