const fs = require('node:fs');
const vm = require('node:vm');
const [sourcePath, input, output, nonce, ownerPid, pipeId, delayOpen] = process.argv.slice(2);
if (Number(delayOpen) > 0) {
  const open = fs.promises.open.bind(fs.promises);
  let count = 0;
  fs.promises.open = async (filePath, ...arguments_) => {
    if (!String(filePath).endsWith('delayed.webm')) return open(filePath, ...arguments_);
    const current = ++count;
    fs.writeFileSync(input + '.media-open-started', String(current));
    await new Promise(resolve => setTimeout(resolve, Number(delayOpen)));
    const file = await open(filePath, ...arguments_);
    const close = file.close.bind(file);
    file.close = async (...parameters) => {
      const result = await close(...parameters);
      fs.writeFileSync(input + '.media-open-closed', String(current));
      return result;
    };
    return file;
  };
}
fs.writeFileSync(input, JSON.stringify({contractVersion: 2, pid: process.pid,
  ownerPid: Number(ownerPid), nonce, pipeName: `CoSkin-${process.pid}-${pipeId}`, created: Date.now()}));
const start = vm.runInThisContext('(' + fs.readFileSync(sourcePath, 'utf8') + ')');
const waits = new Map();
let windowEvaluations = 0, functionCalls = 0, functionAttempts = 0, windowGeneration = 1;
let forcedProtocolFailures = 0, forcedProtocolMessage = 'Could not find object with given id';
const rendererContext = vm.createContext({window: {
  __fixtureWait(key, value) {
    if (waits.has(key)) throw Error('Duplicate fixture binding');
    const waiting = new Promise(resolve => waits.set(key, () => resolve(value)));
    globalThis.__coskinRendererEvent(JSON.stringify({id: 1, method: 'Runtime.bindingCalled',
      params: {name: '__coskinRequest', payload: JSON.stringify({op: 'invoke-fixture', key})}}));
    return waiting;
  },
  __fixtureReply(key) {
    const resolve = waits.get(key);
    waits.delete(key);
    resolve?.();
    return Boolean(resolve);
  },
}});
start(input, output, () => {
  globalThis.__coskinRendererBridge = {
    list() { return [{id: '1', type: 'page', url: 'app://-/index.html'}]; },
    async command(id, method, parameters) {
      if (id !== 1) throw Error('Unknown window');
      if (method === 'Runtime.evaluate') {
        const expression = parameters.expression;
        if (expression === 'window' && parameters.returnByValue === false) {
          windowEvaluations++;
          return {result: {type: 'object', objectId: `fixture-window-${windowGeneration}`}};
        }
        if (expression === 'window-object-stats') return {result: {value: {windowEvaluations, functionCalls, functionAttempts}}};
        const injectedFailure = /^fixture-protocol-failure:([12]):(object|context|other)$/.exec(expression);
        if (injectedFailure) {
          forcedProtocolFailures = Number(injectedFailure[1]);
          forcedProtocolMessage = injectedFailure[2] === 'object' ? 'Could not find object with given id' :
            injectedFailure[2] === 'context' ? 'Cannot find context with specified id' : 'Unrelated debugger protocol failure';
          return {result: {value: true}};
        }
        if (expression === 'await-binding') {
          const promise = new Promise(resolve => waits.set('binding', resolve));
          globalThis.__coskinRendererEvent(JSON.stringify({id: 1, method: 'Runtime.bindingCalled', params: {name: '__coskinRequest', payload: '{}'}}));
          await promise;
          return {result: {value: 'binding-resolved'}};
        }
        if (expression === 'reply-binding') waits.get('binding')?.();
        return {result: {value: expression}};
      }
      if (method === 'Runtime.callFunctionOn') {
        functionAttempts++;
        if (forcedProtocolFailures > 0) {
          forcedProtocolFailures--;
          if (forcedProtocolMessage !== 'Unrelated debugger protocol failure') windowGeneration++;
          throw Error(forcedProtocolMessage);
        }
        if (parameters.objectId !== `fixture-window-${windowGeneration}`) throw Error('Could not find object with given id');
        if (parameters.awaitPromise !== true || parameters.returnByValue !== true ||
            !Array.isArray(parameters.arguments) || parameters.arguments.some(argument =>
              !argument || !Object.prototype.hasOwnProperty.call(argument, 'value')))
          throw Error('Invalid typed function call');
        const callable = vm.runInContext('(' + parameters.functionDeclaration + ')', rendererContext);
        if (typeof callable !== 'function') throw Error('Invalid function declaration');
        functionCalls++;
        try {
          const value = await callable.apply(rendererContext.window, parameters.arguments.map(argument => argument.value));
          return {result: {value}};
        } catch (error) {
          // Executed JS errors are CDP exceptionDetails, never pipe protocol errors.
          return {result: {type: 'undefined'}, exceptionDetails: {text: String(error.message),
            exception: {type: 'object', subtype: 'error', description: String(error.message)}}};
        }
      }
      if (method !== 'Runtime.enable') throw Error('Unsupported test command');
      return {};
    },
    detach() {},
    dispose() { delete globalThis.__coskinRendererBridge; },
  };
  return true;
});
// Keep only this disposable test process alive; the real bridge has no ref'ed timer.
setInterval(() => {}, 1000);
