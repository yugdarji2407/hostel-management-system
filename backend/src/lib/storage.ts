import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {env} from '../config/env.js';

export interface StoredFile{storageKey:string;checksum:string;size:number}

// Adapter boundary: swap LocalDiskStorage for an S3/GCS-backed implementation later
// without touching any route code — routes only ever call save()/read()/delete().
export interface StorageAdapter{
 save(buffer:Buffer,originalName:string):Promise<StoredFile>;
 read(storageKey:string):Promise<Buffer>;
 delete(storageKey:string):Promise<void>;
}

class LocalDiskStorage implements StorageAdapter{
 private root:string;
 constructor(root:string){this.root=path.resolve(root);fs.mkdirSync(this.root,{recursive:true});}
 // storageKey never comes from user input verbatim (see save()), but resolve()
 // still guards against path traversal for defense in depth.
 private resolve(storageKey:string):string{
  const full=path.resolve(this.root,storageKey);
  if(full!==this.root && !full.startsWith(this.root+path.sep))throw new Error('INVALID_STORAGE_KEY');
  return full;
 }
 async save(buffer:Buffer,originalName:string):Promise<StoredFile>{
  const checksum=crypto.createHash('sha256').update(buffer).digest('hex');
  const ext=path.extname(originalName).replace(/[^a-zA-Z0-9.]/g,'').slice(0,10);
  const day=new Date().toISOString().slice(0,10);
  const storageKey=path.posix.join(day,`${crypto.randomUUID()}${ext}`);
  const full=this.resolve(storageKey);
  await fsp.mkdir(path.dirname(full),{recursive:true});
  await fsp.writeFile(full,buffer);
  return {storageKey,checksum,size:buffer.length};
 }
 async read(storageKey:string):Promise<Buffer>{return fsp.readFile(this.resolve(storageKey));}
 async delete(storageKey:string):Promise<void>{await fsp.unlink(this.resolve(storageKey)).catch(()=>{});}
}

export const storage:StorageAdapter=new LocalDiskStorage(env.ATTACHMENTS_DIR);
