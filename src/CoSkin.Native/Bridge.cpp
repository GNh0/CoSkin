#include <windows.h>
#include <string>
#include <cstdint>
#include "SessionSource.h"

// The host verifies the original signed package and all required x64 exports.
// Decorated signatures are the ABI contract; package version is not a gate.
// No addresses are scanned, no original files are changed, and no thread is suspended.
static HMODULE ownModule;
static volatile LONG running;
using Pointer = void*;
template<size_t Count> static std::string Joined(const char* const (&pieces)[Count]) {
 std::string result;for(const auto* piece:pieces)result+=piece;return result;
}
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
 // Never send CoSkin data through the Node inspector WebSocket decoder.
 return "("+Joined(CoSkinPipeSessionSource)+")("+
   Quoted(base+L"request-"+pid+L".json")+","+
   Quoted(base+L"response-"+pid+L".json")+",()=>"+
   Joined(CoSkinRendererBridgeSource)+")";
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
