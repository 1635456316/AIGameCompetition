function _animDurationMs(scene, animKey, fallback) {
    const anim = scene.anims.get(animKey);
    if (!anim || !anim.frames || !anim.frames.length) return fallback;
    const total = anim.frames.reduce((sum, f) => sum + (f.duration || 0), 0);
    return total > 0 ? total : fallback;
}

function _animFrameStartMs(scene, animKey, frameIndex) {
    const anim = scene.anims.get(animKey);
    if (!anim || !anim.frames) return 0;
    let t = 0;
    for (let i = 0; i < frameIndex && i < anim.frames.length; i++) {
        t += anim.frames[i].duration || 0;
    }
    return t;
}

const IdleState = {
    enter(player) {
        player.setVelocityX(0);
        player.playHeroAnim('hero_idle');
    },
    update(player, time, delta) {
        if (player.input.left || player.input.right) {
            player.fsm.change('run');
            return;
        }
        if (player.isAirborne()) {
            player.fsm.change('fall');
        }
    },
    handleInput(player, input) {
        if (player.handleJumpInput(input)) return;
        if (input.dashPressed && player.canDash()) {
            player.fsm.change('dash');
        } else if (input.attackPressed && player.canAttack()) {
            player.startMeleeAttack();
        } else if (input.swordChargePressed && player.canStartSwordCharge()) {
            player.startSwordCharge();
        } else if (input.ultimatePressed && player.canUltimate()) {
            player.fsm.change('ultimate');
        }
    }
};

const RunState = {
    enter(player) {
        player.playHeroAnim('hero_run');
    },
    update(player, time, delta) {
        const dir = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
        if (dir === 0) {
            player.fsm.change('idle');
            return;
        }
        player.facing = dir;
        player.setVelocityX(dir * PlayerConfig.moveSpeed);
        if (player.isAirborne()) {
            player.fsm.change('fall');
        }
    },
    handleInput(player, input) {
        IdleState.handleInput(player, input);
    }
};

const JumpState = {
    enter(player) {
        player.playHeroAnim('hero_idle');
        player.performJump();
    },
    update(player, time, delta) {
        const dir = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
        if (dir !== 0) player.facing = dir;
        player.setVelocityX(dir * PlayerConfig.moveSpeed);
        if (player.body.velocity.y > 0) {
            player.fsm.change('fall');
        }
    },
    handleInput(player, input) {
        if (input.jumpPressed && player.jumpsRemaining > 0) {
            player.performJump();
            player.playHeroAnim('hero_idle');
        } else if (input.dashPressed && player.canDash()) {
            player.fsm.change('dash');
        } else if (input.attackPressed && player.canAttack()) {
            player.startMeleeAttack();
        } else if (input.swordChargePressed && player.canStartSwordCharge()) {
            player.startSwordCharge();
        } else if (input.ultimatePressed && player.canUltimate()) {
            player.fsm.change('ultimate');
        }
    }
};

const FallState = {
    enter(player) {
        player.playHeroAnim('hero_idle');
    },
    update(player, time, delta) {
        const dir = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
        if (dir !== 0) player.facing = dir;
        player.setVelocityX(dir * PlayerConfig.moveSpeed);
        if (player.isLanded()) {
            player.fsm.change(dir === 0 ? 'idle' : 'run');
        }
    },
    handleInput(player, input) {
        if (player.handleJumpInput(input)) return;
        if (input.dashPressed && player.canDash()) {
            player.fsm.change('dash');
        } else if (input.attackPressed && player.canAttack()) {
            player.startMeleeAttack();
        } else if (input.swordChargePressed && player.canStartSwordCharge()) {
            player.startSwordCharge();
        } else if (input.ultimatePressed && player.canUltimate()) {
            player.fsm.change('ultimate');
        }
    }
};

const DashState = {
    enter(player) {
        player._heroDisplayScaleMult = 1;
        player.playHeroAnim('hero_dash', true);
        player.dashEndAt = player.scene.time.now + PlayerConfig.dashDuration;
        player.lastDashAt = player.scene.time.now;
        player.energy = Math.max(0, player.energy - PlayerConfig.dashEnergyCost);
        player.invulnerableUntil = Math.max(
            player.invulnerableUntil,
            player.dashEndAt
        );
        player.setVelocityY(0);
        player.body.allowGravity = false;
        player.setVelocityX(player.facing * PlayerConfig.dashSpeed);
        player.spawnDashTrail();
        player.playDashSfx();
    },
    update(player, time, delta) {
        if (time >= player.dashEndAt) {
            player.body.allowGravity = true;
            if (player.onGround()) {
                player.fsm.change('idle');
            } else {
                player.fsm.change('fall');
            }
        } else {
            player.setVelocityX(player.facing * PlayerConfig.dashSpeed);
        }
    },
    exit(player) {
        player.body.allowGravity = true;
    },
    handleInput(player, input) {
        if (input.attackPressed && player.canAttack()) {
            player.startMeleeAttack(true);
        }
    }
};

