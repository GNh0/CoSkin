import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {EventEmitter} from 'node:events';
const source=fs.readFileSync(new URL('../src/CoSkin.Loader/native-renderer-bridge.js',import.meta.url),'utf8');
function fixture() {
  const events=[], pages=new Map();let timer;let time=0;
  for (const [id,url,type] of [[1,'app://-/index.html','window'],[2,'app://-/detached-window.html?initialRoute=%2Fdetached-window','window'],[3,'app://-/index.html?initialRoute=%2Favatar-overlay','window'],[4,'https://chatgpt.com','webview']]) {
    const debuggerApi=new EventEmitter();debuggerApi.attached=false;
    debuggerApi.isAttached=()=>debuggerApi.attached;
    debuggerApi.attach=()=>{debuggerApi.attached=true};
    debuggerApi.detach=()=>{debuggerApi.attached=false;debuggerApi.emit('detach')};
    debuggerApi.sendCommand=async(method,parameters)=>({method,parameters});
    pages.set(id,{id,getURL:()=>url,getType:()=>type,isDestroyed:()=>false,debugger:debuggerApi});
  }
  const electron={webContents:{fromId:id=>pages.get(id),getAllWebContents:()=>Array.from(pages.values())},BrowserWindow:{fromWebContents:()=>null}};
  const context=vm.createContext({URL,Date:{now:()=>time},process:{resourcesPath:'C:/test/resources',getBuiltinModule:()=>({createRequire:()=>()=>electron})},setInterval:fn=>{timer=fn;return{unref(){}}},clearInterval:()=>{timer=null},__coskinRendererEvent:message=>events.push(JSON.parse(message))});
  assert.equal(vm.runInContext(source,context),true);
  return {bridge:context.__coskinRendererBridge,pages,events,expire(){time=90001;timer()},context};
}
test('Native relay limits attachment to supported Codex app documents',async()=>{
  const f=fixture();assert.deepEqual(JSON.parse(JSON.stringify(f.bridge.list())).map(p=>p.id),['1','2']);
  await assert.rejects(f.bridge.command(3,'Runtime.enable',{}));await assert.rejects(f.bridge.command(4,'Runtime.enable',{}));
  await assert.rejects(f.bridge.command(1,'Network.enable',{}));assert.equal(f.pages.get(1).debugger.attached,false);
});
test('Native relay forwards only CoSkin binding events and detaches its own listener',async()=>{
  const f=fixture();await f.bridge.command(1,'Runtime.addBinding',{name:'__coskinRequest'});
  const d=f.pages.get(1).debugger;d.emit('message',{},'Runtime.bindingCalled',{name:'foreign',payload:'private'});
  d.emit('message',{},'Runtime.bindingCalled',{name:'__coskinRequest',payload:'{}'});
  assert.equal(f.events.length,1);assert.equal(f.events[0].id,1);
  f.bridge.detach(1);assert.equal(d.attached,false);assert.equal(d.listenerCount('message'),0);assert.equal(d.listenerCount('detach'),0);
});
test('Native relay preserves another debugger and recovers its externally detached session',async()=>{
  const f=fixture();const d=f.pages.get(1).debugger;d.attached=true;
  await assert.rejects(f.bridge.command(1,'Runtime.enable',{}),/Another debugger/);f.bridge.dispose();assert.equal(d.attached,true);
  const g=fixture();const own=g.pages.get(1).debugger;await g.bridge.command(1,'Runtime.enable',{});own.detach();
  await g.bridge.command(1,'Runtime.enable',{});assert.equal(own.listenerCount('message'),1);assert.equal(own.attached,true);
  g.expire();assert.equal(own.attached,false);assert.equal(g.context.__coskinRendererBridge,undefined);
});
