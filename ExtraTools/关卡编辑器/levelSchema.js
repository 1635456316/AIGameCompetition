/**
 * 关卡编辑器 — 常量、元素定义、导入导出
 */
const LevelEditorSchema = (() => {
    const GAME_HEIGHT = 720;
    const GROUND_TILE = 64;
    const GROUND_Y = GAME_HEIGHT - GROUND_TILE;
    const MIN_LEVEL_HEIGHT = 480;

    function levelHeight(level) {
        return level?.height || GAME_HEIGHT;
    }

    function groundY(level) {
        return levelHeight(level) - GROUND_TILE;
    }
    const PLATFORM_W = 96;
    const PLATFORM_H = 20;

    function platformHeight(entry) {
        return entry[3] ?? PLATFORM_H;
    }

    function platformSegmentCount(entry) {
        return entry[2] ?? 1;
    }

    const PICKUP_SIZE = 28;
    const SPAWN_RADIUS = 14;

    function getSpawnFeetY(level, spawn) {
        return spawn.y ?? (groundY(level) - 4);
    }

    function hitTestSpawn(worldX, worldY, spawn, level) {
        const feetY = getSpawnFeetY(level, spawn);
        const dx = worldX - spawn.x;
        const dy = worldY - (feetY - SPAWN_RADIUS);
        return dx * dx + dy * dy <= SPAWN_RADIUS * SPAWN_RADIUS;
    }

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
                { kind: 'energy_drain', label: '能量损失区', icon: '🪫', color: '#cc66ee' },
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
                { kind: 'boss_trigger', label: 'Boss 触发框', icon: '⬚', color: '#ff6688' },
                { kind: 'finish', label: '终点', icon: '🏁', color: '#ffcc44' }
            ]
        }
    ];

    const ENEMY_DEFAULT_HP = { melee: 50, ranged: 35, flying: 30 };

    /** 与 js/player/PlayerConfig.js 保持一致的角色默认值 */
    const PLAYER_CONFIG_DEFAULTS = {
        hpStartPercent: 100,
        energyStartPercent: 0,
        energyRegenRate: 0,
        moveSpeed: 320,
        maxJumps: 2,
        jumpVelocity: -720,
        secondJumpVelocity: -560,
        gravity: 1800,
        maxFallVelocity: 1400
    };

    const PLAYER_CONFIG_FIELDS = [
        { section: '生存与能量' },
        { key: 'hpStartPercent', label: '初始血量', unit: '%', clamp: [0, 100] },
        { key: 'energyStartPercent', label: '初始能量', unit: '%', clamp: [0, 100] },
        { key: 'energyRegenRate', label: '回能量速度', unit: '/秒', min: 0 },
        { section: '移动与跳跃' },
        { key: 'moveSpeed', label: '移动速度', unit: 'px/s', optional: true, min: 0 },
        { key: 'maxJumps', label: '跳跃次数', unit: '次', optional: true, integer: true, hint: '负数=无限' },
        { key: 'jumpVelocity', label: '一段跳速度', unit: 'px/s', optional: true, max: 0 },
        { key: 'secondJumpVelocity', label: '二段跳速度', unit: 'px/s', optional: true, max: 0 },
        { section: '物理' },
        { key: 'gravity', label: '重力加速度', unit: 'px/s²', optional: true, min: 0 },
        { key: 'maxFallVelocity', label: '最大下落速度', unit: 'px/s', optional: true, min: 0 }
    ];

    /** 编辑器可选 Boss（须与 BootScene 已加载资源一致） */
    const BOSS_TYPE_OPTIONS = [
        { id: 'steelTriceratops', label: '钢甲三角龙' },
        { id: 'mechanicalDino', label: '机械暴龙' }
    ];

    function spawnDefaultHp(type) {
        return ENEMY_DEFAULT_HP[type] ?? ENEMY_DEFAULT_HP.melee;
    }

    function getBossTypeDefaults(type) {
        if (typeof BossConfigs !== 'undefined' && BossConfigs[type]) {
            const cfg = BossConfigs[type];
            return {
                hp: cfg.hp ?? 800,
                contactDamage: cfg.contactDamage ?? 0
            };
        }
        return { hp: 800, contactDamage: 14 };
    }

    function normalizeBoss(raw) {
        const boss = {
            type: 'steelTriceratops',
            xOffset: 240,
            yOffset: 80,
            ...(raw || {})
        };
        boss.hp = raw?.hp != null ? hazardNumber(raw.hp, null) : null;
        boss.damageMult = raw?.damageMult != null ? hazardNumber(raw.damageMult, null) : null;
        return boss;
    }

    function hasBossTriggerZone(level) {
        const z = level?.bossTriggerZone;
        return z != null && typeof z.x === 'number' && !Number.isNaN(z.x)
            && typeof z.y === 'number' && !Number.isNaN(z.y);
    }

    function normalizeBossTriggerZone(raw) {
        if (!raw || typeof raw.x !== 'number' || Number.isNaN(raw.x)
            || typeof raw.y !== 'number' || Number.isNaN(raw.y)) {
            return null;
        }
        return {
            x: raw.x,
            y: raw.y,
            w: Math.max(16, raw.w ?? 160),
            h: Math.max(16, raw.h ?? 120)
        };
    }

    function createEmptyLevel(id = 1) {
        return {
            id,
            title: `第 ${id} 关 · 新关卡`,
            subtitle: '',
            width: 2400,
            height: GAME_HEIGHT,
            playerStart: { x: 160, yOffset: 120 },
            energyStartPercent: 0,
            energyRegenRate: 0,
            hpStartPercent: 100,
            enemyKillEnergy: 10,
            bossTriggerOffset: 600,
            bossTriggerZone: null,
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
        level.height = hazardNumber(raw.height, GAME_HEIGHT);
        level.playerStart = { x: 160, yOffset: 120, ...(raw.playerStart || {}) };
        level.energyStartPercent = hazardNumber(raw.energyStartPercent, 0);
        level.energyRegenRate = hazardNumber(raw.energyRegenRate, 0);
        level.hpStartPercent = hazardNumber(raw.hpStartPercent, 100);
        level.enemyKillEnergy = hazardNumber(raw.enemyKillEnergy, 10);
        if (level.enemyKillEnergy < 0) level.enemyKillEnergy = 0;

        level.maxJumps = raw.maxJumps != null ? hazardNumber(raw.maxJumps, null) : null;
        level.jumpVelocity = raw.jumpVelocity != null ? hazardNumber(raw.jumpVelocity, null) : null;
        level.secondJumpVelocity = raw.secondJumpVelocity != null ? hazardNumber(raw.secondJumpVelocity, null) : null;
        level.moveSpeed = raw.moveSpeed != null ? hazardNumber(raw.moveSpeed, null) : null;
        level.gravity = raw.gravity != null ? hazardNumber(raw.gravity, null) : null;
        level.maxFallVelocity = raw.maxFallVelocity != null ? hazardNumber(raw.maxFallVelocity, null) : null;
        if (isFinishLevel(raw)) {
            level.finish = { w: 80, h: 80, ...(raw.finish || {}) };
            level.boss = null;
            level.bossTriggerZone = null;
        } else {
            level.finish = null;
            level.boss = normalizeBoss(raw.boss);
            level.bossTriggerZone = normalizeBossTriggerZone(raw.bossTriggerZone);
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
                y: s.y != null ? s.y : groundY(level) - 4
            };
            if (s.hp != null && !Number.isNaN(s.hp)) out.hp = Math.max(1, s.hp);
            if (s.killEnergy != null && !Number.isNaN(s.killEnergy)) {
                out.killEnergy = Math.max(0, s.killEnergy);
            }
            if (s.id != null && s.id !== '') out.id = String(s.id);
            return out;
        });
        level.hazards = (raw.hazards || []).map(h => normalizeCheckpoint(normalizeMissile(normalizeCrumble({ ...h }), level)));
        return level;
    }

    /** 坍塌平台：x,y 为中心，w/h 可调整 */
    function normalizeCrumble(h) {
        if (h.type !== 'crumble') return h;
        return {
            type: 'crumble',
            x: h.x,
            y: h.y,
            w: Math.max(16, h.w ?? PLATFORM_W),
            h: Math.max(16, h.h ?? PLATFORM_H),
            delay: hazardNumber(h.delay, 800),
            respawn: hazardNumber(h.respawn, 4000)
        };
    }

    /** 导弹打击：x,y 为区域中心，w/h 为随机落点范围；兼容旧版 xMin/xMax */
    function normalizeMissile(h, level) {
        if (h.type !== 'missile') return h;
        const gy = level ? groundY(level) : GROUND_Y;
        if (typeof h.x === 'number' && typeof h.w === 'number') {
            return {
                type: 'missile',
                x: h.x,
                y: h.y ?? (gy - 4),
                w: Math.max(16, h.w),
                h: Math.max(16, h.h ?? 60),
                interval: hazardNumber(h.interval, 3000),
                startDelay: hazardNumber(h.startDelay, 0),
                damage: hazardNumber(h.damage, 12)
            };
        }
        const xMin = hazardNumber(h.xMin, 0);
        const xMax = hazardNumber(h.xMax, xMin + 160);
        const y = h.y ?? (gy - 4);
        return {
            type: 'missile',
            x: (xMin + xMax) / 2,
            y,
            w: Math.max(16, xMax - xMin),
            h: Math.max(16, h.h ?? 60),
            interval: hazardNumber(h.interval, 3000),
            startDelay: hazardNumber(h.startDelay, 0),
            damage: hazardNumber(h.damage, 12)
        };
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
        tops.push(groundY(level));
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
            case 'energy_drain':
                return { category: 'hazards', data: { type: 'energy_drain', x: sx, y: sy, w: 140, h: 80, drainRate: 15 } };
            case 'missile':
                return { category: 'hazards', data: { type: 'missile', x: sx, y: sy, w: 160, h: 60, interval: 3000, startDelay: 0, damage: 12 } };
            case 'crumble':
                return { category: 'hazards', data: { type: 'crumble', x: sx, y: sy, w: PLATFORM_W, h: PLATFORM_H, delay: 800, respawn: 4000 } };
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
                return { category: 'spawns', data: { type: 'flying', x: sx, y: sy } };
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
                const y = data.y ?? (groundY(level) - 4);
                return { x: data.x - PICKUP_SIZE / 2, y: y - PICKUP_SIZE / 2, w: PICKUP_SIZE, h: PICKUP_SIZE };
            }
            case 'hazards':
                if (data.type === 'missile') {
                    const m = normalizeMissile(data);
                    return { x: m.x - m.w / 2, y: m.y - m.h / 2, w: m.w, h: m.h };
                }
                if (data.type === 'crumble') {
                    const w = data.w ?? PLATFORM_W;
                    const h = data.h ?? PLATFORM_H;
                    return { x: data.x - w / 2, y: data.y - h / 2, w, h };
                }
                if (data.type === 'checkpoint') {
                    const w = data.w ?? 80;
                    const h = data.h ?? 60;
                    return checkpointBounds(data.x, data.y, w, h);
                }
                if (data.type === 'death' || data.type === 'hint' || data.type === 'electric' || data.type === 'wind' || data.type === 'energy_drain') {
                    return { x: data.x - data.w / 2, y: data.y - data.h / 2, w: data.w, h: data.h };
                }
                return { x: data.x - data.w / 2, y: data.y - data.h / 2, w: data.w, h: data.h };
            case 'spawns': {
                const y = getSpawnFeetY(level, data);
                const d = SPAWN_RADIUS * 2;
                // 圆底边 = y（与画布圆点底边、游戏内脚底坐标一致）
                return { x: data.x - SPAWN_RADIUS, y: y - d, w: d, h: d };
            }
            case 'playerStart': {
                const px = level.playerStart.x;
                const py = levelHeight(level) - level.playerStart.yOffset;
                return { x: px - 16, y: py - 24, w: 32, h: 32 };
            }
            case 'boss': {
                const bx = level.width - (level.boss.xOffset || 240);
                const by = levelHeight(level) - (level.boss.yOffset || 80);
                return { x: bx - 24, y: by - 24, w: 48, h: 48 };
            }
            case 'bossTriggerZone': {
                const z = level.bossTriggerZone || data;
                return { x: z.x - z.w / 2, y: z.y - z.h / 2, w: z.w, h: z.h };
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
                    electric: '电磁区', wind: '风力区', energy_drain: '能量损失区',
                    missile: '导弹', crumble: '坍塌',
                    checkpoint: '复活点', death: '必死区', hint: '提示区'
                };
                const name = labels[data.type] || data.type;
                if (data.type === 'energy_drain') {
                    const rate = data.drainRate ?? 15;
                    return `${name} #${index + 1} (-${rate}/s)`;
                }
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
            case 'bossTriggerZone':
                return 'Boss 触发框';
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
        level.hazards.forEach((data, index) => items.push({ category: 'hazards', index, data }));
        items.push({ category: 'playerStart', index: 0, data: level.playerStart });
        if (isBossLevel(level)) {
            items.push({ category: 'boss', index: 0, data: level.boss });
            if (hasBossTriggerZone(level)) {
                items.push({ category: 'bossTriggerZone', index: 0, data: level.bossTriggerZone });
            }
        }
        if (isFinishLevel(level)) {
            items.push({ category: 'finish', index: 0, data: level.finish });
        }
        // 小怪置于最上层，避免被机关等区域遮挡导致点选/拖不动
        level.spawns.forEach((data, index) => items.push({ category: 'spawns', index, data }));
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
            delete payload.bossTriggerZone;
        } else {
            delete payload.finish;
        }
        return JSON.stringify(payload, null, 2);
    }

    function spawnLabel(spawn, index) {
        return spawn.id != null && spawn.id !== '' ? `小怪 "${spawn.id}"` : `小怪 #${index + 1}`;
    }

    function resolveSpawnWorldY(level, spawn) {
        if (typeof spawn.y === 'number' && !Number.isNaN(spawn.y)) {
            return spawn.y;
        }
        return groundY(level) - 4;
    }

    function validateSpawnBounds(level, errors) {
        (level.spawns || []).forEach((s, i) => {
            const label = spawnLabel(s, i);
            if (typeof s.x !== 'number' || Number.isNaN(s.x)) {
                errors.push(`${label} 缺少有效 X 坐标`);
                return;
            }
            if (s.y != null && (typeof s.y !== 'number' || Number.isNaN(s.y))) {
                errors.push(`${label} Y 坐标无效`);
                return;
            }
            const x = s.x;
            const y = resolveSpawnWorldY(level, s);
            const W = level.width;
            const H = level.height;
            if (x < 0 || x > W || y < 0 || y > H) {
                errors.push(
                    `${label} 坐标 (${Math.round(x)}, ${Math.round(y)}) 超出地图范围 (宽 0–${W}，高 0–${H})`
                );
            }
        });
    }

    function validateLevel(level) {
        const errors = [];
        const normalized = normalizeLevel(level);

        if (!normalized.id) errors.push('缺少关卡 id');
        if (!normalized.width || normalized.width < 800) errors.push('关卡宽度 width 应 >= 800');
        if (!normalized.height || normalized.height < MIN_LEVEL_HEIGHT) {
            errors.push(`关卡高度 height 应 >= ${MIN_LEVEL_HEIGHT}`);
        }
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
            if (b.hp != null && (typeof b.hp !== 'number' || Number.isNaN(b.hp) || b.hp < 0)) {
                errors.push('Boss 血量 hp 应为 >= 0 的数值');
            }
            if (b.damageMult != null && (typeof b.damageMult !== 'number' || Number.isNaN(b.damageMult) || b.damageMult < 0)) {
                errors.push('Boss 攻击伤害倍率 damageMult 应为 >= 0 的数值');
            }
            if (hasBossTriggerZone(normalized)) {
                const z = normalized.bossTriggerZone;
                if (!z.w || z.w < 16) errors.push('Boss 触发框宽度 w 应 >= 16');
                if (!z.h || z.h < 16) errors.push('Boss 触发框高度 h 应 >= 16');
            }
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

        if (normalized.maxJumps != null) {
            if (!Number.isInteger(normalized.maxJumps)) {
                errors.push('跳跃次数 maxJumps 应为整数');
            } else if (normalized.maxJumps >= 0 && normalized.maxJumps > 10) {
                errors.push('跳跃次数 maxJumps 应为负数（无限）或 0–10 的整数');
            }
        }
        if (normalized.jumpVelocity != null) {
            if (typeof normalized.jumpVelocity !== 'number' || normalized.jumpVelocity > 0) {
                errors.push('一段跳速度 jumpVelocity 应为 <= 0 的数值（负数表示向上）');
            }
        }
        if (normalized.secondJumpVelocity != null) {
            if (typeof normalized.secondJumpVelocity !== 'number' || normalized.secondJumpVelocity > 0) {
                errors.push('二段跳速度 secondJumpVelocity 应为 <= 0 的数值（负数表示向上）');
            }
        }
        if (normalized.moveSpeed != null) {
            if (typeof normalized.moveSpeed !== 'number' || normalized.moveSpeed < 0) {
                errors.push('移动速度 moveSpeed 应为 >= 0 的数值');
            }
        }
        if (normalized.gravity != null) {
            if (typeof normalized.gravity !== 'number' || normalized.gravity < 0) {
                errors.push('重力加速度 gravity 应为 >= 0 的数值');
            }
        }
        if (normalized.maxFallVelocity != null) {
            if (typeof normalized.maxFallVelocity !== 'number' || normalized.maxFallVelocity < 0) {
                errors.push('最大下落速度 maxFallVelocity 应为 >= 0 的数值');
            }
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
        validateSpawnBounds(normalized, errors);
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
        (normalized.hazards || []).forEach((h, i) => {
            if (h.type !== 'energy_drain') return;
            const rate = h.drainRate ?? 15;
            if (rate < 0) errors.push(`能量损失区 #${i + 1} 的 drainRate 不能为负`);
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
        return levelHeight(level) - (level.playerStart?.yOffset || 120);
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
     * 自 atY 起（含）将所有世界坐标 Y 下移 amount；可选调整距底边锚点（playerStart / Boss）。
     */
    function shiftWorldYFromY(level, atY, amount, opts = {}) {
        const P = snap(atY);
        const L = amount;
        if (L === 0) return level;

        level.platforms = level.platforms.map(p => {
            if (p[1] >= P) {
                const out = [p[0], p[1] + L, p[2]];
                if (p[3] != null) out[3] = p[3];
                return out;
            }
            return p;
        });
        level.walls = level.walls.map(w => (w.y >= P ? { ...w, y: w.y + L } : w));
        level.destructibleWalls = level.destructibleWalls.map(w => (w.y >= P ? { ...w, y: w.y + L } : w));
        level.systemWalls = level.systemWalls.map(w => (w.y >= P ? { ...w, y: w.y + L } : w));
        level.pickups = level.pickups.map(p => (typeof p.y === 'number' && p.y >= P ? { ...p, y: p.y + L } : p));
        level.spawns = level.spawns.map(s => (typeof s.y === 'number' && s.y >= P ? { ...s, y: s.y + L } : s));
        level.hazards = level.hazards.map(h => {
            if (h.type === 'missile') {
                const m = normalizeMissile(h, level);
                if (m.y - m.h / 2 >= P) return { ...m, y: m.y + L };
                return m;
            }
            if (typeof h.y === 'number' && h.y >= P) return { ...h, y: h.y + L };
            return h;
        });

        if (level.finish && typeof level.finish.y === 'number' && level.finish.y >= P) {
            level.finish = { ...level.finish, y: level.finish.y + L };
        }
        if (hasBossTriggerZone(level) && level.bossTriggerZone.y >= P) {
            level.bossTriggerZone = { ...level.bossTriggerZone, y: level.bossTriggerZone.y + L };
        }

        if (opts.adjustBottomAnchored) {
            const H = opts.levelHeightBefore ?? levelHeight(level);
            const py = H - (level.playerStart?.yOffset ?? 120);
            if (py < P) {
                level.playerStart = {
                    ...level.playerStart,
                    yOffset: (level.playerStart?.yOffset ?? 120) + L
                };
            }
            if (isBossLevel(level) && level.boss) {
                const by = H - (level.boss.yOffset ?? 80);
                if (by < P) {
                    level.boss = {
                        ...level.boss,
                        yOffset: (level.boss.yOffset ?? 80) + L
                    };
                }
            }
        }

        return level;
    }

    /**
     * 修改关卡高度，保留所有元素相对左下角的位置。
     * 世界坐标 Y 整体偏移；playerStart / Boss 的 yOffset（距底边）不变。
     */
    function setLevelHeight(level, newHeight) {
        const oldH = levelHeight(level);
        const newH = Math.max(MIN_LEVEL_HEIGHT, hazardNumber(newHeight, GAME_HEIGHT));
        const delta = newH - oldH;
        if (delta !== 0) {
            shiftWorldYFromY(level, 0, delta);
        }
        level.height = newH;
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
                const m = normalizeMissile(h, level);
                if (m.x - m.w / 2 >= P) return { ...m, x: m.x + L };
                return m;
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
        if (hasBossTriggerZone(level) && level.bossTriggerZone.x >= P) {
            level.bossTriggerZone = { ...level.bossTriggerZone, x: level.bossTriggerZone.x + L };
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

    /**
     * 在 atY 处插入竖向空白段：关卡高度 +length，该位置及上方（Y >= atY）所有元素整体下移。
     * playerStart / Boss 以 yOffset 存于底边；仅当插入点在其下方时才增大 yOffset 以保持世界坐标。
     */
    function insertBlankSpaceVertical(level, atY, length) {
        const P = snap(atY);
        const L = Math.max(snap(length), getGridSize());
        if (L <= 0) return level;

        const H = levelHeight(level);
        shiftWorldYFromY(level, P, L, { adjustBottomAnchored: true, levelHeightBefore: H });
        level.height = H + L;
        return level;
    }

    return {
        GAME_HEIGHT,
        MIN_LEVEL_HEIGHT,
        levelHeight,
        groundY,
        GROUND_TILE,
        GROUND_Y,
        PLATFORM_W,
        PLATFORM_H,
        platformHeight,
        platformSegmentCount,
        PICKUP_SIZE,
        SPAWN_RADIUS,
        getSpawnFeetY,
        hitTestSpawn,
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
        hasBossTriggerZone,
        normalizeBossTriggerZone,
        playerY,
        checkpointBounds,
        normalizeCheckpoint,
        normalizeMissile,
        normalizeCrumble,
        resolveStandingFeetY,
        electricIsActive,
        spawnDefaultHp,
        ENEMY_DEFAULT_HP,
        BOSS_TYPE_OPTIONS,
        getBossTypeDefaults,
        normalizeBoss,
        PLAYER_CONFIG_DEFAULTS,
        PLAYER_CONFIG_FIELDS,
        clearLevelContent,
        insertBlankSpace,
        insertBlankSpaceVertical,
        setLevelHeight
    };
})();
