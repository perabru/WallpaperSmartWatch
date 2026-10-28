#!/usr/bin/env python3
"""Reconstruct an already signed release from an exact, hashed CI build.

The recipe contains public APK packaging metadata and signatures only. No key
or password is used, and this cannot sign a different application or update.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile
import lzma

LIMIT = 64 * 1024 * 1024

def require(condition, message):
    if not condition:
        raise ValueError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def reconstruct(base, recipe):
    require(recipe['format'] == 'raccoon-release-layout/v1', 'Unsupported recipe')
    require(len(base) < LIMIT and digest(base) == recipe['baseSha256'], 'Base APK checksum mismatch')
    decoder = lzma.LZMADecompressor()
    literal = decoder.decompress(base64.b64decode(''.join(recipe['literalXzChunks']), validate=True), max_length=LIMIT)
    require(decoder.eof and not decoder.unused_data and len(literal) == recipe['literalBytes'], 'Invalid public metadata')
    result = bytearray()
    require(len(recipe['segments']) <= 1000, 'Too many segments')
    for segment in recipe['segments']:
        require(len(segment) == 1 and next(iter(segment)) in ('copy', 'literal'), 'Invalid operation')
        kind, value = next(iter(segment.items()))
        require(len(value) == 2 and all(type(v) is int for v in value), 'Invalid range')
        offset, count = value
        source = base if kind == 'copy' else literal
        require(offset >= 0 and count >= 0 and offset + count <= len(source), 'Range out of bounds')
        require(len(result) + count < LIMIT, 'APK exceeds limit')
        result.extend(source[offset:offset + count])
    require(len(result) == recipe['signedBytes'] and digest(result) == recipe['signedSha256'], 'Signed APK checksum mismatch')
    # A packaging recipe may not change executable code, resources or artwork.
    with zipfile.ZipFile(io.BytesIO(base)) as original, zipfile.ZipFile(io.BytesIO(result)) as signed:
        names = {i.filename for i in original.infolist() if not i.is_dir()}
        require(names == {i.filename for i in signed.infolist() if not i.is_dir()}, 'APK file set changed')
        for name in names:
            require(original.getinfo(name).file_size <= LIMIT and signed.getinfo(name).file_size <= LIMIT, 'Entry exceeds limit')
            require(original.read(name) == signed.read(name), 'Application content changed: ' + name)
    return bytes(result)

def main():
    recipe = json.loads(Path(sys.argv[1]).read_text())
    artifact = Path(sys.argv[2])
    destination = Path(sys.argv[3])
    filename = recipe['filename']
    require(re.fullmatch(r'RaccoonStudio-[0-9.]+-assinado\.apk', filename) is not None, 'Invalid APK filename')
    require(artifact.stat().st_size < 150 * 1024 * 1024, 'Artifact exceeds limit')
    with zipfile.ZipFile(artifact) as z:
        info = z.getinfo('native/aligned.apk')
        require(info.file_size < LIMIT, 'Base APK exceeds limit')
        apk = reconstruct(z.read(info), recipe)
        destination.mkdir(parents=True, exist_ok=True)
        (destination / filename).write_bytes(apk)
        (destination / (filename + '.sha256')).write_text(digest(apk) + '  ' + filename + '\n')
        for member, output in {
            'RaccoonStudio-source.zip':'RaccoonStudio-2.1.0-codigo-fonte.zip',
            'qa/image-editor-tests.json':'image-editor-tests.json',
            'qa/image-core-tests.json':'image-core-tests.json',
            'qa/Raccoon-Inventory-480.png':'Raccoon-Inventory-480.png',
            'qa/Raccoon-Inventory-480-animado.gif':'Raccoon-Inventory-480-animado.gif',
        }.items():
            entry = z.getinfo(member)
            require(entry.file_size < LIMIT, 'Artifact member exceeds limit')
            (destination / output).write_bytes(z.read(entry))
    print('Exact signed APK reconstructed:', filename, digest(apk))

if __name__ == '__main__':
    main()
