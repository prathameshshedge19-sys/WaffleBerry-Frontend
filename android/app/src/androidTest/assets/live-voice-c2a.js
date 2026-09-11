(async () => {
  const check = (value, name) => { if (!value) throw new Error(name); };
  const { RealtimeClient } = await import('https://localhost/js/realtime-client.mjs');
  const sockets = [], events = [];
  let account = 1;
  class Socket {
    constructor() { this.readyState = 0; this.bufferedAmount = 0; sockets.push(this); }
    send() {}
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  }
  const environment = {
    location, WebSocket: Socket,
    setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id),
    setInterval: (...args) => setInterval(...args), clearInterval: id => clearInterval(id),
    LegaryaAuthApi: { getSessionEpoch: () => account },
  };
  const client = new RealtimeClient({ environment, websocketUrl: 'wss://example.invalid/realtime', onEvent: event => events.push(event),
    api: async () => ({session_id: 'synthetic', ticket: 'synthetic-ticket'}) });
  client.acquireMicrophone = async () => {};
  client.attachCapture = async () => {};
  const start = async () => {
    const pending = client.start({legacy_id: 1, mode: 'rya'});
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = sockets.at(-1); socket.readyState = 1; socket.onopen();
    socket.onmessage({data: JSON.stringify({type: 'ready', session_id: 'synthetic', generation: 1})});
    await pending; return socket;
  };
  for (let i = 0; i < 20; i++) {
    const old = await start(), message = old.onmessage, close = old.onclose;
    const ending = client.stop();
    old.onmessage({data: '{"type":"ended"}'}); await ending;
    const current = await start(), count = events.length;
    message({data: '{"type":"error"}'}); close();
    check(client.socket === current && events.length === count, 'stale callback');
    ++account; client.invalidate();
    check(client.state === 'idle' && client.socket === null && client.receipts.size === 0, 'identity fence');
  }
  client.dispose();
  check(sockets.every(socket => socket.readyState === 3), 'socket leak');
  window.__c2aSensitiveStops = 0;
  window.addEventListener('legarya:android-sensitive-stop', () => ++window.__c2aSensitiveStops);
  const focus = await window.LegaryaPlatform.requestAudioFocus('l15');
  check(focus.granted, 'focus grant');
  window.__c2aFocusGeneration = focus.generation;
  return 'PASS:20 cycles;40 sockets closed;focus granted';
})().then(value => C2AResult.complete(value)).catch(error => C2AResult.complete('FAIL:' + error.name + ':' + String(error.message).slice(0,180)));
