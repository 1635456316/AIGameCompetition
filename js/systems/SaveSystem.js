class SaveSystem {
    static key = 'invincibleDinoWarrior.save.v1';

    static defaultData() {
        return {
            unlockedLevel: 1,
            completedLevels: [],
            hasWatchedIntroPV: false,
            watchedPVs: [],
            settings: { volume: 0.8 }
        };
    }

    static load() {
        try {
            const raw = localStorage.getItem(SaveSystem.key);
            if (!raw) return SaveSystem.defaultData();
            return Object.assign(SaveSystem.defaultData(), JSON.parse(raw));
        } catch (e) {
            return SaveSystem.defaultData();
        }
    }

    static save(data) {
        localStorage.setItem(SaveSystem.key, JSON.stringify(data));
    }

    static unlockLevel(levelId) {
        const data = SaveSystem.load();
        data.unlockedLevel = Math.max(data.unlockedLevel || 1, levelId);
        SaveSystem.save(data);
    }

    static completeLevel(levelId) {
        const data = SaveSystem.load();
        if (!data.completedLevels.includes(levelId)) data.completedLevels.push(levelId);
        data.unlockedLevel = Math.max(data.unlockedLevel || 1, levelId + 1);
        SaveSystem.save(data);
    }

    static markIntroWatched() {
        const data = SaveSystem.load();
        data.hasWatchedIntroPV = true;
        SaveSystem.save(data);
    }

    static markPVWatched(pvId) {
        const data = SaveSystem.load();
        if (!Array.isArray(data.watchedPVs)) data.watchedPVs = [];
        if (!data.watchedPVs.includes(pvId)) {
            data.watchedPVs.push(pvId);
            SaveSystem.save(data);
        }
    }

    static hasPVWatched(pvId) {
        const data = SaveSystem.load();
        return Array.isArray(data.watchedPVs) && data.watchedPVs.includes(pvId);
    }

    static reset() {
        localStorage.removeItem(SaveSystem.key);
    }
}
