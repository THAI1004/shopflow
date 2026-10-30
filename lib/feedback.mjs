export function packingAnnouncement(order){
 if(order.packedAt)return 'Đơn đã đóng.';
 if(order.status!=='pending')return order.status==='cancelled'?'Đơn đã hủy. Không bắt đầu đóng đơn.':'Đơn đã giao vận chuyển. Không bắt đầu đóng đơn.';
 const short=text=>String(text||'').replace(/\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim().split(/\s+/).slice(0,8).join(' ');
 const items=(order.items||[]).map(item=>`${item.qty} ${short(item.variant)||short(item.name)||'sản phẩm'}`).join('; ');
 return 'Bắt đầu đóng đơn'+(items?' gồm '+items:'')+'.';
}
export function createScanFeedback(env=globalThis,onSpeechIssue=()=>{}){
 let context,activeSpeech,speechTimer;
 const clearSpeechTimer=()=>{if(speechTimer!==undefined)env.clearTimeout?.(speechTimer);speechTimer=undefined;};
 function prime(){try{const Audio=env.AudioContext||env.webkitAudioContext;if(!context&&Audio)context=new Audio();if(context?.state==='suspended')return Promise.resolve(context.resume()).catch(()=>{});}catch{}return Promise.resolve();}
 function speak(text){
  if(!text)return false;
  try{
   const synth=env.speechSynthesis;
   if(!synth||!env.SpeechSynthesisUtterance){onSpeechIssue('Thiết bị chưa hỗ trợ đọc thông báo.');return false;}
   clearSpeechTimer();activeSpeech=undefined;synth.cancel();synth.resume?.();
   let started=false;const utterance=new env.SpeechSynthesisUtterance(text);activeSpeech=utterance;
   utterance.lang='vi-VN';utterance.rate=1;utterance.volume=1;
   const voices=synth.getVoices?.()||[],voice=voices.find(v=>v.lang?.toLowerCase().startsWith('vi'));if(voice)utterance.voice=voice;
   utterance.onstart=()=>{started=true;if(activeSpeech===utterance){clearSpeechTimer();onSpeechIssue('');}};
   utterance.onend=()=>{if(activeSpeech===utterance){clearSpeechTimer();activeSpeech=undefined;}};
   utterance.onerror=event=>{if(activeSpeech!==utterance)return;clearSpeechTimer();activeSpeech=undefined;if(!['canceled','interrupted'].includes(event.error))onSpeechIssue('Chưa phát được lời đọc. Chạm Nghe thử / đọc lại để bật tiếng.');};
   synth.speak(utterance);
   if(!started&&activeSpeech===utterance&&env.setTimeout)speechTimer=env.setTimeout(()=>{if(activeSpeech===utterance)onSpeechIssue('Chưa bắt đầu đọc. Chạm Nghe thử / đọc lại để bật tiếng.');},3500);
   return true;
  }catch{onSpeechIssue('Chưa phát được lời đọc. Chạm Nghe thử / đọc lại để bật tiếng.');return false;}
 }

 function success(){try{env.navigator?.vibrate?.(100);}catch{}try{if(!context||context.state==='closed')return;const play=()=>{try{const tone=context.createOscillator(),gain=context.createGain(),at=context.currentTime;tone.type='sine';tone.frequency.setValueAtTime(1046,at);gain.gain.setValueAtTime(0.0001,at);gain.gain.exponentialRampToValueAtTime(0.15,at+0.015);gain.gain.exponentialRampToValueAtTime(0.0001,at+0.18);tone.connect(gain);gain.connect(context.destination);tone.start(at);tone.stop(at+0.2);}catch{}};if(context.state==='suspended')Promise.resolve(context.resume()).then(play).catch(()=>{});else play();}catch{}}
 function close(){clearSpeechTimer();activeSpeech=undefined;try{env.speechSynthesis?.cancel();}catch{}try{context?.close()?.catch(()=>{});}catch{}context=undefined;}
 return {prime,success,speak,close};
}
