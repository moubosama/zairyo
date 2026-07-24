import sys, os, fitz
PDF = r'C:/Users/81804/Pictures/zairyoの資料/20260723084638/250627_意匠図一式.pdf'
OUT = r'C:/Users/81804/Pictures/zairyoの資料/20260723084638/意匠図_pages_hires'
os.makedirs(OUT, exist_ok=True)
dpi = int(sys.argv[1]) if len(sys.argv) > 1 else 400
pages = [int(a) for a in sys.argv[2:]]
doc = fitz.open(PDF)
for n in pages:
    p = doc[n-1]
    pix = p.get_pixmap(dpi=dpi)
    path = os.path.join(OUT, f'page_{n:03d}.png')
    pix.save(path)
    mb = os.path.getsize(path)/1048576
    print(f'  p{n} OK {pix.width}x{pix.height} {mb:.1f}MB')
