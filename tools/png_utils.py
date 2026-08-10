"""
Pure Python PNG Encoder using zlib and struct.
No external dependencies required.
"""

import struct
import zlib

def _make_chunk(chunk_type: bytes, data: bytes) -> bytes:
    content = chunk_type + data
    crc = zlib.crc32(content) & 0xffffffff
    return struct.pack('>I', len(data)) + content + struct.pack('>I', crc)

def write_png_rgb(filename: str, width: int, height: int, rgb_bytes: bytes):
    """Write raw RGB (3 bytes per pixel) bytes to PNG."""
    if len(rgb_bytes) != width * height * 3:
        raise ValueError(f"RGB data length mismatch: expected {width * height * 3}, got {len(rgb_bytes)}")
    
    header = b'\x89PNG\r\n\x1a\n'
    ihdr = _make_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) # 2 = Truecolor RGB
    
    # Add filter byte 0 (None) to beginning of each scanline
    scanlines = []
    row_bytes = width * 3
    for y in range(height):
        scanlines.append(b'\x00')
        scanlines.append(rgb_bytes[y * row_bytes : (y + 1) * row_bytes])
    
    raw_data = b''.join(scanlines)
    compressed = zlib.compress(raw_data, level=6)
    idat = _make_chunk(b'IDAT', compressed)
    iend = _make_chunk(b'IEND', b'')
    
    with open(filename, 'wb') as f:
        f.write(header + ihdr + idat + iend)

def write_png_rgba(filename: str, width: int, height: int, rgba_bytes: bytes):
    """Write raw RGBA (4 bytes per pixel) bytes to PNG."""
    if len(rgba_bytes) != width * height * 4:
        raise ValueError(f"RGBA data length mismatch: expected {width * height * 4}, got {len(rgba_bytes)}")
    
    header = b'\x89PNG\r\n\x1a\n'
    ihdr = _make_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) # 6 = Truecolor RGBA
    
    scanlines = []
    row_bytes = width * 4
    for y in range(height):
        scanlines.append(b'\x00')
        scanlines.append(rgba_bytes[y * row_bytes : (y + 1) * row_bytes])
    
    raw_data = b''.join(scanlines)
    compressed = zlib.compress(raw_data, level=6)
    idat = _make_chunk(b'IDAT', compressed)
    iend = _make_chunk(b'IEND', b'')
    
    with open(filename, 'wb') as f:
        f.write(header + ihdr + idat + iend)
