#!/usr/bin/env bash
# Build the Android app without Gradle, using an installed Android SDK and JDK.
# Linux/macOS prerequisites: JDK 17+, Android SDK Platform 35, Build-Tools 35.0.0,
# Python 3, zip. First run: python3 tools/fetch-dependencies.py.
# A debug signing key is created outside the source project.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$project_dir/app/src/main"
sdk_dir="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$project_dir/../toolchain/android-sdk}}"
tools_dir="$sdk_dir/build-tools/35.0.0"
android_jar="$sdk_dir/platforms/android-35/android.jar"
java_dir="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
work_dir="$project_dir/build/native"
output_apk="$project_dir/build/RaccoonStudio-debug.apk"
signing_dir="${RACCOON_SIGNING_DIR:-$project_dir/../toolchain/signing}"
version_code="${RACCOON_VERSION_CODE:-2}"
version_name="${RACCOON_VERSION_NAME:-2.0.0}"

if [[ -x "$java_dir/bin/javac" ]]; then
  java_compiler="$java_dir/bin/javac"
  jar_tool="$java_dir/bin/jar"
  key_tool="$java_dir/bin/keytool"
  export JAVA_HOME="$java_dir"
else
  java_compiler="$(command -v javac || true)"
  jar_tool="$(command -v jar || true)"
  key_tool="$(command -v keytool || true)"
fi

for required in "$tools_dir/aapt2" "$tools_dir/d8" "$tools_dir/zipalign" "$tools_dir/apksigner" "$java_compiler" "$jar_tool" "$key_tool"; do
  if [[ -z "$required" || ! -x "$required" ]]; then
    printf 'Missing tool: %s\nSet ANDROID_SDK_ROOT and JAVA_HOME to your SDK/JDK.\n' "$required" >&2
    exit 1
  fi
done
if [[ ! -f "$android_jar" || ! -f "$source_dir/AndroidManifest.xml" ]]; then
  printf 'Missing Android platform or app manifest.\n' >&2
  exit 1
fi
command -v python3 >/dev/null
command -v zip >/dev/null
python3 "$project_dir/tools/fetch-dependencies.py" --check

mkdir -p "$work_dir" "$signing_dir"
rm -rf "$work_dir/classes" "$work_dir/generated" "$work_dir/dex" "$work_dir/dependencies" "$work_dir/native-libs"
mkdir -p "$work_dir/classes" "$work_dir/generated" "$work_dir/dex" "$work_dir/dependencies" "$work_dir/native-libs"
rm -f "$work_dir/resources.zip" "$work_dir/unsigned.apk" "$work_dir/aligned.apk" "$work_dir/classes.jar"

# AGP 8 uses namespace from app/build.gradle. AAPT2 standalone needs a package
# in its staging manifest. Apply the source manifest's tools:node removals too:
# standalone AAPT does not perform Android's library manifest merge.
python3 - "$project_dir" "$work_dir" <<'PY'
from pathlib import Path, PurePosixPath
import hashlib, json, shutil, sys, xml.etree.ElementTree as ET, zipfile
root, work = map(Path, sys.argv[1:])
tools_ns = 'http://schemas.android.com/tools'
ET.register_namespace('android', 'http://schemas.android.com/apk/res/android')
manifest = ET.parse(root / 'app/src/main/AndroidManifest.xml')
for parent in manifest.iter():
    for child in list(parent):
        if child.get('{%s}node' % tools_ns) == 'remove':
            parent.remove(child)
    for key in list(parent.attrib):
        if key.startswith('{%s}' % tools_ns):
            del parent.attrib[key]
manifest.getroot().set('package', 'br.com.perabru.raccoonstudio')
manifest.write(work / 'AndroidManifest.xml', encoding='utf-8', xml_declaration=True)
locked = json.loads((root / 'dependencies.lock.json').read_text())['dependencies']
expected = {entry['filename'] for entry in locked}
actual = {p.name for p in (root / 'app/libs').iterdir() if p.suffix in ('.jar', '.aar')}
if actual != expected:
    raise SystemExit('app/libs must contain exactly the dependencies in dependencies.lock.json')
for entry in locked:
    source = root / 'app/libs' / entry['filename']
    destination = work / 'dependencies' / source.stem
    destination.mkdir()
    if source.suffix == '.jar':
        shutil.copyfile(source, destination / source.name)
        continue
    with zipfile.ZipFile(source) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            parts = PurePosixPath(member.filename).parts
            if '..' in parts or member.filename.startswith('/'):
                raise SystemExit('Unsafe AAR entry: ' + member.filename)
            if member.filename.startswith(('res/', 'assets/')):
                raise SystemExit('Standalone build needs resource merge support for: ' + source.name)
            target = None
            if member.filename == 'classes.jar' or (member.filename.startswith('libs/') and member.filename.endswith('.jar')):
                target = destination / member.filename
            elif len(parts) == 3 and parts[0] == 'jni' and parts[2].endswith('.so'):
                target = work / 'native-libs/lib' / parts[1] / parts[2]
            if target is not None:
                data = archive.read(member)
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists() and target.read_bytes() != data:
                    raise SystemExit('Conflicting dependency entry: ' + str(target))
                target.write_bytes(data)
PY

dependency_jars=()
while IFS= read -r -d '' dependency_file; do
  dependency_jars+=("$dependency_file")
done < <(find "$work_dir/dependencies" -type f -name '*.jar' -print0)
dependency_classpath="$(IFS=:; printf '%s' "${dependency_jars[*]}")"

