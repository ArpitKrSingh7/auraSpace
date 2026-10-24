import type { Detection, Photo } from '../domain/types';
import { applyPixelOperation, approximateSurfaceFill, clampBox, furnitureType, MAX_IMAGE_PIXELS, parseDetections, postVision, VisionError } from './vision-core';
import type { ImageOperation, Progress } from './vision-core';
export { VisionError } from './vision-core';

const endpoint = process.env.EXPO_PUBLIC_VISION_API_URL?.replace(/\/$/, '');
type Detector = { detect: (input: HTMLCanvasElement, maxBoxes?: number, minScore?: number) => Promise<Array<{class:string;score:number;bbox:[number,number,number,number]}>> };
let detectorPromise: Promise<Detector> | null = null;
let inferenceTail: Promise<unknown> = Promise.resolve();

export const modelStatus = 'On-device COCO-SSD detection. Dimensions are editable estimates.';

async function canvasFor(photo:Photo, maxSide=1600):Promise<HTMLCanvasElement> {
  const image = new Image();
  if (!photo.uri.startsWith('data:') && !photo.uri.startsWith('blob:')) image.crossOrigin='anonymous';
  const loaded = new Promise<void>((resolve,reject)=>{ image.onload=()=>resolve(); image.onerror=()=>reject(new VisionError('This photo could not be opened. Import it again.', 'invalid-image')); });
  image.src=photo.uri; await loaded;
  if(!image.naturalWidth || image.naturalWidth*image.naturalHeight>MAX_IMAGE_PIXELS) throw new VisionError('Please choose a photo below 20 megapixels.', 'image-too-large');
  const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');
  if(!context)throw new VisionError('Image processing is not supported by this browser.');
  context.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas;
}

async function getDetector(progress?:Progress):Promise<Detector> {
  if(!detectorPromise) detectorPromise=(async()=>{
    progress?.('Loading the furniture detector. The first run downloads model weights.');
    const tf = await import('@tensorflow/tfjs');
    await tf.ready();
    if(!tf.getBackend()) await tf.setBackend('cpu');
    const coco = await import('@tensorflow-models/coco-ssd');
    return await coco.load({base:'lite_mobilenet_v2'});
  })().catch(error=>{detectorPromise=null; throw new VisionError('The furniture model could not load. Check your connection, or outline an item manually.', 'model-unavailable');});
  return detectorPromise;
}

export async function analyzePhoto(photo:Photo, onProgress?:Progress):Promise<Detection[]> {
  const canvas=await canvasFor(photo,1280);
  if(endpoint){
    onProgress?.('Analyzing furniture…');
    const result=await postVision(endpoint,'analyze',{image:canvas.toDataURL('image/jpeg',0.84)});
    return parseDetections(result.detections,canvas.width,canvas.height).map(d=>({...d,box:[d.box[0]*photo.width/canvas.width,d.box[1]*photo.height/canvas.height,d.box[2]*photo.width/canvas.width,d.box[3]*photo.height/canvas.height]}));
  }
  const detector=await getDetector(onProgress);
  onProgress?.('Finding furniture on your device…');
  const task=inferenceTail.catch(()=>undefined).then(()=>detector.detect(canvas,50,0.3));
  inferenceTail=task;
  let predictions:Awaited<typeof task>;
  try { predictions=await task; } catch { throw new VisionError('The detector could not finish on this device. Try a smaller photo or add items manually.'); }
  return predictions.flatMap((prediction,index)=>{
    const type=furnitureType(prediction.class);
    const box=clampBox([prediction.bbox[0]*photo.width/canvas.width,prediction.bbox[1]*photo.height/canvas.height,prediction.bbox[2]*photo.width/canvas.width,prediction.bbox[3]*photo.height/canvas.height],photo.width,photo.height);
    return type && box ? [{id:`${photo.id}-det-${index}`,label:prediction.class,type,score:prediction.score,box,source:'model' as const}] : [];
  });
}

export async function processPhoto(photo:Photo,operation:ImageOperation):Promise<string> {
  const canvas=await canvasFor(photo); const context=canvas.getContext('2d')!;
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  pixels.data.set(applyPixelOperation(pixels.data,canvas.width,canvas.height,operation));
  context.putImageData(pixels,0,0);
  return canvas.toDataURL('image/png');
}

export async function removeFurniture(photo:Photo,detections:Detection[],onProgress?:Progress):Promise<{uri:string;method:string}> {
  if(!detections.length) throw new VisionError('Select or outline furniture to remove first.','no-selection');
  const canvas=await canvasFor(photo);
  const boxes=detections.map(d=>[d.box[0]*canvas.width/photo.width,d.box[1]*canvas.height/photo.height,d.box[2]*canvas.width/photo.width,d.box[3]*canvas.height/photo.height]);
  if(endpoint){
    onProgress?.('Preparing an approximate empty-room preview…');
    const result=await postVision(endpoint,'inpaint',{image:canvas.toDataURL('image/jpeg',0.88),boxes});
    if(typeof result.uri!=='string' || !/^data:image\/(png|jpeg);base64,/.test(result.uri))throw new VisionError('The image service returned an invalid preview.');
    return {uri:result.uri,method:typeof result.method==='string'?result.method:'Service-generated preview'};
  }
  onProgress?.('Blending surrounding surfaces. Hidden details are approximate.');
  // Yield so the UI paints the progress state before a bounded pixel operation.
  await new Promise(resolve=>setTimeout(resolve,20));
  const context=canvas.getContext('2d')!; const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  pixels.data.set(approximateSurfaceFill(pixels.data,canvas.width,canvas.height,boxes));
  context.putImageData(pixels,0,0);
  return {uri:canvas.toDataURL('image/jpeg',0.9),method:'Approximate surface fill'};
}
