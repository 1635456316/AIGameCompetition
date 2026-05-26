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
        if (!player.onGround()) {
            player.fsm.change('fall');
        }
    },
    handleInput(player, input) {
        if (player.handleJumpInput(input)) return;
        if (input.dashPressed && player.canDash()) {
            player.fsm.change('dash');
        } else if (input.attackPressed && player.canAttack()) {
            player.startMeleeAttack();
        } else if (input.rangedPressed && player.canRanged()) {
            player.fireRanged();
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
        if (!player.onGround()) {
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
        } else if (input.rangedPressed && player.canRanged()) {
            player.fireRanged();
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
        if (player.onGround()) {
            player.fsm.change(dir === 0 ? 'idle' : 'run');
        }
    },
    handleInput(player, input) {
        if (input.jumpPressed && player.jumpsRemaining > 0) {
            player.performJump();
            player.playHeroAnim('hero_idle');
            player.fsm.change('jump');
        } else if (input.dashPressed && player.canDash()) {
            player.fsm.change('dash');
        } else if (input.attackPressed && player.canAttack()) {
            player.startMeleeAttack();
        } else if (input.rangedPressed && player.canRanged()) {
            player.fireRanged();
        } else if (input.ultimatePressed && player.canUltimate()) {
            player.fsm.change('ultimate');
        }
    }
};

const DashState = {
    enter(player) {
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

const HurtState = {
    enter(player, params) {
        player.resetMeleeCombo();
        player.playHeroAnim('hero_idle');
        player.hurtEndAt = player.scene.time.now + PlayerConfig.hurtDuration;
        const knockDir = params.fromRight ? -1 : 1;
        player.setVelocityX(knockDir * 220);
        player.setVelocityY(-260);
        player.sprite.setTint(0xff6666);
    },
    update(player, time, delta) {
        if (time >= player.hurtEndAt) {
            player.sprite.clearTint();
            player.fsm.change(player.onGround() ? 'idle' : 'fall');
        }
    }
};

const DeadState = {
    enter(player) {
        player.resetMeleeCombo();
        player.setVelocityX(0);
        player.playHeroAnim('hero_idle');
        player.sprite.setTint(0x444444);
        player.scene.onPlayerDead && player.scene.onPlayerDead();
    },
    update() {}
};

const UltimateState = {
    enter(player) {
        player.playHeroAnim('hero_idle');
        player.ultEndAt = player.scene.time.now + PlayerConfig.ultimateDuration;
        player.setVelocity(0, 0);
        player.body.allowGravity = false;
        player.invulnerableUntil = Math.max(player.invulnerableUntil, player.ultEndAt + 200);
        player.energy = 0;
        player.fireUltimate();
    },
    update(player, time, delta) {
        if (time >= player.ultEndAt) {
            player.body.allowGravity = true;
            player.fsm.change(player.onGround() ? 'idle' : 'fall');
        }
    },
    exit(player) {
        player.body.allowGravity = true;
    }
};
