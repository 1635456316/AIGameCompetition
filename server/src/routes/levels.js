import fs from 'fs/promises';
import path from 'path';
import {
    createLevel,
    deleteLevel,
    getLevel,
    getLevelFilePath,
    listLevels,
    listLevelsByAuthor
} from '../services/ugcStorage.js';
import { requireAuth } from '../middleware/requireAuth.js';

export async function levelsRoutes(fastify) {
    fastify.get('/api/levels', async () => {
        const levels = await listLevels();
        return { levels };
    });

    fastify.get('/api/levels/mine', async (request, reply) => {
        if (!(await requireAuth(request, reply))) return;

        const levels = await listLevelsByAuthor(request.user.userId);
        return { levels };
    });

    fastify.get('/api/levels/:id', async (request, reply) => {
        const data = await getLevel(request.params.id);
        if (!data) {
            reply.code(404).send({ error: '关卡不存在' });
            return;
        }
        return {
            meta: data.meta,
            level: data.level
        };
    });

    fastify.post('/api/levels', async (request, reply) => {
        if (!(await requireAuth(request, reply))) return;

        let body = request.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch {
                reply.code(400).send({ error: '请求体必须是 JSON' });
                return;
            }
        }

        const { title, description, levelData, testPass, overwriteLevelId } = body || {};
        if (!levelData || typeof levelData !== 'object') {
            reply.code(400).send({ error: '缺少 levelData' });
            return;
        }

        const result = await createLevel({
            authorId: request.user.userId,
            authorName: request.user.userName,
            authorAvatar: request.user.avatarUrl || '',
            title,
            description,
            levelData,
            testPass,
            overwriteLevelId: typeof overwriteLevelId === 'string' ? overwriteLevelId : undefined
        });

        if (!result.ok) {
            if (result.duplicate) {
                reply.code(409).send({
                    error: result.error,
                    duplicate: true,
                    ownLevel: result.ownLevel,
                    existing: result.existing
                });
                return;
            }
            reply.code(400).send({ error: result.error });
            return;
        }

        reply.code(result.updated ? 200 : 201);
        return { level: result.level, updated: !!result.updated };
    });

    fastify.delete('/api/levels/:id', async (request, reply) => {
        if (!(await requireAuth(request, reply))) return;

        const result = await deleteLevel(request.params.id, request.user.userId);
        if (!result.ok) {
            reply.code(result.error === '关卡不存在' ? 404 : 403).send({ error: result.error });
            return;
        }
        return { ok: true };
    });

    fastify.get('/api/ugc/:levelId/:filename', async (request, reply) => {
        const filePath = await getLevelFilePath(request.params.levelId, request.params.filename);
        if (!filePath) {
            reply.code(404).send({ error: '文件不存在' });
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeMap = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.mp3': 'audio/mpeg',
            '.ogg': 'audio/ogg',
            '.wav': 'audio/wav',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.json': 'application/json'
        };

        const data = await fs.readFile(filePath);
        reply.header('Content-Type', mimeMap[ext] || 'application/octet-stream');
        reply.send(data);
    });
}
