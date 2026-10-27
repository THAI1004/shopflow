export function createScanFeedback(env=globalThis){
 let context;
 function prime(){try{const Audio=env.AudioContext||env.webkitAudioContext;if(!context&&Audio)context=new Audio();if(context?.state==='suspended')return Promise.resolve(context.resume()).catch(()=>{});}catch{}return Promise.resolve();}
 function success(){try{env.navigator?.vibrate?.(100);}catch{}try{if(!context||context.state==='closed')return;const play=()=>{try{const tone=context.createOscillator(),gain=context.createGain(),at=context.currentTime;tone.type='sine';tone.frequency.setValueAtTime(1046,at);gain.gain.setValueAtTime(0.0001,at);gain.gain.exponentialRampToValueAtTime(0.15,at+0.015);gain.gain.exponentialRampToValueAtTime(0.0001,at+0.18);tone.connect(gain);gain.connect(context.destination);tone.start(at);tone.stop(at+0.2);}catch{}};if(context.state==='suspended')Promise.resolve(context.resume()).then(play).catch(()=>{});else play();}catch{}}
 function close(){try{context?.close()?.catch(()=>{});}catch{}context=undefined;}
 return {prime,success,close};
}
