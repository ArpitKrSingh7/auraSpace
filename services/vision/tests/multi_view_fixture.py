"""Deterministic textured room rendered by ray/plane intersections, no private images."""
import numpy as np,cv2

def render(offset,yaw):
 w,h=640,480;f=w/(2*np.tan(np.pi/6));k=dict(fx=f,fy=f,cx=w/2,cy=h/2)
 v,u=np.mgrid[:h,:w];rays=np.stack(((u-w/2)/f,(v-h/2)/f,np.ones((h,w))),-1)
 pitch=np.deg2rad(18);yaw=np.deg2rad(yaw)
 rx=np.array([[1,0,0],[0,np.cos(pitch),np.sin(pitch)],[0,-np.sin(pitch),np.cos(pitch)]])
 ry=np.array([[np.cos(yaw),0,np.sin(yaw)],[0,1,0],[-np.sin(yaw),0,np.cos(yaw)]])
 R=ry@rx;T=np.array(offset);rays=rays@R.T
 depth=np.full((h,w),np.inf);image=np.zeros((h,w,3),np.uint8)
 rng=np.random.default_rng(9)
 tex=rng.integers(30,235,(700,700,3),np.uint8);tex=cv2.GaussianBlur(tex,(3,3),0)
 for i in range(130):
  p=tuple(rng.integers(0,680,2));cv2.putText(tex,str(i),p,cv2.FONT_HERSHEY_SIMPLEX,.7,tuple(int(x) for x in rng.integers(0,255,3)),2)
 for normal,d,axes in [(np.array([0,1,0]),-1.5,(0,2)),(np.array([0,0,1]),-6,(0,1)),(np.array([1,0,0]),-2.6,(2,1)),(np.array([1,0,0]),2.6,(2,1))]:
  denom=rays@normal;z=np.divide(-(d+normal@T),denom,out=np.full((h,w),np.inf),where=np.abs(denom)>1e-7)
  finite=np.isfinite(z)&(z>.15)&(z<30);point=rays*np.where(finite,z,0)[...,None]+T
  valid=finite&(abs(point[...,0])<=2.6+1e-5)&(point[...,1]<=1.5+1e-5)&(point[...,2]<=6+1e-5)&(point[...,2]>.1)&(point[...,1]>-1.5)
  take=valid&(z<depth);depth[take]=z[take]
  sample=((point[...,[axes[0],axes[1]]]+3)*85)%699
  color=cv2.remap(tex,sample[...,0].astype(np.float32),sample[...,1].astype(np.float32),cv2.INTER_LINEAR)
  image[take]=color[take]
 depth[~np.isfinite(depth)]=0
 return image,depth.astype(np.float32),k,R,T
