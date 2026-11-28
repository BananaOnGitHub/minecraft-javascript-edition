import {test} from 'node:test';import assert from 'node:assert/strict';
import {DirtySections} from '../client/js/render/dirty-sections.js';import {Game} from '../client/js/game/game.js';
test('heap drains nearest-first, reuses ordering across deletions and accepts new dirty sections',()=>{
 const d=new DirtySections(['5,4,0','0,4,0','2,4,0','100,4,0']),q=d.prioritized(0,4,0,32);
 assert.equal(q.pop()[0],'0,4,0');d.delete('0,4,0');assert.equal(d.prioritized(.8,4.5,.2,32),q);
 d.add('1,4,0');assert.equal(q.pop()[0],'1,4,0');d.delete('5,4,0');assert.equal(q.pop()[0],'2,4,0');assert.equal(q.pop(),null);assert.ok(d.has('100,4,0'));
 assert.notEqual(d.prioritized(1,4,0,32),q);const next=d.prioritized(1,4,0,32);d.clear();assert.equal(next.pop(),null);assert.notEqual(d.prioritized(1,4,0,32),next);
});
test('deferred entries retry without duplicates and outside-range changes stay deferred',()=>{
 const d=new DirtySections(['0,0,0','1,0,0']),q=d.prioritized(0,0,0,1),e=q.pop();q.add(e);q.add(e);d.add('10,0,0');
 assert.equal(q.pop()[0],'0,0,0');assert.equal(q.pop()[0],'1,0,0');assert.equal(q.pop(),null);assert.equal(d.size,3);
 assert.equal(d.prioritized(10,0,0,0).pop()[0],'10,0,0');
});
test('removing an empty section cancels its dirty job, worker lease and stale result token',()=>{
 const removed=[],g={world:{getChunk:()=>({sections:[{nonAir:0}],getSection:()=>({nonAir:0})})},dirty:new DirtySections(['0,0,0']),inFlight:new Map([['0,0,0',1]]),buildTokens:new Map([['0,0,0',1]]),playerAffectedSections:new Set(['0,0,0']),renderer:{removeSection:k=>removed.push(k)}};
 Game.prototype._markSectionDirty.call(g,0,0,0);assert.equal(g.dirty.size,0);assert.equal(g.inFlight.size,0);assert.equal(g.buildTokens.size,0);assert.equal(g.playerAffectedSections.size,0);assert.deepEqual(removed,['0,0,0']);
 g.world.getChunk=()=>({sections:[{nonAir:1}],getSection:()=>({nonAir:1})});Game.prototype._markSectionDirty.call(g,0,0,0);assert.ok(g.dirty.has('0,0,0'));
});
test('heap agrees with a full sort for a large backlog and survives arbitrary removals',()=>{
 const d=new DirtySections();for(let x=-16;x<=16;x++)for(let z=-16;z<=16;z++)for(let y=-4;y<20;y++)d.add(`${x},${y},${z}`);
 const camera=[.25,4.1,-.1],score=([,x,y,z])=>(x+.5-camera[0])**2+(y+.5-camera[1])**2*.5+(z+.5-camera[2])**2;
 const q=d.prioritized(...camera,16),expected=d.within(0,-1,16).map(score).sort((a,b)=>a-b),actual=[];
 for(let e;e=q.pop();)actual.push(score(e));assert.deepEqual(actual,expected);
});

