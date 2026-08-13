import {app} from './app.js';import {env} from './config/env.js';import {prisma} from './lib/prisma.js';import {ensureAdminAccount} from './services/bootstrap.js';
const port = env.PORT; const host = '0.0.0.0';
const start=async()=>{await ensureAdminAccount();const server=app.listen(port,host,()=>console.log(`KSV Hostel API listening on http://${host}:${port}`));const shutdown=async()=>{server.close();await prisma.$disconnect();process.exit(0)};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);};
start().catch(async e=>{console.error('Failed to start server',e);await prisma.$disconnect();process.exit(1);});
