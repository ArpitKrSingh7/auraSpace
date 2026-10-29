"""Build the source-backed viva handbook. Run: python3 docs/viva/build_guide.py"""
from pathlib import Path
import re, json, math, base64, hashlib
from html import escape
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle, Preformatted, Flowable, Image, KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / 'AuraSpace_End_to_End_Viva_Guide.pdf'
W,H=595.276,841.89
LEFT,RIGHT,TOP,BOTTOM=46,46,69,54
CW=W-LEFT-RIGHT
INK=colors.HexColor('#17332f'); TEAL=colors.HexColor('#167b72'); GOLD=colors.HexColor('#d59c42')
MUTED=colors.HexColor('#586963'); LIGHT=colors.HexColor('#eef4f1'); LINE=colors.HexColor('#d6e2dc')
for name,file in [('Body','Lato-Regular.ttf'),('Bold','Lato-Bold.ttf'),('Italic','Lato-Italic.ttf')]:
    pdfmetrics.registerFont(TTFont(name,'/usr/share/fonts/truetype/lato/'+file))
pdfmetrics.registerFont(TTFont('Mono','/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Italic',boldItalic='Bold')
styles={
 'body':ParagraphStyle('body',fontName='Body',fontSize=10,leading=14.4,textColor=INK,spaceAfter=8),
 'small':ParagraphStyle('small',fontName='Body',fontSize=8.1,leading=11.1,textColor=MUTED,spaceAfter=5),
 'h2':ParagraphStyle('h2',fontName='Bold',fontSize=12.2,leading=16.3,textColor=TEAL,spaceBefore=7,spaceAfter=6),
 'title':ParagraphStyle('title',fontName='Bold',fontSize=25,leading=29,textColor=INK,spaceAfter=13),
 'cell':ParagraphStyle('cell',fontName='Body',fontSize=8.6,leading=11.8,textColor=INK,spaceAfter=0),
 'th':ParagraphStyle('th',fontName='Bold',fontSize=8.5,leading=11.7,textColor=colors.white,spaceAfter=0),
 'code':ParagraphStyle('code',fontName='Mono',fontSize=7.6,leading=10.6,textColor=INK,backColor=LIGHT,borderPadding=9,spaceBefore=4,spaceAfter=13),
}

def fmt(s):
    s=escape(s)
    s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'`(.+?)`',lambda m:'<font name="Mono" size="8.3">'+m[1]+'</font>',s)
    s=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',r'<link href="\2" color="#167b72">\1</link>',s)
    return s

def p(s,style='body'): return Paragraph(fmt(s),styles[style])

