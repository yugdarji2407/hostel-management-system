import {api} from '../services/api';
export async function login(email:string,password:string,rememberDevice:boolean){return api.post<{status:string;role?:string;requestId?:string}>('/api/v1/auth/login',{email,password,rememberDevice,deviceName:navigator.userAgent.slice(0,60),os:navigator.platform,browser:navigator.userAgent});}
export async function logout(){return api.post('/api/v1/auth/logout');}
export async function me(){return api.get<{user:any}>('/api/v1/auth/me');}
