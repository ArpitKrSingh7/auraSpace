#!/usr/bin/env python3
"""Download exact, checksum-verified model assets. No remote code execution."""
import argparse,hashlib,json,os,urllib.request
from pathlib import Path
manifest=Path(__file__).resolve().parents[1]/'model-manifest.json'
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--include-depth',action='store_true');parser.add_argument('--output',type=Path,default=Path('.artifacts/models'));args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
 description=json.loads(manifest.read_text());models=list(description['models'])
 if args.include_depth:
  depth=description['metricDepth'];(args.output/depth['directory']).mkdir(exist_ok=True)
  models.extend({'name':depth['name']+' '+f['name'],'file':depth['directory']+'/'+f['name'],'url':f['url'],'sha256':f['sha256']} for f in depth['files'])
 for model in models:
  path=args.output/model['file']
  if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()==model['sha256']:
   print('Verified',path);continue
  temporary=path.with_suffix(path.suffix+'.download')
  try:
   print('Downloading',model['name'],flush=True)
   with urllib.request.urlopen(model['url'],timeout=120) as response,temporary.open('wb') as output:
    while chunk:=response.read(1024*1024):output.write(chunk)
   if hashlib.sha256(temporary.read_bytes()).hexdigest()!=model['sha256']:raise ValueError('Checkpoint checksum mismatch: '+model['file'])
   os.replace(temporary,path)
  finally:
   temporary.unlink(missing_ok=True)
if __name__=='__main__':main()
