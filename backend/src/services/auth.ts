import {prisma} from '../lib/prisma.js';import {hashPassword,verifyPassword,randomToken,sha256} from '../lib/security.js';import {env} from '../config/env.js';import {audit,notify} from './audit.js';
const SESSION_DAYS=30; const DEVICE_TTL=10*60*1000;
export async function login(input:{email:string;password:string;rememberDevice?:boolean;deviceName?:string;os?:string;browser?:string;ip:string;userAgent?:string;requestId?:string}){
 const identifier=input.email.trim();const normalized=identifier.toLowerCase();const byEmail=await prisma.user.findUnique({where:{normalizedEmail:normalized},include:{student:true}});const digits=identifier.replace(/\D/g,'');const phoneCandidates=Array.from(new Set([identifier,digits,digits.length===10?`+91${digits}`:`+${digits}`]));const user=byEmail||await prisma.user.findFirst({where:{student:{phone:{in:phoneCandidates}}},include:{student:true}});if(!user){return {kind:'invalid'};}
 if(user.lockedUntil&&user.lockedUntil>new Date())return {kind:'locked'};
 if(user.status==='PENDING')return {kind:'pending_verification'};if(['DISABLED','SUSPENDED'].includes(user.status))return {kind:'forbidden'};
 const valid=await verifyPassword(user.passwordHash,input.password).catch(()=>false);if(!valid){const failures=user.failedLoginAttempts+1;await prisma.user.update({where:{id:user.id},data:{failedLoginAttempts:failures,lockedUntil:failures>=5?new Date(Date.now()+15*60*1000):null}});await audit({actorUserId:user.id,actorRole:user.role,action:'LOGIN_FAILED',ipAddress:input.ip,userAgent:input.userAgent,requestId:input.requestId,success:false});return {kind:'invalid'};}
 await prisma.user.update({where:{id:user.id},data:{failedLoginAttempts:0,lockedUntil:null}});
 let device=await prisma.device.findUnique({where:{serverDeviceId:sha256(`${user.id}|${input.deviceName||'unknown'}|${input.os||''}|${input.browser||''}`)}});
 if(device?.status==='REVOKED'||device?.status==='BLOCKED')return {kind:'device_rejected'};
 if(!device){device=await prisma.device.create({data:{userId:user.id,serverDeviceId:sha256(`${user.id}|${input.deviceName||'unknown'}|${input.os||''}|${input.browser||''}`),deviceName:input.deviceName||'Unknown device',os:input.os||'Unknown',browser:input.browser||'Unknown',ipAddress:input.ip,userAgentHash:sha256(input.userAgent||''),status:'PENDING'}})}
 const challengeToken=randomToken(32);
 await prisma.loginChallenge.create({data:{tokenHash:sha256(challengeToken),userId:user.id,deviceId:device.id,expiresAt:new Date(Date.now()+10*60*1000)}});
 await audit({actorUserId:user.id,actorRole:user.role,action:'LOGIN_PASSWORD_VERIFIED',entityType:'LoginChallenge',ipAddress:input.ip,userAgent:input.userAgent,requestId:input.requestId});
 return {kind:'otp_required',challengeToken,user};

}
export async function createSessionForApproved(userId:string,deviceId:string,ip:string,userAgent:string){const raw=randomToken(48);const expires=new Date(Date.now()+SESSION_DAYS*86400000);const session=await prisma.session.create({data:{userId,deviceId,tokenHash:sha256(raw),expiresAt:expires,ipAddress:ip,userAgent,remembered:true}});return {raw,expires,session};}

