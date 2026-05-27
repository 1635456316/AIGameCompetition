/**
 * 小怪配置：logic（碰撞/数值/AI）与 visual（贴图/血条）分离。
 * 贴图见 assets/character/LittleMonster/
 */
const EnemyConfigs = {
    melee: {
        logic: {
            origin: { x: 0.5, y: 1 },
            referenceFrameWidth: 56,
            referenceFrameHeight: 72,
            body: { width: 46, height: 54, offsetX: 5, offsetY: 10 },
            collideWorldBounds: true,
            maxHp: 50,
            moveSpeed: 140,
            contactDamage: 12,
            contactDamageInterval: 1000,
            patrolRange: 120,
            samePlaneThreshold: 72,
            detectRangeX: 360
        },
        visual: {
            texture: 'tex_enemy_melee',
            displayHeight: 72,
            referenceFrameHeight: 1422,
            depth: 10,
            hpBar: { width: 40, fillWidth: 36, offsetY: 78 }
        }
    },
    ranged: {
        logic: {
            origin: { x: 0.5, y: 1 },
            referenceFrameWidth: 56,
            referenceFrameHeight: 72,
            body: { width: 42, height: 52, offsetX: 7, offsetY: 12 },
            collideWorldBounds: true,
            maxHp: 35,
            moveSpeed: 90,
            contactDamage: 0,
            patrolRange: 120,
            samePlaneThreshold: 72,
            detectRangeX: 420,
            shootRangeX: 380,
            attackCooldown: 1400,
            bulletSpeed: 400,
            bulletSpawnOffsetX: 28,
            bulletSpawnOffsetY: 36
        },
        visual: {
            texture: 'tex_enemy_ranged',
            displayHeight: 72,
            referenceFrameHeight: 1152,
            depth: 10,
            hpBar: { width: 40, fillWidth: 36, offsetY: 78 }
        }
    },
    flying: {
        logic: {
            origin: { x: 0.5, y: 1 },
            referenceFrameWidth: 48,
            referenceFrameHeight: 56,
            body: { width: 38, height: 40, offsetX: 5, offsetY: 8 },
            collideWorldBounds: true,
            allowGravity: false,
            maxHp: 30,
            moveSpeed: 110,
            contactDamage: 0,
            patrolRange: 140,
            detectRangeX: 400,
            attackCooldown: 2800,
            rayWarningMs: 1000,
            // 固定全长：覆盖 1280×720 对角线并留余量
            rayLength: 1680,
            rayClipGround: false,
            rayHalfThickness: 18,
            rayDamage: 14,
            rayBeamWidth: 26,
            rayBeamGlowWidth: 40
        },
        visual: {
            texture: 'tex_enemy_flying',
            displayHeight: 56,
            referenceFrameHeight: 951,
            depth: 11,
            hpBar: { width: 36, fillWidth: 32, offsetY: 64 }
        }
    }
};

EnemyConfigs.get = function (type) {
    return EnemyConfigs[type] || EnemyConfigs.melee;
};