test('chunk refresh invalidates diagonal and in-flight meshes sampling light across vertical section boundaries',async()=>{
 const {World}=await import('../client/js/world/world.js');
 const {Chunk,Section}=await import('../client/js/world/chunk.js');
 const {buildSlice,SliceWorld}=await import('../client/js/world/slice.js');
 const w=new World(), target=new Chunk(-5,4,true),source=new Chunk(-4,5,true);
 for(const sy of [2,3,4]){target.sections[sy]=new Section(true);target.sections[sy].set(15,sy===2?15:0,15,16);}
 source.sections[3]=new Section(true);source.sections[3].setSky(0,15);
 w.chunks.set('-5,4',target);w.chunks.set('-4,5',source);
 const g={world:w,dirty:new DirtySections(),inFlight:new Map([['-5,3,4',1]]),buildTokens:new Map([['-5,3,4',7]]),meshedChunks:new Set(),renderer:{invalidateVisibility(){},removeSection(){},removeChunk(){}},tileRenderer:{scanChunk(){},removeChunk(){}},pistons:{},entities:{},_markSectionDirty:Game.prototype._markSectionDirty,_dirtyChunkMeshNeighbors:Game.prototype._dirtyChunkMeshNeighbors};
 Game.prototype._setupWorldListeners.call(g);
 const before=new SliceWorld(buildSlice(w,-5,2,4));assert.equal(before.getLight(-64,48,80)>>4,15);
 source.sections[3].setSky(0,0);
 w.emit('chunkLoaded',source,1<<3,false);
 const after=new SliceWorld(buildSlice(w,-5,2,4));assert.equal(after.getLight(-64,48,80)>>4,0);
 for(const sy of [2,3,4])assert.ok(g.dirty.has(`-5,${sy},4`),`diagonal section ${sy}`);
 assert.ok(g.inFlight.has('-5,3,4'),'dirty lease is discarded on completion');
});

test('chunk unload also invalidates diagonal sampled sections',async()=>{
 const {World}=await import('../client/js/world/world.js');const {Chunk,Section}=await import('../client/js/world/chunk.js');
 const w=new World(),target=new Chunk(0,0,true),neighbor=new Chunk(1,1,true);target.sections[3]=new Section(true);target.sections[3].set(15,0,15,16);
 w.chunks.set('0,0',target);w.chunks.set('1,1',neighbor);
 const g={world:w,dirty:new DirtySections(),inFlight:new Map(),buildTokens:new Map(),meshedChunks:new Set(),renderer:{invalidateVisibility(){},removeSection(){},removeChunk(){}},tileRenderer:{scanChunk(){},removeChunk(){}},pistons:{},entities:{},_markSectionDirty:Game.prototype._markSectionDirty,_dirtyChunkMeshNeighbors:Game.prototype._dirtyChunkMeshNeighbors};
 Game.prototype._setupWorldListeners.call(g);w.unloadChunk(1,1);assert.ok(g.dirty.has('0,3,0'));
});

test('smooth lighting changes mark loaded sections dirty and stale worker results are discarded',async()=>{
 const {World}=await import('../client/js/world/world.js');const {Chunk,Section}=await import('../client/js/world/chunk.js');
 const w=new World(),c=new Chunk(0,0,true);c.sections[3]=new Section(true);c.sections[3].set(0,0,0,16);w.chunks.set('0,0',c);
 const {setPlatform}=await import('../client/js/platform/platform.js');setPlatform({});
 const worker={postMessage(){}},g={world:w,assets:{worker,setMipmapLevels(){}},settings:{smoothLighting:2,fancyGraphics:true},renderer:{removeSection(){}},_markSectionDirty:Game.prototype._markSectionDirty};
 Game.prototype._setupWorker.call(g);g.inFlight.set('0,3,0',1);g.buildTokens.set('0,3,0',7);
 Game.prototype.applyGraphicsSettings.call(g,false);assert.ok(g.dirty.has('0,3,0'));
 worker.onmessage({data:{type:'built',x:0,y:3,z:0,gen:g.meshGen,token:7}});
 assert.equal(g._meshUploads.length,0);assert.equal(g.inFlight.size,0);
 g.dirty.clear();g.settings.smoothLighting=1;Game.prototype.applyGraphicsSettings.call(g,false);assert.equal(g.dirty.size,0,'minimum and maximum share identical mesh settings');
 g.settings.smoothLighting=0;Game.prototype.applyGraphicsSettings.call(g,false);assert.ok(g.dirty.has('0,3,0'));
});