export async function getLoginChallenge(rawToken:string){
  if(!rawToken) return null;
  return prisma.loginChallenge.findFirst({where:{tokenHash:sha256(rawToken),completedAt:null,expiresAt:{gt:new Date()}},include:{user:{include:{student:true}},device:true}});
}
export async function completeLoginChallenge(rawToken:string,input:{ip:string;userAgent?:string;rememberDevice?:boolean}){
  const challenge=await getLoginChallenge(rawToken);
  if(!challenge) return null;
  if(challenge.device && ['REVOKED','BLOCKED'].includes(challenge.device.status)) return null;
  const now=new Date();
  const raw=randomToken(48);
  const expires=new Date(now.getTime()+((input.rememberDevice ?? true)?SESSION_DAYS:1)*86400000);
  const result=await prisma.$transaction(async tx=>{
    const claimed=await tx.loginChallenge.updateMany({where:{id:challenge.id,completedAt:null,expiresAt:{gt:now}},data:{completedAt:now}});
    if(claimed.count!==1)return null;
    let deviceId: string;
    if(challenge.device){
      deviceId=challenge.device.id;
      await tx.device.update({where:{id:deviceId},data:{status:'APPROVED',approvedAt:now,lastSeenAt:now,ipAddress:input.ip}});
    } else {
      const createdDevice=await tx.device.create({data:{userId:challenge.userId,serverDeviceId:sha256(`${challenge.userId}|${input.userAgent||'unknown'}|${input.ip}`),deviceName:'OTP verified device',os:'Unknown',browser:'Unknown',ipAddress:input.ip,userAgentHash:sha256(input.userAgent||''),status:'APPROVED',approvedAt:now}});
      deviceId=createdDevice.id;
    }
    const session=await tx.session.create({data:{userId:challenge.userId,deviceId,tokenHash:sha256(raw),expiresAt:expires,ipAddress:input.ip,userAgent:input.userAgent,remembered:!!(input.rememberDevice ?? true)}});
    await tx.user.update({where:{id:challenge.userId},data:{lastLoginAt:now,failedLoginAttempts:0,lockedUntil:null}});
    await tx.loginHistory.create({data:{userId:challenge.userId,deviceId,event:'LOGIN_SUCCESS',status:'SUCCESS',ipAddress:input.ip,userAgent:input.userAgent}});
    return session;
  });
  if(!result)return null;
  await audit({actorUserId:challenge.userId,actorRole:challenge.user.role,action:'LOGIN',entityType:'Session',entityId:result.id,ipAddress:input.ip,userAgent:input.userAgent});
  return {raw,expires,role:challenge.user.role};
}
export async function registerStudent(input:{email:string;phone:string;password:string}){
  const email=input.email.trim().toLowerCase();
  const rawPhone=input.phone.trim();const digits=rawPhone.replace(/\D/g,'');const phone=digits.length===10?`+91${digits}`:rawPhone;
  const existing=await prisma.user.findUnique({where:{normalizedEmail:email}});
  if(existing) throw new Error('EMAIL_ALREADY_REGISTERED');
  const phoneCandidates=Array.from(new Set([phone,rawPhone,digits,digits.length===10?`+91${digits}`:rawPhone]));const phoneExists=await prisma.student.findFirst({where:{phone:{in:phoneCandidates}}});
  if(phoneExists) throw new Error('PHONE_ALREADY_REGISTERED');
  const college=await prisma.college.findFirst({where:{status:'ACTIVE'},orderBy:{createdAt:'asc'}});
  if(!college) throw new Error('COLLEGE_NOT_CONFIGURED');
  const academicYear=`${new Date().getFullYear()}-${String(new Date().getFullYear()+1).slice(-2)}`;
  const enrollmentId=`PENDING-${randomToken(8).replace(/[^A-Za-z0-9]/g,'').toUpperCase()}`;
  const user=await prisma.user.create({data:{email,normalizedEmail:email,passwordHash:await hashPassword(input.password),role:'STUDENT',status:'PENDING',student:{create:{name:'New Student',enrollmentId,phone,emailDisplay:email,collegeId:college.id,course:null,semester:1,academicYear,status:'PENDING'}},settings:{create:{}}},include:{student:true}});
  return {userId:user.publicId,email:user.email,phone:user.student?.phone};
}
