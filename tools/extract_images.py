"""
Extract UI images from Images.dat into assets/ui/*.png
"""

import os
import sys
from PIL import Image

sys.path.append(os.path.dirname(__file__))
from unpack_dat import load_dat_file

INPUT_DAT = r'C:\Users\USER\Downloads\Mantra-Windows\Mantra-Windows\Images.dat'
GAMEDATA_DAT = r'C:\Users\USER\Downloads\Mantra-Windows\Mantra-Windows\GameData.dat'
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'ui')

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Load palette from GameData.dat
    gamedata = load_dat_file(GAMEDATA_DAT)
    pal_obj = [o for o in gamedata if o['name'] == 'SystemPalette'][0]
    pal_data = pal_obj['data']
    
    images = load_dat_file(INPUT_DAT)
    extracted_count = 0
    
    for obj in images:
        if obj['type'] != 'BMP ':
            continue
        
        name = obj['name'].lower()
        data = obj['data']
        bpp = (data[0] << 8) | data[1]
        width = (data[2] << 8) | data[3]
        height = (data[4] << 8) | data[5]
        pixel_bytes = data[6:]
        
        img = Image.new('RGBA', (width, height))
        pixels = img.load()
        
        if bpp == 8:
            idx = 0
            for y in range(height):
                for x in range(width):
                    color_idx = pixel_bytes[idx]
                    idx += 1
                    if color_idx == 0:
                        pixels[x, y] = (0, 0, 0, 0)
                    else:
                        r = pal_data[color_idx * 3]
                        g = pal_data[color_idx * 3 + 1]
                        b = pal_data[color_idx * 3 + 2]
                        pixels[x, y] = (r, g, b, 255)
        elif bpp == 24:
            idx = 0
            for y in range(height):
                for x in range(width):
                    r = pixel_bytes[idx]
                    g = pixel_bytes[idx + 1]
                    b = pixel_bytes[idx + 2]
                    idx += 3
                    if (r, g, b) == (255, 0, 255):
                        pixels[x, y] = (0, 0, 0, 0)
                    else:
                        pixels[x, y] = (r, g, b, 255)
        else:
            print(f"Warning: unsupported BPP {bpp} for {name}")
            continue
            
        out_path = os.path.join(OUTPUT_DIR, f"{name}.png")
        img.save(out_path)
        print(f"Extracted {name}.png ({width}x{height}, {bpp}bpp)")
        extracted_count += 1
        
    print(f"Successfully extracted {extracted_count} UI images to {OUTPUT_DIR}")

if __name__ == '__main__':
    main()
