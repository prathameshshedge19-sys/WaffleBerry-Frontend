import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const email = process.env.LEGARYA_TEST_EMAIL;
const password = process.env.LEGARYA_TEST_PASSWORD;
if (!email || !password) throw new Error("Set LEGARYA_TEST_EMAIL and LEGARYA_TEST_PASSWORD.");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = 9331;
const profile = await mkdtemp(join(tmpdir(), "legarya-new-chat-"));
const edge = spawn(edgePath, [
  "--headless=new",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "--disable-gpu",
  "--no-first-run",
  "http://localhost:5600/auth.html?mode=login",
], { stdio: "ignore", windowsHide: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitFor = async (check, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error("Timed out waiting for browser state.");
};

let socket;
let nextId = 0;
const pending = new Map();
const requests = new Map();
const completedRequests = [];

try {
  const target = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      return targets.find((item) => item.type === "page");
    } catch {
      return null;
    }
  });

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method === "Network.requestWillBeSent") {
      const request = message.params.request;
      if (request.url.includes("/conversations")) {
        requests.set(message.params.requestId, {
          method: request.method,
          url: request.url,
          payload: request.postData ? JSON.parse(request.postData) : null,
        });
      }
    }
    if (message.method === "Network.responseReceived" && requests.has(message.params.requestId)) {
      completedRequests.push({
        ...requests.get(message.params.requestId),
        status: message.params.response.status,
      });
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  };
  const waitForExpression = (expression, timeout) => waitFor(() => evaluate(expression), timeout);
  const setInput = (selector, value) => evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    element.value = ${JSON.stringify(value)};
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  const submitMessage = async (content, expectedUserMessages) => {
    await setInput("#messageInput", content);
    const enabled = await evaluate("!document.querySelector('#sendButton').disabled");
    if (!enabled) throw new Error("Composer was disabled before first send.");
    await evaluate("document.querySelector('#composer').requestSubmit(); true");
    await waitForExpression(`document.querySelectorAll('.message-user').length >= ${expectedUserMessages}
      && !document.querySelector('.message-pending')
      && !document.querySelector('#messageInput').disabled`, 90000);
  };

  await send("Runtime.enable");
  await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__legaryaConsoleErrors = [];
      const originalConsoleError = console.error;
      console.error = (...args) => {
        window.__legaryaConsoleErrors.push(args.map(String).join(" "));
        originalConsoleError(...args);
      };`,
  });
  await waitForExpression("Boolean(document.querySelector('#emailInput'))", 10000);
  await setInput("#emailInput", email);
  await setInput("#passwordInput", password);
  await evaluate("document.querySelector('#authForm').requestSubmit(); true");
  await waitForExpression("location.pathname.endsWith('/chat.html') && document.querySelectorAll('.legacy-option').length === 2", 20000);

  await evaluate(`document.querySelector('#legacyButton').click();
    [...document.querySelectorAll('.legacy-option')].find((item) => item.textContent.includes('Pallavi')).click(); true`);
  await waitForExpression("document.querySelector('#activeLegacyName').textContent.includes('Pallavi')", 10000);

  await evaluate("document.querySelector('#newConversation').click(); true");
  const firstEmptyState = await evaluate(`({
    legacy: document.querySelector('#activeLegacyName').textContent,
    storedConversation: localStorage.getItem('activeConversationId'),
    activeRows: document.querySelectorAll('.conversation-item.is-active').length
  })`);
  await submitMessage("Hi Rya", 1);
  await waitForExpression("[...document.querySelectorAll('.conversation-select')].some((item) => item.textContent.includes('Hi Rya'))", 15000);
  const firstConversationId = await evaluate("localStorage.getItem('activeConversationId')");
  const createsAfterFirst = completedRequests.filter((item) => item.method === "POST" && /\/conversations$/.test(item.url)).length;

  await submitMessage("What should we remember first?", 2);
  const secondConversationId = await evaluate("localStorage.getItem('activeConversationId')");
  const createsAfterSecond = completedRequests.filter((item) => item.method === "POST" && /\/conversations$/.test(item.url)).length;

  await evaluate("document.querySelector('#newConversation').click(); true");
  await submitMessage("Tell me something about my mother", 1);
  await waitForExpression("[...document.querySelectorAll('.conversation-select')].some((item) => item.textContent.includes('Tell me something about my mother'))", 15000);
  const pallaviSecondConversationId = await evaluate("localStorage.getItem('activeConversationId')");

  await evaluate(`document.querySelector('#legacyButton').click();
    [...document.querySelectorAll('.legacy-option')].find((item) => item.textContent.includes('Aarav')).click(); true`);
  await waitForExpression("document.querySelector('#activeLegacyName').textContent.includes('Aarav')", 10000);
  await evaluate("document.querySelector('#newConversation').click(); true");
  await submitMessage("Hi Rya", 1);
  const otherLegacyConversationId = await evaluate("localStorage.getItem('activeConversationId')");

  console.log(JSON.stringify({
    firstEmptyState,
    firstConversationId,
    secondConversationId,
    pallaviSecondConversationId,
    otherLegacyConversationId,
    createsAfterFirst,
    createsAfterSecond,
    requests: completedRequests.filter((item) => item.method === "POST"),
    consoleErrors: await evaluate("window.__legaryaConsoleErrors || []"),
  }, null, 2));
} finally {
  socket?.close();
  edge.kill();
  await Promise.race([
    new Promise((resolve) => edge.once("exit", resolve)),
    delay(3000),
  ]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
