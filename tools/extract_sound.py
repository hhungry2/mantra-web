"""
Extract Sound effects from Sound.dat into assets/sfx/*.wav
"""

import os
import sys
import struct
import wave

sys.path.append(os.path.dirname(__file__))
from unpack_dat import load_dat_file

INPUT_DAT = r'C:\Users\USER\Downloads\Mantra-Windows\Mantra-Windows\Sound.dat'
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    sounds = load_dat_file(INPUT_DAT)
    extracted_count = 0
    
    for obj in sounds:
        if obj['type'] != 'SAMP':
            continue
        
        name = obj['name']
        data = obj['data']
        
        # Allegro SAMPLE header (8 bytes):
        # unsigned short bits
        # unsigned short freq
        # unsigned int len
        bits_raw, freq, sample_len = struct.unpack('>HHI', data[:8])
        pcm_data = data[8:]
        
        # Determine audio parameters based on pcm_data length vs sample_len
        # In Allegro DAT files, 8-bit unsigned PCM mono has 1 channel, 1 byte/sample
        # If len(pcm_data) == sample_len: 8-bit mono
        # If len(pcm_data) == sample_len * 2: either 16-bit mono or 8-bit stereo
        
        channels = 1
        sampwidth = 1
        
        if len(pcm_data) == sample_len:
            channels = 1
            sampwidth = 1
        elif len(pcm_data) == sample_len * 2:
            # 8-bit stereo or 16-bit mono
            channels = 2
            sampwidth = 1
        elif len(pcm_data) == sample_len * 4:
            channels = 2
            sampwidth = 2
        else:
            sampwidth = max(1, len(pcm_data) // sample_len)
            
        out_path = os.path.join(OUTPUT_DIR, f"sfx_{name}.wav")
        with wave.open(out_path, 'wb') as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sampwidth)
            wf.setframerate(freq)
            wf.writeframes(pcm_data)
            
        print(f"Extracted sfx_{name}.wav (freq={freq}Hz, len={sample_len}, bytes={len(pcm_data)}, channels={channels})")
        extracted_count += 1
        
    print(f"Successfully extracted {extracted_count} sound effects to {OUTPUT_DIR}")

if __name__ == '__main__':
    main()
