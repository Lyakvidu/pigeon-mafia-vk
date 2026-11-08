'use strict';
(() => {
  const {target,host}=window.RELEASE_BOOT;
  let paused=false, audio=host?.audioEnabled!==false, busy=false, listener;
  let lastInterstitial=performance.now();
  const state=()=>({blocked:busy||paused, busy, audio});
  const notify=()=>listener?.(state());
  host?.onPause?.(value=>{paused=value;notify();});
  host?.onAudio?.(value=>{audio=value;notify();});

  async function show(kind) {
    const method=kind==='rewarded'?'showRewarded':'showInterstitial';
    if(!host?.[method]||busy||paused||document.hidden) return false;
    if(kind==='rewarded'&&!host.rewarded) return false;
    if(kind==='interstitial'&&target!=='playgama'&&performance.now()-lastInterstitial<180000) return false;
    busy=true;notify();
    const controller=new AbortController();
    let timeout;
    try {
      const failure=new Promise(resolve=>{
        const expire=()=>{controller.abort();resolve(false);};
        timeout=setTimeout(expire,8500);
        const onOpen=()=>{clearTimeout(timeout);timeout=setTimeout(expire,180000);};
        Promise.resolve().then(()=>host[method]({onOpen,signal:controller.signal})).then(resolve,()=>resolve(false));
      });
      const result=await failure;
      if(result&&kind==='interstitial') lastInterstitial=performance.now();
      return result===true;
    } finally {
      clearTimeout(timeout);busy=false;notify();
    }
  }
  window.RELEASE=Object.freeze({
    target,host,show,state,
    get rewarded(){return Boolean(host?.rewarded);},
    subscribe(callback){listener=callback;notify();},
    gameplay(active){host?.gameplay?.(active);},
    ready(){Promise.resolve(host?.ready?.()).catch(()=>{});}
  });
})();