link_args=(link -o "$work_dir/unsigned.apk" -I "$android_jar" --manifest "$work_dir/AndroidManifest.xml" --java "$work_dir/generated" --auto-add-overlay --version-code "$version_code" --version-name "$version_name")
if [[ -d "$source_dir/res" ]] && [[ -n "$(find "$source_dir/res" -type f -print -quit)" ]]; then
  "$tools_dir/aapt2" compile --dir "$source_dir/res" -o "$work_dir/resources.zip"
  link_args+=(-R "$work_dir/resources.zip")
fi
if [[ -d "$source_dir/assets" ]]; then
  link_args+=(-A "$source_dir/assets")
fi
"$tools_dir/aapt2" "${link_args[@]}"

java_sources=()
while IFS= read -r -d '' source_file; do
  java_sources+=("$source_file")
done < <(find "$source_dir/java" "$work_dir/generated" -type f -name '*.java' -print0)
if [[ ${#java_sources[@]} -eq 0 ]]; then
  printf 'No Java sources found.\n' >&2
  exit 1
fi

"$java_compiler" -encoding UTF-8 -source 8 -target 8 -bootclasspath "$tools_dir/core-lambda-stubs.jar:$android_jar" -classpath "$dependency_classpath" -d "$work_dir/classes" "${java_sources[@]}"
"$jar_tool" cf "$work_dir/classes.jar" -C "$work_dir/classes" .
"$tools_dir/d8" --min-api 26 --lib "$android_jar" --output "$work_dir/dex" "$work_dir/classes.jar" "${dependency_jars[@]}"
(cd "$work_dir/dex" && zip -q "$work_dir/unsigned.apk" ./*.dex)
(cd "$work_dir/native-libs" && zip -q -0 -r "$work_dir/unsigned.apk" lib)
"$tools_dir/zipalign" -P 16 -f 4 "$work_dir/unsigned.apk" "$work_dir/aligned.apk"

if [[ ! -f "$signing_dir/debug.keystore" ]]; then
  "$key_tool" -genkeypair -keystore "$signing_dir/debug.keystore" -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Raccoon Studio,C=BR' -noprompt
fi
"$tools_dir/apksigner" sign --ks "$signing_dir/debug.keystore" --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "$output_apk" "$work_dir/aligned.apk"
"$tools_dir/apksigner" verify --verbose --print-certs "$output_apk" | tee "$work_dir/signing-verification.txt"
"$tools_dir/zipalign" -c -P 16 -v 4 "$output_apk" > "$work_dir/zipalign-verification.txt"
"$tools_dir/aapt2" dump badging "$output_apk" > "$work_dir/apk-badging.txt"
python3 - "$project_dir" "$work_dir" "$output_apk" "$version_code" "$version_name" <<'PY'
from pathlib import Path
import datetime, hashlib, json, struct, sys, zipfile
root, work, apk = map(Path, sys.argv[1:4])
digest = lambda data: hashlib.sha256(data).hexdigest()
report = {'applicationId': 'br.com.perabru.raccoonstudio', 'versionCode': int(sys.argv[4]),
          'versionName': sys.argv[5], 'minSdk': 26, 'targetSdk': 35,
          'apk': apk.name, 'bytes': apk.stat().st_size, 'sha256': digest(apk.read_bytes()),
          'hardwareTested': False, 'assets': {}, 'nativeLibraries': [],
          'verifiedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
with zipfile.ZipFile(apk) as archive, apk.open('rb') as file:
    for source in sorted((root / 'app/src/main/assets').rglob('*')):
        if source.is_file():
            relative = source.relative_to(root / 'app/src/main/assets').as_posix()
            original = source.read_bytes()
            assert archive.read('assets/' + relative) == original, relative
            report['assets'][relative] = {'bytes': len(original), 'sha256': digest(original)}
    for member in archive.infolist():
        if not member.filename.endswith('.so'):
            continue
        data = archive.read(member)
        assert data == (work / 'native-libs' / member.filename).read_bytes(), member.filename
        endian = '<' if data[5] == 1 else '>'
        if data[4] == 2:
            offset = struct.unpack_from(endian + 'Q', data, 32)[0]
            entry_size, count = struct.unpack_from(endian + 'HH', data, 54)
            header_format = endian + 'IIQQQQQQ'
        else:
            offset = struct.unpack_from(endian + 'I', data, 28)[0]
            entry_size, count = struct.unpack_from(endian + 'HH', data, 42)
            header_format = endian + 'IIIIIIII'
        headers = [struct.unpack_from(header_format, data, offset + index * entry_size) for index in range(count)]
        alignments = [header[7] for header in headers if header[0] == 1]
        assert alignments and all(value >= 16384 for value in alignments), member.filename
        file.seek(member.header_offset + 26)
        name_length, extra_length = struct.unpack('<HH', file.read(4))
        payload_offset = member.header_offset + 30 + name_length + extra_length
        assert member.compress_type == zipfile.ZIP_STORED and payload_offset % 16384 == 0, member.filename
        report['nativeLibraries'].append({'path': member.filename, 'bytes': len(data),
            'sha256': digest(data), 'elfLoadAlignments': alignments, 'apkOffset': payload_offset})
signing = (work / 'signing-verification.txt').read_text()
assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in signing
assert 'Verified using v3 scheme (APK Signature Scheme v3): true' in signing
report['signingV2V3Verified'] = True
report['zipAndElf16KiBAlignmentVerified'] = True
report['dependencies'] = json.loads((root / 'dependencies.lock.json').read_text())['dependencies']
report['sources'] = {str(p.relative_to(root)): digest(p.read_bytes()) for p in sorted((root / 'app/src/main/java').rglob('*.java'))}
(work / 'build-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('Verified packaged assets, native libraries, 16 KiB alignment and v2/v3 signature.')
PY
printf '\nBuilt APK: %s\n' "$output_apk"
