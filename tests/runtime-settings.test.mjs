import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {workspaceBundle} from './workspace-bundle.mjs';
import {settingsPage} from '../src/renderer/runtime-settings.js';
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.style={};this.listeners={};}
  setAttribute(key,value){this.attributes[key]=String(value)}
  addEventListener(key,value){this.listeners[key]=value}
  append(...children){this.children.push(...children)}
}
const compiled=await build({stdin:{contents:'export {Panel} from "./src/renderer/panel.js"',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[workspaceBundle()]});
const {Panel}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
test('Settings update buttons send one request through the real panel action and release busy state',async()=>{
  globalThis.document={createElement:tag=>new Element(tag),documentElement:{lang:'ko'},querySelector:()=>null};
  const panel=Object.create(Panel.prototype);Object.assign(panel,{busy:false,runtimeSettings:{launchWithCodex:true,exitWithCodex:false,automaticUpdates:false},runtimeSettingsDraft:null,c:{externalApplying:false},render(){},notify(message){this.message=message}});
  const requests=[];panel.c.request=async op=>{requests.push(op);assert.equal(panel.updateRequesting,true);assert.equal(panel.busy,true);return{status:'ready',version:'0.2.0'}};
  const all=root=>[root,...root.children.flatMap(all)];
  const section=new Element('section');settingsPage(panel,section);
  await all(section).find(e=>e.textContent==='업데이트 확인').listeners.click();
  assert.deepEqual(requests,['runtime-update-check']);assert.equal(panel.busy,false);assert.equal(panel.updateRequesting,false);assert.match(panel.message,/0.2.0/);
  const ready=new Element('section');settingsPage(panel,ready);
  const install=all(ready).find(e=>e.textContent==='업데이트 설치');assert.equal(install.disabled,false);await install.listeners.click();
  assert.deepEqual(requests,['runtime-update-check','runtime-update-apply']);
  panel.runtimeSettingsDraft={...panel.runtimeSettings};const dirty=new Element('section');settingsPage(panel,dirty);
  assert.equal(all(dirty).find(e=>e.textContent==='업데이트 설치').disabled,true);
});
test('Settings update request failure leaves controls usable',async()=>{
  globalThis.document={createElement:tag=>new Element(tag),documentElement:{lang:'en'},querySelector:()=>null};
  const panel=Object.create(Panel.prototype);Object.assign(panel,{busy:false,runtimeSettings:{},c:{externalApplying:false,request:async()=>{throw Error('network unavailable')}},render(){},notify(){}});
  const section=new Element('section');settingsPage(panel,section);
  const all=root=>[root,...root.children.flatMap(all)];await all(section).find(e=>e.textContent==='Check for updates').listeners.click();
  assert.equal(panel.busy,false);assert.equal(panel.updateRequesting,false);assert.equal(panel.message,'network unavailable');
});
