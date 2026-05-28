import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { verifySession, getCookieName } from '../services/feishuAuth.js';

export function getSessionUser(request) {
    const token = request.cookies[getCookieName()];
    return verifySession(token);
}

export async function requireAuth(request, reply) {
    const user = getSessionUser(request);
    if (!user) {
        reply.code(401).send({ error: '未登录' });
        return false;
    }
    request.user = user;
    return true;
}
