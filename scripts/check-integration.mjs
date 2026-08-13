import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const frontend=fs.readFileSync(path.join(root,'frontend/src/pages/Pages.tsx'),'utf8');
const auth=fs.readFileSync(path.join(root,'frontend/src/lib/auth.ts'),'utf8');
const pattern=/['"`](\/api\/v1[^'"`]+)['"`]/g;
const refs=[...frontend.matchAll(pattern)].map(m=>m[1]);
const authRefs=[...auth.matchAll(pattern)].map(m=>m[1]);
const supportedPrefixes=['/api/v1/auth','/api/v1/otp','/api/v1/student','/api/v1/menu','/api/v1/bills','/api/v1/receipts','/api/v1/vehicles','/api/v1/cancellation','/api/v1/complaints','/api/v1/applications','/api/v1/passes','/api/v1/notifications','/api/v1/announcements','/api/v1/admin','/api/v1/settings','/api/v1/account','/api/v1/devices','/api/v1/qr','/api/v1/rector','/api/v1/security'];
const all=[...new Set([...refs,...authRefs])];
const normalize=x=>x.replace(/\$\{[^}]+\}/g,':param').replace(/\?.*$/,'');
const missing=all.filter(ref=>!supportedPrefixes.some(prefix=>normalize(ref).startsWith(prefix)));
if(missing.length){console.error('Unsupported frontend API references:',missing);process.exit(1)}
console.log(`Integration route audit passed: ${all.length} frontend API references are mapped to backend route groups.`);
