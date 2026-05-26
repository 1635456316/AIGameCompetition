/**
 * 从 assets/levels/manifest.json 加载全部关卡配置。
 * 在 Phaser 启动前调用，结果写入 window.LevelConfigs。
 */
async function loadLevelConfigs(manifestUrl = 'assets/levels/manifest.json') {
    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) {
        throw new Error(`无法加载关卡清单: ${manifestUrl} (${manifestRes.status})`);
    }
    const manifest = await manifestRes.json();
    const urls = manifest.levels || [];
    if (!urls.length) {
        throw new Error('关卡清单为空');
    }

    const levels = await Promise.all(urls.map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`无法加载关卡: ${url} (${res.status})`);
        }
        const data = await res.json();
        if (!data.walls) data.walls = [];
        return data;
    }));

    return levels.sort((a, b) => (a.id || 0) - (b.id || 0));
}
