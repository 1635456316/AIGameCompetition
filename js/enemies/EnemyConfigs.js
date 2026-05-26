/**
 * 小怪配置：logic（碰撞/数值/AI）与 visual（贴图/血条）分离。
 */
const EnemyConfigs = {
    melee: {
        logic: {
            origin: { x: 0.5, y: 1 },
            referenceFrameWidth: 48,
            referenceFrameHeight: 64,
            body: { width: 28, height: 50, offsetX: 8, offsetY: 4 },
            collideWorldBounds: true,
            maxHp: 50,
            moveSpeed: 140,
            contactDamage: 12,
            attackCooldown: 900,
            detectRange: 360,
            attackRange: 50,
            patrolRange: 120
        },
        visual: {
            texture: 'enemy_melee',
            displayHeight: 64,
            referenceFrameHeight: 64,
            depth: 10,
            hpBar: { width: 40, fillWidth: 36, offsetY: 72 }
        }
    },
    ranged: {
        logic: {
            origin: { x: 0.5, y: 1 },
            referenceFrameWidth: 48,
            referenceFrameHeight: 64,
            body: { width: 28, height: 50, offsetX: 8, offsetY: 4 },
            collideWorldBounds: true,
            maxHp: 30,
            moveSpeed: 80,
            contactDamage: 6,
            attackCooldown: 1500,
            detectRange: 480,
            attackRange: 420,
            patrolRange: 120,
            bulletSpeed: 380,
            bulletSpawnOffsetX: 24,
            bulletSpawnOffsetY: 28
        },
        visual: {
            texture: 'enemy_range',
            displayHeight: 64,
            referenceFrameHeight: 64,
            depth: 10,
            hpBar: { width: 40, fillWidth: 36, offsetY: 72 }
        }
    }
};

EnemyConfigs.get = function (type) {
    return EnemyConfigs[type] || EnemyConfigs.melee;
};
