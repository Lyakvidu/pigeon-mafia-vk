'use strict';
(() => {
  const {target,files}=document.currentScript.dataset;
  const parsed=new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  function script(src) {
    return new Promise((resolve,reject)=>{
      const element=document.createElement('script');element.src=src;
      element.onload=resolve;element.onerror=reject;document.head.append(element);
    });
  }
  async function start() {
    let timer;
    const host=await Promise.race([
      window.platformReady||Promise.resolve(null),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(null),7500);})
    ]).finally(()=>clearTimeout(timer));
    await parsed;
    window.RELEASE_BOOT={target,host};
    const css=document.createElement('link');css.rel='stylesheet';css.href='game.css';
    const styled=new Promise(resolve=>{css.onload=resolve;css.onerror=resolve;});
    document.head.append(css);
    for(const file of files.split(','))await script(file);
    await styled;
  }
  start().catch(()=>{
    const label=document.getElementById('launch-message');
    if(label)label.textContent='Could not load the game. Please reload.';
  });
})();
