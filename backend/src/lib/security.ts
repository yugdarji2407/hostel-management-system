import crypto from 'node:crypto';
import argon2 from 'argon2';
export async function hashPassword(password:string){return argon2.hash(password,{type:argon2.argon2id});}
export async function verifyPassword(hash:string,password:string){return argon2.verify(hash,password);}
export function randomToken(bytes=32){return crypto.randomBytes(bytes).toString('base64url');}
export function sha256(value:string){return crypto.createHash('sha256').update(value).digest('hex');}
export function publicId(){return crypto.randomUUID();}
