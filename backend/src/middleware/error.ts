import type {Request,Response,NextFunction} from 'express';
import {ZodError} from 'zod';
import {MulterError} from 'multer';
import {fail} from '../lib/http.js';
export function notFound(req:Request,res:Response){return fail(res,404,'NOT_FOUND','Resource not found');}
export function errorHandler(err:unknown,req:Request,res:Response,next:NextFunction){
 if(res.headersSent)return next(err);
 if(err instanceof ZodError){
  const details=err.issues.map(i=>({path:i.path.join('.'),message:i.message}));
  return fail(res,400,'VALIDATION_ERROR','Invalid request data',details);
 }
 if(err instanceof MulterError){
  const message=err.code==='LIMIT_FILE_SIZE'?'File is too large':err.code==='LIMIT_FILE_COUNT'?'Too many files':err.message;
  return fail(res,400,'UPLOAD_ERROR',message);
 }
 if(err instanceof Error && err.message==='UNSUPPORTED_FILE_TYPE'){
  return fail(res,400,'UNSUPPORTED_FILE_TYPE','Only JPG, PNG, WEBP or PDF files are allowed');
 }
 console.error(err);
 return fail(res,500,'INTERNAL_ERROR','Something went wrong');
}
