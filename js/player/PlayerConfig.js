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
    attackDashDamagePerTick: 10,   // 第三段多段：每跳伤害
    attackDashHitInterval: 55,     // 同一目标两次伤害最小间隔（ms）
    attackDashBossDamagePerTick: 12,
    attackDashHitWidth: 80,
    attackDashHitHeight: 60,
    attackDashHitOffsetX: 28,
    attackDashHitOffsetY: 32,
    // 普攻 1/2 段近战判定
    meleeHitWidth: 88,
    meleeHitHeight: 64,
    meleeOffsetX: 52,
    meleeOffsetY: 36,
    meleeDamage: 25,
    // 第三段冲刺 · 冲击波特效（改这里即可调大小与位置）
    shockwaveWidth: 100,       // 贴图显示宽度（像素），越大特效越大
    shockwaveOffsetX: -10,      // 相对角色的水平偏移（朝右为 +，朝左自动取反）
    shockwaveOffsetY: 42,      // 相对脚底向上的偏移（y - 此值）
    shockwaveOriginX: 0.12,    // 朝右时贴图水平锚点（0~1，越小越靠左/贴手）
    shockwaveOriginXLeft: 0.88,// 朝左时贴图水平锚点
    shockwaveOriginY: 0.5,     // 垂直锚点（0 顶 / 0.5 中 / 1 底）
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
