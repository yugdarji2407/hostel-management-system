import {describe,it,expect,vi} from 'vitest';
import {ok,fail} from '../src/lib/http.js';

function mockRes(){
 const res:any={locals:{requestId:'test-request-id'},statusCode:200};
 res.status=vi.fn((code:number)=>{res.statusCode=code;return res});
 res.json=vi.fn((body:unknown)=>body);
 return res;
}

describe('http response helpers',()=>{
 it('ok() wraps data in a success envelope with the request id',()=>{
  const res=mockRes();
  const body=ok(res,{hello:'world'});
  expect(body).toEqual({success:true,data:{hello:'world'},meta:{},requestId:'test-request-id'});
 });

 it('fail() sets the status code and wraps the error envelope',()=>{
  const res=mockRes();
  const body=fail(res,404,'NOT_FOUND','Student not found');
  expect(res.status).toHaveBeenCalledWith(404);
  expect(body).toEqual({success:false,error:{code:'NOT_FOUND',message:'Student not found',details:[]},requestId:'test-request-id'});
 });
});