const AttackState = {
    enter(player) {
        player.playHeroAnim('hero_attack', true);
        player.attackEndAt = player.scene.time.now + PlayerConfig.attackDuration;
        player.lastAttackAt = player.scene.time.now;
        player.spawnMeleeHitbox();
        player.playPunchSfx();
    },
    update(player, time, delta) {
        // 攻击时仍可空中漂移
        const dir = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
        if (player.onGround()) {
            player.setVelocityX(dir * PlayerConfig.moveSpeed * 0.4);
        } else {
            player.setVelocityX(dir * PlayerConfig.moveSpeed * 0.8);
        }
        if (time >= player.attackEndAt) {
            player.fsm.change(player.onGround() ? 'idle' : 'fall');
        }
    },
    handleInput(player, input) {
        // 冲刺可取消攻击后摇
        if (input.dashPressed && player.canDash()) {
            player.fsm.change('dash');
        }
    }
};

const AttackDashState = {
    enter(player) {
        // 第三帧（index 2）出拳姿态定格并前冲
        if (player.scene.textures.exists('tex_hero_attack')) {
            player.showHeroSheetFrame('tex_hero_attack', 'attack_2');
        } else {
            player.playHeroAnim('hero_attack', true);
        }
        const now = player.scene.time.now;
        player.attackDashEndAt = now + PlayerConfig.attackDashDuration;
        player.lastAttackAt = now;
        player.invulnerableUntil = Math.max(player.invulnerableUntil, player.attackDashEndAt);
        player.attackDashBlockedByBoss = false;
        player.attackDashBlockedByWall = false;
        player._attackDashHitTimes = new Map();
        player.setVelocityY(0);
        player.body.allowGravity = false;
        player.setVelocityX(player.facing * PlayerConfig.attackDashSpeed);
        player.playPunchSfx();
        Effects.createAttachedShockwave(player);
    },
    update(player, time, delta) {
        player.setVelocityY(0);
        if (player.attackDashBlockedByBoss || player.attackDashBlockedByWall) {
            player.setVelocityX(0);
        } else {
            player.setVelocityX(player.facing * PlayerConfig.attackDashSpeed);
        }
        Effects.syncShockwaveToPlayer(player);
        player.scene.tickAttackDashHits && player.scene.tickAttackDashHits(player);
        if (time >= player.attackDashEndAt) {
            player.body.allowGravity = true;
            player.fsm.change(player.onGround() ? 'idle' : 'fall');
        }
    },
    exit(player) {
        Effects.destroyAttachedShockwave(player);
        player.setVelocityX(0);
        player.body.allowGravity = true;
        player.attackDashBlockedByBoss = false;
        player.attackDashBlockedByWall = false;
        player._attackDashHitTimes = null;
        player.resetMeleeCombo();
    },
    handleInput() {}
};

const SwordChargeState = {
    enter(player) {
        player.swordChargeStartAt = player.scene.time.now;
        player.swordChargeRatio = 0;
        player._heroDisplayScaleMult = PlayerConfig.swordChargeDisplayScaleMult;
        if (player.scene.anims.exists('hero_sword_charge')) {
            player.playHeroAnim('hero_sword_charge', true);
        } else if (player.scene.textures.exists('tex_hero_sword_charge')) {
            player.showHeroSheetFrame('tex_hero_sword_charge', 'charge_0');
        } else {
            player.playHeroAnim('hero_idle');
        }
        Effects.createSwordChargeFx(player);
        Effects.createSwordChargeBar(player);
        player.startChargeSfx();
    },
    update(player, time, delta) {
        const dir = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
        if (dir !== 0) player.facing = dir;
        player.setVelocityX(dir * PlayerConfig.moveSpeed * PlayerConfig.swordChargeMoveSpeedMult);
        Effects.syncSwordChargeFx(player);
        Effects.updateSwordChargeBar(player);

        if (!player.input.swordChargeHeld) {
            if (player.canReleaseSwordCharge()) {
                player.releaseSwordCharge();
            } else {
                player.cancelSwordCharge();
            }
        }
    },
    exit(player) {
        player.swordChargeStartAt = 0;
        player.stopChargeSfx();
        Effects.destroySwordChargeFx(player);
        Effects.destroySwordChargeBar(player);
    },
    handleInput(player, input) {
        // 蓄力期间 L 为取消，不触发冲刺、不消耗能量
        if (input.dashPressed) {
            player.cancelSwordCharge();
        }
    }
};

