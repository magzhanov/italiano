(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ItalianoCloudSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'italiano-cloud-progress-v1';
  const CONFIG = { owner: 'magzhanov', repo: 'italiano-progress' };
  const KEY = 'italiano.private-sync.v1';
  const plain = v => v && typeof v === 'object' && !Array.isArray(v);
  const safeKey = k => !['__proto__', 'constructor', 'prototype'].includes(k);
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (plain(v)) return '{' + Object.keys(v).filter(safeKey).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  const timestamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : '';
  function union(a = [], b = []) {
    const items = new Map();
    for (const x of [...a, ...b]) if (plain(x)) items.set(canonical(x), x);
    return [...items.values()].sort((x, y) => String(x.t || x.date || x.updated || '').localeCompare(String(y.t || y.date || y.updated || '')) || canonical(x).localeCompare(canonical(y)));
  }
  function validate(s) {
    if (!plain(s) || s.schema !== 3 || s.course !== 'italiano-four-blocks' || !plain(s.records)) throw new Error('The cloud progress file is not a compatible Italiano backup.');
    for (const name of ['records', 'reading', 'translation', 'dialogue']) {
      if (s[name] != null && !plain(s[name])) throw new Error('The cloud progress file has invalid progress data.');
      for (const [key, item] of Object.entries(s[name] || {})) {
        if (!safeKey(key) || !plain(item)) throw new Error('The cloud progress file has invalid entries.');
        if (name === 'records' && (item.attempts != null && !Array.isArray(item.attempts) || item.forms != null && !plain(item.forms))) throw new Error('The cloud progress file has invalid attempts.');
        if (item.versions != null && !Array.isArray(item.versions)) throw new Error('The cloud progress file has invalid written responses.');
      }
    }
    if (s.log != null && !Array.isArray(s.log) || s.imports != null && !Array.isArray(s.imports)) throw new Error('The cloud progress file has invalid history.');
    return s;
  }
  function merge(a, b) {
    validate(a); validate(b);
    const out = { schema: 3, course: 'italiano-four-blocks', records: {}, reading: {}, translation: {}, dialogue: {}, log: union(a.log, b.log), imports: union(a.imports, b.imports) };
    out.created = [timestamp(a.created), timestamp(b.created)].filter(Boolean).sort()[0] || '';
    for (const key of [...new Set([...Object.keys(a.records), ...Object.keys(b.records)])].sort()) {
      const x = a.records[key] || {}, y = b.records[key] || {};
      const attempts = union(x.attempts, y.attempts), forms = {};
      for (const cell of [...new Set([...Object.keys(x.forms || {}), ...Object.keys(y.forms || {})])].filter(safeKey).sort()) {
        if (x.forms?.[cell] === true || y.forms?.[cell] === true) forms[cell] = true;
      }
      const latest = timestamp(x.coverageUpdated) > timestamp(y.coverageUpdated) ? x : y;
      const covered = attempts.length > 0 || (timestamp(x.coverageUpdated) !== timestamp(y.coverageUpdated) ? !!latest.covered : !!(x.covered || y.covered));
      out.records[key] = { covered, seeded: covered && !attempts.length && !!(x.seeded || y.seeded), attempts, forms };
      const updated = [timestamp(x.coverageUpdated), timestamp(y.coverageUpdated)].sort().pop();
      if (updated) out.records[key].coverageUpdated = updated;
    }
    for (const section of ['reading', 'translation', 'dialogue']) {
      for (const key of [...new Set([...Object.keys(a[section] || {}), ...Object.keys(b[section] || {})])].sort()) {
        const x = a[section]?.[key] || {}, y = b[section]?.[key] || {};
        const versions = union(x.versions, y.versions);
        for (const entry of [x, y]) if (typeof entry.response === 'string') versions.push({ response: entry.response, updated: timestamp(entry.updated) });
        const all = union(versions, []);
        const chosen = all[all.length - 1];
        const value = { completed: !!(x.completed || y.completed) };
        if (x.estimated || y.estimated) value.estimated = true;
        if (chosen) {
          value.response = chosen.response;
          value.versions = all;
        }
        const updated = [timestamp(x.updated), timestamp(y.updated), chosen?.updated || ''].sort().pop();
        if (updated) value.updated = updated;
        out[section][key] = value;
      }
    }
    return out;
  }
  const project = s => merge(s, {schema:3,course:'italiano-four-blocks',records:{}});
  function encode(text) {
    const bytes = new TextEncoder().encode(text); let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  const decode = text => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));
  function create(options) {
    const { getState, applyState, storage, onStatus = () => {}, fetch: request = globalThis.fetch.bind(globalThis) } = options;
    const now = options.now || Date.now, wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    let token = '', status = { connected:false, phase:'disconnected', message:'Connect this device to sync your progress.', lastSync:null };
    let timer, busy, generation = 0, verified = false, blocked = false, lastStart = 0, failures = 0, stopped = false;
    function notify(phase, message) {
      status = {...status, connected:!!token, phase, message}; onStatus({...status});
    }
    function load() {
      try { const saved = JSON.parse(storage.getItem(KEY) || 'null'); if (saved?.token?.startsWith('github_pat_')) {token = saved.token; status.lastSync = saved.lastSync || null;} } catch (_) {}
    }
    function persist() { storage.setItem(KEY, JSON.stringify({token, lastSync:status.lastSync})); }
    const repoURL = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo;
    async function api(url, init = {}, currentToken) {
      const response = await request(url, { ...init, cache:'no-store', credentials:'omit', redirect:'error', signal:AbortSignal.timeout(20000), headers:{Accept:'application/vnd.github+json', Authorization:'Bearer ' + currentToken, 'X-GitHub-Api-Version':'2026-03-10', ...init.headers} });
      return response;
    }
    function errorFor(response) {
      if (response.status === 401) return new Error('Your sync key expired or was revoked. Connect again with a new key.');
      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') !== '0' && !response.headers.get('retry-after')) return new Error('The sync key needs Contents: read and write access to italiano-progress.');
      if (response.status === 404) return new Error('Cannot access the private progress repository. Check the key’s repository access.');
      if (response.status === 429 || response.status === 403) return new Error('GitHub is limiting requests. Your progress is safe here; try Sync now later.');
      return new Error('GitHub sync is unavailable (' + response.status + '). Your progress is saved on this device.');
    }
    async function cycle(currentGeneration, currentToken) {
      // Recheck privacy before every upload/pull, including after repository settings change.
      {
        const response = await api(repoURL, {}, currentToken);
        if (!response.ok) {blocked = true; throw errorFor(response);}
        const repo = await response.json();
        if (repo.private !== true || repo.full_name !== CONFIG.owner + '/' + CONFIG.repo) {blocked = true; throw new Error('Sync requires the private italiano-progress repository. No progress was uploaded.');}
        verified = true;
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        if (generation !== currentGeneration) return;
        const response = await api(repoURL + '/contents/progress.json', {}, currentToken);
        let remote = null, sha;
        if (response.ok) {
          const file = await response.json(); sha = file.sha;
          if (file.type !== 'file' || typeof sha !== 'string' || file.size > 10000000) throw new Error('The cloud progress file is too large or invalid. Export a local backup before continuing.');
          let text;
          if (file.encoding === 'base64') text = decode(file.content);
          else {
            const raw = await api(repoURL + '/contents/progress.json', {headers:{Accept:'application/vnd.github.raw+json'}}, currentToken);
            if (!raw.ok) throw errorFor(raw);
            text = await raw.text();
          }
          const data = JSON.parse(text);
          if (data.format !== FORMAT) throw new Error('The cloud file format is not recognized. No progress was replaced.');
          remote = validate(data.state);
        } else if (response.status !== 404) {
          if ([401,403,429].includes(response.status)) blocked = true;
          throw errorFor(response);
        }
        if (generation !== currentGeneration) return;
        const local = project(getState()), combined = remote ? merge(local, remote) : local;
        if (!remote || canonical(combined) !== canonical(project(remote))) {
          const response = await api(repoURL + '/contents/progress.json', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Sync Italiano learning progress',content:encode(JSON.stringify({format:FORMAT,state:combined})),...(sha ? {sha} : {})})}, currentToken);
          if (response.status === 409 || response.status === 422) {await wait(1100 * (attempt + 1)); continue;}
          if (!response.ok) {if ([401,403,429].includes(response.status)) blocked = true; throw errorFor(response);}
        }
        if (generation !== currentGeneration) return;
        // Re-read local state after the request so answers saved in flight are retained.
        const current = project(getState()), next = merge(current, combined);
        if (canonical(next) !== canonical(current)) applyState(next);
        status.lastSync = new Date(now()).toISOString();
        persist(); failures = 0;
        notify('synced','Progress synced. Both devices will pick up new activity while the app is open.');
        if (canonical(next) !== canonical(combined)) schedule(15000);
        return;
      }
      throw new Error('Both devices updated together. Your progress is safe here; sync will retry.');
    }
    async function sync(manual = false) {
      if (!token || stopped || blocked && !manual) return false;
      if (busy) return busy;
      if (!manual && now() - lastStart < 15000) {schedule(15000);return false;}
      if (manual) {blocked = false; verified = false;}
      clearTimeout(timer); timer = null; lastStart = now(); const currentGeneration = generation, currentToken = token;
      notify('syncing','Syncing your progress…');
      busy = cycle(currentGeneration,currentToken).then(() => generation === currentGeneration).catch(error => {
        if (generation !== currentGeneration) return false;
        failures++;
        const message = error instanceof TypeError || error.name === 'TimeoutError' ? 'You are offline or GitHub is unreachable. Keep studying; progress will sync when connected.' : error.message;
        notify(blocked ? 'attention' : 'offline',message);
        if (!blocked) schedule(Math.min(300000,30000 * 2 ** Math.min(failures - 1,3)));
        return false;
      }).finally(() => {busy = null;});
      return busy;
    }
    function schedule(delay = 15000) {
      if (!token || blocked || stopped) return;
      // Keep the first pending flush: continuous studying cannot postpone it forever.
      if (timer) return;
      timer = setTimeout(() => {timer = null;void sync();},delay);
    }
    async function connect(value) {
      const key = String(value || '').trim();
      if (!/^github_pat_[A-Za-z0-9_]+$/.test(key)) throw new Error('Paste a fine-grained GitHub sync key, starting with github_pat_.');
      if (busy) await busy;
      token = key; stopped = false; blocked = false; verified = false; generation++;
      try {persist();} catch (_) {token = '';throw new Error('This browser cannot remember the sync key. Enable website storage, then try again.');}
      return sync(true);
    }
    function disconnect() {
      generation++;token='';verified=false;blocked=false;clearTimeout(timer);timer=null;storage.removeItem(KEY);status.lastSync=null;
      notify('disconnected','This device is disconnected. Its local progress has been kept.');
    }
    function start() {load();if(token){notify('waiting','Waiting to sync…');schedule(1000);}}
    function stop() {stopped=true;generation++;clearTimeout(timer);timer=null;}
    return {start,stop,connect,disconnect,sync,schedule,getStatus:()=>({...status})};
  }
  return {merge,project,validate,canonical,create,CONFIG,FORMAT};
});
