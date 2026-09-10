"use strict";

(() => {
  const supported = new Set(['en', 'de', 'fr', 'hi', 'mr']);
  const storageKey = 'legarya:ui-language';
  let language = 'en';
  try { const saved = localStorage.getItem(storageKey); if (supported.has(saved)) language = saved; } catch {}
  document.documentElement.lang = language;
  const catalogs = new Map([['en', {}]]), pending = new Map(), supplements = new Map();
  let dictionary = {}, folded = new Map(), patterns = [], revision = 0, frame = 0;
  const texts = new WeakMap(), attributes = new WeakMap(), dirty = new Set();
  const normalize = value => String(value).replace(/\s+/g, ' ').trim();
  const fold = value => normalize(value).replace(/[’‘]/g, "'").replace(/…/g, '...').toLowerCase();
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const attrNames = ['aria-label','placeholder','title','alt','data-tooltip'];
  // These are content, not interface copy. Never translate names, codes, documents or conversations.
  const protectedSelector = [
    '[translate="no"]','[data-i18n-skip]','script','style','code','pre','textarea',
    '.message-content','.message-web-sources','.stream-content','.live-call-transcript',
    '.conversation-title','.visitor-conversation-main','.conversation-name','.conversation-select',
    '#userName','#userEmail','#accountInitial','#legacyName','#sidebarLegacyName','#emptyLegacyName',
    '#inviteLegacy','#inviteOwner',
    '#legacyInitial','#presenceInitial','#accountMenu > p',
    '.memory-card-copy > p','.media-proposal','.media-extracted','.media-original-image','.media-detail > h3','.media-extraction > p','.collaborator-row strong',
    '.media-evidence blockquote','.media-evidence-text','.media-edit-preview > p','.media-source > strong',
    '.personality-description','.personality-expression-wording','.personality-context',
    '.timeline-event > h3','.timeline-event-description','.timeline-detail > h2',
    '.story-prose','.story-content','.story-body','.story-title','.story-preview','.story-card h3','.story-reader-head h3','.story-chapter-tab','.story-chapter h2',
    '[data-live-transcript]','[data-picture-name]','.live-call[data-mode="legacy"] h1','#dailyQuestionText'
  ].join(',');
  const isProtected = (el) => !!el?.closest(protectedSelector);
  function installCatalog(catalog) {
    catalog = { ...catalog, ...supplements.get(language) };
    dictionary = catalog; folded = new Map(); patterns = [];
    for (const [source, value] of Object.entries(catalog)) {
      folded.set(fold(source), value);
      if (/\{\d+\}/.test(source) && /[A-Za-z]{2}/.test(source.replace(/\{\d+\}/g,''))) {
        const ids = []; let at = 0, expression = '';
        for (const match of source.matchAll(/\{(\d+)\}/g)) { expression += escapeRegex(source.slice(at, match.index)) + '(.+?)'; ids.push(match[1]); at = match.index + match[0].length; }
        expression += escapeRegex(source.slice(at));
        patterns.push({ source, value, ids, regex: new RegExp('^' + expression + '$'), weight: source.replace(/\{\d+\}/g,'').length });
      }
    }
    patterns.sort((a,b) => b.weight-a.weight);
  }
  function t(value, parameters) {
    const source = normalize(value);
    let result = language === 'en' ? source : dictionary[source] || folded.get(fold(source));
    if (!result && language !== 'en') {
      for (const pattern of patterns) {
        const match = source.match(pattern.regex); if (!match) continue;
        const captured = {}; pattern.ids.forEach((id,i) => { captured[id] = match[i+1]; });
        const localizeSlots = {
          'Supported by {0} preserved {1}': ['1'], 'No {0} yet.': ['0'],
          '{0} · {1} · Joined {2}': ['1'], '{0} · Joined {1}': ['0'],
          '{0}-day preservation streak. {1}.': ['1'], 'Next area to explore · {0}. An invitation, never a requirement.': ['0']
        }[pattern.source] || [];
        for (const id of localizeSlots) captured[id] = dictionary[captured[id]] || folded.get(fold(captured[id])) || captured[id];
        result = pattern.value.replace(/\{(\d+)\}/g, (_,id) => captured[id]); break;
      }
    }
    result ||= source;
    if (parameters) result = result.replace(/\{(\d+)\}/g, (whole,id) => parameters[id] ?? whole);
    return result;
  }
  function translateText(node) {
    if (!node.parentElement || isProtected(node.parentElement) || !/[A-Za-z\u0900-\u097f\u00c0-\u024f]/.test(node.data)) return;
    if (location.pathname.endsWith('legacy-chat.html') && node.parentElement.closest('.message-label-assistant')) return;
    let record = texts.get(node);
    if (!record || node.data !== record.rendered) record = { source: node.data };
    const trimmed = normalize(record.source); if (!trimmed) return;
    record.rendered = record.source.replace(trimmed, t(trimmed));
    // Preserve meaningful whitespace around inline branding and links.
    if (record.rendered === record.source && trimmed !== record.source.trim()) record.rendered = record.source.match(/^\s*/)[0] + t(trimmed) + record.source.match(/\s*$/)[0];
    texts.set(node, record); if (node.data !== record.rendered) node.data = record.rendered;
  }
  function translateAttributes(el) {
    if (el.matches('script,style,[data-i18n-skip],option')) return;
    if (isProtected(el) && !el.matches('textarea,input')) return;
    let map = attributes.get(el); if (!map) { map = new Map(); attributes.set(el,map); }
    for (const name of attrNames) {
      if (!el.hasAttribute(name)) continue;
      const current = el.getAttribute(name); let record = map.get(name);
      if (!record || current !== record.rendered) record = { source: current };
      record.rendered = t(record.source); map.set(name,record);
      if (current !== record.rendered) el.setAttribute(name,record.rendered);
    }
  }
  function translate(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { translateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches('script,style,svg,[data-i18n-skip],[translate="no"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    } });
    while (walk.nextNode()) { const node = walk.currentNode; if (node.nodeType === Node.TEXT_NODE) translateText(node); else translateAttributes(node); }
    for (const input of root.querySelectorAll?.('input[type="file"]:not([data-localized-file])') || []) localizeFileInput(input);
  }
  function schedule(root) {
    if (root) dirty.add(root);
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; const roots = [...dirty]; dirty.clear(); roots.forEach(node => { if (node.isConnected) translate(node); }); });
  }
  async function load(locale) {
    if (catalogs.has(locale)) return catalogs.get(locale);
    if (!pending.has(locale)) pending.set(locale, fetch(`locales/${locale}.json?v=languages1`, { signal: AbortSignal.timeout(15000) }).then(response => {
      if (!response.ok) throw new Error('Locale unavailable'); return response.json();
    }).then(catalog => { catalogs.set(locale,catalog); return catalog; }).finally(() => pending.delete(locale)));
    return pending.get(locale);
  }
  async function setLanguage(locale, persist = true) {
    if (!supported.has(locale)) return false;
    const request = ++revision;
    try {
      const catalog = await load(locale); if (request !== revision) return false;
      language = locale; document.documentElement.lang = locale; installCatalog(catalog);
      if (persist) try { localStorage.setItem(storageKey,locale); } catch {}
      translate(document.documentElement);
      document.querySelectorAll('[data-language-select]').forEach(select => { select.value=locale; select.disabled=false; });
      window.dispatchEvent(new CustomEvent('legarya:language-change', { detail: { language: locale } }));
      return true;
    } catch {
      if (request === revision && !catalogs.has(language)) { language='en';document.documentElement.lang='en';installCatalog({});translate(document.documentElement); }
      if (request === revision) { document.querySelectorAll('[data-language-select]').forEach(select => { select.value=language; select.disabled=false; }); const status=document.querySelector('#languageStatus'); if(status)status.textContent=t('This language could not load. Please try again.'); }
      return false;
    }
  }
  function localizeFileInput(input) {
    input.dataset.localizedFile = ''; input.classList.add('i18n-file-native');
    input.tabIndex = -1;
    const control = document.createElement('span'); control.className = 'i18n-file-control';
    const choose = document.createElement('button'); choose.type='button'; choose.textContent='Choose file';
    choose.setAttribute('aria-label',attributes.get(input)?.get('aria-label')?.source || input.getAttribute('aria-label') || 'Choose file');
    const name = document.createElement('span'); name.textContent='No file chosen';
    choose.addEventListener('click', () => input.click());
    const update = () => { choose.disabled=input.disabled; if(input.files?.length) { name.setAttribute('translate','no'); name.textContent=Array.from(input.files).map(file=>file.name).join(', '); } else { name.removeAttribute('translate'); name.textContent='No file chosen'; } translate(control); };
    control.append(choose,name); input.after(control); update(); input.addEventListener('change',update);
    new MutationObserver(update).observe(input,{ attributes:true, attributeFilter:['disabled'] });
  }
  function attachSelector(select) {
    select.value=language;
    select.addEventListener('change', async () => { select.disabled=true; const status=document.querySelector('#languageStatus'); if(status)status.textContent=''; await setLanguage(select.value); });
  }
  // Native prompts stay synchronous, preserving the application's existing control flow.
  for (const name of ['alert','confirm','prompt']) { const original=window[name].bind(window); window[name]=(message,...args)=>original(t(message),...args); }
  let ready;
  const register = (code, copy) => {
    supplements.set(code, { ...supplements.get(code), ...copy });
    if (code === language) { installCatalog(catalogs.get(code) || {}); translate(document.documentElement); }
  };
  window.LegaryaI18n = Object.freeze({ t, setLanguage, translate, register, get language() { return language; }, get ready() { return ready; } });
  ready = setLanguage(language,false);
  const boot = () => {
    document.querySelectorAll('[data-language-select]').forEach(attachSelector);
    translate(document.documentElement);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type==='characterData') schedule(record.target);
        else if (record.type==='attributes') schedule(record.target);
        else record.addedNodes.forEach(schedule);
      }
    }).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:attrNames});
    // A second selector in Help lets users change language without leaving their current page.
    const addHelpSelector = () => { const help=document.querySelector('.lg-help'); if(!help||help.querySelector('[data-language-select]'))return;
      const label=document.createElement('label');label.className='i18n-help-language';const caption=document.createElement('span');caption.textContent='Language';
      const select=document.createElement('select');select.dataset.languageSelect='';select.setAttribute('aria-label','Choose your language');
      for(const [value,name] of [['en','English'],['de','Deutsch'],['fr','Français'],['hi','हिन्दी'],['mr','मराठी']]){const option=document.createElement('option');option.value=value;option.textContent=name;option.setAttribute('translate','no');select.append(option);}
      label.append(caption,select); help.querySelector('footer')?.before(label);attachSelector(select);translate(label);
    };
    addHelpSelector(); new MutationObserver(addHelpSelector).observe(document.body,{childList:true});
    document.addEventListener('input', event=>{if(event.target.dataset.i18nValidation){event.target.setCustomValidity('');delete event.target.dataset.i18nValidation;}},true);
    document.addEventListener('invalid', event=>{const input=event.target;if(input.validity.customError)return;let message=input.validity.valueMissing?'Please fill out this field.':input.validity.typeMismatch?'Please enter a valid email address.':input.validity.tooShort?'Please enter a longer value.':input.validity.patternMismatch?'Please use the requested format.':null;if(message){input.setCustomValidity(t(message));input.dataset.i18nValidation='';}},true);
    ready.then(() => translate(document.documentElement));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('storage',event=>{if(event.key===storageKey&&supported.has(event.newValue))void setLanguage(event.newValue,false);});
})();
