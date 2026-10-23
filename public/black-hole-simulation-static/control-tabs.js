const tabs=[...document.querySelectorAll('[data-control-tab]')];

// Switching categories changes only the visible controls, never simulation state.
export function selectControlTab(name,{focus=false}={}){
 const selected=tabs.find(tab=>tab.dataset.controlTab===name);
 if(!selected)return;
 for(const tab of tabs){
  const active=tab===selected;
  tab.setAttribute('aria-selected',String(active));
  tab.tabIndex=active?0:-1;
  document.getElementById(tab.getAttribute('aria-controls')).hidden=!active;
 }
 const panels=document.getElementById('controlPanels');
 panels.scrollTop=0;
 if(focus)selected.focus();
}

tabs.forEach((tab,index)=>{
 tab.addEventListener('click',()=>selectControlTab(tab.dataset.controlTab));
 tab.addEventListener('keydown',event=>{
  let next;
  if(event.key==='ArrowRight')next=(index+1)%tabs.length;
  else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
  else if(event.key==='Home')next=0;
  else if(event.key==='End')next=tabs.length-1;
  else return;
  event.preventDefault();event.stopPropagation();
  selectControlTab(tabs[next].dataset.controlTab,{focus:true});
 });
});
