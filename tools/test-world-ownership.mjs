import {test} from 'node:test';import assert from 'node:assert/strict';
import {acquireWorldOwnership} from '../client/js/local-world/world-ownership.js';
class FakeLocks {
  constructor(){this.held=new Set();}
  async request(name,options,callback){assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});if(this.held.has(name))return callback(null);this.held.add(name);try{return await callback({name});}finally{this.held.delete(name);}}
}
test('world ownership rejects duplicate sessions and releases for reopening',async()=>{
 const locks=new FakeLocks(),a=await acquireWorldOwnership('one',locks),b=await acquireWorldOwnership('two',locks);
 await assert.rejects(acquireWorldOwnership('one',locks),/already open/);await a.release();await a.release();
 const again=await acquireWorldOwnership('one',locks);await again.release();await b.release();assert.equal(locks.held.size,0);
});
test('world ownership fails closed without Web Locks and propagates API errors',async()=>{
 await assert.rejects(acquireWorldOwnership('one',null),/requires Web Locks/);
 await assert.rejects(acquireWorldOwnership('one',{request(){throw Error('denied');}}),/denied/);
 await assert.rejects(acquireWorldOwnership('',new FakeLocks()),/world ID/);
});

test('experimental gameplay entry refuses a world owned by another session',async()=>{
 const {loadLocalWorld}=await import('../client/js/local-world/server.js');
 const {EXPERIMENTAL_DEFAULT_189}=await import('../client/js/local-world/generation/v1_8_9/stateful-population.js');
 const locks=new FakeLocks(),existing=await acquireWorldOwnership('saved-id',locks),old=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks}});
 let closed=false;const store={load:async()=>({id:'saved-id',state:{version:3,generator:{id:EXPERIMENTAL_DEFAULT_189.id}}}),close(){closed=true;}};
 try{await assert.rejects(loadLocalWorld({id:'saved-id'},()=>{},async()=>store),/already open/);assert.equal(closed,true);}
 finally{await existing.release();if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}
});
