const fs = require('fs');
const f = '/app/.next/static/chunks/app/dashboard/calls/page-f021514521471011.js';
let code = fs.readFileSync(f, 'utf8');

// 1. Add log in ontrack
const old1 = 't.addEventListener("track",e=>{let s=';
const new1 = 't.addEventListener("track",e=>{console.log("[SIP] ontrack fired streams=",e.streams&&e.streams.length,"kind=",e.track&&e.track.kind,"state=",e.track&&e.track.readyState);let s=';

// 2. Add log after AudioContext connect
const old2 = 'window._ss.connect(c.destination)}catch(_){}b.current';
const new2 = 'window._ss.connect(c.destination);console.log("[SIP] AC connected state=",c.state,"rate=",c.sampleRate)}catch(ctxErr){console.error("[SIP] AC error",ctxErr)}b.current';

// 3. Add log in makeCall unlock (try both variants)
const old3a = 'try{window._sc||(window._sc=new(window.AudioContext||window.webkitAudioContext)());window._sc.resume()}catch(_){}';
const old3b = 'try{window._sc||(window._sc=new(window.AudioContext||window.webkitAudioContext)());window._sc.resume()}catch(e){console.error("[SIP] makeCall AudioCtx err:",e)}';
const new3  = 'try{window._sc||(window._sc=new(window.AudioContext||window.webkitAudioContext)());window._sc.resume();console.log("[SIP] makeCall AC state=",window._sc.state)}catch(e){console.error("[SIP] makeCall AC err",e)}';

let out = code;
if(code.includes(old1)){out=out.replace(old1,new1);console.log('patch1 OK');}
else{console.error('patch1 NOT FOUND');}

if(out.includes(old2)){out=out.replace(old2,new2);console.log('patch2 OK');}
else{console.error('patch2 NOT FOUND');}

if(out.includes(old3a)){out=out.replace(old3a,new3);console.log('patch3a OK');}
else if(out.includes(old3b)){out=out.replace(old3b,new3);console.log('patch3b OK');}
else{console.error('patch3 NOT FOUND');}

fs.writeFileSync(f,out);
console.log('Done, size='+out.length);
