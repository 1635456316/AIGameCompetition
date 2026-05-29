/**
 * 系统墙：bindId 绑定小怪或触发器全局 id；对应小怪死亡或触发器触发后移除碰撞。
 */
class SystemWalls {
    static spawn(scene, levelConfig) {
        return (levelConfig.systemWalls || [])
            .map(cfg => new SystemWall(scene, cfg))
            .filter(w => !w.removed);
    }
}

class SystemWall {
    constructor(scene, cfg) {
        this.scene = scene;
        this.x = cfg.x;
        this.y = cfg.y;
        this.w = cfg.w || 32;
        this.h = cfg.h || 200;
        const bind = cfg.bindId ?? cfg.bindEnemyId;
        this.bindId = bind != null && bind !== '' ? String(bind) : '';
        this.removed = false;
        this._removing = false;

        this.sprite = scene.groundSolids.create(this.x, this.y, 'tile_wall');
        this.sprite.setOrigin(0.5, 0.5);
        this.sprite.setDisplaySize(this.w, this.h);
        this.sprite.setTint(0x8899bb);
        this.sprite.refreshBody();
        this.sprite.setData('isSystemWall', true);
        this.sprite.setData('isWall', true);
        this.sprite.setData('systemWallOwner', this);

        const label = this.bindId ? `⛨${this.bindId}` : '⛨?';
        this.marker = scene.add.text(this.x, this.y, label, {
            font: '12px Arial',
            color: '#eef6ff',
            stroke: '#446688',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(26);
    }

    getCollisionRect() {
        if (this.removed) return null;
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    remove() {
        if (this.removed || this._removing) return;
        this._removing = true;
        this.removed = true;

        const targets = [this.sprite, this.marker].filter(o => o && (o.active === undefined || o.active));
        Effects.flickerVanish(this.scene, targets, {
            steps: 10,
            interval: 65,
            onComplete: () => {
                this.sprite = null;
                this.marker = null;
            }
        });
    }
}
