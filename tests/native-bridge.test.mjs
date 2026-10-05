import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {EventEmitter} from 'node:events';
const source=fs.readFileSync(new URL('../src/CoSkin.Loader/native-renderer-bridge.js',import.meta.url),'utf8');
class NativeView {
  constructor(contents, visible = true) { this.webContents = contents; this.visible = visible; this.children = []; }
  getVisible() { return this.visible; }
  setVisible(visible) { this.visible = visible; }
  addChildView(child) { this.children.push(child); }
}
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
  for (const contents of pages.values()) {
    contents.isFocused = () => contents.focused === true;
    contents.focus = () => { for (const other of pages.values()) other.focused = false; contents.focused = true; };
  }
  const root = new NativeView(), shell = new NativeView(pages.get(1)), browser = new NativeView(pages.get(4));
  const hiddenContents = {id:5, isDestroyed:()=>false, isFocused:()=>false};
  const alreadyHidden = new NativeView(hiddenContents, false), otherWindowView = new NativeView({id:6,isDestroyed:()=>false});
  root.children.push(shell, browser, alreadyHidden);
  const otherRoot = new NativeView(); otherRoot.children.push(new NativeView(pages.get(2)), otherWindowView);
  const windows = new Map([[1,root],[2,otherRoot]]);
  const electron={webContents:{fromId:id=>pages.get(id),getAllWebContents:()=>Array.from(pages.values())},BrowserWindow:{fromWebContents:contents=> windows.has(contents.id) ? {contentView:windows.get(contents.id),isFocused:()=>true,getNativeWindowHandle:()=>({readBigUInt64LE:()=>BigInt(contents.id)})} : null}};
  const context=vm.createContext({URL,Date:{now:()=>time},process:{resourcesPath:'C:/test/resources',getBuiltinModule:()=>({createRequire:()=>()=>electron})},setInterval:fn=>{timer=fn;return{unref(){}}},clearInterval:()=>{timer=null},__coskinRendererEvent:message=>events.push(JSON.parse(message))});
  assert.equal(vm.runInContext(source,context),true);
  return {bridge:context.__coskinRendererBridge,pages,events,expire(){time=90001;timer()},context,root,shell,browser,alreadyHidden,otherWindowView};
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

test('background-only hides embedded views without hiding the shell or another window and restores browser focus',async()=>{
  const f=fixture(), originalPage=f.browser.webContents;
  originalPage.focus();
  const result=await f.bridge.command(1,'CoSkin.backgroundView',{active:true});
  assert.equal(result.views,2); assert.equal(result.supported,true);
  assert.equal(f.browser.getVisible(),false); assert.equal(f.alreadyHidden.getVisible(),false);
  assert.equal(f.shell.getVisible(),true); assert.equal(f.otherWindowView.getVisible(),true);
  assert.equal(f.pages.get(1).isFocused(),true);
  assert.equal(f.pages.get(1).debugger.attached,false);
  await f.bridge.command(1,'CoSkin.backgroundView',{active:false});
  assert.equal(f.browser.getVisible(),true); assert.equal(f.alreadyHidden.getVisible(),false);
  assert.equal(originalPage.isFocused(),true); assert.equal(f.browser.webContents,originalPage);
  assert.equal(Object.hasOwn(f.browser,'setVisible'),false); assert.equal(Object.hasOwn(f.root,'addChildView'),false);
});

test('background-only covers newly attached views and restores the latest requested tab visibility',async()=>{
  const f=fixture(); await f.bridge.command(1,'CoSkin.backgroundView',{active:true});
  f.browser.setVisible(false); f.alreadyHidden.setVisible(true);
  assert.equal(f.alreadyHidden.getVisible(),false);
  const group=new NativeView(), added=new NativeView({id:7,isDestroyed:()=>false});
  f.root.addChildView(group); group.addChildView(added);
  assert.equal(added.getVisible(),false);
  f.bridge.list(); // Discovery refresh must not overwrite the requested visibility.
  await f.bridge.command(1,'CoSkin.backgroundView',{active:false});
  assert.equal(f.browser.getVisible(),false); assert.equal(f.alreadyHidden.getVisible(),true);
  assert.equal(added.getVisible(),true); assert.equal(Object.hasOwn(group,'addChildView'),false);
});

test('detach and an expired loader lease release native visibility even without a debugger session',async()=>{
  const f=fixture(); await f.bridge.command(1,'CoSkin.backgroundView',{active:true}); f.bridge.detach(1);
  assert.equal(f.browser.getVisible(),true);
  await f.bridge.command(1,'CoSkin.backgroundView',{active:true}); f.expire();
  assert.equal(f.browser.getVisible(),true); assert.equal(f.alreadyHidden.getVisible(),false);
  assert.equal(Object.hasOwn(f.browser,'setVisible'),false);
});

test('native background visibility rejects external renderer targets and malformed state',async()=>{
  const f=fixture(); await assert.rejects(f.bridge.command(4,'CoSkin.backgroundView',{active:true}));
  await assert.rejects(f.bridge.command(1,'CoSkin.backgroundView',{active:'yes'}));
  assert.equal(f.browser.getVisible(),true);
});
