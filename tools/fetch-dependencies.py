#!/usr/bin/env python3
"""Obtém somente as dependências públicas fixadas em dependencies.lock.json.

Usa apenas a biblioteca padrão, valida tamanho/SHA-256 antes de instalar e não
executa arquivos baixados. --check valida o cache local sem acessar a rede.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / "dependencies.lock.json"
DESTINATION = ROOT / "app" / "libs"
ALLOWED_HOSTS = {"raw.githubusercontent.com", "repo.maven.apache.org"}
MAX_ARTIFACT_BYTES = 32 * 1024 * 1024


class HttpsRedirectsOnly(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, new_url):
        parsed = urlparse(new_url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            raise ValueError("Redirecionamento fora das fontes HTTPS permitidas")
        return super().redirect_request(request, fp, code, msg, headers, new_url)


def load_dependencies():
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    if lock.get("schemaVersion") != 1:
        raise ValueError("Versão de lock não suportada")
    entries = lock.get("dependencies")
    if not isinstance(entries, list) or not entries:
        raise ValueError("Lock sem dependências")
    names = set()
    for entry in entries:
        name = entry["filename"]
        if not re.fullmatch(r"[A-Za-z0-9_.-]+\.(aar|jar)", name) or name in names:
            raise ValueError("Nome de dependência inválido ou repetido")
        names.add(name)
        if not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]):
            raise ValueError("SHA-256 inválido no lock")
        size = entry["bytes"]
        if not isinstance(size, int) or isinstance(size, bool) or not 0 < size <= MAX_ARTIFACT_BYTES:
            raise ValueError("Tamanho inválido no lock")
        parsed = urlparse(entry["url"])
        if (parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS
                or parsed.username or parsed.password or parsed.query or parsed.fragment):
            raise ValueError("Fonte da dependência não permitida")
    return entries


def valid_local(path, entry):
    if path.is_symlink():
        raise ValueError("Recusando arquivo de dependência que seja link simbólico: " + path.name)
    if not path.is_file() or path.stat().st_size != entry["bytes"]:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest() == entry["sha256"]


def download(entry, target):
    opener = build_opener(HttpsRedirectsOnly())
    request = Request(entry["url"], headers={"User-Agent": "WallpaperSmartWatch-dependency-fetch/1"})
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".download-", dir=DESTINATION, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            digest = hashlib.sha256()
            received = 0
            deadline = time.monotonic() + 90
            with opener.open(request, timeout=20) as response:
                while True:
                    if time.monotonic() > deadline:
                        raise TimeoutError("Tempo total do download excedido")
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    received += len(chunk)
                    if received > entry["bytes"]:
                        raise ValueError("Download maior que o tamanho fixado no lock")
                    digest.update(chunk)
                    temporary.write(chunk)
            if received != entry["bytes"] or digest.hexdigest() != entry["sha256"]:
                raise ValueError("Tamanho/SHA-256 divergente; download rejeitado")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, target)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="somente verifica arquivos locais; não usa rede")
    args = parser.parse_args()
    entries = load_dependencies()
    if DESTINATION.is_symlink():
        raise ValueError("Diretório app/libs não pode ser link simbólico")
    if not args.check:
        DESTINATION.mkdir(parents=True, exist_ok=True)
    failures = []
    for entry in entries:
        target = DESTINATION / entry["filename"]
        if valid_local(target, entry):
            print("OK  " + entry["filename"])
            continue
        if args.check:
            failures.append(entry["filename"] + ": ausente ou SHA-256 divergente")
            continue
        print("GET " + entry["filename"], flush=True)
        download(entry, target)
        print("OK  " + entry["filename"])
    if failures:
        for failure in failures:
            print("ERRO: " + failure, file=sys.stderr)
        print("Execute: python3 tools/fetch-dependencies.py", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, URLError) as error:
        print("ERRO: " + str(error), file=sys.stderr)
        sys.exit(1)
