"""
Allegro 4 .dat File Unpacker for Mantra
Decryption key: 'musicman3320' (XOR)
"""

import os
import struct

XOR_KEY = b'musicman3320'

def decrypt_data(data: bytes, key: bytes = XOR_KEY) -> bytes:
    """Decrypt XOR-encrypted packfile data."""
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))

def unpackbits(data: bytes) -> bytes:
    """
    Decode Macintosh PackBits RLE, which is how the graphics blobs inside
    GameData.dat are compressed (the game originated on 68k Macs in 1995).

    n = 0..127   copy the next n+1 bytes verbatim
    n = 129..255 repeat the next byte 257-n times
    n = 128      no-op
    """
    out = bytearray()
    pos = 0
    while pos < len(data):
        n = data[pos]
        pos += 1
        if n < 128:
            out.extend(data[pos:pos + n + 1])
            pos += n + 1
        elif n > 128:
            if pos >= len(data):
                break
            out.extend(bytes([data[pos]]) * (257 - n))
            pos += 1
    return bytes(out)

def parse_chunks(blob: bytes):
    """
    Split a GameData blob into its id-tagged chunks.
    Layout: uint16 id + uint32 length + payload, terminated by id 65535.
    """
    chunks = {}
    pos = 0
    while pos + 6 <= len(blob):
        obj_id = (blob[pos] << 8) | blob[pos + 1]
        size = struct.unpack('>I', blob[pos + 2:pos + 6])[0]
        pos += 6
        if obj_id == 0xffff:
            break
        chunks[obj_id] = blob[pos:pos + size]
        pos += size
    return chunks

def parse_dat_bytes(decrypted_data: bytes):
    """
    Parse decrypted Allegro 4 DAT file bytes.
    Returns a list of dicts:
    [
        {
            'type': str (e.g. 'BMP ', 'DATA', 'SAMP'),
            'name': str,
            'props': dict,
            'data': bytes,
            'size': int,
            'unsize': int
        }, ...
    ]
    """
    magic = decrypted_data[4:8]
    if magic != b'ALL.':
        raise ValueError(f"Invalid DAT magic: {magic}")
    
    count = struct.unpack('>I', decrypted_data[8:12])[0]
    pos = 12
    objects = []
    
    for _ in range(count):
        props = {}
        while pos < len(decrypted_data):
            tag = decrypted_data[pos:pos+4]
            if tag == b'prop':
                prop_id = decrypted_data[pos+4:pos+8].decode('latin1', 'ignore').strip()
                prop_len = struct.unpack('>I', decrypted_data[pos+8:pos+12])[0]
                prop_val = decrypted_data[pos+12:pos+12+prop_len]
                props[prop_id] = prop_val
                pos += 12 + prop_len
            else:
                break
        
        obj_type = decrypted_data[pos:pos+4].decode('latin1', 'ignore')
        size = struct.unpack('>i', decrypted_data[pos+4:pos+8])[0]
        unsize = struct.unpack('>i', decrypted_data[pos+8:pos+12])[0]
        pos += 12
        
        raw_size = abs(size)
        obj_data = decrypted_data[pos:pos+raw_size]
        pos += raw_size
        
        name = props.get('NAME', b'').decode('latin1', 'ignore')
        objects.append({
            'type': obj_type,
            'name': name,
            'props': props,
            'data': obj_data,
            'size': size,
            'unsize': unsize
        })
        
    return objects

def load_dat_file(file_path: str):
    """Read and unpack a .dat file directly from path."""
    with open(file_path, 'rb') as f:
        encrypted = f.read()
    decrypted = decrypt_data(encrypted)
    return parse_dat_bytes(decrypted)
