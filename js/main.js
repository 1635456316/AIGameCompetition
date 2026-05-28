const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: document.body,
    backgroundColor: 'rgba(0,0,0,0)',
    transparent: true,
    pixelArt: false,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 1800 },
            debug: false
        }
    },
    scene: [BootScene, MenuScene, PVScene, LevelSelectScene, WorkshopScene, GameScene, ResultScene]
};

function readTestPlayLaunch() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('testPlay') !== '1') return null;

    const raw = sessionStorage.getItem('editor-test-level');
    if (!raw) {
        throw new Error('未找到试玩关卡数据，请从关卡编辑器重新发起试玩');
    }

    const levelConfig = JSON.parse(raw);
    const draftId = params.get('draftId') || sessionStorage.getItem('editor-draft-id') || '';

    return {
        mode: 'editorTest',
        levelConfig,
        editorDraftId: draftId,
        returnScene: 'editor'
    };
}

(async () => {
    try {
        window.__testPlayLaunch = readTestPlayLaunch();
        window.LevelConfigs = await loadLevelConfigs();
    } catch (err) {
        console.error('[LevelLoader]', err);
        document.body.innerHTML =
            '<div style="color:#fff;font-family:sans-serif;padding:40px;text-align:center">' +
            '<h2>关卡加载失败</h2><p>请通过本地 HTTP 服务运行游戏（如 cd server && npm start），并确认 assets/levels/ 存在。</p>' +
            '<pre style="color:#f88;margin-top:16px">' + String(err.message || err) + '</pre></div>';
        return;
    }
    new Phaser.Game(config);
})();
