#!/usr/bin/env bash
# Runs pure policy checks against the real compiled app and pinned SDK classes.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
sdk_dir="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$project_dir/../toolchain/android-sdk}}"
java_dir="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
work_dir="$project_dir/build/native"
if [[ ! -f "$work_dir/classes.jar" ]]; then
  printf 'Run ./build.sh first.\n' >&2
  exit 1
fi
if [[ -x "$java_dir/bin/javac" ]]; then
  java_compiler="$java_dir/bin/javac"
  java_runtime="$java_dir/bin/java"
else
  java_compiler="$(command -v javac)"
  java_runtime="$(command -v java)"
fi
classpath="$work_dir/classes.jar:$sdk_dir/platforms/android-35/android.jar"
while IFS= read -r -d '' dependency; do
  classpath="$classpath:$dependency"
done < <(find "$work_dir/dependencies" -name '*.jar' -type f -print0)
mkdir -p "$work_dir/policy-tests"
"$java_compiler" -encoding UTF-8 -cp "$classpath" -d "$work_dir/policy-tests" "$project_dir/tools/tests/WatchfacePolicyTest.java"
"$java_runtime" -cp "$work_dir/policy-tests:$classpath" br.com.perabru.raccoonstudio.WatchfacePolicyTest
