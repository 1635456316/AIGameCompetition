import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { levelsRoutes } from './routes/levels.js';

const app = Fastify({ logger: true });

await app.register(fastifyCookie, {
    secret: config.cookieSecret
});

app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
});

await authRoutes(app);
await levelsRoutes(app);

await app.register(fastifyStatic, {
    root: config.projectRoot,
    prefix: '/',
    decorateReply: false
});

try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Server running at ${config.publicBaseUrl}`);
    app.log.info(`Project root: ${config.projectRoot}`);
    app.log.info(`UGC root: ${config.ugcRoot}`);
    app.log.info(`Feishu redirect_uri (must match developer console): ${config.feishu.redirectUri}`);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