const SwordReleaseState = {
    enter(player) {
        const scene = player.scene;
        const slashKey = 'hero_sword_slash';
        player._swordQiSpawned = false;
        player._heroDisplayScaleMult = PlayerConfig.swordReleaseDisplayScaleMult;
        player.playHeroAnim(slashKey, true);
        player.setVelocityX(player.facing * PlayerConfig.moveSpeed * 0.15);

        const animMs = _animDurationMs(scene, slashKey, PlayerConfig.swordReleaseDuration);
        const frame2StartMs = _animFrameStartMs(scene, slashKey, 1);

        player._swordQiSpawnTimer = scene.time.delayedCall(frame2StartMs, () => {
            if (!player.fsm.is('swordRelease') || player._swordQiSpawned) return;
            player._swordQiSpawned = true;
            player.spawnSwordQi(player.swordChargeRatio);
        });

        const finishRelease = () => {
            if (!player.fsm.is('swordRelease')) return;
            player.fsm.change(player.onGround() ? 'idle' : 'fall');
        };

        player._onSwordSlashComplete = (animation) => {
            if (animation.key !== slashKey) return;
            finishRelease();
        };
        player.viewSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, player._onSwordSlashComplete);
        player._swordReleaseFallbackTimer = scene.time.delayedCall(animMs + 80, finishRelease);
    },
    update(player, time, delta) {
        const dir = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
        if (player.onGround()) {
            player.setVelocityX(dir * PlayerConfig.moveSpeed * 0.25);
        } else {
            player.setVelocityX(dir * PlayerConfig.moveSpeed * 0.45);
        }
    },
    exit(player) {
        if (player._swordQiSpawnTimer) {
            player._swordQiSpawnTimer.remove(false);
            player._swordQiSpawnTimer = null;
        }
        if (player._swordReleaseFallbackTimer) {
            player._swordReleaseFallbackTimer.remove(false);
            player._swordReleaseFallbackTimer = null;
        }
        if (player._onSwordSlashComplete) {
            player.viewSprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE, player._onSwordSlashComplete);
            player._onSwordSlashComplete = null;
        }
        player._swordQiSpawned = false;
        player.swordChargeMs = 0;
        player.setHeroDisplayScaleMult(1);
    },
    handleInput() {}
};

const HurtState = {
    enter(player, params) {
        player.resetMeleeCombo();
        player.playHeroAnim('hero_idle');
        player.hurtEndAt = player.scene.time.now + PlayerConfig.hurtDuration;
        const knockDir = params.fromRight ? -1 : 1;
        player.setVelocityX(knockDir * 220);
        player.setVelocityY(-260);
        player.view.setTint(0xff6666);
    },
    update(player, time, delta) {
        if (time >= player.hurtEndAt) {
            player.view.clearTint();
            player.fsm.change(player.onGround() ? 'idle' : 'fall');
        }
    }
};

const DeadState = {
    enter(player) {
        player.resetMeleeCombo();
        player.setVelocityX(0);
        player.playHeroAnim('hero_idle');
        player.view.setTint(0x444444);
        player.scene.onPlayerDead && player.scene.onPlayerDead();
    },
    update() {}
};

const UltimateState = {
    enter(player) {
        const cfg = PlayerConfig;
        const scene = player.scene;
        const now = scene.time.now;
        const windup = cfg.ultimateWindupDuration || 0;
        const charge = cfg.ultimateChargeDuration;

        player.ultPhase = windup > 0 ? 'windup' : 'charge';
        player.ultEndAt = now + cfg.ultimateDuration;
        player.ultReleaseAt = now + windup + charge;
        player.playHeroAnim('hero_idle', true);
        player.setVelocity(0, 0);
        player.body.allowGravity = false;
        player.invulnerableUntil = Math.max(player.invulnerableUntil, player.ultEndAt + 200);
        player.energy = 0;

        const beginCharge = () => {
            if (!player.fsm?.is('ultimate')) return;
            player.ultPhase = 'charge';
            Effects.createUltimateChargeFx(player);
            player.startUltimateChargeSfx();
        };

        const beginRelease = () => {
            if (!player.fsm?.is('ultimate')) return;

            player.ultPhase = 'release';
            Effects.destroyUltimateChargeFx(player);
            player.stopUltimateChargeSfx();
            player.startUltimateFireSfx();
            player.applySheetHeroBody();

            if (scene.anims.exists('hero_ultimate')) {
                player.playHeroAnim('hero_ultimate', true);
            } else if (scene.textures.exists('tex_hero_ultimate')) {
                player.showHeroSheetFrame('tex_hero_ultimate', 'ultimate_0');
            }

            scene.spawnPlayerUltimate(player);
        };

        if (windup > 0) {
            player._ultChargeStartTimer = scene.time.delayedCall(windup, beginCharge);
        } else {
            beginCharge();
        }
        player._ultReleaseTimer = scene.time.delayedCall(windup + charge, beginRelease);
    },
    update(player, time) {
        if (player.ultPhase === 'charge') {
            Effects.syncUltimateChargeFx(player);
        }
        if (time >= player.ultEndAt) {
            player.body.allowGravity = true;
            player.fsm.change(player.onGround() ? 'idle' : 'fall');
        }
    },
    exit(player) {
        player.body.allowGravity = true;
        if (player._ultChargeStartTimer) {
            player._ultChargeStartTimer.remove(false);
            player._ultChargeStartTimer = null;
        }
        if (player._ultReleaseTimer) {
            player._ultReleaseTimer.remove(false);
            player._ultReleaseTimer = null;
        }
        Effects.destroyUltimateChargeFx(player);
        player.stopUltimateChargeSfx();
        player.stopUltimateFireSfx();
        player.ultPhase = null;
    }
};
