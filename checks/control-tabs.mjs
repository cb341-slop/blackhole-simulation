import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/black-hole-simulation-static/index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../public/black-hole-simulation-static/control-tabs.js',import.meta.url),'utf8');
const panels={controlPanels:{scrollTop:0}},tabs=[];
let focused=null,checks=0;
for(const match of html.matchAll(/<button[^>]*data-control-tab="([^"]+)"[^>]*>/g)){
 const attrs=Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
 panels[attrs['aria-controls']]={hidden:attrs['aria-selected']!=='true'};
 tabs.push({dataset:{controlTab:match[1]},tabIndex:+attrs.tabindex,events:{},setAttribute:(k,v)=>attrs[k]=v,getAttribute:k=>attrs[k],addEventListener(type,fn){this.events[type]=fn;},focus(){focused=this;}});
}
vm.runInNewContext(source.replace('export function','function')+'\nglobalThis.select=selectControlTab;',{document:{querySelectorAll:()=>tabs,getElementById:id=>panels[id]}});
function selected(name){
 assert.equal(tabs.find(t=>t.getAttribute('aria-selected')==='true')?.dataset.controlTab,name);checks++;
 assert.equal(Object.entries(panels).filter(([k,v])=>k!=='controlPanels'&&!v.hidden).length,1);checks++;
 assert.equal(tabs.filter(t=>t.tabIndex===0).length,1);checks++;
}
selected('body');
for(const tab of tabs){tab.events.click();selected(tab.dataset.controlTab);}
function key(tabName,key,expected){
 const tab=tabs.find(t=>t.dataset.controlTab===tabName);let prevented=false,stopped=false;
 tab.events.keydown({key,preventDefault:()=>prevented=true,stopPropagation:()=>stopped=true});
 selected(expected);assert.ok(prevented&&stopped);assert.equal(focused.dataset.controlTab,expected);checks+=2;
}
key('physics','ArrowRight','body');key('body','ArrowLeft','physics');key('physics','Home','body');key('body','End','physics');key('disk','ArrowRight','rays');key('body','ArrowUp','physics');key('physics','ArrowDown','body');
console.log(`${checks} tab checks passed: category visibility, one keyboard stop, wraparound, Home/End, and focus.`);
