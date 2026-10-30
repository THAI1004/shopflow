import {prepareZXingModule,readBarcodes} from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
prepareZXingModule({overrides:{locateFile:()=>wasmUrl}});
const options={tryHarder:true,tryRotate:true,tryInvert:true,formats:['QRCode','Code128','Code39','ITF','EAN-13','EAN-8'] as any,maxNumberOfSymbols:4};
export async function decodeLabel(input:ImageData|Blob){const results=await readBarcodes(input,options);return [...new Set(results.map(r=>r.text).filter(Boolean))];}
export function scanVideo(video:HTMLVideoElement,onCodes:(codes:string[])=>Promise<void>,onError:(e:unknown)=>void){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Không mở được bộ đọc camera.');let stopped=false,timer:ReturnType<typeof setTimeout>;
 const controls={stop(){stopped=true;clearTimeout(timer);}};
 async function tick(){if(stopped)return;try{if(video.readyState>=2&&video.videoWidth){
   const width=video.videoWidth,height=video.videoHeight;
   // Try the whole label, then native-resolution crops for small QR/barcodes.
   const regions=[[0,0,width,height],[width*.2,height*.2,width*.6,height*.6],[0,0,width,height*.5]];
   for(const [x,y,w,h] of regions){
    if(stopped)break;const ratio=Math.min(1,2560/w);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    ctx!.drawImage(video,x,y,w,h,0,0,canvas.width,canvas.height);
    const codes=await decodeLabel(ctx!.getImageData(0,0,canvas.width,canvas.height));
    if(!stopped&&codes.length){await onCodes(codes);break;}
   }
 }}catch(e){if(!stopped){controls.stop();onError(e);}}if(!stopped)timer=setTimeout(tick,200);}

 timer=setTimeout(tick,0);return controls;
}
