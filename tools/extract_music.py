"""
Extract MOD music files from Music.dat into assets/music/*.mod
"""

import os
import sys

sys.path.append(os.path.dirname(__file__))
from unpack_dat import load_dat_file

INPUT_DAT = r'C:\Users\USER\Downloads\Mantra-Windows\Mantra-Windows\Music.dat'
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'music')

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    music = load_dat_file(INPUT_DAT)
    extracted_count = 0
    
    for obj in music:
        if obj['type'] != 'MOD ':
            continue
        
        name = obj['name']
        data = obj['data']
        out_path = os.path.join(OUTPUT_DIR, f"track_{name}.mod")
        with open(out_path, 'wb') as f:
            f.write(data)
            
        print(f"Extracted track_{name}.mod ({len(data)} bytes)")
        extracted_count += 1
        
    print(f"Successfully extracted {extracted_count} MOD music files to {OUTPUT_DIR}")

if __name__ == '__main__':
    main()
