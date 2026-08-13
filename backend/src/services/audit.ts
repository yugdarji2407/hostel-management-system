import {prisma} from '../lib/prisma.js';
export async function audit(input:{actorUserId?:string;actorRole?:any;action:string;entityType?:string;entityId?:string;targetUserId?:string;ipAddress?:string;userAgent?:string;requestId?:string;success?:boolean;reason?:string;metadata?:any}){try{await prisma.auditLog.create({data:{...input,success:input.success??true}})}catch(e){console.error('audit failed',e)}}
export async function notify(userId:string,type:any,title:string,message:string,data?:any){return prisma.notification.create({data:{userId,type,title,message,data}})}
