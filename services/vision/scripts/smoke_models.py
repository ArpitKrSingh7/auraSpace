#!/usr/bin/env python3
"""Run genuine HTTP model smoke checks; this does not measure model accuracy."""
import argparse,base64,hashlib,json,time,urllib.request
from pathlib import Path
import cv2,numpy as np

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--image',type=Path,required=True);parser.add_argument('--url',default='http://127.0.0.1:8000');parser.add_argument('--output',type=Path,default=Path('.artifacts/model-smoke'));args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
 content=args.image.read_bytes();image='data:image/jpeg;base64,'+base64.b64encode(content).decode()
 def post(path,body):
  start=time.perf_counter();request=urllib.request.Request(args.url+'/'+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(request,timeout=240) as response:result=json.load(response)
  return result,time.perf_counter()-start
 analysis,seconds=post('analyze',{'image':image,'include_room':True,'include_depth':True})
 selected=next((d for d in analysis['detections'] if d['label']=='couch'),None)
 if not selected:raise ValueError('No sofa in this fixture. Use the documented COCO sofa example or choose a matching detection in a separate experiment.')
 box=selected['box'];x,y=box['x1'],box['y1'];w,h=box['x2']-x,box['y2']-y
 removal,removal_seconds=post('inpaint',{'image':image,'masks':[{'box':[x,y,w,h],'polygons':[selected['mask_polygon']] if len(selected.get('mask_polygon',[]))>=3 else [],'strokes':[],'expansionPx':3}],'prefer_lama':True})
 if not removal['method'].startswith('Big-LaMa'):raise ValueError('This smoke run requires the configured verified LaMa checkpoint')
 def decode(uri,flags=cv2.IMREAD_COLOR):return cv2.imdecode(np.frombuffer(base64.b64decode(uri.split(',')[1]),np.uint8),flags)
 original=cv2.imdecode(np.frombuffer(content,np.uint8),cv2.IMREAD_COLOR);output=decode(removal['uri']);mask=decode(removal['mask_uri'],cv2.IMREAD_GRAYSCALE)
 if not np.array_equal(original[mask==0],output[mask==0]):raise ValueError('Pixels outside the mask changed')
 cv2.imwrite(str(args.output/'removal.png'),output)
 report={'inputSha256':hashlib.sha256(content).hexdigest(),'labels':[d['label'] for d in analysis['detections']],'analysisSeconds':seconds,'removalSeconds':removal_seconds,'models':analysis['model_versions'],'inpainting':removal['method'],'outsideMaskPixelsUnchanged':True,'accuracy':'not_evaluated'}
 (args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
