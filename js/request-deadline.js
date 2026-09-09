"use strict";
(() => {
  // A stuck fetch/refresh must not hold a screen disabled indefinitely. Callers
  // still fence their own UI epoch: abort cannot undo an already committed POST.
  async function withDeadline(work, {signal, timeoutMs=15000}={}) {
    const controller=new AbortController();let timer, rejectStop;
    const stopped=new Promise((_,reject)=>{rejectStop=reject;});
    const cancel=()=>{controller.abort();rejectStop(new DOMException('Cancelled','AbortError'));};
    signal?.addEventListener('abort',cancel,{once:true});
    timer=window.setTimeout(()=>{controller.abort();rejectStop(new Error('The request timed out. Please try again.'));},timeoutMs);
    try {
      if(signal?.aborted)cancel();
      return await Promise.race([stopped,Promise.resolve().then(()=>{controller.signal.throwIfAborted();return work(controller.signal);})]);
    } finally {window.clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();}
  }
  window.LegaryaAsync=Object.freeze({withDeadline});
})();
