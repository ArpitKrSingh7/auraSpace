"""Reviewed masks use oriented source-image pixels; originals are never modified."""
import cv2
import numpy as np
from app.inpainting import create_removal_mask


def reviewed_mask(shape, selections):
    height,width=shape[:2]
    union=np.zeros((height,width),dtype=np.uint8)
    for selection in selections:
        mask=np.zeros_like(union)
        polygons=selection.get('polygons',[])
        for polygon in polygons:
            points=np.asarray(polygon,dtype=np.float64)
            if len(points)<3 or len(points)>1000 or not np.isfinite(points).all():
                raise ValueError('Invalid mask polygon')
            points[:,0]=np.clip(points[:,0],0,width-1)
            points[:,1]=np.clip(points[:,1],0,height-1)
            cv2.fillPoly(mask,[np.round(points).astype(np.int32)],255)
        if not polygons and selection.get('box'):
            mask=create_removal_mask(shape,[selection['box']],dilation=0)
        for stroke in selection.get('strokes',[]):
            points=stroke['points']
            radius=int(round(stroke['radius']))
            value=255 if stroke['tool']=='paint' else 0
            if not 1<=radius<=500 or len(points)>3000:
                raise ValueError('Invalid brush stroke')
            previous=None
            for point in points:
                x,y=(int(round(point[0])),int(round(point[1])))
                if not np.isfinite(point).all() or x<0 or y<0 or x>width or y>height:
                    raise ValueError('Brush stroke extends outside the photograph')
                if previous is not None:
                    cv2.line(mask,previous,(x,y),value,radius*2,cv2.LINE_8)
                cv2.circle(mask,(x,y),radius,value,-1)
                previous=(x,y)
        expansion=int(selection.get('expansionPx',0))
        if expansion:
            kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(expansion*2+1,expansion*2+1))
            mask=cv2.dilate(mask,kernel)
        union=cv2.bitwise_or(union,mask)
    if not np.any(union) or np.all(union):
        raise ValueError('Select furniture and leave some surrounding wall or floor visible')
    return union


def mask_features(image,raw_mask):
    """Conservative cleanup, separate raw/clean masks, contour evidence and cutout."""
    mask=(raw_mask>127).astype(np.uint8)*255
    # One small closing fills pinholes without joining separate furniture instances.
    cleaned=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8),iterations=1)
    moments=cv2.moments(cleaned)
    centroid=[moments['m10']/moments['m00'],moments['m01']/moments['m00']] if moments['m00'] else None
    ys,xs=np.where(cleaned>0)
    if not len(xs):
        return None
    x0,y0,x1,y1=int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)
    cutout=cv2.cvtColor(image[y0:y1,x0:x1],cv2.COLOR_BGR2BGRA)
    cutout[:,:,3]=cleaned[y0:y1,x0:x1]
    masked=image[cleaned>0]
    bgr=np.median(masked,axis=0).astype(int)
    color=f'#{bgr[2]:02x}{bgr[1]:02x}{bgr[0]:02x}'
    return {'raw_mask':mask,'cleaned_mask':cleaned,'thumbnail':cutout,'centroid':centroid,'color':color,'box':[x0,y0,x1-x0,y1-y0]}