class Diagram(Flowable):
    def __init__(self,kind):
        super().__init__(); self.width=CW; self.kind=kind
        self.height={'overview':172,'architecture':238,'ip':151,'mask':128,'maskrcnn':178,'homography':173,'identity':177,'scene':166,'ray':161,'sat':167,'queue':203,'storage':164,'lifecycle':159}.get(kind,150)
    def draw(self):
        c=self.canv
        def box(x,y,w,h,title,sub='',fill=LIGHT):
            c.setFillColor(fill); c.setStrokeColor(LINE);c.roundRect(x,y,w,h,7,fill=1,stroke=1)
            lines=title.split('|'); yy=y+h/2+((len(lines)-1)*6)+(7 if sub else 0)
            c.setFillColor(INK);c.setFont('Bold',9.3)
            for line in lines:c.drawCentredString(x+w/2,yy,line);yy-=12
            if sub:
                c.setFillColor(MUTED); c.setFont('Body',7.7)
                for line in sub.split('|'): c.drawCentredString(x+w/2,yy-2,line);yy-=10
        def arrow(x1,y1,x2,y2,label=''):
            c.setStrokeColor(TEAL);c.setFillColor(TEAL);c.setLineWidth(1.3);c.line(x1,y1,x2,y2)
            a=math.atan2(y2-y1,x2-x1);q=c.beginPath();q.moveTo(x2,y2)
            for d in [-.45,.45]:q.lineTo(x2-6*math.cos(a+d),y2-6*math.sin(a+d))
            q.close();c.drawPath(q,fill=1,stroke=0)
            if label:c.setFont('Body',7.3);c.drawCentredString((x1+x2)/2,(y1+y2)/2+5,label)
        def note(x,y,s):c.setFillColor(MUTED);c.setFont('Body',8);c.drawString(x,y,s)
        k=self.kind
        if k=='overview':
            for x,t,s in [(0,'1 / IMAGE PROCESSING','Pixels, contrast, edges, masks'),(173,'2 / COMPUTER VISION','Objects, depth, proposals'),(346,'3 / GRAPHICS','Editable room and interaction')]:box(x,91,157,59,t,s)
            arrow(157,120,173,120);arrow(330,120,346,120)
            box(90,5,325,52,'Human review + sourced measurements','Correct detections, preserve originals, confirm changes')
            for x in [78,251,424]:arrow(x,91,x,73)
            c.setStrokeColor(TEAL);c.line(78,73,424,73);arrow(251,73,251,57)
        elif k=='architecture':
            box(0,167,151,56,'Android / Expo','SQLite + local photo files')
            box(0,85,151,56,'Web / Next.js','Legacy browser-local projects')
            box(194,167,132,56,'Fastify API :4000','Auth / ownership / revisions')
            box(368,167,135,56,'PostgreSQL','Projects, jobs, metadata')
            box(194,85,132,56,'Redis + BullMQ','Queue, retry and leases')
            box(368,85,135,56,'Private object store','Supabase private bucket')
            box(194,3,132,56,'Node worker','Persist output proposals')
            box(368,3,135,56,'Python / FastAPI','OpenCV + PyTorch models')
            arrow(151,195,194,195);arrow(326,195,368,195);arrow(260,167,260,141)
            arrow(260,85,260,59);arrow(326,31,368,31);arrow(326,48,368,96)
            arrow(326,182,368,141);c.setDash(3,3)
            c.setStrokeColor(TEAL);c.line(151,112,163,112);c.line(163,112,163,0);c.line(163,0,351,0);arrow(351,0,368,22);c.setDash()
            note(2,64,'Dashed: web vision proxy uses Python directly;')
            note(2,52,'web does not use native cloud workspace.')
        elif k=='ip':
            for x,t in [(0,'Decode + orient'),(173,'Bound analysis size'),(346,'Process / inspect')]:box(x,87,157,46,t)
            arrow(157,110,173,110);arrow(330,110,346,110)
            box(0,8,157,47,'Unchanged source','Original bytes / source pixels')
            box(173,8,157,47,'Map coordinates back','Separate X and Y scales')
            box(346,8,157,47,'Derived artifacts','PNG masks / previews')
            arrow(78,87,78,55);arrow(424,87,424,55);arrow(346,31,330,31)
        elif k=='mask':
            for x,t,s in [(0,'Raw binary mask','Threshold model output'),(173,'Clean + review','Close pinholes; paint / erase'),(346,'Removal union','Expand selected movable items')]:box(x,49,157,57,t,s)
            arrow(157,78,173,78);arrow(330,78,346,78)
            note(3,22,'White = remove / foreground. Black = preserve. Each instance keeps its own identity.')
        elif k=='maskrcnn':
            for x,t,s in [(0,'RGB tensor','Scaled analysis photo'),(173,'ResNet-50 + FPN','Features at multiple scales'),(346,'RPN + RoIAlign','Propose and align regions')]:box(x,104,157,57,t,s)
            arrow(157,133,173,133);arrow(330,133,346,133)
            for x,t,s in [(0,'Class + confidence','What is the object?'),(173,'Bounding box','Where is its rectangle?'),(346,'Instance mask','Which pixels belong to it?')]:box(x,9,157,57,t,s)
            c.setStrokeColor(TEAL);c.line(78,83,424,83);arrow(424,104,424,83)
            for x in [78,251,424]:arrow(x,83,x,66)
        elif k=='homography':
            c.setStrokeColor(TEAL);c.setFillColor(LIGHT)
            for pts in [[(20,12),(193,12),(172,144),(56,144)],[(320,12),(488,12),(488,144),(320,144)]]:
                c.setFillColor(LIGHT)
                q=c.beginPath();q.moveTo(*pts[0]);[q.lineTo(*pt) for pt in pts[1:]];q.close();c.drawPath(q,fill=1,stroke=1)
                for i,(x,y) in enumerate(pts):c.setFillColor(GOLD);c.circle(x,y,4,fill=1,stroke=0);c.setFillColor(INK);c.setFont('Bold',9);c.drawString(x+6,y+5,str(i+1))
            arrow(205,78,302,78,'H: 3 x 3')
            note(50,156,'Photo floor pixels');note(337,156,'Measured floor plane')
            note(344,77,'Width and depth in meters')
        elif k=='identity':
            box(0,109,145,49,'Photo A observation','Box / mask in source pixels');box(0,15,145,49,'Photo B observation','Another view of same sofa')
            box(182,62,145,57,'Physical item: sofa-1','One width / depth / height')
            box(363,109,140,49,'Layout A placement','Position + yaw + lock');box(363,15,140,49,'Layout B placement','A different position')
            arrow(145,133,182,99);arrow(145,40,182,84);arrow(327,99,363,133);arrow(327,84,363,40)
        elif k=='scene':
            box(164,102,176,51,'Validated scene v2','Meters / items / layouts / evidence')
            for x,t,s in [(0,'Inside view','Perspective at eye height'),(173,'Overview','Perspective from above'),(346,'Plan view','Native SVG / web orthographic')]:box(x,8,157,57,t,s)
            c.setStrokeColor(TEAL);c.line(78,83,424,83);arrow(251,102,251,83)
            for x in [78,251,424]:arrow(x,83,x,65)
        elif k=='ray':
            box(0,98,148,49,'Screen touch (x, y)','Relative to viewport');box(177,98,148,49,'Normalized coordinates','x: -1..1 / y: -1..1');box(355,98,148,49,'World-space ray','Camera position + direction')
            arrow(148,122,177,122);arrow(325,122,355,122)
            box(177,8,326,53,'Intersect floor Y = 0; snap; validate; commit','Raycasting proposes a point. Scene commands store the accepted pose.')
            arrow(429,98,429,61)
        elif k=='sat':
            c.setStrokeColor(INK);c.setFillColor(LIGHT)
            for x,y,a,col in [(88,87,.35,TEAL),(224,87,-.3,GOLD)]:
                c.saveState();c.translate(x,y);c.rotate(a*180/math.pi);c.setStrokeColor(col);c.setFillColor(LIGHT);c.rect(-57,-27,114,54,fill=1,stroke=1);c.restoreState()
            c.setStrokeColor(MUTED);c.line(15,24,310,24);c.setStrokeColor(TEAL);c.setLineWidth(5);c.line(32,24,144,24);c.setStrokeColor(GOLD);c.line(172,24,280,24)
            note(22,5,'A separating projection axis means no overlap.')
            box(334,41,169,89,'SAT for rotated footprints','Project corners onto edge normals.|One separated interval is enough.|Touching edges are allowed.')
        elif k=='queue':
            for x,t,s in [(0,'API accepts intent','Validate revision + idempotency'),(173,'PostgreSQL job','Save immutable input snapshot'),(346,'Redis queue entry','Small payload: durable job ID')]:box(x,128,157,59,t,s)
            arrow(157,158,173,158);arrow(330,158,346,158)
            for x,t,s in [(0,'Explicit user review','Keep latest measurements / edits'),(173,'Proposal + artifacts','DB metadata + private object bytes'),(346,'Worker + Python','Process, retry, check cancel')]:box(x,25,157,59,t,s)
            arrow(424,128,424,84);arrow(346,55,330,55);arrow(173,55,157,55)
            note(5,4,'Recovery scans persisted queued intent when Redis enqueue is temporarily unavailable.')
        elif k=='storage':
            for x,t,s in [(0,'SQLite + local files','Offline room and source photos'),(173,'PostgreSQL','Remote revisions, jobs, ownership'),(346,'Object storage','Private photo / mask / preview bytes')]:box(x,81,157,64,t,s)
            arrow(157,113,173,113);arrow(330,113,346,113)
            box(74,4,355,49,'Portable ZIP + manifest + SHA-256','Editable scene and referenced media; import verifies integrity')
            arrow(78,81,108,53);arrow(424,81,398,53)
        elif k=='lifecycle':
            for x,t in [(0,'queued'),(130,'running'),(260,'review'),(390,'user accepts')]:box(x,90,112,43,t)
            for x in [112,242,372]:arrow(x,111,x+18,111)
            box(0,10,157,43,'retry after failure');box(173,10,157,43,'cancelled');box(346,10,157,43,'failed after attempts')
            arrow(186,90,251,53);arrow(186,90,424,53);arrow(56,53,56,90)

