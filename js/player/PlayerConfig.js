const PlayerConfig = {
    heroFrameHeight: 640,
    heroDisplayHeight: 96,
    heroSheetBody: { width: 50, height: 80, offsetX: 295, offsetY: 560},
    heroStaticBody: { width: 28, height: 60, offsetX: 10, offsetY: 4 },

    /** 构建玩家实体配置（逻辑体 + 表现层） */
    buildEntityConfig(scene) {
        const useSheet = scene.textures.exists('tex_hero_idle');
        const logic = {
            origin: { x: 0.5, y: 1 },
            referenceFrameWidth: useSheet ? this.heroFrameHeight : 48,
            referenceFrameHeight: useSheet ? this.heroFrameHeight : 64,
            body: useSheet ? this.heroSheetBody : this.heroStaticBody,
            depth: 19,
            collideWorldBounds: true,
            maxVelocity: { x: 800, y: 1400 }
        };
        const visual = useSheet ? {
            idleTexture: 'tex_hero_idle',
            idleFrame: 'idle_0',
            displayHeight: this.heroDisplayHeight,
            referenceFrameHeight: this.heroFrameHeight,
            depth: 20
        } : {
            texture: 'hero_jump',
            displayHeight: this.heroDisplayHeight,
            referenceFrameHeight: 64,
            depth: 20
        };
        return { logic, visual, useSheet };
    },
    moveSpeed: 320,
    jumpVelocity: -720,
    secondJumpVelocity: -560,
    maxJumps: 2,
    dashSpeed: 760,
    dashDuration: 200,        // ms
    dashCooldown: 250,        // ms
    dashEnergyCost: 5,
    attackDuration: 220,      // ms
    attackCooldown: 280,      // ms
    attackComboWindow: 900,   // ms，连击有效间隔
    attackDashSpeed: 360,
    attackDashDuration: 200,  // ms，约 72px 冲刺距离
    attackDashDamagePerTick: 10,
    attackDashHitInterval: 55,
    attackDashBossDamagePerTick: 12,

    // ---------- 战斗判定（仅碰撞/伤害，与特效无关）----------
    meleeHitWidth: 72,
    meleeHitHeight: 64,
    meleeHitOffsetX: 58,
    meleeHitOffsetY: 38,
    meleeDamage: 25,
    attackDashHitWidth: 120,
    attackDashHitHeight: 76,
    attackDashHitOffsetX: 44,
    attackDashHitOffsetY: 36,

    // ---------- 特效（仅显示，改这里不影响出拳范围）----------
    punchWindDisplayWidth: 65,
    punchWindOffsetX: 20,
    punchWindOffsetY: 42,
    punchWindOriginX: 0.14,
    punchWindOriginXLeft: 0.86,
    punchWindOriginY: 0.52,
    shockwaveWidth: 100,
    shockwaveOffsetX: -5,
    shockwaveOffsetY: 42,
    shockwaveOriginX: 0.12,
    shockwaveOriginXLeft: 0.88,
    shockwaveOriginY: 0.5,

    rangedCooldown: 320,      // ms（保留兼容）
    rangedEnergyCost: 8,

    // ---------- 蓄力剑气（K 按住蓄力，松开释放）----------
    swordChargeMinMs: 150,
    swordChargeMaxMs: 2000,
    swordChargeMoveSpeedMult: 0.35,
    swordReleaseDuration: 320,
    swordQiCooldown: 350,
    swordQiPierceChargeMs: 1500,
    swordChargeDisplayScaleMult: 1.14,
    swordReleaseDisplayScaleMult: 1.1,
    swordChargeBarWidth: 58,
    swordChargeBarHeight: 7,
    swordChargeDamageMult: 0.5,
    swordChargeRingStartRadius: 58,
    swordChargeRingEndRadius: 10,
    swordChargeRingOffsetY: 58,
    swordChargeBlueRingRadius: 54,
    swordChargeRingInterval: 360,
    swordChargeRingDuration: 420,
    swordQiEnergyCostMin: 5,
    swordQiEnergyCostMax: 14,
    swordQiMinDamage: 14,
    swordQiMaxDamage: 48,
    swordQiMinScale: 0.45,
    swordQiMaxScale: 1.35,
    swordQiMinSpeed: 380,
    swordQiMaxSpeed: 920,
    swordQiMinRange: 260,
    swordQiMaxRange: 780,
    swordQiDisplayWidth: 110,
    swordQiHitWidthMult: 2,
    swordQiHitHeightMult: 4,
    swordQiOffsetY: 54,
    swordQiSpawnOffsetXMin: 18,
    swordQiSpawnOffsetXMax: 44,
    ultimateEnergyCost: 100,
    ultimateChargeDuration: 500,   // ms，蓄力阶段（idle + 特效）
    ultimateReleaseDuration: 2000, // ms，大招动作 + 光柱
    ultimateDuration: 2500,       // ms，总时长（蓄力 0.5s + 释放 2s）
    ultimateBeamOffsetY: 58,
    ultimateHitHalfHeight: 120,
    ultimateChargeRingStartRadius: 130,
    ultimateChargeRingEndRadius: 16,
    ultimateChargeRingInterval: 80,
    ultimateChargeRingDuration: 440,
    ultimateChargeGlowStartRadius: 100,
    ultimateChargeGlowEndRadius: 34,
    maxHp: 100,
    maxEnergy: 100,
    energyRegenRate: 3,
    invulnAfterHurt: 600,     // ms
    hurtDuration: 200,        // ms
    platformDropDuration: 400,   // ms，穿落期间忽略单向平台碰撞
    platformDropTapWindow: 350,  // ms，连续两次按下「下」的有效间隔
    bulletSpeed: 700
};
