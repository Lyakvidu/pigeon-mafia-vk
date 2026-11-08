'use strict';
(() => {
  const names={click:'move',peck:'move',coo:'confirm',steal:'pickup',flutter:'transition',
    deliver:'ability',win:'level',fail:'error',cat:'error',alert:'error'};
  const clips=new Map();
  let context, musicBus, effectsBus, track, wanted='menu', suspended=false;
  let levels={music:.35,effects:.65};
  let lastEffect=0;

  function clip(name) {
    if(!clips.has(name)) {
      const request=fetch('assets/audio/'+name+'.mp3').then(response=>{
        if(!response.ok) throw new Error('Audio unavailable');
        return response.arrayBuffer();
      }).then(buffer=>context.decodeAudioData(buffer)).catch(()=>null);
      clips.set(name,request);
    }
    return clips.get(name);
  }
  function audible() {return context?.state==='running'&&!suspended&&!document.hidden;}
  function stopTrack() {
    if(!track)return;
    track.stop();track.disconnect();track=null;
  }
  async function sync() {
    if(!context) return false;
    if(suspended||document.hidden) {
      await context.suspend().catch(()=>{});
      return false;
    }
    if(context.state!=='running') await context.resume().catch(()=>{});
    if(!audible())return false;
    musicBus.gain.value=levels.music;
    effectsBus.gain.value=levels.effects;
    if(wanted==='silent'||levels.music===0){stopTrack();return true;}
    if(!track) {
      const buffer=await clip('bossa');
      if(buffer&&audible()&&!track&&wanted!=='silent'&&levels.music>0) {
        track=context.createBufferSource();track.buffer=buffer;track.loop=true;
        track.connect(musicBus);track.start();
      }
    }
    return true;
  }
  async function effect(name) {
    if(!audible()||!levels.effects||!names[name]||context.currentTime-lastEffect<.065)return;
    lastEffect=context.currentTime;
    const buffer=await clip(names[name]);
    if(!buffer||!audible()||!levels.effects)return;
    const source=context.createBufferSource();source.buffer=buffer;
    source.connect(effectsBus);source.onended=()=>source.disconnect();source.start();
  }
  window.SOUND=Object.freeze({
    unlock() {
      if(!context) {
        const Audio=window.AudioContext||window.webkitAudioContext;
        if(!Audio)return Promise.resolve(false);
        try {
          context=new Audio();musicBus=context.createGain();effectsBus=context.createGain();
          musicBus.connect(context.destination);effectsBus.connect(context.destination);
        } catch {return Promise.resolve(false);}
      }
      return sync();
    },
    effect,
    scene(value){if(wanted!==value){wanted=value;return sync();}},
    setLevels(value){levels={...levels,...value};return sync();},
    suspend(){suspended=true;return sync();},
    resume(){suspended=false;return sync();},
    getState(){return {scene:wanted,state:context?.state||'locked',music:levels.music,effects:levels.effects,musicPlaying:Boolean(track&&audible())};}
  });
  document.addEventListener('visibilitychange',sync);
})();
