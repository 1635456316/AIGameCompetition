/**
 * 全局 Debug 开关。URL ?debug=1 或游戏中按 F9 切换碰撞盒显示与调试信息。
 * URL ?respawn=1 开启复活流程调试日志（控制台过滤 [RespawnDBG]）。
 * URL ?boss=1 开启 Boss 生成位置调试日志（控制台过滤 [BossSpawnDBG]）。
 */
const GameDebug = {
    showHitboxes: false,
    respawnDebug: false,
    bossSpawnDebug: false,
    toggleKey: 'F9',
    _respawnSeq: 0,
    _bossSpawnSeq: 0,

    initFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('debug') === '1' || params.get('hitbox') === '1') {
                this.showHitboxes = true;
            }
            if (params.get('respawn') === '1') {
                this.respawnDebug = true;
            }
            if (params.get('boss') === '1') {
                this.bossSpawnDebug = true;
            }
        } catch (e) {}
    },

    toggleHitboxes() {
        this.showHitboxes = !this.showHitboxes;
        return this.showHitboxes;
    },

    respawnLog(phase, payload = {}) {
        if (!this.respawnDebug) return;
        this._respawnSeq += 1;
        console.log(`[RespawnDBG #${this._respawnSeq}] ${phase}`, payload);
    },

    bossSpawnLog(phase, payload = {}) {
        if (!this.bossSpawnDebug) return;
        this._bossSpawnSeq += 1;
        console.log(`[BossSpawnDBG #${this._bossSpawnSeq}] ${phase}`, payload);
    },

    /** 列出 feetX 附近平台/地面的顶边，便于对比复活 Y */
    nearbySurfaces(scene, feetX, margin = 96) {
        const surfaces = [];
        const collect = (group, type) => {
            group?.children?.iterate?.((obj) => {
                if (!obj?.body) return;
                const b = obj.body;
                if (feetX < b.left - margin || feetX > b.right + margin) return;
                surfaces.push({
                    type,
                    spriteX: Math.round(obj.x),
                    spriteY: Math.round(obj.y),
                    top: Math.round(b.top),
                    bottom: Math.round(b.bottom),
                    left: Math.round(b.left),
                    right: Math.round(b.right)
                });
            });
        };
        collect(scene.platforms, 'platform');
        collect(scene.groundSolids, 'ground');
        surfaces.sort((a, b) => a.top - b.top);
        return surfaces;
    },

    logPlayerPose(player, label) {
        if (!player) return {};
        const body = player.body;
        const pose = {
            logicX: Math.round(player.x),
            logicY: Math.round(player.y),
            viewX: Math.round(player.viewSprite?.x ?? NaN),
            viewY: Math.round(player.viewSprite?.y ?? NaN),
            bodyTop: body ? Math.round(body.top) : null,
            bodyBottom: body ? Math.round(body.bottom) : null,
            bodyLeft: body ? Math.round(body.left) : null,
            bodyRight: body ? Math.round(body.right) : null,
            velX: body ? Math.round(body.velocity.x) : null,
            velY: body ? Math.round(body.velocity.y) : null,
            onGround: player.onGround?.() ?? null,
            fsm: player.fsm?.currentName ?? null
        };
        this.respawnLog(label, pose);
        return pose;
    }
};

GameDebug.initFromUrl();
