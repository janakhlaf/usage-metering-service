import {test,after} from 'node:test';import assert from 'node:assert/strict';import {app,init,db} from '../src/server';import {createServer} from 'node:http';
const server=createServer(app);const base='http://127.0.0.1:';
const admin=process.env.ADMIN_SECRET||'local-admin-change-me';
async function call(port:number,path:string,key?:string,method='GET',body?:any){const r=await fetch(base+port+path,{method,headers:{'content-type':'application/json',...(key?{'x-api-key':key}:{}),...(path==='/admin/accounts'?{'x-admin-secret':admin}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
test('API key isolation, consumption, retry and concurrency',async()=>{await init();await new Promise<void>(r=>server.listen(0,r));const port=(server.address() as any).port;
 const a=await call(port,'/admin/accounts',undefined,'POST',{name:'test-a'}),b=await call(port,'/admin/accounts',undefined,'POST',{name:'test-b'});assert.equal(a.status,201);assert.equal(b.status,201);
 assert.equal((await call(port,'/api/users')).status,401);assert.equal((await call(port,'/api/users','bad')).status,401);
 const plans=(await call(port,'/api/plans',a.data.apiKey)).data;const basic=plans.find((p:any)=>p.name==='Basic');const u=await call(port,'/api/users',a.data.apiKey,'POST',{name:'Ahmed',planId:basic.id});assert.equal(u.status,201);
 assert.equal((await call(port,'/api/consume',b.data.apiKey,'POST',{userId:u.data.id,units:1,requestId:'cross'})).status,404);
 const payload={userId:u.data.id,units:5,requestId:'one'};const first=await call(port,'/api/consume',a.data.apiKey,'POST',payload);assert.equal(first.data.accepted,true);
 const again=await call(port,'/api/consume',a.data.apiKey,'POST',payload);assert.equal(again.data.duplicate,true);
 assert.equal((await call(port,'/api/consume',a.data.apiKey,'POST',{...payload,units:3})).status,409);
 const concurrent=await Promise.all([call(port,'/api/consume',a.data.apiKey,'POST',{userId:u.data.id,units:5,requestId:'two'}),call(port,'/api/consume',a.data.apiKey,'POST',{userId:u.data.id,units:5,requestId:'three'})]);assert.equal(concurrent.filter(x=>x.data.accepted).length,1);
 const usage=(await call(port,'/api/usage',a.data.apiKey)).data;assert.equal(usage.users.find((x:any)=>x.id===u.data.id).used,10);
 const history=(await call(port,'/api/history',a.data.apiKey)).data;assert.equal(history.items.length,3);
});after(async()=>{server.close();await db.end()});