def parse_page(text):
    lines=text.strip().splitlines();title=lines.pop(0).lstrip('# ').strip();items=[];src=''
    i=0
    while i<len(lines):
        s=lines[i].strip()
        if not s:i+=1;continue
        if s.startswith('@sources '):src=s[9:];i+=1;continue
        if s.startswith('## '):items.append(p(s[3:],'h2'));i+=1;continue
        if s.startswith(':::diagram '):items.extend([Diagram(s[11:]),Spacer(1,8)]);i+=1;continue
        if s.startswith(':::image '):
            name=s[9:];im=Image(str(HERE/'assets'/name));im.drawHeight=im.imageHeight*CW/im.imageWidth;im.drawWidth=CW;items.extend([im,Spacer(1,8)]);i+=1;continue
        if s.startswith('```'):
            code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            items.append(Preformatted('\n'.join(code),styles['code']));i+=1;continue
        if s.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                row=[x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch('[-: ]+',v) for v in row):rows.append(row)
                i+=1
            n=len(rows[0]); widths=([CW*.25,CW*.75] if n==2 else [CW*.23,CW*.39,CW*.38] if n==3 else [CW/n]*n)
            if title.startswith('Repository map'): widths=[CW*.48,CW*.52]
            if title.startswith('References and provenance'): widths=[CW*.085,CW*.915]
            table=Table([[p(v,'th' if ri==0 else 'cell') for v in row] for ri,row in enumerate(rows)],colWidths=widths,hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),TEAL),('ROWBACKGROUNDS',(0,1),(-1,-1),[LIGHT,colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,-1),.4,LINE)]))
            if title.startswith('Repository map'):
                table.setStyle(TableStyle([('TOPPADDING',(0,0),(-1,-1),4.8),('BOTTOMPADDING',(0,0),(-1,-1),4.8)]))
            items.extend([table,Spacer(1,9)]);continue
        if s.startswith('- '):items.append(p('• '+s[2:]));i+=1;continue
        if re.match(r'^\d+\. ',s):items.append(p(s));i+=1;continue
        para=[s];i+=1
        while i<len(lines) and lines[i].strip() and not lines[i].startswith(('## ','@sources',':::','```','|','- ')) and not re.match(r'^\d+\. ',lines[i]):
            para.append(lines[i].strip());i+=1
        items.append(p(' '.join(para)))
    return title,items,src

