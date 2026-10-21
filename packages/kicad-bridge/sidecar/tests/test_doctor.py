"""Environment check and install plans, with kicad-cli faked through PATH (the real KiCad is never touched)."""

import os
import stat
import sys

import pytest

from dsh_kicad_sidecar import freerouting, kicad_cli
from dsh_kicad_sidecar.doctor import format_report, install_hint, install_options, platform_info, run_doctor
from dsh_kicad_sidecar.kicad_cli import KiCadCli, KiCadCliError, flatpak_argv, locate_kicad_cli, parse_version
from dsh_kicad_sidecar.tools import ToolError, Toolbox

posix = pytest.mark.skipif(sys.platform == "win32", reason="fake executables are shell scripts")

FEDORA = {"os": "linux", "distro": "fedora", "distro_like": [], "name": "Fedora Linux 44", "version": "44"}


def script(path, body):
    path.write_text("#!/bin/sh\n" + body + "\n")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return str(path)


@pytest.fixture
def bare(tmp_path, monkeypatch):
    """A machine without KiCad: PATH holds only an empty bin dir, no $KICAD_CLI, no install dirs."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    monkeypatch.setenv("PATH", str(bin_dir))
    monkeypatch.delenv("KICAD_CLI", raising=False)
    monkeypatch.setattr(kicad_cli, "install_dirs", lambda: [])
    return bin_dir


def which_of(*present):
    return lambda name: f"/usr/bin/{name}" if name in present else None


def checks(report):
    return {c["id"]: c for c in report["checks"]}


# ---- platform and install plans -------------------------------------------------------

@pytest.mark.parametrize("text,distro,like", [
    ('NAME="Fedora Linux"\nID=fedora\nVERSION_ID=44\n', "fedora", []),
    ('NAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\nVERSION_ID="24.04"\n', "ubuntu", ["debian"]),
    ('NAME="Linux Mint"\nID=linuxmint\nID_LIKE="ubuntu debian"\n', "linuxmint", ["ubuntu", "debian"]),
    ("NAME='Arch Linux'\nID=arch\n", "arch", []),
])
def test_platform_info_reads_os_release(tmp_path, text, distro, like):
    f = tmp_path / "os-release"
    f.write_text(text)
    info = platform_info(str(f), system="linux")
    assert info["os"] == "linux" and info["distro"] == distro and info["distro_like"] == like


def test_platform_info_other_systems():
    assert platform_info(system="darwin")["os"] == "macos"
    assert platform_info(system="win32")["os"] == "windows"


def ids(options):
    return [o["id"] for o in options]


def recommended(options):
    return next(o for o in options if o["recommended"])


def test_fedora_prefers_rootless_flatpak_and_shows_dnf():
    options = install_options(FEDORA, which_of("dnf", "flatpak"))
    assert ids(options) == ["dnf", "flatpak", "download"]
    dnf, flatpak = options[0], options[1]
    assert dnf["needs_root"] and not dnf["runnable"] and dnf["command"] == "sudo dnf install -y kicad"
    assert not flatpak["needs_root"] and flatpak["runnable"] and recommended(options) is flatpak
    assert flatpak["steps"][-1] == ["flatpak", "install", "--user", "-y", "--noninteractive", "flathub", "org.kicad.KiCad"]
    assert "--user" in flatpak["steps"][0]  # the Flathub remote is added per user, no root


def test_fedora_without_flatpak_recommends_dnf():
    options = install_options(FEDORA, which_of("dnf"))
    assert recommended(options)["id"] == "dnf"
    assert not next(o for o in options if o["id"] == "flatpak")["runnable"]
    assert "sudo dnf install -y kicad" in install_hint(FEDORA, which_of("dnf"))


def test_ubuntu_uses_the_kicad_ppa():
    info = {**FEDORA, "distro": "ubuntu", "distro_like": ["debian"]}
    apt = install_options(info, which_of("apt-get"))[0]
    assert apt["id"] == "apt" and apt["needs_root"]
    assert apt["steps"][0] == ["sudo", "add-apt-repository", "-y", "ppa:kicad/kicad-10.0-releases"]
    assert apt["command"].endswith("sudo apt-get install -y kicad")


def test_arch_installs_the_libraries_too():
    info = {**FEDORA, "distro": "endeavouros", "distro_like": ["arch"]}
    pacman = install_options(info, which_of("pacman"))[0]
    assert pacman["id"] == "pacman" and "kicad-library" in pacman["steps"][0]


def test_unknown_linux_gets_flatpak_and_download():
    info = {**FEDORA, "distro": "nixos"}
    assert ids(install_options(info, which_of("flatpak"))) == ["flatpak", "download"]


def test_macos_and_windows():
    mac = install_options({**FEDORA, "os": "macos"}, which_of("brew"))
    assert mac[0]["command"] == "brew install --cask kicad" and mac[0]["runnable"] and mac[0]["recommended"]
    win = install_options({**FEDORA, "os": "windows"}, which_of())
    assert win[0]["id"] == "winget" and not win[0]["available"]
    assert recommended(win)["id"] == "download" and recommended(win)["url"].startswith("https://www.kicad.org")


def test_parse_version():
    assert parse_version("10.0.7") == (10, 0, 7)
    assert parse_version("Version: 8.0\n") == (8, 0)
    assert parse_version("garbage") is None


# ---- missing / outdated / flatpak --------------------------------------------------------

@posix
def test_missing_kicad(bare):
    cli = KiCadCli()
    assert cli.argv is None
    report = run_doctor(cli, FEDORA, which_of("dnf", "flatpak"))
    assert report["status"] == "missing" and not report["ok"]
    c = checks(report)
    assert c["kicad_cli"]["status"] == "error" and "flatpak install --user" in c["kicad_cli"]["fix"]
    assert c["kicad_version"]["status"] == "error"
    assert ids(report["install"]) == ["dnf", "flatpak", "download"]
    assert "Install options:" in format_report(report)


@posix
def test_tool_error_points_to_installation(bare):
    with pytest.raises(KiCadCliError) as err:
        KiCadCli().run("sch", "erc", "x.kicad_sch")
    message = str(err.value)
    assert "KiCad is not installed" in message and "kicad.org/download" in message and "/kicad-doctor" in message
    # Through the toolbox the same text reaches the caller as a tool error.
    with pytest.raises(ToolError, match="KiCad is not installed"):
        Toolbox().call("list_nets", {"path": os.path.join(os.path.dirname(__file__), "fixtures", "rc_filter", "rc_filter.kicad_sch")})


@posix
def test_outdated_kicad(bare):
    script(bare / "kicad-cli", 'if [ "$1" = version ]; then echo 7.0.11; else echo "unknown command" >&2; exit 1; fi')
    cli = KiCadCli()
    report = run_doctor(cli, FEDORA, which_of("dnf"))
    assert report["status"] == "outdated" and report["kicad"]["version"] == "7.0.11"
    assert checks(report)["kicad_version"]["status"] == "error"
    assert "Upgrade to KiCad 8" in checks(report)["kicad_version"]["fix"]
    assert report["install"]
    with pytest.raises(KiCadCliError, match="need KiCad 8 or newer"):
        cli.run("sch", "erc", "x.kicad_sch")


@posix
def test_flatpak_kicad(bare):
    marker = bare / "flatpak.log"
    script(bare / "flatpak", f'echo "$@" >> {marker}\n'
           'case "$1" in info) [ "$2" = org.kicad.KiCad ] && exit 0; exit 1;; '
           'run) for a; do last="$a"; done; echo 10.0.7;; esac')
    argv, source, _ = locate_kicad_cli()
    assert source == "flatpak" and argv == flatpak_argv(str(bare / "flatpak"))
    assert "--command=kicad-cli" in argv and argv[-1] == "org.kicad.KiCad"
    report = run_doctor(KiCadCli(), FEDORA, which_of("flatpak"))
    assert report["ok"] and report["kicad"]["source"] == "flatpak" and report["kicad"]["version"] == "10.0.7"
    assert report["install"] == []


@posix
def test_new_flatpak_wins_over_an_old_kicad_on_path(bare):
    script(bare / "kicad-cli", 'echo 7.0.11')
    script(bare / "flatpak", 'case "$1" in info) exit 0;; run) echo 10.0.7;; esac')
    argv, source, _ = locate_kicad_cli()
    assert source == "flatpak" and argv[0] == str(bare / "flatpak")
    # Without a newer one, the old kicad-cli is still used (and reported as outdated).
    (bare / "flatpak").unlink()
    assert locate_kicad_cli()[:2] == ([str(bare / "kicad-cli")], "path")


@posix
def test_outdated_setting_says_to_update_it(bare, tmp_path):
    old = script(tmp_path / "kicad7", "echo 7.0.11")
    report = run_doctor(KiCadCli(old), FEDORA, which_of())
    assert report["status"] == "outdated" and "clear or update the kicadCli setting" in checks(report)["kicad_version"]["fix"]


@posix
def test_install_is_picked_up_without_restart(bare):
    cli = KiCadCli()
    assert run_doctor(cli, FEDORA, which_of())["status"] == "missing"
    script(bare / "kicad-cli", "echo 10.0.7")  # "installed" while the sidecar keeps running
    report = run_doctor(cli, FEDORA, which_of())
    assert report["kicad"]["cli"] == str(bare / "kicad-cli") and report["kicad"]["version"] == "10.0.7"
    assert report["status"] in ("ok", "error")  # libraries depend on the test machine
    assert checks(report)["kicad_version"]["status"] == "ok"
    # A tool call made after the install also finds it.
    cli2 = KiCadCli()
    (bare / "kicad-cli").unlink()
    cli2.argv = None
    script(bare / "kicad-cli", "echo 10.0.7")
    assert cli2.version() == "10.0.7"


@posix
def test_stale_setting_is_reported(bare):
    script(bare / "kicad-cli", "echo 10.0.7")
    cli = KiCadCli("/nowhere/kicad-cli")
    report = run_doctor(cli, FEDORA, which_of())
    c = checks(report)["kicad_cli"]
    assert c["status"] == "warn" and c["source"] == "path" and "/nowhere/kicad-cli" in c["fix"]


def test_doctor_tool_in_catalog():
    from dsh_kicad_sidecar.tools import SPEC_BY_NAME

    assert "doctor" in SPEC_BY_NAME
    out = Toolbox().call("doctor", {})
    assert out["status"] in ("ok", "missing", "outdated", "error") and out["text"].startswith(out["summary"])
    assert {c["id"] for c in out["checks"]} >= {"kicad_cli", "kicad_version", "symbol_libraries", "footprint_libraries", "python", "png", "kipy"}


# ---- autorouting (optional): Java and Freerouting ----------------------------------------

UBUNTU = {"os": "linux", "distro": "ubuntu", "distro_like": ["debian"], "name": "Ubuntu 26.04", "version": "26.04"}


def routing(report):
    c = checks(report)
    return c["java"], c["freerouting"]


def test_freerouting_missing_offers_the_download(bare):
    report = run_doctor(KiCadCli(), FEDORA, which_of(), router=freerouting.Router(java="/usr/bin/java", java_version=(25, 0, 4)))
    java, fr = routing(report)
    assert java["status"] == "ok" and java["summary"] == "Java 25.0.4 (/usr/bin/java)." and not java["required"]
    assert fr["status"] == "warn" and not fr["required"] and "/kicad-install freerouting" in fr["fix"]
    (option,) = fr["install"]
    assert option["id"] == "freerouting" and option["runnable"] and not option["needs_root"]
    assert option["steps"] == [freerouting.download_command()] and "sha" in option["note"].lower() and "GPL-3.0" in option["note"]
    assert "install: /kicad-install freerouting" in format_report(report)
    assert report["install"] == install_options(FEDORA, which_of()) or report["status"] == "missing"  # KiCad's list is separate


def test_java_missing_or_old_lists_the_ways_to_install_it(bare):
    report = run_doctor(KiCadCli(), UBUNTU, which_of("apt-get"), router=freerouting.Router())
    java, _ = routing(report)
    assert java["status"] == "warn" and "Java was not found" in java["summary"]
    assert [o["id"] for o in java["install"]] == ["java", "java-download"]
    assert java["install"][0]["command"] == "sudo apt-get install -y openjdk-25-jre-headless" and java["install"][0]["needs_root"]
    assert "adoptium.net" in java["fix"] and "'java' setting" in java["fix"]
    old = run_doctor(KiCadCli(), FEDORA, which_of("dnf"), router=freerouting.Router(java="/usr/bin/java", java_version=(21, 0, 2)))
    java, _ = routing(old)
    assert java["status"] == "warn" and "older than Java 25" in java["summary"] and "java-25-openjdk-headless" in java["fix"]


def test_macos_java_can_be_installed_without_root(bare):
    mac = {"os": "macos", "distro": None, "distro_like": [], "name": None, "version": None}
    java, _ = routing(run_doctor(KiCadCli(), mac, which_of("brew"), router=freerouting.Router()))
    assert java["install"][0]["command"] == "brew install --cask temurin" and java["install"][0]["runnable"]


def test_working_freerouting(bare):
    router = freerouting.Router(argv=["java", "-jar", "f.jar"], jar="/data/freerouting-2.5.0.jar", java="/usr/bin/java",
                                java_version=(25,), java_required=25, version="2.5.0", source="downloaded")
    java, fr = routing(run_doctor(KiCadCli(), FEDORA, which_of(), router=router))
    assert java["status"] == fr["status"] == "ok" and fr["summary"].startswith("Freerouting 2.5.0: /data/freerouting-2.5.0.jar")
    assert "install" not in fr


def test_a_broken_java_setting_is_reported(bare):
    router = freerouting.Router(java="/usr/bin/java", java_version=(25,),
                                java_problems=["the KiCad bridge 'java' setting points to /opt/jdk/bin/java, which does not exist"])
    java, _ = routing(run_doctor(KiCadCli(), FEDORA, which_of(), router=router))
    assert java["status"] == "warn" and "/opt/jdk/bin/java" in java["summary"] and java["fix"] == "Fix or clear the KiCad bridge 'java' setting."
