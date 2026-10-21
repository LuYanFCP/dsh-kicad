"""Finding, running and downloading Freerouting, with a fake Freerouting (a Python script) and a fake Java."""
import hashlib
import io
import os
import stat
import sys
import threading
import time
import zipfile

import pytest

from dsh_kicad_sidecar import freerouting
from dsh_kicad_sidecar.freerouting import Cancelled, FreeroutingError, Router, download, jar_java, java_version, locate, run

posix = pytest.mark.skipif(sys.platform == "win32", reason="fake executables are scripts with a shebang")

FAKE = r'''
import os, sys, time
args = sys.argv[1:]
dsn, ses = args[args.index("-de") + 1], args[args.index("-do") + 1]
mode = os.environ.get("FAKE_FREEROUTING", "ok")
print("2026-10-21 22:31:30.090 INFO   Freerouting v9.9.9 (build-date: 2026-10-05)", flush=True)
print("INFO   Auto-routing stage started on board 'b' with baseline score 0.00 for 4 unrouted items.", flush=True)
print("INFO   Auto-routing pass #1 on board 'b' was completed in 0.1 seconds with score 990 (3 unrouted and 0 violations)", flush=True)
if mode == "hang":
    time.sleep(120)
if mode == "fail":
    print("Exception in thread main java.lang.UnsupportedClassVersionError: app/freerouting/Freerouting", flush=True)
    sys.exit(1)
print("INFO   Auto-routing pass #2 on board 'b' was completed in 0.1 seconds with score 1000 (0 unrouted and 0 violations)")
print("INFO   Auto-routing stage completed: started with 4 unrouted nets, completed in 0.2 seconds, final score: 1000.00 (0 unrouted and 0 violations)")
print("INFO   Optimizer pass #1 on board 'b' was completed in 0.1 seconds with the score of 300 (0 unrouted and 0 violations).")
print("INFO   Job 'x' finished with state: " + ("TIMED_OUT" if mode == "timeout" else "COMPLETED"))
with open(ses, "w") as fh:
    fh.write(open(os.environ["FAKE_SES"]).read() if os.environ.get("FAKE_SES") else "(session b (routes (resolution um 10) (network_out)))")
with open(ses + ".args", "w") as fh:
    fh.write("\n".join(args))
'''


def fake_router(tmp_path, executable=False):
    path = tmp_path / "fake_freerouting.py"
    path.write_text((f"#!{sys.executable}\n" if executable else "") + FAKE)
    if executable:
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
        return str(path)
    return Router(argv=[sys.executable, str(path)], version="9.9.9")


def fake_java(tmp_path, version):
    path = tmp_path / "java"
    path.write_text(f'#!/bin/sh\necho \'openjdk version "{version}" 2026-07-21\' >&2\n')
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return str(path)


def fake_jar(path, class_version=69):
    with zipfile.ZipFile(path, "w") as jar:
        jar.writestr("app/freerouting/Freerouting.class", b"\xca\xfe\xba\xbe" + (0).to_bytes(2, "big") + class_version.to_bytes(2, "big"))
    return str(path)


@pytest.fixture
def clean_env(monkeypatch, tmp_path):
    monkeypatch.delenv("FREEROUTING_JAR", raising=False)
    monkeypatch.delenv("JAVA_HOME", raising=False)
    monkeypatch.setenv("PATH", str(tmp_path / "nothing"))
    monkeypatch.setattr(freerouting, "data_dir", lambda: str(tmp_path / "data"))
    return tmp_path


# ---- finding it ---------------------------------------------------------------------------

def test_java_and_jar_versions(tmp_path):
    assert jar_java(fake_jar(tmp_path / "freerouting-2.5.0.jar")) == 25
    assert jar_java(fake_jar(tmp_path / "old.jar", 65)) == 21
    assert jar_java(str(tmp_path / "missing.jar")) is None
    assert freerouting.jar_version("/x/freerouting-2.5.0.jar") == "2.5.0" and freerouting.jar_version("/x/fr.jar") is None


@posix
@pytest.mark.parametrize("text,parsed", [("25.0.4", (25, 0, 4)), ("21", (21,)), ("1.8.0_402", (8, 0))])
def test_java_version(tmp_path, text, parsed):
    assert java_version(fake_java(tmp_path, text)) == parsed


@posix
def test_locate_a_jar_with_a_new_enough_java(clean_env):
    jar = fake_jar(clean_env / "freerouting-2.5.0.jar")
    router = locate(java=fake_java(clean_env, "25.0.1"), freerouting=jar)
    assert router.ok and router.source == "setting" and router.version == "2.5.0" and router.java_required == 25
    assert router.argv == [router.java, "-Djava.awt.headless=true", "-jar", jar]


@posix
def test_locate_reports_an_old_or_missing_java(clean_env):
    jar = fake_jar(clean_env / "freerouting-2.5.0.jar")
    old = locate(java=fake_java(clean_env, "21.0.2"), freerouting=jar)
    assert not old.ok and "needs Java 25+" in old.problems[0] and "Java 21.0.2" in old.problems[0]
    none = locate(freerouting=jar)
    assert not none.ok and none.problems == ["Java was not found (Freerouting is a Java program)"]


@posix
def test_locate_finds_the_newest_downloaded_jar(clean_env):
    data = clean_env / "data"
    data.mkdir()
    fake_jar(data / "freerouting-2.4.1.jar")
    newest = fake_jar(data / "freerouting-2.5.0.jar")
    router = locate(java=fake_java(clean_env, "25"))
    assert router.ok and router.jar == newest and router.source == "downloaded"


