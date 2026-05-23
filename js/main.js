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
    scene: [BootScene, MenuScene, PVScene, LevelSelectScene, GameScene, ResultScene]
};

const game = new Phaser.Game(config);
