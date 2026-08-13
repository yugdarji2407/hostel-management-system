import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { hashPassword } from '../lib/security.js';

export async function ensureAdminAccount(){
  if(!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;
  const email=env.ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash=await hashPassword(env.ADMIN_PASSWORD);
  const existing=await prisma.user.findUnique({where:{normalizedEmail:email}});
  if(existing){
    if(existing.role!=='ADMIN' || existing.status!=='ACTIVE'){
      await prisma.user.update({where:{id:existing.id},data:{role:'ADMIN',status:'ACTIVE',email,normalizedEmail:email,passwordHash}});
    }
    return;
  }
  await prisma.user.create({data:{email,normalizedEmail:email,passwordHash,role:'ADMIN',status:'ACTIVE',settings:{create:{}}}});
}