def test_locate_without_freerouting(clean_env, monkeypatch):
    router = locate(freerouting=str(clean_env / "gone.jar"))
    assert not router.ok and router.jar is None and "points to" in router.problems[0]
    monkeypatch.setenv("FREEROUTING_JAR", str(clean_env / "also-gone.jar"))
    assert "$FREEROUTING_JAR" in locate().problems[0]


@posix
def test_locate_a_native_executable(clean_env):
    exe = fake_router(clean_env, executable=True)
    router = locate(freerouting=exe)
    assert router.ok and router.argv == [exe] and router.executable == exe


def test_old_freerouting_is_refused(clean_env):
    router = locate(freerouting=fake_jar(clean_env / "freerouting-1.9.0.jar"))
    assert not router.ok and "older than Freerouting 2.0" in router.problems[0]


# ---- running it -----------------------------------------------------------------------------

def test_run_passes_the_headless_flags_and_reports_progress(tmp_path):
    dsn, ses = tmp_path / "b.dsn", tmp_path / "b.ses"
    dsn.write_text("(pcb b)")
    seen = []
    result = run(fake_router(tmp_path), str(dsn), str(ses), passes=7, timeout=90, progress=lambda *a: seen.append(a),
                 log_path=str(tmp_path / "b.log"))
    args = (tmp_path / "b.ses.args").read_text().splitlines()
    assert args[:4] == ["-de", str(dsn), "-do", str(ses)]
    assert {"--gui.enabled=false", "--router.automatic_neckdown=false", "--router.fanout.enabled=false",
            "--usage_and_diagnostic_data.disable_analytics=true", "--router.job_timeout=00:01:30",
            "--router.autorouter.max_passes=7"} <= set(args)
    assert result.summary() == {"version": "9.9.9", "state": "COMPLETED", "passes": 2, "optimizer_passes": 1, "unrouted_before": 4,
                                "unrouted": 0, "seconds": pytest.approx(result.elapsed, abs=0.1), "timed_out": False}
    assert seen[:2] == [(1.0, 7.0, "routing pass 1: 3 unrouted"), (2.0, 7.0, "routing pass 2: 0 unrouted")]
    assert (tmp_path / "b.log").read_text().startswith("$ ")


def test_run_failure_says_why(tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_FREEROUTING", "fail")
    (tmp_path / "b.dsn").write_text("(pcb b)")
    with pytest.raises(FreeroutingError, match="wrote no session.*exited with 1.*needs a newer Java"):
        run(fake_router(tmp_path), str(tmp_path / "b.dsn"), str(tmp_path / "b.ses"))


def test_cancel_stops_freerouting(tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_FREEROUTING", "hang")
    (tmp_path / "b.dsn").write_text("(pcb b)")
    cancel = threading.Event()
    threading.Timer(1.0, cancel.set).start()
    start = time.monotonic()
    with pytest.raises(Cancelled, match="cancelled; the board was not changed"):
        run(fake_router(tmp_path), str(tmp_path / "b.dsn"), str(tmp_path / "b.ses"), cancel=cancel)
    assert time.monotonic() - start < 10 and not (tmp_path / "b.ses").exists()


def test_overrunning_freerouting_is_killed(tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_FREEROUTING", "hang")
    monkeypatch.setattr(freerouting, "KILL_GRACE", 0.5)
    (tmp_path / "b.dsn").write_text("(pcb b)")
    with pytest.raises(FreeroutingError, match="stopped after the time limit"):
        run(fake_router(tmp_path), str(tmp_path / "b.dsn"), str(tmp_path / "b.ses"), timeout=1)


def test_run_needs_a_router():
    with pytest.raises(FreeroutingError, match="cannot run here: Java was not found"):
        run(Router(problems=["Java was not found"]), "a.dsn", "a.ses")


# ---- downloading it -------------------------------------------------------------------------

class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def release_of(data):
    return {"version": "0.0.1", "url": "https://example.invalid/freerouting-0.0.1.jar", "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "java": 25}


def test_download_checks_the_checksum(tmp_path, monkeypatch):
    data = b"jar bytes" * 1000
    monkeypatch.setattr(freerouting.urllib.request, "urlopen", lambda request, timeout: FakeResponse(data))
    out = io.StringIO()
    path = download(str(tmp_path / "dl"), release_of(data), out=out)
    assert path == str(tmp_path / "dl" / "freerouting-0.0.1.jar") and open(path, "rb").read() == data
    assert "sha256 verified" in out.getvalue() and os.listdir(tmp_path / "dl") == ["freerouting-0.0.1.jar"]
    again = io.StringIO()
    download(str(tmp_path / "dl"), release_of(data), out=again)
    assert "already in" in again.getvalue()  # a second run finds the verified jar and downloads nothing


def test_download_with_a_bad_checksum_installs_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(freerouting.urllib.request, "urlopen", lambda request, timeout: FakeResponse(b"tampered"))
    with pytest.raises(FreeroutingError, match="does not match the published checksum.*nothing was installed"):
        download(str(tmp_path / "dl"), release_of(b"original"), out=io.StringIO())
    assert os.listdir(tmp_path / "dl") == []


def test_download_command_runs_this_file_isolated():
    command = freerouting.download_command("/tmp/x")
    assert command[:2] == [sys.executable, "-I"] and command[2].endswith("freerouting.py") and command[3:] == ["download", "--dir", "/tmp/x"]


def test_pinned_release_is_the_jar_on_github():
    assert freerouting.RELEASE["url"].startswith("https://github.com/freerouting/freerouting/releases/download/")
    assert len(freerouting.RELEASE["sha256"]) == 64 and freerouting.RELEASE["java"] == 25
