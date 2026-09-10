import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const source=JSON.parse(await read('locales/source.json'));
const overrides=JSON.parse(await read('locales/overrides.json'));
const tokens=text=>(text.match(/\{\d+\}/g)||[]).sort();
for(const [index,locale]of ['de','fr','hi','mr'].entries()){
 test(`${locale}: full source coverage, safe placeholders and reviewed terminology`,async()=>{
  const dictionary=JSON.parse(await read(`locales/${locale}.json`));
  for(const {source:key}of source){assert.equal(typeof dictionary[key],'string',key);assert.ok(dictionary[key].trim(),key);assert.deepEqual(tokens(dictionary[key]),tokens(key),key);}
  for(const [key,values]of Object.entries(overrides))assert.equal(dictionary[key],values[index],key);
  if(['hi','mr'].includes(locale))for(const key of ['? Help','Media','Tutorial','Language','Legacy photo','Talk with a Legacy','Upload photos & documents','Continue with Google','Set up a Legacy']){
   assert.match(dictionary[key],/[\u0900-\u097f]/,key);assert.doesNotMatch(dictionary[key],/[A-Za-z]/,key);
  }
 });
}
test('every page includes localization before the guidance UI',async()=>{
 for(const name of (await readdir(new URL('../',import.meta.url))).filter(f=>f.endsWith('.html'))){const html=await read(name);assert.match(html,/css\/i18n\.css/);assert.match(html,/js\/i18n\.js/);assert.ok(html.indexOf('js/i18n.js')<html.indexOf('js/product-guide.js'),name);}
});
test('localized labels are not used as Story generation identifiers',async()=>{const js=await read('js/stories-dashboard.js');assert.match(js,/data-story-generate/);assert.doesNotMatch(js,/textContent\.includes\("(?:Re)?[Gg]enerate"\)/);});
