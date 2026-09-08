// L16 upload acceptance precedes asynchronous safety validation. Do not fetch
// original pixels or offer preparation until the normal source state is clean.
export async function waitForVisualSource(media, legacyId, source, { signal, current = () => true, attempts = 40, delay } = {}) {
  const abort = () => { if (signal?.aborted || !current()) throw new DOMException("Source selection retired", "AbortError"); };
  const pause = delay || (() => new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); reject(new DOMException("Source selection retired", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve(); }, 1500);
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
  }));
  const sourceId = source.id;
  for (let count = 0; count < attempts; count++) {
    abort();
    if (source.id !== sourceId || source.legacy_id !== legacyId || source.kind !== "image" || ["failed", "deleting", "deleted"].includes(source.state)) throw new Error("Photo validation failed");
    if (source.safety_state === "clean" && source.state !== "uploading") return source;
    await pause(); abort();
    source = await media.source(legacyId, sourceId, signal); abort();
  }
  throw new Error("Photo validation is taking longer. Select the uploaded photo again once it is ready.");
}
