import crypto from 'crypto';

const MEDIA_KEYS = [
    'startVideoUrl',
    'endVideoUrl',
    'normalBgmUrl',
    'bossBgmUrl',
    'bgUrl',
    'resultBgUrl'
];

const MIN_LEVEL_HEIGHT = 480;
const GROUND_TILE = 64;

function resolveSpawnWorldY(level, spawn) {
    const H = level.height;
    if (typeof spawn.y === 'number' && !Number.isNaN(spawn.y)) {
        return spawn.y;
    }
    return H - GROUND_TILE - 4;
}

function spawnLabel(spawn, index) {
    return spawn.id != null && spawn.id !== '' ? `小怪 "${spawn.id}"` : `小怪 #${index + 1}`;
}

function resolveBindId(obj) {
    const v = obj?.bindId ?? obj?.bindEnemyId;
    return v != null && v !== '' ? String(v) : '';
}

function collectLevelGlobalIds(level) {
    const entries = [];
    (level.spawns || []).forEach((s, i) => {
        if (s.id != null && s.id !== '') {
            entries.push({ id: String(s.id), label: `小怪 #${i + 1}` });
        }
    });
    (level.hazards || []).forEach((h, i) => {
        if (h.type === 'trigger' && h.triggerId != null && h.triggerId !== '') {
            entries.push({ id: String(h.triggerId), label: `触发器 #${i + 1}` });
        }
    });
    return entries;
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

function hazardNumber(value, fallback) {
    return typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
}

function isFinishLevel(level) {
    const f = level?.finish;
    return f != null && typeof f.x === 'number' && !Number.isNaN(f.x);
}

function isBossLevel(level) {
    return !isFinishLevel(level) && level?.boss != null;
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

function hasBossTriggerZone(level) {
    const z = level?.bossTriggerZone;
    return z != null && typeof z.x === 'number' && !Number.isNaN(z.x)
        && typeof z.y === 'number' && !Number.isNaN(z.y);
}

function normalizeLevel(raw) {
    const level = {
        id: raw.id || 1,
        title: raw.title || '',
        subtitle: raw.subtitle || '',
        width: raw.width || 2400,
        height: hazardNumber(raw.height, 720),
        playerStart: { x: 160, yOffset: 120, ...(raw.playerStart || {}) },
        cameraOffsetX: hazardNumber(raw.cameraOffsetX, 0),
        cameraOffsetY: hazardNumber(raw.cameraOffsetY, 0),
        energyStartPercent: hazardNumber(raw.energyStartPercent, 0),
        energyRegenRate: hazardNumber(raw.energyRegenRate, 0),
        hpStartPercent: hazardNumber(raw.hpStartPercent, 100),
        enemyKillEnergy: hazardNumber(raw.enemyKillEnergy, 10),
        bossTriggerOffset: raw.bossTriggerOffset ?? 600,
        maxJumps: raw.maxJumps != null ? hazardNumber(raw.maxJumps, null) : null,
        jumpVelocity: raw.jumpVelocity != null ? hazardNumber(raw.jumpVelocity, null) : null,
        secondJumpVelocity: raw.secondJumpVelocity != null ? hazardNumber(raw.secondJumpVelocity, null) : null,
        moveSpeed: raw.moveSpeed != null ? hazardNumber(raw.moveSpeed, null) : null,
        gravity: raw.gravity != null ? hazardNumber(raw.gravity, null) : null,
        maxFallVelocity: raw.maxFallVelocity != null ? hazardNumber(raw.maxFallVelocity, null) : null,
        boss: null,
        finish: null,
        startVideoUrl: raw.startVideoUrl ?? null,
        endVideoUrl: raw.endVideoUrl ?? null,
        normalBgmUrl: raw.normalBgmUrl ?? null,
        bossBgmUrl: raw.bossBgmUrl ?? null,
        bgUrl: raw.bgUrl ?? null,
        resultBgUrl: raw.resultBgUrl ?? null,
        platforms: (raw.platforms || []).map(p => [...p]),
        walls: (raw.walls || []).map(w => ({ ...w })),
        destructibleWalls: (raw.destructibleWalls || []).map(w => ({ ...w })),
        systemWalls: (raw.systemWalls || []).map(w => {
            const out = { ...w };
            out.bindId = resolveBindId(out);
            delete out.bindEnemyId;
            return out;
        }),
        pickups: (raw.pickups || []).map(p => ({ ...p })),
        spawns: (raw.spawns || []).map(s => ({ ...s })),
        hazards: (raw.hazards || []).map(h => {
            const out = { ...h };
            if (out.type === 'hint') {
                const bind = resolveBindId(out);
                if (bind) out.bindId = bind;
                else delete out.bindId;
                delete out.bindEnemyId;
            }
            if (out.type === 'trigger') {
                if (out.triggerId != null && out.triggerId !== '') out.triggerId = String(out.triggerId);
                delete out.bindHintIds;
                delete out.bindSystemWallIds;
            }
            if (out.type === 'triggered_platform' && out.triggerId != null && out.triggerId !== '') {
                out.triggerId = String(out.triggerId);
            }
            return out;
        })
    };

    if (isFinishLevel(raw)) {
        level.finish = { w: 80, h: 80, ...(raw.finish || {}) };
        level.boss = null;
        level.bossTriggerZone = null;
    } else {
        level.finish = null;
        level.boss = normalizeBoss(raw.boss);
        level.bossTriggerZone = normalizeBossTriggerZone(raw.bossTriggerZone);
    }

    return level;
}

export function sanitizeForPlayer(level) {
    const out = normalizeLevel(level);
    MEDIA_KEYS.forEach(key => {
        out[key] = null;
    });
    return out;
}

export function exportLevel(level) {
    const out = sanitizeForPlayer(level);
    if (isFinishLevel(out)) {
        delete out.boss;
    } else {
        delete out.finish;
    }
    return out;
}

export function validateLevel(level) {
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
            errors.push('Boss hp 应为 >= 0 的数值');
        }
        if (b.damageMult != null && (typeof b.damageMult !== 'number' || Number.isNaN(b.damageMult) || b.damageMult < 0)) {
            errors.push('Boss damageMult 应为 >= 0 的数值');
        }
        if (hasBossTriggerZone(normalized)) {
            const z = normalized.bossTriggerZone;
            if (!z.w || z.w < 16) errors.push('Boss 触发框宽度 w 应 >= 16');
            if (!z.h || z.h < 16) errors.push('Boss 触发框高度 h 应 >= 16');
        }
    }

    if (normalized.energyStartPercent < 0 || normalized.energyStartPercent > 100) {
        errors.push('energyStartPercent 应在 0–100');
    }
    if (normalized.hpStartPercent < 0 || normalized.hpStartPercent > 100) {
        errors.push('hpStartPercent 应在 0–100');
    }
    if (normalized.energyRegenRate < 0) errors.push('energyRegenRate 不能为负');
    if (normalized.enemyKillEnergy < 0) errors.push('enemyKillEnergy 不能为负');

    if (normalized.maxJumps != null) {
        if (!Number.isInteger(normalized.maxJumps)) {
            errors.push('maxJumps 应为整数');
        } else if (normalized.maxJumps >= 0 && normalized.maxJumps > 10) {
            errors.push('maxJumps 应为负数（无限）或 0–10 的整数');
        }
    }
    if (normalized.jumpVelocity != null) {
        if (typeof normalized.jumpVelocity !== 'number' || normalized.jumpVelocity > 0) {
            errors.push('jumpVelocity 应为 <= 0 的数值');
        }
    }
    if (normalized.secondJumpVelocity != null) {
        if (typeof normalized.secondJumpVelocity !== 'number' || normalized.secondJumpVelocity > 0) {
            errors.push('secondJumpVelocity 应为 <= 0 的数值');
        }
    }
    if (normalized.moveSpeed != null) {
        if (typeof normalized.moveSpeed !== 'number' || normalized.moveSpeed < 0) {
            errors.push('moveSpeed 应为 >= 0 的数值');
        }
    }
    if (normalized.gravity != null) {
        if (typeof normalized.gravity !== 'number' || normalized.gravity < 0) {
            errors.push('gravity 应为 >= 0 的数值');
        }
    }
    if (normalized.maxFallVelocity != null) {
        if (typeof normalized.maxFallVelocity !== 'number' || normalized.maxFallVelocity < 0) {
            errors.push('maxFallVelocity 应为 >= 0 的数值');
        }
    }

    const globalIdOwners = new Map();
    collectLevelGlobalIds(normalized).forEach(({ id, label }) => {
        if (globalIdOwners.has(id)) {
            errors.push(`全局 id 重复: "${id}"（${globalIdOwners.get(id)} 与 ${label}）`);
        } else {
            globalIdOwners.set(id, label);
        }
    });
    const globalIds = new Set(globalIdOwners.keys());

    validateSpawnBounds(normalized, errors);
    (normalized.systemWalls || []).forEach((w, i) => {
        const bind = resolveBindId(w);
        if (!bind) errors.push(`系统墙 #${i + 1} 未设置 bindId`);
        else if (!globalIds.has(bind)) errors.push(`系统墙 #${i + 1} 绑定了不存在的全局 id: "${bind}"`);
    });
    (normalized.hazards || []).forEach((h, i) => {
        if (h.type !== 'hint') return;
        const bind = resolveBindId(h);
        if (!bind) return;
        if (!globalIds.has(bind)) errors.push(`提示区 #${i + 1} 绑定了不存在的全局 id: "${bind}"`);
    });
    (normalized.hazards || []).forEach((h, i) => {
        if (h.type !== 'energy_drain') return;
        const rate = h.drainRate ?? 15;
        if (rate < 0) errors.push(`能量损失区 #${i + 1} 的 drainRate 不能为负`);
    });

    (normalized.hazards || []).forEach((h, i) => {
        if (h.type !== 'trigger') return;
        if (!h.triggerId) errors.push(`触发器 #${i + 1} 未设置 triggerId（全局 id）`);
    });
    (normalized.hazards || []).forEach((h, i) => {
        if (h.type !== 'triggered_platform') return;
        const tid = h.triggerId;
        if (!tid) errors.push(`触发移动平台 #${i + 1} 未绑定 triggerId`);
        else if (!globalIds.has(String(tid))) {
            errors.push(`触发移动平台 #${i + 1} 绑定了不存在的触发器 id: "${tid}"`);
        }
    });

    return errors;
}

export function hashLevelData(level) {
    return hashJson(exportLevel(level));
}

export function hashJson(obj) {
    const text = JSON.stringify(obj);
    return crypto.createHash('sha256').update(text).digest('hex');
}

export { normalizeLevel, isFinishLevel, isBossLevel, normalizeBoss };
