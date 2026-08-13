import type {Request,Response,NextFunction} from 'express';
import crypto from 'node:crypto';
export function requestId(req:Request,res:Response,next:NextFunction){const id=String(req.header('x-request-id')||crypto.randomUUID());res.locals.requestId=id;res.setHeader('x-request-id',id);next();}
export function ok(res:Response,data:unknown,meta:Record<string,unknown>={}){return res.json({success:true,data,meta,requestId:res.locals.requestId});}
export function fail(res:Response,status:number,code:string,message:string,details:unknown[]=[]){return res.status(status).json({success:false,error:{code,message,details},requestId:res.locals.requestId});}
