const PlayerConfig = {
    heroFrameHeight: 640,
    heroDisplayHeight: 96,
    heroSheetBody: { width: 200, height: 380, offsetX: 220, offsetY: 260 },
    heroStaticBody: { width: 28, height: 60, offsetX: 10, offsetY: 4 },
    moveSpeed: 320,
    jumpVelocity: -720,
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
    meleeHitOffsetX: 40,
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

    rangedCooldown: 320,      // ms
    rangedEnergyCost: 8,
    ultimateEnergyCost: 100,
    ultimateDuration: 1400,   // ms
    maxHp: 100,
    maxEnergy: 100,
    energyRegenRate: 3,
    invulnAfterHurt: 600,     // ms
    hurtDuration: 200,        // ms
    platformDropDuration: 400,   // ms，穿落期间忽略单向平台碰撞
    platformDropTapWindow: 350,  // ms，连续两次按下「下」的有效间隔
    bulletSpeed: 700
};
