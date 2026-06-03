/**
 * 关卡编辑器 — 常量、元素定义、导入导出
 */
const LevelEditorSchema = (() => {
    const GAME_HEIGHT = 720;
    const GROUND_TILE = 64;
    const GROUND_Y = GAME_HEIGHT - GROUND_TILE;
    const MIN_LEVEL_HEIGHT = 480;
    const MIN_LEVEL_WIDTH = 200;

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
                { kind: 'energy_pickup', label: '回能量道具', icon: '⚡', color: '#44aaff' },
                { kind: 'invincible_pickup', label: '无敌道具', icon: '🛡', color: '#ffdd66' }
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
                { kind: 'hint', label: '提示区', icon: '💬', color: '#ffdd44' },
                { kind: 'trigger', label: '触发器', icon: '🔘', color: '#ff99cc' },
                { kind: 'moving_platform', label: '移动平台(自动)', icon: '⇔', color: '#55cc88' },
                { kind: 'triggered_platform', label: '移动平台(触发)', icon: '⇌', color: '#55aacc' },
                { kind: 'spring', label: '弹簧', icon: '⤴', color: '#88ee55' }
            ]
        },
        {
            category: '实体',
            items: [
                { kind: 'spawn_melee', label: '近战敌人', icon: '⚔', color: '#ff5566' },
                { kind: 'spawn_ranged', label: '远程敌人', icon: '🏹', color: '#ff8866' },
                { kind: 'spawn_flying', label: '飞行敌人', icon: '🪽', color: '#66bbff' },
                { kind: 'spawn_zone', label: '刷怪区', icon: '⟳', color: '#ff7799' }
            ]
        },
        {
            category: '标记',
            items: [
                { kind: 'player_start', label: '玩家出生', icon: '★', color: '#44ff88' },
                { kind: 'checkpoint', label: '复活点', icon: '⛳', color: '#44cc88' },
                { kind: 'boss', label: 'Boss 位置', icon: '👹', color: '#cc44ff' },
                { kind: 'boss_trigger', label: 'Boss 触发框', icon: '⬚', color: '#ff6688' },
                { kind: 'finish', label: '终点', icon: '🏁', color: '#ffcc44' },
                { kind: 'camera_cut', label: '镜头 Cut', icon: '🎬', color: '#aa88ff' }
            ]
        }
    ];

    const ENEMY_DEFAULT_HP = { melee: 50, ranged: 35, flying: 30 };
    const ENEMY_DEFAULT_DETECT_X = { melee: 360, ranged: 420, flying: 400 };
    const ENEMY_DEFAULT_DETECT_Y = { melee: 72, ranged: 9999, flying: 9999 };

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
        { key: 'maxJumps', label: '跳跃次数', unit: '次', optional: true, integer: true, min: 0, max: 10, allowUnlimited: true },
        { key: 'jumpVelocity', label: '一段跳速度', unit: 'px/s', optional: true, min: 0, storeAsNegative: true },
        { key: 'secondJumpVelocity', label: '二段跳速度', unit: 'px/s', optional: true, min: 0, storeAsNegative: true },
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

    function spawnEffectiveDetectRangeX(spawn) {
        if (spawn.detectRangeX != null && !Number.isNaN(spawn.detectRangeX)) {
            return Math.max(0, spawn.detectRangeX);
        }
        return ENEMY_DEFAULT_DETECT_X[spawn.type] ?? ENEMY_DEFAULT_DETECT_X.melee;
    }

    function spawnEffectiveDetectRangeY(spawn) {
        if (spawn.detectRangeY != null && !Number.isNaN(spawn.detectRangeY)) {
            return Math.max(0, spawn.detectRangeY);
        }
        return ENEMY_DEFAULT_DETECT_Y[spawn.type] ?? 72;
    }

    function spawnDetectRangeYUnlimited(spawn) {
        return spawnEffectiveDetectRangeY(spawn) >= 9999;
    }

    /** 解析元素绑定 id（兼容旧字段 bindEnemyId） */
    function resolveBindId(obj) {
        const v = obj?.bindId ?? obj?.bindEnemyId;
        return v != null && v !== '' ? String(v) : '';
    }

    /** 关卡内全局 id：小怪 spawn.id + 触发器 triggerId */
    function collectLevelGlobalIds(level) {
        const entries = [];
        (level.spawns || []).forEach((s, i) => {
            if (s.id != null && s.id !== '') {
                entries.push({ id: String(s.id), kind: 'spawn', label: `小怪 #${i + 1}` });
            }
        });
        (level.hazards || []).forEach((h, i) => {
            if (h.type === 'trigger' && h.triggerId != null && h.triggerId !== '') {
                entries.push({ id: String(h.triggerId), kind: 'trigger', label: `触发器 #${i + 1}` });
            }
        });
        return entries;
    }

    function listLevelGlobalIdStrings(level) {
        return collectLevelGlobalIds(level).map(e => e.id);
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
            cameraOffsetX: 0,
            cameraOffsetY: 0,
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
        level.cameraOffsetX = hazardNumber(raw.cameraOffsetX, 0);
        level.cameraOffsetY = hazardNumber(raw.cameraOffsetY, 0);
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
        level.systemWalls = (raw.systemWalls || []).map(w => {
            const out = { ...w };
            const bind = resolveBindId(out);
            out.bindId = bind;
            delete out.bindEnemyId;
            return out;
        });
        level.pickups = (raw.pickups || []).map(p => {
            const type = p.type || 'health';
            let defaults;
            if (type === 'energy') {
                defaults = { type: 'energy', amount: 25 };
            } else if (type === 'invincible') {
                defaults = { type: 'invincible' };
            } else {
                defaults = { type: 'health', amount: 30 };
            }
            const out = { ...defaults, ...p, type };
            if (type === 'invincible' && out.duration != null && !Number.isNaN(out.duration)) {
                out.duration = Math.max(0, out.duration);
            } else if (type === 'invincible') {
                delete out.duration;
            }
            return out;
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
            if (s.detectRangeX != null && !Number.isNaN(s.detectRangeX)) out.detectRangeX = Math.max(0, s.detectRangeX);
            if (s.detectRangeY != null && !Number.isNaN(s.detectRangeY)) out.detectRangeY = Math.max(0, s.detectRangeY);
            return out;
        });
        level.hazards = (raw.hazards || []).map(h => {
            let out = normalizeCheckpoint(normalizeMissile(normalizeCrumble(normalizeSpring(normalizeSpawnZone({ ...h }))), level));
            if (out.type === 'hint') {
                const bind = resolveBindId(out);
                if (bind) out.bindId = bind;
                else delete out.bindId;
                delete out.bindEnemyId;
            }
            if (out.type === 'trigger') {
                out = normalizeTrigger(out);
            }
            if (out.type === 'triggered_platform') {
                out = normalizeTriggeredPlatform(out);
            }
            if (out.type === 'camera_cut') {
                out = normalizeCameraCut(out);
            }
            return out;
        });
        return level;
    }

    function drawSpringCoilCanvas(ctx, cx, baseY, width, height, opts = {}) {
        const w = Math.max(16, width);
        const h = Math.max(20, height);
        const shadow = opts.shadow ?? '#3a8822';
        const main = opts.main ?? '#66dd44';
        const hi = opts.hi ?? '#ccff99';
        const turns = opts.turns ?? 3.8;
        const steps = 96;
        const tcx = w / 2;

        ctx.save();
        ctx.translate(cx - w / 2, baseY - h);

        const pts = [];
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const y = h - 5 - t * (h - 10);
            const angle = t * Math.PI * 2 * turns;
            const amp = (w * 0.37) * (1 - t * 0.22);
            pts.push({ x: tcx + Math.sin(angle) * amp, y });
        }

        const strokePts = (points, color, lw, alpha, ox = 0, oy = 0) => {
            ctx.strokeStyle = color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            points.forEach((p, i) => {
                const x = p.x + ox;
                const y = p.y + oy;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        };

        strokePts(pts, shadow, 5, 0.88, 0.8, 0.8);
        strokePts(pts, main, 3.5, 1, 0, 0);
        strokePts(pts, hi, 1.6, 0.8, -1, -0.6);

        ctx.globalAlpha = 0.92;
        ctx.fillStyle = '#55bb33';
        ctx.beginPath();
        ctx.ellipse(tcx, h - 3, w * 0.29, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        const top = pts[pts.length - 1];
        ctx.globalAlpha = 1;
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.ellipse(top.x, top.y, w * 0.13, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /** 触碰=圆点按钮，攻击=十字准星按钮（与运行时 TextureFactory 一致） */
    function triggerModeIcon(mode) {
        return mode === 'attack' ? '⊕' : '🔘';
    }

    function drawTriggerButtonIcon(ctx, x, y, size, mode, alpha = 0.75) {
        const scale = size / 32;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;

        const bx = -12;
        const by = -8;
        const bw = 24;
        const bh = 16;
        const r = 3;

        const roundRect = (rx, ry, rw, rh, rad) => {
            ctx.beginPath();
            ctx.moveTo(rx + rad, ry);
            ctx.lineTo(rx + rw - rad, ry);
            ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad);
            ctx.lineTo(rx + rw, ry + rh - rad);
            ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh);
            ctx.lineTo(rx + rad, ry + rh);
            ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad);
            ctx.lineTo(rx, ry + rad);
            ctx.quadraticCurveTo(rx, ry, rx + rad, ry);
            ctx.closePath();
        };

        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        roundRect(bx + 1, by + 2, bw, bh, r);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,153,204,0.92)';
        roundRect(bx, by, bw, bh, r);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,204,224,0.88)';
        roundRect(bx, by, bw, Math.ceil(bh * 0.42), r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,102,153,0.75)';
        ctx.lineWidth = 1;
        roundRect(bx, by, bw, bh, r);
        ctx.stroke();

        if (mode === 'attack') {
            ctx.strokeStyle = 'rgba(255,255,255,0.92)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(0, 6);
            ctx.moveTo(-5, -2);
            ctx.lineTo(5, -2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,34,68,0.85)';
            ctx.beginPath();
            ctx.arc(0, -2, 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,102,153,0.55)';
            ctx.beginPath();
            ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    function normalizeTrigger(h) {
        const out = { ...h };
        if (out.triggerId != null && out.triggerId !== '') {
            out.triggerId = String(out.triggerId);
        }
        out.triggerMode = out.triggerMode === 'attack' ? 'attack' : 'touch';
        if (out.triggerMode === 'attack') {
            delete out.showVisual;
        } else if (out.showVisual === false) {
            out.showVisual = false;
        } else {
            delete out.showVisual;
        }
        delete out.bindHintIds;
        delete out.bindSystemWallIds;
        return out;
    }

    /** 触发移动平台：可绑定触发器，或角色踩上触发；踩上模式禁止瞬间复位 */
    function normalizeTriggeredPlatform(h) {
        const activateMode = h.activateMode === 'stand' ? 'stand' : 'trigger';
        const out = {
            type: 'triggered_platform',
            x: h.x,
            y: h.y,
            w: Math.max(16, h.w ?? PLATFORM_W),
            h: Math.max(16, h.h ?? PLATFORM_H),
            moveAxis: h.moveAxis === 'y' ? 'y' : 'x',
            moveRange: Math.max(0, hazardNumber(h.moveRange, 200)),
            moveSpeed: Math.max(1, hazardNumber(h.moveSpeed, 80)),
            autoReturn: h.autoReturn !== false,
            returnDelay: Math.max(0, hazardNumber(h.returnDelay, 2000))
        };
        if (activateMode === 'stand') {
            out.activateMode = 'stand';
            out.returnMode = 'reverse';
        } else {
            if (h.triggerId != null && h.triggerId !== '') out.triggerId = String(h.triggerId);
            out.returnMode = h.returnMode === 'instant' ? 'instant' : 'reverse';
        }
        return out;
    }

    /** 镜头 Cut：绑定触发器后切换镜头焦点；玩家离开区域时按退出方式恢复跟随 */
    function normalizeCameraCut(h) {
        return {
            type: 'camera_cut',
            x: h.x,
            y: h.y,
            w: Math.max(16, h.w ?? 320),
            h: Math.max(16, h.h ?? 240),
            triggerId: h.triggerId != null && h.triggerId !== '' ? String(h.triggerId) : '',
            enterMode: h.enterMode === 'move' ? 'move' : 'instant',
            enterDuration: Math.max(0, hazardNumber(h.enterDuration, 800)),
            exitMode: h.exitMode === 'move' ? 'move' : 'instant',
            exitDuration: Math.max(0, hazardNumber(h.exitDuration, 500))
        };
    }

    /** 弹簧：踩上后向上弹起；可选左右往复移动；maxUses=0 表示无限次 */
    function normalizeSpring(h) {
        if (h.type !== 'spring') return h;
        const horizontalMove = h.horizontalMove === true;
        const out = {
            type: 'spring',
            x: h.x,
            y: h.y,
            w: Math.max(16, h.w ?? 80),
            h: Math.max(8, h.h ?? 24),
            force: Math.max(0, hazardNumber(h.force, 720)),
            cooldown: Math.max(0, hazardNumber(h.cooldown, 350)),
            maxUses: Math.max(0, Math.round(hazardNumber(h.maxUses, 0)))
        };
        if (horizontalMove) {
            out.horizontalMove = true;
            out.moveRange = Math.max(0, hazardNumber(h.moveRange, 200));
            out.moveSpeed = Math.max(1, hazardNumber(h.moveSpeed, 80));
        }
        return out;
    }

    /** 刷怪区：区域内按间隔刷怪，可限制同时存活数量 */
    function normalizeSpawnZone(h) {
        if (h.type !== 'spawn_zone') return h;
        const enemyType = ['melee', 'ranged', 'flying'].includes(h.enemyType) ? h.enemyType : 'melee';
        const out = {
            type: 'spawn_zone',
            x: h.x,
            y: h.y,
            w: Math.max(32, h.w ?? 160),
            h: Math.max(32, h.h ?? 120),
            enemyType,
            interval: Math.max(500, hazardNumber(h.interval, 3000)),
            maxAlive: Math.max(1, Math.round(hazardNumber(h.maxAlive, 2)))
        };
        if (h.hp != null && !Number.isNaN(h.hp)) out.hp = Math.max(1, h.hp);
        if (h.killEnergy != null && !Number.isNaN(h.killEnergy)) out.killEnergy = Math.max(0, h.killEnergy);
        if (h.detectRangeX != null && !Number.isNaN(h.detectRangeX)) out.detectRangeX = Math.max(0, h.detectRangeX);
        if (h.detectRangeY != null && !Number.isNaN(h.detectRangeY)) out.detectRangeY = Math.max(0, h.detectRangeY);
        return out;
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
                return { category: 'systemWalls', data: { x: sx, y: sy, w: 32, h: 200, bindId: '' } };
            case 'health_pickup':
                return { category: 'pickups', data: { type: 'health', x: sx, y: sy, amount: 30 } };
            case 'energy_pickup':
                return { category: 'pickups', data: { type: 'energy', x: sx, y: sy, amount: 25 } };
            case 'invincible_pickup':
                return { category: 'pickups', data: { type: 'invincible', x: sx, y: sy } };
            case 'spring':
                return { category: 'hazards', data: { type: 'spring', x: sx, y: sy, w: 80, h: 24, force: 720, cooldown: 350, maxUses: 0 } };
            case 'spawn_zone':
                return { category: 'hazards', data: { type: 'spawn_zone', x: sx, y: sy, w: 160, h: 120, enemyType: 'melee', interval: 3000, maxAlive: 2 } };
            case 'electric':
                return { category: 'hazards', data: { type: 'electric', x: sx, y: sy, w: 140, h: 60, period: 2400, activeDuration: 1000, damage: 6 } };
            case 'wind':
                return { category: 'hazards', data: { type: 'wind', x: sx, y: sy, w: 200, h: 300, force: 180, dir: 'right' } };
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
            case 'trigger':
                return { category: 'hazards', data: { type: 'trigger', x: sx, y: sy, w: 80, h: 80, triggerMode: 'touch', maxTriggers: 1, triggerId: '' } };
            case 'moving_platform':
                return { category: 'hazards', data: { type: 'moving_platform', x: sx, y: sy, w: PLATFORM_W, h: PLATFORM_H, moveAxis: 'x', moveRange: 200, moveSpeed: 80 } };
            case 'triggered_platform':
                return { category: 'hazards', data: { type: 'triggered_platform', x: sx, y: sy, w: PLATFORM_W, h: PLATFORM_H, activateMode: 'trigger', triggerId: '', moveAxis: 'x', moveRange: 200, moveSpeed: 80, autoReturn: true, returnMode: 'reverse', returnDelay: 2000 } };
            case 'camera_cut':
                return { category: 'hazards', data: { type: 'camera_cut', x: sx, y: sy, w: 320, h: 240, triggerId: '', enterMode: 'move', enterDuration: 800, exitMode: 'instant', exitDuration: 500 } };
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
                if (data.type === 'death' || data.type === 'hint' || data.type === 'electric' || data.type === 'wind' || data.type === 'energy_drain' || data.type === 'trigger' || data.type === 'moving_platform' || data.type === 'triggered_platform' || data.type === 'camera_cut' || data.type === 'spring' || data.type === 'spawn_zone') {
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

    function resolvePaletteKind(category, data) {
        switch (category) {
            case 'platforms': return 'platform';
            case 'walls': return 'wall';
            case 'destructibleWalls': return 'destructible_wall';
            case 'systemWalls': return 'system_wall';
            case 'pickups':
                if (data?.type === 'energy') return 'energy_pickup';
                if (data?.type === 'invincible') return 'invincible_pickup';
                return 'health_pickup';
            case 'spawns': {
                const map = { melee: 'spawn_melee', ranged: 'spawn_ranged', flying: 'spawn_flying' };
                return map[data?.type] || 'spawn_melee';
            }
            case 'hazards':
                return data?.type || 'hint';
            case 'playerStart': return 'player_start';
            case 'boss': return 'boss';
            case 'bossTriggerZone': return 'boss_trigger';
            case 'finish': return 'finish';
            default:
                return null;
        }
    }

    function getPaletteItemMeta(category, data) {
        const kind = resolvePaletteKind(category, data);
        for (const group of PALETTE) {
            const item = group.items.find(i => i.kind === kind);
            if (item) {
                return {
                    kind: item.kind,
                    label: item.label,
                    icon: item.icon,
                    color: item.color,
                    paletteCategory: group.category
                };
            }
        }
        return {
            kind: kind || category,
            label: category,
            icon: '▪',
            color: '#5a6470',
            paletteCategory: ''
        };
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
                const bind = resolveBindId(data);
                const suffix = bind ? ` → ${bind}` : '（未绑定）';
                return `系统墙 #${index + 1}${suffix}`;
            }
            case 'pickups':
                if (data.type === 'energy') return `回能量 #${index + 1} (+${data.amount ?? 25})`;
                if (data.type === 'invincible') {
                    const dur = data.duration;
                    const durLabel = dur != null && !Number.isNaN(dur) ? `${dur}ms` : '默认 3000ms';
                    return `无敌道具 #${index + 1} (${durLabel})`;
                }
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
                    checkpoint: '复活点', death: '必死区', hint: '提示区',
                    trigger: '触发器', moving_platform: '移动平台', triggered_platform: '触发平台',
                    camera_cut: '镜头 Cut', spring: '弹簧', spawn_zone: '刷怪区'
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
                    const bind = resolveBindId(data);
                    const bindSuffix = bind ? ` → ${bind}` : '';
                    return `${name} #${index + 1}${preview}${bindSuffix}`;
                }
                if (data.type === 'trigger') {
                    const tid = data.triggerId || '?';
                    const mode = data.triggerMode === 'attack' ? '攻击' : '触碰';
                    const hideSuffix = data.triggerMode !== 'attack' && data.showVisual === false ? ' · 运行时隐藏' : '';
                    return `${name} #${index + 1} (${mode} · id:${tid}${hideSuffix})`;
                }
                if (data.type === 'moving_platform') {
                    return `${name} #${index + 1} (${data.moveAxis ?? 'x'} · ${data.moveRange ?? 200}px)`;
                }
                if (data.type === 'triggered_platform') {
                    const mode = data.activateMode === 'stand' ? '踩上' : `→${data.triggerId || '?'}`;
                    return `${name} #${index + 1} (${mode} · ${data.moveAxis ?? 'x'})`;
                }
                if (data.type === 'camera_cut') {
                    const tid = data.triggerId || '?';
                    const enter = data.enterMode === 'move'
                        ? `入移${data.enterDuration ?? 800}ms`
                        : '入瞬切';
                    const exit = data.exitMode === 'move'
                        ? `出移${data.exitDuration ?? 500}ms`
                        : '出瞬切';
                    return `${name} #${index + 1} (→${tid} · ${enter} · ${exit})`;
                }
                if (data.type === 'spring') {
                    const parts = [`↑${data.force ?? 720}`, `CD ${data.cooldown ?? 350}ms`];
                    if (data.horizontalMove) parts.push(`⇔${data.moveRange ?? 200}px`);
                    const uses = data.maxUses ?? 0;
                    parts.push(uses === 0 ? '∞次' : `${uses}次`);
                    return `${name} #${index + 1} (${parts.join(' · ')})`;
                }
                if (data.type === 'spawn_zone') {
                    const typeLabels = { melee: '近战', ranged: '远程', flying: '飞行' };
                    const et = typeLabels[data.enemyType] || data.enemyType || '近战';
                    return `${name} #${index + 1} (${et} · ${data.interval ?? 3000}ms · 上限 ${data.maxAlive ?? 2})`;
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
        if (!normalized.width || normalized.width < MIN_LEVEL_WIDTH) {
            errors.push(`关卡宽度 width 应 >= ${MIN_LEVEL_WIDTH}`);
        }
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

        const globalIdOwners = new Map();
        collectLevelGlobalIds(normalized).forEach(({ id, kind, label }) => {
            if (globalIdOwners.has(id)) {
                errors.push(`全局 id 重复: "${id}"（${globalIdOwners.get(id)} 与 ${label}）`);
            } else {
                globalIdOwners.set(id, label);
            }
        });
        const globalIds = new Set(globalIdOwners.keys());

        (normalized.spawns || []).forEach((s, i) => {
            if (s.id == null || s.id === '') return;
            if (!globalIds.has(String(s.id))) {
                errors.push(`小怪 #${i + 1} 的 id 未登记为全局 id`);
            }
        });
        validateSpawnBounds(normalized, errors);
        (normalized.systemWalls || []).forEach((w, i) => {
            const bind = resolveBindId(w);
            if (!bind) {
                errors.push(`系统墙 #${i + 1} 未设置 bindId`);
            } else if (!globalIds.has(bind)) {
                errors.push(`系统墙 #${i + 1} 绑定了不存在的全局 id: "${bind}"`);
            }
        });
        (normalized.hazards || []).forEach((h, i) => {
            if (h.type !== 'hint') return;
            const bind = resolveBindId(h);
            if (!bind) return;
            if (!globalIds.has(bind)) {
                errors.push(`提示区 #${i + 1} 绑定了不存在的全局 id: "${bind}"`);
            }
        });
        (normalized.hazards || []).forEach((h, i) => {
            if (h.type !== 'energy_drain') return;
            const rate = h.drainRate ?? 15;
            if (rate < 0) errors.push(`能量损失区 #${i + 1} 的 drainRate 不能为负`);
        });

        (normalized.hazards || []).forEach((h, i) => {
            if (h.type !== 'trigger') return;
            if (!h.triggerId) {
                errors.push(`触发器 #${i + 1} 未设置 triggerId（全局 id）`);
            }
        });
        (normalized.hazards || []).forEach((h, i) => {
            if (h.type !== 'triggered_platform') return;
            if (h.activateMode === 'stand') return;
            const tid = h.triggerId;
            if (!tid) {
                errors.push(`触发移动平台 #${i + 1} 未绑定 triggerId`);
            } else if (!globalIds.has(String(tid))) {
                errors.push(`触发移动平台 #${i + 1} 绑定了不存在的触发器 id: "${tid}"`);
            }
        });
        (normalized.hazards || []).forEach((h, i) => {
            if (h.type !== 'camera_cut') return;
            const tid = h.triggerId;
            if (!tid) {
                errors.push(`镜头 Cut #${i + 1} 未绑定 triggerId`);
            } else if (!globalIds.has(String(tid))) {
                errors.push(`镜头 Cut #${i + 1} 绑定了不存在的触发器 id: "${tid}"`);
            }
            if (h.enterMode === 'move' && (h.enterDuration == null || h.enterDuration < 0)) {
                errors.push(`镜头 Cut #${i + 1} 的 enterDuration 无效`);
            }
            if (h.exitMode === 'move' && (h.exitDuration == null || h.exitDuration < 0)) {
                errors.push(`镜头 Cut #${i + 1} 的 exitDuration 无效`);
            }
        });
        (normalized.pickups || []).forEach((p, i) => {
            if (p.type !== 'invincible') return;
            if (p.duration != null && (typeof p.duration !== 'number' || Number.isNaN(p.duration) || p.duration < 0)) {
                errors.push(`无敌道具 #${i + 1} 的 duration 应为 >= 0 的数值（留空=默认 3000ms）`);
            }
        });
        (normalized.hazards || []).forEach((h, i) => {
            if (h.type !== 'spring') return;
            if ((h.force ?? 720) <= 0) errors.push(`弹簧 #${i + 1} 的弹起力度 force 应 > 0`);
            if (h.horizontalMove && (h.moveRange ?? 0) <= 0) {
                errors.push(`弹簧 #${i + 1} 开启左右移动时，moveRange 应 > 0`);
            }
            if ((h.maxUses ?? 0) < 0) errors.push(`弹簧 #${i + 1} 的 maxUses 应 >= 0（0=无限）`);
        });
        (normalized.hazards || []).forEach((h, i) => {
            if (h.type !== 'spawn_zone') return;
            if ((h.maxAlive ?? 2) < 1) errors.push(`刷怪区 #${i + 1} 的 maxAlive 应 >= 1`);
            if ((h.interval ?? 3000) < 500) errors.push(`刷怪区 #${i + 1} 的 interval 应 >= 500ms`);
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
        MIN_LEVEL_WIDTH,
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
        getPaletteItemMeta,
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
        normalizeSpring,
        normalizeSpawnZone,
        normalizeCameraCut,
        normalizeTrigger,
        normalizeTriggeredPlatform,
        triggerModeIcon,
        drawTriggerButtonIcon,
        drawSpringCoilCanvas,
        resolveStandingFeetY,
        electricIsActive,
        spawnDefaultHp,
        spawnEffectiveDetectRangeX,
        spawnEffectiveDetectRangeY,
        spawnDetectRangeYUnlimited,
        resolveBindId,
        collectLevelGlobalIds,
        listLevelGlobalIdStrings,
        ENEMY_DEFAULT_HP,
        ENEMY_DEFAULT_DETECT_X,
        ENEMY_DEFAULT_DETECT_Y,
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
