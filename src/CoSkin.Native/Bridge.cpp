#include <windows.h>
#include <string>
#include <cstdint>

// The host verifies the original signed package and all required x64 exports.
// Decorated signatures are the ABI contract; package version is not a gate.
// No addresses are scanned, no original files are changed, and no thread is suspended.
static HMODULE ownModule;
static volatile LONG running;
using Pointer = void*;
static std::string Quoted(const std::wstring& value) {
 int size=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),(int)value.size(),nullptr,0,nullptr,nullptr);
 if(size<=0) return "\"\"";
 std::string utf8(size,'\0');
 WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),(int)value.size(),utf8.data(),size,nullptr,nullptr);
 std::string result="\"";
 for(unsigned char c:utf8) {if(c=='\\'||c=='\"')result+='\\';if(c<32)return "\"\"";result+=(char)c;}
 return result+'\"';
}
static std::string Startup() {
 wchar_t path[32768]{};
 DWORD length=GetModuleFileNameW(ownModule,path,32768);
 if(!length||length>=32768) return {};
 std::wstring base(path,length);
 base=base.substr(0,base.find_last_of(L"\\/")+1);
 auto pid=std::to_wstring(GetCurrentProcessId());
 std::string source="(()=>{const fs=process.getBuiltinModule('fs');const input="+Quoted(base+L"request-"+pid+L".json")+";const output="+Quoted(base+L"response-"+pid+L".json")+";";
 source+=R"JS(
 if(fs.statSync(input).size>4096)throw Error('Invalid CoSkin connection request');
 const request=JSON.parse(fs.readFileSync(input,'utf8'));
 if(request.contractVersion!==1||request.pid!==process.pid||!Number.isSafeInteger(request.ownerPid)||request.ownerPid<=0||!/^[a-f0-9]{64}$/.test(request.nonce)||Math.abs(Date.now()-request.created)>30000)throw Error('Expired CoSkin connection request');
 let result;
 try{
 const inspector=process.getBuiltinModule('inspector');
 let endpoint=globalThis.__coskinNativeEndpoint;
 if(inspector.url() && endpoint?.contractVersion!==1)throw Error('A different inspector owns this process');
 if(inspector.url() && endpoint.closing)throw Error('CoSkin connection is closing; retry shortly');
 if(inspector.url() && endpoint.ownerPid!==request.ownerPid){
  let active=false;try{process.kill(endpoint.ownerPid,0);active=true;}catch{}
  if(active)throw Error('Another CoSkin instance owns this Codex connection');
 }
 if(!inspector.url()){
  inspector.open(0,'127.0.0.1');
  endpoint=globalThis.__coskinNativeEndpoint={contractVersion:1,pid:process.pid,ownerPid:request.ownerPid,url:inspector.url()};
 }
 endpoint.ownerPid=request.ownerPid;
 result={contractVersion:1,pid:process.pid,url:inspector.url(),nonce:request.nonce};
 }catch(error){result={contractVersion:1,pid:process.pid,error:String(error.message).slice(0,200),nonce:request.nonce};}
 const temporary=output+'.'+request.nonce+'.tmp';
 fs.writeFileSync(temporary,JSON.stringify(result),{flag:'wx',mode:0o600});
 fs.renameSync(temporary,output);
 })()
 )JS";
 return source;
}
static bool Execute(const std::string& source) {
 if(source.empty())return false;
 HMODULE chrome=GetModuleHandleW(L"chrome.dll");if(!chrome)return false;
 auto get=(Pointer(*)())GetProcAddress(chrome,"?TryGetCurrent@Isolate@v8@@SAPEAV12@XZ");
 auto context=(Pointer(*)(Pointer,Pointer*))GetProcAddress(chrome,"?GetCurrentContext@Isolate@v8@@QEAA?AV?$Local@VContext@v8@@@2@XZ");
 auto handles=(void(*)(Pointer,Pointer))GetProcAddress(chrome,"??0HandleScope@v8@@QEAA@PEAVIsolate@1@@Z");
 auto endHandles=(void(*)(Pointer))GetProcAddress(chrome,"??1HandleScope@v8@@QEAA@XZ");
 auto catcher=(void(*)(Pointer,Pointer))GetProcAddress(chrome,"??0TryCatch@v8@@QEAA@PEAVIsolate@1@@Z");
 auto endCatcher=(void(*)(Pointer))GetProcAddress(chrome,"??1TryCatch@v8@@QEAA@XZ");
 auto caught=(bool(*)(Pointer))GetProcAddress(chrome,"?HasCaught@TryCatch@v8@@QEBA_NXZ");
 auto text=(Pointer(*)(Pointer*,Pointer,const char*,int,int))GetProcAddress(chrome,"?NewFromUtf8@String@v8@@SA?AV?$MaybeLocal@VString@v8@@@2@PEAVIsolate@2@PEBDW4NewStringType@2@H@Z");
 auto compile=(Pointer(*)(Pointer*,Pointer,Pointer,Pointer))GetProcAddress(chrome,"?Compile@Script@v8@@SA?AV?$MaybeLocal@VScript@v8@@@2@V?$Local@VContext@v8@@@2@V?$Local@VString@v8@@@2@PEAVScriptOrigin@2@@Z");
 auto run=(Pointer(*)(Pointer,Pointer*,Pointer))GetProcAddress(chrome,"?Run@Script@v8@@QEAA?AV?$MaybeLocal@VValue@v8@@@2@V?$Local@VContext@v8@@@2@@Z");
 if(!get||!context||!handles||!endHandles||!catcher||!endCatcher||!caught||!text||!compile||!run)return false;
 Pointer isolate=get();if(!isolate)return false;
 // These objects are constructed/destructed by the running V8, not accessed
 // using field offsets from a particular Electron build.
 alignas(16) unsigned char hs[1024]{},tc[4096]{};
 handles(hs,isolate);catcher(tc,isolate);
 Pointer ctx=nullptr,value=nullptr;context(isolate,&ctx);
 if(ctx){
  Pointer string=nullptr,script=nullptr;
  text(&string,isolate,source.data(),0,(int)source.size());
  if(string)compile(&script,ctx,string,nullptr);
  if(script)run(script,&value,ctx);
 }
 bool success=value!=nullptr&&!caught(tc);endCatcher(tc);endHandles(hs);return success;
}
extern "C" __declspec(dllexport) LRESULT CALLBACK CoSkinConnectHook(int code,WPARAM w,LPARAM l) {
 if(code>=0&&w==PM_REMOVE){
  auto message=reinterpret_cast<MSG*>(l);
  if(message&&message->message==WM_APP+0x26D&&InterlockedCompareExchange(&running,1,0)==0){
   Execute(Startup());InterlockedExchange(&running,0);
  }
 }
 return CallNextHookEx(nullptr,code,w,l);
}
BOOL WINAPI DllMain(HINSTANCE value,DWORD reason,LPVOID) {
 if(reason==DLL_PROCESS_ATTACH){ownModule=value;DisableThreadLibraryCalls(value);}return TRUE;
}
