import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('every HTML page exposes one native, labelled Back link and the shared style',async()=>{
 const pages=(await readdir(root)).filter(f=>f.endsWith('.html'));
 for(const page of pages){
  const html=await readFile(new URL(page,root),'utf8');
  const links=[...html.matchAll(/<a\b[^>]*class="[^"]*\bpremium-back\b[^"]*"[^>]*>[\s\S]*?<\/a>/g)];
  assert.equal(links.length,1,page);assert.match(links[0][0],/aria-label="Back to /,page);
  assert.match(links[0][0],/<span>Back<\/span>/,page);assert.doesNotMatch(links[0][0].split('>')[0],/\s(?:hidden|disabled|onclick)\b|javascript:/,page);
  const href=links[0][0].match(/href="([^"]+)"/)[1];assert.ok(pages.includes(href.split('?')[0]),page);
  assert.match(html,/css\/back-navigation.css\?v=back1/,page);
 }
});
test('both chat headers retain the sidebar control beside an always-available gateway link',async()=>{
 for(const page of ['chat.html','legacy-chat.html']){
  const html=await readFile(new URL(page,root),'utf8');
  assert.match(html,/<header class="chat-header">\s*<div class="header-navigation"><a class="premium-back" href="gateway.html"/);
  assert.match(html,/id="openSidebar"/);
 }
});
test('premium Back links have touch targets, keyboard focus and reduced-motion styling',async()=>{
 const css=await readFile(new URL('css/back-navigation.css',root),'utf8');
 assert.match(css,/min-height:44px/);assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion:reduce/);
});
