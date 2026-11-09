'use strict';
(() => {
  const app=document.getElementById('app');
  const byId=id=>document.getElementById(id);
  const screenIds=['menu','pause','settings','help','credits','board','nest'];
  const release=window.RELEASE;
  const hosted=release&&release.target!=='web';
  const pauseCode=release?.target==='playgama'?'KeyP':'Escape';
  const defaults={music:35,effects:65,hints:true,leftHanded:false,muted:false,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
  let settings={...defaults}, screen='menu', backTo='menu', hasRun=false, selected=CAMPAIGN[0], activeMission=CAMPAIGN[0], saving=false;
  let boardView='chapters', boardDistrict=CHAPTERS[0].district;
  let progressReady=false, roofTimer=0;
  let adAttempted=false, transition=false, prefsTimer=0;
  const isEnglish=()=>I18N.language()==='en';
  function recoverSettings(saved) {
    for(const key of ['music','effects']) if(Number.isFinite(saved[key])) settings[key]=Math.max(0,Math.min(100,saved[key]));
    for(const key of ['hints','leftHanded','reducedMotion','muted']) if(typeof saved[key]==='boolean') settings[key]=saved[key];
  }
  try {
    if(!hosted)recoverSettings(JSON.parse(localStorage.getItem('pigeon-mafia-settings')||'{}'));
  } catch {}
  function setAudioLevels() {
    const mute=settings.muted||release?.state().audio===false;
    SOUND.setLevels({music:mute?0:settings.music/100,effects:mute?0:settings.effects/100});
  }
  function persistSettings() {
    if(hosted) {
      clearTimeout(prefsTimer);
      prefsTimer=setTimeout(()=>PROGRESS.setPreferences({...settings,language:I18N.language()}).catch(showSaveError),300);
    } else {
      try {localStorage.setItem('pigeon-mafia-settings',JSON.stringify(settings));} catch {}
    }
  }
  function applySettings(persist=true) {
    setAudioLevels();
    document.body.classList.toggle('no-hints',!settings.hints);
    document.body.classList.toggle('left-handed',settings.leftHanded);
    document.body.classList.toggle('reduced-motion',settings.reducedMotion);
    GAME.setReducedMotion(settings.reducedMotion);
    for(const key of ['music','effects']) {
      byId(key).value=settings[key];
      byId(key+'-value').value=settings[key]+'%';
      byId(key).style.setProperty('--fill',settings[key]+'%');
    }
    byId('hints').checked=settings.hints;
    byId('left-handed').checked=settings.leftHanded;
    byId('reduced-motion').checked=settings.reducedMotion;
    byId('muted').checked=settings.muted;
    if(persist)persistSettings();
  }
  function show(next,focus=true) {
    screen=next;
    if(next==='board') renderBoard();
    if(next==='nest') renderNest();
    app.dataset.screen=next;
    const inGame=next==='playing'||next==='result';
    byId('game-screen').hidden=!inGame;
    byId('game-screen').inert=!inGame;
    for(const name of screenIds) byId(name+'-screen').hidden=next!==name;
    updateRoof();
    if(next!=='playing') GAME.pause();
    release?.gameplay(next==='playing'&&!release.state().blocked&&!document.hidden);
    SOUND.scene(next==='playing'?'play':next==='pause'?'paused':next==='result'?'silent':'menu');
    if(focus) {
      const area=inGame?byId(next==='result'?'result':'game-screen'):byId(next+'-screen');
      area.querySelector('button:not([hidden])')?.focus({preventScroll:true});
    }
  }
  function canResume(next) {return hasRun&&activeMission===next&&GAME.status().phase==='play';}
  function updateRoof() {
    clearTimeout(roofTimer);
    if(screen!=='menu'||document.hidden) return;
    const save=PROGRESS.state();
    const done=CAMPAIGN.filter(m=>save.completed[m.id]).length;
    const next=PROGRESS.next();
    byId('continue').disabled=!progressReady||saving||!PROGRESS.unlocked(next);
    byId('continue-label').textContent=T(done||canResume(next)?'Продолжить дело':'Первое дело');
    byId('continue-job').textContent=missionName(next);
    byId('roof-progress').textContent=done+'/150 · '+(isEnglish()?'Jobs closed':'Дел закрыто');
    const canvas=byId('title-art');
    ROOF_ART.drawRoof(canvas,save);
    if(settings.reducedMotion) return;
    function stir() {
      if(screen!=='menu'||document.hidden||settings.reducedMotion) return;
      ROOF_ART.drawRoof(canvas,save,1);
      roofTimer=setTimeout(()=>{
        ROOF_ART.drawRoof(canvas,save,2);
        roofTimer=setTimeout(()=>{
          ROOF_ART.drawRoof(canvas,save);
          roofTimer=setTimeout(stir,3800);
        },240);
      },240);
    }
    roofTimer=setTimeout(stir,1800);
  }
  function clickSound() { SOUND.unlock().then(()=>SOUND.effect('click')); }
  function startRun() {
    if(saving) return;
    clickSound();
    hasRun=true;
    show('playing',false);
    GAME.newRun(activeMission);
    if(release?.state().blocked)GAME.pause();
  }
  function resume() {
    clickSound();
    show('playing',false);
    GAME.resume();
  }
  function pause() {
    if(screen!=='playing') return;
    show('pause');
  }
  function open(name) {
    backTo=screen;
    clickSound();
    show(name);
  }
  byId('play').addEventListener('click',async()=>{await PROGRESS.ready;clickSound();openBoard('chapters');});
  byId('restart').addEventListener('click',startRun);
  byId('again').addEventListener('click',()=>leaveResult(startRun));
  byId('resume').addEventListener('click',resume);
  byId('continue').addEventListener('click',()=>{
    const next=PROGRESS.next();
    if(!PROGRESS.unlocked(next)) return;
    if(canResume(next)) {resume();return;}
    activeMission=next;startRun();
  });
  byId('pause').addEventListener('click',pause);
  byId('home').addEventListener('click',()=>{clickSound();show('menu');});
  byId('result-menu').addEventListener('click',()=>leaveResult(()=>{clickSound();show('menu');}));
  byId('open-settings').addEventListener('click',()=>open('settings'));
  byId('pause-settings').addEventListener('click',()=>open('settings'));
  byId('open-help').addEventListener('click',()=>open('help'));
  byId('open-credits').addEventListener('click',()=>open('credits'));
  document.querySelectorAll('[data-back]').forEach(button=>button.addEventListener('click',()=>{clickSound();show(backTo);}));
  for(const key of ['music','effects']) {
    byId(key).addEventListener('input',()=>{
      settings[key]=Number(byId(key).value);
      applySettings();
      SOUND.unlock();
    });
    byId(key).addEventListener('change',()=>SOUND.effect(key==='effects'?'coo':'click'));
  }
  for(const [id,key] of [['hints','hints'],['left-handed','leftHanded'],['reduced-motion','reducedMotion'],['muted','muted']]) {
    byId(id).addEventListener('change',()=>{settings[key]=byId(id).checked;applySettings();clickSound();});
  }
  byId('defaults').addEventListener('click',()=>{settings={...defaults};applySettings();clickSound();});
  async function leaveResult(next) {
    if(screen!=='result'||saving||transition||release?.state().blocked)return;
    transition=true;
    try {
      if(release&&!adAttempted)await release.show('interstitial');
      if(screen==='result')next();
    } finally {transition=false;}
  }
  byId('bonus-ad').addEventListener('click',async()=>{
    if(!release||screen!=='result'||transition||saving||adAttempted)return;
    transition=true;adAttempted=true;
    byId('bonus-ad').hidden=true;
    try {
      if(await release.show('rewarded')) {
        const bonus=await PROGRESS.claimAd(activeMission.id);
        if(bonus)byId('reward').textContent+=' · '+T('Бонус за рекламу · +10 крошек');
      } else byId('reward').textContent+=' · '+T('Реклама недоступна. Можно продолжать.');
    } catch(e){byId('reward').textContent+=' · '+T(e.message);showSaveError();}
    finally {transition=false;}
  });
  window.addEventListener('game-ended',async event=>{
    const {outcome,mission,time}=event.detail;
    adAttempted=false;byId('bonus-ad').hidden=true;
    drawResult(outcome);
    show('result');
    if(outcome!=='win') return;
    saving=true;
    byId('next-order').disabled=true;
    byId('again').disabled=true;
    try {
      const receipt=await PROGRESS.complete(mission,{time});
      byId('reward').textContent=receipt.first?'+'+receipt.reward+' '+T('крошек')+' · '+T('Рекорд')+' '+receipt.best.toFixed(1)+' '+T('с')+' · '+medalName(receipt.medal):T('Награда уже получена')+' · '+T('Рекорд')+' '+receipt.best.toFixed(1)+' '+T('с');
      byId('bonus-ad').hidden=!(release?.rewarded&&receipt.first&&CAMPAIGN.includes(mission)&&!PROGRESS.error());
    } catch(e) {byId('reward').textContent=T(e.message);showSaveError();}
    saving=false;byId('next-order').disabled=false;byId('again').disabled=false;
  });
  window.addEventListener('blur',()=>{if(!release?.state().blocked)pause();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) { pause(); SOUND.suspend(); }
    else if(!release?.state().blocked)SOUND.resume();
    updateRoof();
  });
  window.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.altKey||event.metaKey) return;
    if(release?.state().blocked)return;
    if(event.code===pauseCode) {
      event.preventDefault();
      if(screen==='playing') pause();
      else if(screen==='pause') resume();
      else if(screen==='board'&&boardView!=='chapters') returnToChapters();
      else if(['board','nest'].includes(screen)) show('menu');
      else if(['settings','help','credits'].includes(screen)) show(backTo);
      return;
    }
    if(screen==='playing'||event.target instanceof HTMLInputElement) return;
    if(['ArrowUp','ArrowDown'].includes(event.code)) {
      event.preventDefault();
      const parent=screen==='result'?byId('result'):byId(screen+'-screen');
      const items=[...parent.querySelectorAll('button:not([disabled]),a[href],input')].filter(el=>el.getClientRects().length);
      const index=items.indexOf(document.activeElement);
      const next=(index+(event.code==='ArrowDown'?1:-1)+items.length)%items.length;
      items[next]?.focus();
      SOUND.effect('click');
    }
  });

  function sprite(c,name,x,y,scale=1,options={}) {
    c.save();c.translate(x,y);c.scale(scale,scale);ART.draw(c,name,0,0,options);c.restore();
  }
  for(const node of document.querySelectorAll('canvas[data-art]')) {
    const c=node.getContext('2d');
    c.imageSmoothingEnabled=false;
    ART.draw(c,node.dataset.art,node.width/2,node.height-1,{variant:1});
  }
  function drawResult(outcome) {
    const c=byId('result-art').getContext('2d');
    c.clearRect(0,0,120,50);
    if(outcome==='win') {
      sprite(c,'ally',25,45,1.4);sprite(c,'pigeon',60,43,1.8);sprite(c,'ally',95,45,1.4,{flip:true,variant:2});
      sprite(c,'fries',63,44,1.5);
    } else {
      sprite(c,'alarm',43,44,1.5);
      sprite(c,outcome==='cat'?'cat':'sweeper',86,45,1.1,{flip:true});
    }
  }
  function showSaveError() {
    const message=PROGRESS.error();
    byId('save-error').hidden=!message;
    byId('save-error').textContent=T(message);
  }
  function renderWallet() {
    document.querySelectorAll('.wallet').forEach(el=>el.textContent=PROGRESS.state().crumbs+' '+T('крошек'));
  }
  function medalName(medal) {return T({gold:'Золото',silver:'Серебро',bronze:'Бронза'}[medal]);}
  function missionName(m) {return isEnglish()?m.en:m.title;}
  const chapterThemes=[
    ['Первые налёты и сбор стаи','First heists and recruits'],['Передача грузов и разведка','Handoffs and scouting'],
    ['Задвижки и ремонт','Switches and repairs'],['Перелёты и ветер','Flight routes and wind'],
    ['Пути между крышами','Rooftop crossings'],['Укрытия и скрытность','Hideouts and stealth'],
    ['Спасение и сопровождение','Rescue and escort'],['Обмены на рынке','Market trades'],
    ['Работа в паре','Teamwork and plates'],['Борьба за территорию','Contested turf'],
    ['Сеть доставок','Delivery network'],['Восстановление проходов','Repair routes'],
    ['Толпы и отвлечения','Crowds and distractions'],['Финал депо','Depot finale'],['Дела между районами','Jobs across districts']
  ];
  const chapters=CHAPTERS.map(chapter=>({...chapter,jobs:CAMPAIGN.filter(m=>m.chapter===chapter.id)}));
  const districts=ROOF_ART.districts.map(district=>({...district,chapters:chapters.filter(c=>c.district===district.id)}));
  const chapterName=c=>isEnglish()?c.en:c.ru;
  const districtName=id=>{
    const district=districts.find(d=>d.id===id);
    return isEnglish()?district.en:district.ru;
  };
  function prerequisite(m,isChallenge) {
    return isChallenge?CAMPAIGN.find(job=>job.id===(m.requires||'territory')):CAMPAIGN[CAMPAIGN.indexOf(m)-1];
  }
  function chooseOrder(list,save) {
    return list.find(m=>!save.completed[m.id]&&PROGRESS.unlocked(m))||list.find(m=>!save.completed[m.id])||list[0];
  }
  function resetBoardScroll() {
    byId('board-screen').scrollTop=0;
    window.scrollTo(0,0);
  }
  function openBoard(view) {
    selected=PROGRESS.next();
    const isChallenge=CHALLENGES.includes(selected);
    if(!isChallenge) boardDistrict=chapters.find(c=>c.id===selected.chapter).district;
    boardView=view==='chapters'?'chapters':isChallenge?'challenges':'orders';
    show('board');resetBoardScroll();
  }
  function openOrders(view,mission) {
    boardView=view;selected=mission;
    renderBoard();resetBoardScroll();
    byId('order-heading').focus({preventScroll:true});
  }
  function returnToChapters() {
    boardView='chapters';renderBoard();
    const chapter=CAMPAIGN.includes(selected)?byId('chapter-nav').querySelector(`[data-chapter="${selected.chapter}"]`):null;
    const target=chapter||byId('chapter-nav').querySelector(`[data-chapter-district="${boardDistrict}"] button`);
    target?.scrollIntoView({block:'nearest'});
    target?.focus({preventScroll:true});
  }
  function renderChapterIndex(save) {
    const nav=byId('district-nav');
    const index=byId('chapter-nav');index.replaceChildren();
    for(const {id,x,y,chapters:districtChapters} of districts) {
      const open=districtChapters.filter(c=>c.jobs.some(PROGRESS.unlocked)).length;
      let button=nav.querySelector(`[data-district="${id}"]`);
      if(!button) {
        button=document.createElement('button');button.className='district-pin';button.dataset.district=id;
        button.style.setProperty('--x',x/384*100+'%');button.style.setProperty('--y',y/218*100+'%');
        button.append(document.createElement('strong'),document.createElement('small'));
        button.addEventListener('click',()=>{
          boardDistrict=id;SOUND.effect('click');renderBoard();
          const group=index.querySelector(`[data-chapter-district="${id}"]`);
          group.scrollIntoView({block:'nearest'});
          group.querySelector('button').focus({preventScroll:true});
        });
        nav.append(button);
      }
      button.setAttribute('aria-pressed',String(boardDistrict===id));
      button.dataset.locked=String(open===0);
      button.firstElementChild.textContent=districtName(id);
      button.lastElementChild.textContent=open+'/'+districtChapters.length+' '+T('глав');
      const group=document.createElement('section');group.dataset.chapterDistrict=id;
      group.className='chapter-district';group.dataset.active=String(boardDistrict===id);
      const label=document.createElement('h4');label.textContent=districtName(id);group.append(label);
      for(const chapter of districtChapters) {
        const locked=!chapter.jobs.some(PROGRESS.unlocked);
        const done=chapter.jobs.filter(m=>save.completed[m.id]).length;
        const entry=document.createElement('button');entry.className='chapter-entry';
        entry.dataset.chapter=chapter.id;entry.dataset.locked=String(locked);
        if(CAMPAIGN.includes(selected)&&selected.chapter===chapter.id)entry.setAttribute('aria-current','true');
        const number=document.createElement('span');number.className='chapter-number';
        number.textContent=String(chapter.id).padStart(2,'0');
        const info=document.createElement('span');info.className='chapter-info';
        const name=document.createElement('strong');name.textContent=chapterName(chapter);
        const status=document.createElement('small');
        const previous=prerequisite(chapter.jobs[0],false);
        status.textContent=locked&&previous?T('После дела №')+(CAMPAIGN.indexOf(previous)+1):done+'/'+chapter.jobs.length;
        info.append(name,status);
        const icon=document.createElement('span');
        if(locked){icon.className='lock-mark';icon.setAttribute('aria-label',T('Закрыто'));}
        else if(done===chapter.jobs.length){icon.className='done-mark';icon.setAttribute('aria-label',T('Выполнено'));}
        else {icon.textContent='›';icon.setAttribute('aria-hidden','true');}
        entry.append(number,info,icon);
        entry.addEventListener('click',()=>{
          boardDistrict=id;SOUND.effect('click');openOrders('orders',chooseOrder(chapter.jobs,PROGRESS.state()));
        });
        group.append(entry);
      }
      index.append(group);
    }
    const done=CAMPAIGN.filter(m=>save.completed[m.id]).length;
    const closed=chapters.filter(c=>c.jobs.every(m=>save.completed[m.id])).length;
    byId('city-progress').textContent=done+'/'+CAMPAIGN.length+' '+T('дел')+' · '+closed+'/'+chapters.length+' '+T('глав');
  }
  function renderBoard() {
    renderWallet();
    const save=PROGRESS.state();
    const isIndex=boardView==='chapters', isChallenge=boardView==='challenges';
    byId('campaign-catalog').hidden=!isIndex;
    byId('campaign-orders').hidden=isIndex;
    byId('board-challenges').setAttribute('aria-pressed',String(isChallenge));
    showSaveError();
    if(isIndex){renderChapterIndex(save);return;}

    const list=byId('order-list');
    list.replaceChildren();
    const chapter=chapters.find(c=>c.id===selected.chapter);
    const available=isChallenge?CHALLENGES:chapter.jobs;
    byId('order-district').textContent=isChallenge?'':districtName(chapter.district);
    byId('order-district').hidden=isChallenge;
    byId('order-heading').textContent=isChallenge?T('Испытания'):T('Глава')+' '+chapter.id+' · '+chapterName(chapter);
    const counts=available.filter(m=>save.completed[m.id]).length+'/'+available.length;
    byId('chapter-progress').textContent=isChallenge?counts:chapterThemes[chapter.id-1][isEnglish()?1:0]+' · '+counts;
    for(const [index,m] of available.entries()) {
      const row=document.createElement('button');
      row.className='order-row'+(m.id===selected.id?' selected':'');
      const locked=!PROGRESS.unlocked(m);
      row.dataset.locked=String(locked);
      row.dataset.mission=m.id;
      row.setAttribute('aria-pressed',String(m.id===selected.id));
      const number=document.createElement('span');number.textContent=String(isChallenge?index+1:CAMPAIGN.indexOf(m)+1).padStart(2,'0');
      const name=document.createElement('span');name.textContent=missionName(m);
      if(!isChallenge&&m.district!==chapter.district) {
        const location=document.createElement('small');location.className='order-location';
        location.textContent=districtName(m.district);name.append(location);
      }
      const status=document.createElement('span');
      if(save.completed[m.id]){status.className='done-mark';status.setAttribute('aria-label',T('Выполнено'));}
      else if(locked){status.className='lock-mark';status.setAttribute('aria-label',T('Закрыто'));}
      else {status.textContent='›';status.setAttribute('aria-hidden','true');}
      row.append(number,name,status);
      row.addEventListener('click',()=>{
        selected=m;SOUND.effect('click');renderBoard();
        list.querySelector(`[data-mission="${m.id}"]`)?.focus({preventScroll:true});
        if(matchMedia('(max-width: 700px)').matches) byId('order-brief').scrollIntoView({block:'nearest'});
      });
      list.append(row);
    }
    byId('order-title').textContent=missionName(selected);
    const english=I18N.language()==='en';
    byId('order-intro').textContent=selected.steps?(english?selected.steps[0].map(n=>n.en):selected.steps[0].map(n=>n.ru)).join(english?' OR ':' ИЛИ ')+(english?' · Steps: ':' · Этапов: ')+selected.steps.length:T(selected.intro);
    if(selected.rules?.length){
      const rules={quiet:['Третья тревога сорвёт заказ','A third alarm fails the job'],pursuit:['Груз привлекает дворника','Cargo attracts the sweeper'],rival:['Район оспаривает соперник','A rival contests this district'],rush:['Тележка движется быстрее','The cart moves faster'],storm:['Сильный ветер','Strong wind'],crowd:['Толпа меняет маршруты','Crowds change their routes']};
      byId('order-intro').textContent+=' · '+selected.rules.map(rule=>rules[rule][english?1:0]).join(' · ');
    }
    const prereq=prerequisite(selected,isChallenge);
    const unlocked=PROGRESS.unlocked(selected);
    byId('order-unlock').textContent=!unlocked&&prereq?(english?'Opens after ':'Откроется после дела «')+missionName(prereq)+(english?'':'»'):english&&selected.unlockEn?selected.unlockEn:T(selected.unlock);
    byId('order-route').hidden=!selected.steps;
    byId('order-route-text').textContent=english&&selected.introEn?selected.introEn:selected.intro;
    const best=save.completed[selected.id];
    byId('order-record').textContent=best?T('Рекорд')+' '+best.best.toFixed(1)+' '+T('с')+' · '+medalName(best.medal)+' · '+T('Награда уже получена'):'+'+selected.reward+' '+T('крошек');
    byId('launch-order').disabled=!unlocked;
  }
  function renderNest() {
    renderWallet();
    const save=PROGRESS.state(), list=byId('upgrade-list');
    list.replaceChildren();
    for(const upgrade of UPGRADES) {
      const level=save.upgrades[upgrade.id],price=upgrade.prices[level];
      const row=document.createElement('div');row.className='upgrade-row';
      const title=document.createElement('h3');title.textContent=(I18N.language()==='en'?upgrade.en:upgrade.title)+' '+level+'/'+upgrade.prices.length;
      const description=document.createElement('p');description.textContent=I18N.language()==='en'&&upgrade.descriptionEn?upgrade.descriptionEn:T(upgrade.description);
      const buy=document.createElement('button');buy.className='text-button';buy.dataset.upgrade=upgrade.id;
      const locked=upgrade.requires&&!save.completed[upgrade.requires];
      buy.textContent=locked?(I18N.language()==='en'?'After chapter ':'После главы ')+Number(upgrade.requires.slice(1,3)):price===undefined?T('Завершено'):T('Улучшить')+' · '+price;
      buy.disabled=locked||price===undefined||save.crumbs<price;
      buy.addEventListener('click',async()=>{
        buy.disabled=true;
        try {await PROGRESS.buy(upgrade.id);SOUND.effect('deliver');byId('purchase-note').textContent=T('Улучшение сохранено.');}
        catch(e){byId('purchase-note').textContent=T(e.message);}
        renderNest();
      });
      row.append(title,description,buy);list.append(row);
    }
    const roles={rescue:'Сизый — разведчик',wind:'Рыжик — курьер',lure:'Гром — защитник'};
    const recruits=ROOF_ART.recruits(save).map(id=>T(roles[id]));
    byId('flock-progress').textContent=recruits.length?recruits.join(' · '):T('Спасай голубей в заказах, чтобы расширить стаю.');
    ROOF_ART.drawRoof(byId('nest-art'),save);
    showSaveError();
  }
  byId('open-nest').addEventListener('click',async()=>{await PROGRESS.ready;open('nest');});
  byId('board-nest').addEventListener('click',()=>show('nest'));
  byId('chapter-back').addEventListener('click',()=>{SOUND.effect('click');returnToChapters();});
  byId('board-challenges').addEventListener('click',()=>{
    SOUND.effect('click');openOrders('challenges',chooseOrder(CHALLENGES,PROGRESS.state()));
  });
  byId('nest-orders').addEventListener('click',()=>show('board'));
  for(const id of ['board-home','nest-home'])byId(id).addEventListener('click',()=>show('menu'));
  byId('launch-order').addEventListener('click',()=>{
    if(!PROGRESS.unlocked(selected)) return;
    activeMission=selected;startRun();
  });
  byId('next-order').addEventListener('click',()=>leaveResult(()=>openBoard('orders')));
  window.addEventListener('progress-changed',()=>{
    showSaveError();
    if(screen==='board')renderBoard();
    if(screen==='nest')renderNest();
    if(screen==='menu')updateRoof();
  });
  byId('language').value=I18N.language();
  byId('language').addEventListener('change',()=>{
    I18N.set(byId('language').value);
    if(hosted)persistSettings();
    if(screen==='board')renderBoard();
    if(screen==='nest')renderNest();
  });
  I18N.capture();
  if(release) {
    byId('save-transfer').hidden=false;
    if(pauseCode==='KeyP') {byId('pause-key').textContent='P';byId('pause').removeAttribute('title');}
    app.addEventListener('contextmenu',event=>event.preventDefault());
    byId('export-save').addEventListener('click',async()=>{
      const data=await PROGRESS.exportSave();
      if(release.target==='android') {
        try {await release.host.exportSave(data);}
        catch {byId('transfer-note').textContent=T('Не удалось сохранить файл.');}
        return;
      }
      const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='pigeon-mafia-save.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    byId('import-save').addEventListener('click',async()=>{
      if(release.target!=='android') {byId('save-file').click();return;}
      try {
        const value=await release.host.importSave();
        if(value===null)return;
        await PROGRESS.importSave(value);
        byId('transfer-note').textContent=T('Сохранение восстановлено.');
      } catch(e){byId('transfer-note').textContent=T(e.message);}
    });
    byId('save-file').addEventListener('change',async event=>{
      const file=event.target.files[0];event.target.value='';if(!file)return;
      try {
        if(file.size>65536)throw new Error('Файл сохранения не подходит.');
        let value;
        try {value=JSON.parse(await file.text());}catch{throw new Error('Файл сохранения не подходит.');}
        await PROGRESS.importSave(value);
        byId('transfer-note').textContent=T('Сохранение восстановлено.');
      } catch(e){byId('transfer-note').textContent=T(e.message);}
    });
    release.subscribe(({blocked,busy})=>{
      app.inert=blocked;
      byId('ad-pause').hidden=!busy;
      if(blocked) {GAME.pause();SOUND.suspend();}
      else if(!document.hidden) {SOUND.resume();if(screen==='playing')GAME.resume();}
      release.gameplay(!blocked&&screen==='playing'&&!document.hidden);
      setAudioLevels();
    });
  }
  if(release?.target==='android') {
    window.addEventListener('android-background',()=>{
      pause();
      if(prefsTimer) {
        clearTimeout(prefsTimer);
        prefsTimer=0;
        PROGRESS.setPreferences({...settings,language:I18N.language()}).catch(showSaveError);
      }
    });
    window.androidBack=()=>{
      if(saving||transition||release.state().blocked)return true;
      if(screen==='menu')return false;
      if(screen==='playing')pause();
      else if(screen==='board'&&boardView!=='chapters')returnToChapters();
      else if(['settings','help','credits'].includes(screen))show(backTo);
      else show('menu');
      return true;
    };
  }
  PROGRESS.ready.then(()=>{
    progressReady=true;
    if(hosted) {
      const prefs=PROGRESS.preferences();recoverSettings(prefs);
      if(release.target!=='playgama'&&['en','ru'].includes(prefs.language))I18N.set(prefs.language);
      applySettings(false);
    }
    showSaveError();updateRoof();
    document.documentElement.removeAttribute('data-starting');
    requestAnimationFrame(()=>release?.ready());
  });
  ROOF_ART.drawCity(byId('city-art'));
  applySettings(false);
  show('menu',false);
})();
