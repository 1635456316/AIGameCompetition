/**
 * 游戏实体基类：组合逻辑体 + 表现层，对外保留 sprite 指向逻辑体以兼容物理系统。
 */
class GameEntity {
    constructor(scene, x, y, entityConfig) {
        this.scene = scene;
        this.entityConfig = entityConfig || {};

        const logicCfg = entityConfig.logic || {};
        const visualCfg = entityConfig.visual || {};

        this.logic = new EntityLogic(scene, x, y, logicCfg);
        this.view = new EntityView(scene, x, y, visualCfg);

        this.logic.sprite.owner = this;
        this.sprite = this.logic.sprite;
        this.viewSprite = this.view.sprite;
    }

    get x() { return this.logic.x; }
    get y() { return this.logic.y; }
    get body() { return this.logic.body; }

    setVelocityX(v) { this.logic.setVelocityX(v); }
    setVelocityY(v) { this.logic.setVelocityY(v); }
    setVelocity(x, y) { this.logic.setVelocity(x, y); }

    syncView() {
        this.view.syncFromLogic(this.logic);
    }

    applyLogicBody(bodyCfg) {
        this.logic.applyBody(bodyCfg);
    }

    destroyEntity() {
        this.view.destroy();
        this.logic.destroy();
    }
}
