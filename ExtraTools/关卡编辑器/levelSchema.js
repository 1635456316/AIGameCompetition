/**
 * 关卡编辑器 — 常量、元素定义、导入导出
 */
const LevelEditorSchema = (() => {
    const GAME_HEIGHT = 720;
    const GROUND_TILE = 64;
    const GROUND_Y = GAME_HEIGHT - GROUND_TILE;
    const PLATFORM_W = 96;
    const PLATFORM_H = 20;

    const PICKUP_SIZE = 28;

    const PALETTE = [
        {
            category: '地形',
            items: [
                { kind: 'platform', label: '浮空平台', icon: '▬', color: '#7b5ea7' },
                { kind: 'wall', label: '竖墙', icon: '▮', color: '#566578' },
                { kind: 'destructible_wall', label: '可破坏墙', icon: '▨', color: '#8a7a62' }
            ]
        },
        {
            category: '道具',
            items: [
                { kind: 'health_pickup', label: '回血道具', icon: '♥', color: '#44dd88' }
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
                { kind: 'boss', label: 'Boss 位置', icon: '👹', color: '#cc44ff' }
            ]
        }
    ];

    function createEmptyLevel(id = 1) {
        return {
            id,
            title: `第 ${id} 关 · 新关卡`,
            subtitle: '',
            width: 2400,
            playerStart: { x: 160, yOffset: 120 },
            bossTriggerOffset: 600,
            boss: { type: 'steelTriceratops', xOffset: 240, yOffset: 80 },
            startVideoUrl: null,
            endVideoUrl: null,
            normalBgmUrl: null,
            bossBgmUrl: null,
            bgUrl: null,
            resultBgUrl: null,
            platforms: [],
            walls: [],
            destructibleWalls: [],
            pickups: [],
            spawns: [],
            hazards: []
        };
    }

    function normalizeLevel(raw) {
        const level = { ...createEmptyLevel(raw.id || 1), ...raw };
        level.playerStart = { x: 160, yOffset: 120, ...(raw.playerStart || {}) };
        level.boss = { type: 'steelTriceratops', xOffset: 240, yOffset: 80, ...(raw.boss || {}) };
        level.platforms = (raw.platforms || []).map(p => [...p]);
        level.walls = (raw.walls || []).map(w => ({ ...w }));
        level.destructibleWalls = (raw.destructibleWalls || []).map(w => ({
            hp: 3,
            ...w
        }));
        level.pickups = (raw.pickups || []).map(p => ({
            type: 'health',
            amount: 30,
            ...p
        }));
        level.spawns = (raw.spawns || []).map(s => ({
            type: s.type || 'melee',
            x: s.x,
            y: s.y != null ? s.y : GROUND_Y - 4
        }));
        level.hazards = (raw.hazards || []).map(h => ({ ...h }));
        return level;
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
            case 'health_pickup':
                return { category: 'pickups', data: { type: 'health', x: sx, y: sy, amount: 30 } };
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
                return { category: 'hazards', data: { type: 'checkpoint', x: sx, y: sy, w: 80, h: 120 } };
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

    let gridSize = 16;
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
                const w = count * PLATFORM_W;
                return { x: x - PLATFORM_W / 2, y: y - PLATFORM_H / 2, w, h: PLATFORM_H };
            }
            case 'walls':
            case 'destructibleWalls':
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
                if (data.type === 'checkpoint' || data.type === 'death' || data.type === 'hint' || data.type === 'electric' || data.type === 'wind') {
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
            default:
                return { x: 0, y: 0, w: 0, h: 0 };
        }
    }

    function getItemLabel(category, data, index) {
        switch (category) {
            case 'platforms':
                return `平台 #${index + 1} (${data[2]}段)`;
            case 'walls':
                return `竖墙 #${index + 1}`;
            case 'destructibleWalls':
                return `可破坏墙 #${index + 1} (HP ${data.hp ?? 3})`;
            case 'pickups':
                return data.type === 'health' ? `回血 #${index + 1} (+${data.amount ?? 30})` : `道具 #${index + 1}`;
            case 'spawns': {
                const labels = { melee: '近战', ranged: '远程', flying: '飞行' };
                return `${labels[data.type] || data.type} #${index + 1}`;
            }
            case 'hazards': {
                const labels = {
                    electric: '电磁区', wind: '风力区', missile: '导弹', crumble: '坍塌',
                    checkpoint: '复活点', death: '必死区', hint: '提示区'
                };
                const name = labels[data.type] || data.type;
                if (data.type === 'hint' && data.text) return `${name} #${index + 1}: ${data.text.slice(0, 12)}`;
                return `${name} #${index + 1}`;
            }
            case 'playerStart':
                return '玩家出生点';
            case 'boss':
                return 'Boss 位置';
            default:
                return `#${index + 1}`;
        }
    }

    function listAllItems(level) {
        const items = [];
        level.platforms.forEach((data, index) => items.push({ category: 'platforms', index, data }));
        level.walls.forEach((data, index) => items.push({ category: 'walls', index, data }));
        level.destructibleWalls.forEach((data, index) => items.push({ category: 'destructibleWalls', index, data }));
        level.pickups.forEach((data, index) => items.push({ category: 'pickups', index, data }));
        level.spawns.forEach((data, index) => items.push({ category: 'spawns', index, data }));
        level.hazards.forEach((data, index) => items.push({ category: 'hazards', index, data }));
        items.push({ category: 'playerStart', index: 0, data: level.playerStart });
        items.push({ category: 'boss', index: 0, data: level.boss });
        return items;
    }

    function exportLevel(level) {
        const out = normalizeLevel(level);
        return JSON.stringify(out, null, 2);
    }

    function validateLevel(level) {
        const errors = [];
        if (!level.id) errors.push('缺少 id');
        if (!level.width || level.width < 800) errors.push('width 应 >= 800');
        if (!level.playerStart) errors.push('缺少 playerStart');
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

    return {
        GAME_HEIGHT,
        GROUND_TILE,
        GROUND_Y,
        PLATFORM_W,
        PLATFORM_H,
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
        bossTriggerX,
        playerY,
        hazardNumber,
        electricIsActive
    };
})();
