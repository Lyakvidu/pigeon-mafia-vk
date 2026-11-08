'use strict';
(() => {
  const saveKey = 'pigeon_mafia_progress_v1';
  // VK's StorageSet takes one string per key. Keep the entire save in one
  // bounded write so a failed write cannot leave a partially updated campaign.
  const valueLimit = 3900;
  const medals = ['gold', 'silver', 'bronze'];

  function compact(snapshot) {
    const {progress, ...envelope} = snapshot;
    const {completed, adClaims, ...counters} = progress ?? {};
    if (snapshot.format !== 1 || !completed || !adClaims) return null;
    const claims = {...adClaims};
    const records = [];
    for (const [id, record] of Object.entries(completed)) {
      const medal = medals.indexOf(record.medal);
      if (medal < 0 || Object.keys(record).length !== 2) return null;
      const entry = [id, record.best, medal];
      if (claims[id] === true) {
        entry.push(1);
        delete claims[id];
      }
      records.push(entry);
    }
    return {...envelope, progress:counters, records, claims};
  }

  function expand(packed) {
    const {progress, records, claims, ...envelope} = packed;
    const completed = Object.fromEntries(records.map(([id, best, medal]) => [id, {best, medal:medals[medal]}]));
    const adClaims = {...claims, ...Object.fromEntries(records.filter(row => row[3] === 1).map(([id]) => [id, true]))};
    return {...envelope, progress:{...progress, completed, adClaims}};
  }

  async function encode(snapshot) {
    const json = JSON.stringify(snapshot);
    const bytes = new TextEncoder().encode(json);
    if (bytes.length <= 1800) return 'j:' + json;
    if (typeof CompressionStream !== 'function') {
      if (bytes.length + 2 <= valueLimit) return 'j:' + json;
      throw new Error('VK save compression is unavailable');
    }
    const packed = compact(snapshot);
    const payload = packed ? JSON.stringify(packed) : bytes;
    const compressed = await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const binary = Array.from(new Uint8Array(compressed), byte => String.fromCharCode(byte)).join('');
    const value = (packed ? 'c:' : 'g:') + btoa(binary);
    if (value.length > valueLimit) throw new Error('VK save exceeds the storage limit');
    return value;
  }

  async function decode(value) {
    if (!value) return null;
    if (value.startsWith('j:')) return JSON.parse(value.slice(2));
    const packed = value.startsWith('c:');
    if (!packed && !value.startsWith('g:')) throw new Error('VK save format is invalid');
    const bytes = Uint8Array.from(atob(value.slice(2)), char => char.charCodeAt(0));
    const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const data = JSON.parse(json);
    return packed ? expand(data) : data;
  }

  async function connect() {
    const sdk = window.vkBridge;
    if (!sdk?.send || !sdk.isEmbedded()) return null;
    const launch = new URLSearchParams(window.location.search);
    let paused = false;
    let pauseListener;
    let adPending = false;
    sdk.subscribe(({detail}) => {
      if (detail.type === 'VKWebAppViewHide') paused = true;
      else if (detail.type === 'VKWebAppViewRestore') paused = false;
      else return;
      pauseListener?.(paused);
    });
    await sdk.send('VKWebAppInit');

    const nativeAds = sdk.supports('VKWebAppShowNativeAds') && sdk.supports('VKWebAppCheckNativeAds');
    async function show(rewarded, {onOpen, signal} = {}) {
      if (!nativeAds || adPending || signal?.aborted) return false;
      adPending = true;
      const options = rewarded ? {ad_format: 'reward', use_waterfall: true} : {ad_format: 'interstitial'};
      try {
        const availability = await sdk.send('VKWebAppCheckNativeAds', options);
        if (availability?.result !== true || signal?.aborted) return false;
        // VK does not expose an ad-open callback. Suspend immediately before
        // requesting the confirmed available ad and hold until it resolves.
        onOpen?.();
        const result = await sdk.send('VKWebAppShowNativeAds', options);
        return !signal?.aborted && result?.result === true;
      } catch {
        return false;
      } finally {
        adPending = false;
      }
    }

    return {
      id: 'vk',
      language: launch.get('vk_language') || navigator.language.split('-')[0],
      externalLinks: false,
      audioEnabled: true,
      rewarded: nativeAds,
      ready() {},
      gameplay() {},
      onPause(callback) { pauseListener = callback; callback(paused); },
      onAudio(callback) { callback(true); },
      async load() {
        const result = await sdk.send('VKWebAppStorageGet', {keys: [saveKey]});
        if (!Array.isArray(result?.keys)) throw new Error('VK save read failed');
        return decode(result.keys.find(entry => entry.key === saveKey)?.value);
      },
      async save(snapshot) {
        const value = await encode(snapshot);
        const result = await sdk.send('VKWebAppStorageSet', {key: saveKey, value});
        if (result?.result !== true) throw new Error('VK save write failed');
      },
      showInterstitial(options) { return show(false, options); },
      showRewarded(options) { return show(true, options); }
    };
  }

  window.platformReady = connect().catch(() => null);
  window.createPlatform = () => window.platformReady;
})();