def make_assets():
    import cv2,numpy as np
    from PIL import Image as PILImage,ImageDraw,ImageFont
    import sys
    sys.path.insert(0,str(ROOT/'services/vision'))
    from app.preprocessing import to_grayscale,apply_clahe,detect_edges,extract_contours
    from app.masks import reviewed_mask
    source=HERE/'assets/coco-39769.jpg'
    expected='dea9e7ef97386345f7cff32f9055da4982da5471c48d575146c796ab4563b04e'
    assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
    img=cv2.imread(str(source))
    contour=img.copy()
    for v in extract_contours(img,min_area=200):cv2.polylines(contour,[np.array(v['points'],np.int32)],True,(70,180,100),2)
    panels=[('Original smoke fixture',img),('Grayscale: weighted luminance',to_grayscale(img)),('CLAHE: L channel only',apply_clahe(img)),('Canny: thin structural edges',detect_edges(img)),('Sobel: gradient magnitude',detect_edges(img,'sobel')),('Contours: filtered boundaries',contour)]
    def plate(entries,name):
        colw,ph=640,520;out=PILImage.new('RGB',(colw*2,ph*((len(entries)+1)//2)), '#ffffff');draw=ImageDraw.Draw(out);font=ImageFont.truetype('/usr/share/fonts/truetype/lato/Lato-Bold.ttf',22)
        for i,(title,pixels) in enumerate(entries):
            x=(i%2)*colw;y=(i//2)*ph;draw.text((x+9,y+8),title,font=font,fill='#17332f')
            if pixels.ndim==2:rgb=cv2.cvtColor(pixels,cv2.COLOR_GRAY2RGB)
            elif pixels.shape[2]==4:rgb=cv2.cvtColor(pixels,cv2.COLOR_BGRA2RGBA)
            else:rgb=cv2.cvtColor(pixels,cv2.COLOR_BGR2RGB)
            out.paste(PILImage.fromarray(rgb).resize((640,480)),(x,y+38))
        out.save(HERE/'assets'/name)
    plate(panels,'processing-plate.jpg')
    analysis=json.loads((ROOT/'.artifacts/model-smoke/analysis.json').read_text());det=analysis['detections'][0]
    def decode(uri):return cv2.imdecode(np.frombuffer(base64.b64decode(uri.split(',')[-1]),np.uint8),cv2.IMREAD_COLOR)
    mask=decode(det['mask_uri'])
    b=det['box']
    selection=reviewed_mask(img.shape,[{'box':[b['x1'],b['y1'],b['x2']-b['x1'],b['y2']-b['y1']], 'polygons':[det['mask_polygon']], 'strokes':[], 'expansionPx':3}])
    removal=cv2.imread(str(ROOT/'.artifacts/model-smoke/removal.png'))
    assert np.array_equal(img[selection==0],removal[selection==0]), 'Reconstructed smoke mask must match the recorded preview'
    plate([('Original: COCO image 39769',img),('Mask R-CNN: cleaned couch mask',mask),('Removal polygon + 3 px expansion',selection),('Big-LaMa: recorded preview',removal)],'model-plate.jpg')

def build():
    parts=(HERE/'Viva_Guide.md').read_text().split('\n---PAGE---\n')
    pages=[parse_page(t) for t in parts]
    c=canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1)
    c.setTitle('AuraSpace | End-to-End Viva Guide');c.setAuthor('AuraSpace Project Team');c.setSubject('Image processing, computer vision and interactive computer graphics; source-backed viva preparation')
    layout=[]
    for n,(title,items,src) in enumerate(pages,1):
        section='PROJECT OVERVIEW' if n<5 else '01 / IMAGE PROCESSING' if n<14 else '02 / COMPUTER VISION' if n<25 else '03 / INTERACTIVE COMPUTER GRAPHICS' if n<43 else 'REFERENCES & SOURCE MAP'
        c.bookmarkPage(f'page-{n}');c.addOutlineEntry(title,f'page-{n}',0,False)
        c.setFillColor(TEAL);c.rect(0,H-12,W,12,fill=1,stroke=0)
        c.setFont('Bold',8.5);c.drawString(LEFT,H-39,'AURASPACE / VIVA HANDBOOK');c.setFont('Body',8);c.setFillColor(MUTED);c.drawRightString(W-RIGHT,H-39,section)
        titleflow=p(title,'title');tw,th=titleflow.wrap(CW,100);y=H-TOP;titleflow.drawOn(c,LEFT,y-th);y-=th+15
        if n==1:
            c.setFillColor(GOLD);c.roundRect(LEFT,y-4,64,4,2,fill=1,stroke=0);y-=24
        available=y-BOTTOM-(35 if src else 5)
        # Fixed pages make references dependable. Refuse any silent page overflow.
        measured=[]
        for flow in items:
            fw,fh=flow.wrap(CW,available)
            before=flow.getSpaceBefore();after=flow.getSpaceAfter()
            measured.append((flow,fh,before,after))
        required=sum(h+b+a for _,h,b,a in measured)
        scale=min(1,available/required) if required else 1
        if scale<.88:raise RuntimeError(f'Page {n} too full ({required:.0f} > {available:.0f}): {title}')
        c.saveState();c.translate(LEFT,y);c.scale(1,scale)
        cursor=0
        for flow,fh,before,after in measured:
            cursor-=before+fh;flow.drawOn(c,0,cursor);cursor-=after
        c.restoreState()
        if src:
            foot=p('Source trail: '+src,'small');_,fh=foot.wrap(CW,36);foot.drawOn(c,LEFT,BOTTOM+2)
        c.setStrokeColor(LINE);c.setLineWidth(.6);c.line(LEFT,42,W-RIGHT,42)
        c.setFillColor(MUTED);c.setFont('Body',7.6);c.drawString(LEFT,28,'Source snapshot: 25 Oct 2026 • base commit f2a83e8 • preview implementation')
        c.setFont('Bold',8.5);c.drawRightString(W-RIGHT,28,f'{n:02d} / {len(pages):02d}')
        layout.append({'page':n,'title':title,'used_pt':round(required,1),'available_pt':round(available,1),'vertical_scale':round(scale,3)})
        c.showPage()
    c.save();(HERE/'layout-report.json').write_text(json.dumps(layout,indent=2)+'\n')
    print(f'Created {OUT} ({len(pages)} pages)')
    print('Minimum vertical scale:',min(x['vertical_scale'] for x in layout))

if __name__=='__main__':make_assets();build()
