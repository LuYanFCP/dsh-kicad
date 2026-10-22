import { describe, expect, it } from 'vitest'
import { launchSpec } from '../src/launcher.ts'

describe('launchSpec', () => {
  it('runs the stdlib sidecar from source with python', () => {
    const spec = launchSpec({ launcher: 'python', executable: '/usr/bin/python3', sidecarDir: '/x/sidecar', kicadCli: '/opt/kicad-cli', platform: 'linux' })
    expect(spec.argv).toEqual(['/usr/bin/python3', '-m', 'dsh_kicad_sidecar', '--kicad-cli', '/opt/kicad-cli'])
    expect(spec.env.PYTHONPATH?.split(':')[0]).toBe('/x/sidecar/src')
    expect(spec.env.PYTHONDONTWRITEBYTECODE).toBe('1')
  })

  it('passes the Java and Freerouting settings to the sidecar', () => {
    const spec = launchSpec({ launcher: 'python', executable: 'python3', sidecarDir: '/x', java: '/opt/jdk/bin/java', freerouting: '/opt/freerouting-2.5.0.jar', platform: 'linux' })
    expect(spec.argv).toEqual(['python3', '-m', 'dsh_kicad_sidecar', '--java', '/opt/jdk/bin/java', '--freerouting', '/opt/freerouting-2.5.0.jar'])
  })

  it('passes the ngspice setting to the sidecar', () => {
    const spec = launchSpec({ launcher: 'python', executable: 'python3', sidecarDir: '/x', ngspice: '/opt/ngspice/bin/ngspice', platform: 'linux' })
    expect(spec.argv).toEqual(['python3', '-m', 'dsh_kicad_sidecar', '--ngspice', '/opt/ngspice/bin/ngspice'])
  })

  it('runs through uv with extras', () => {
    const spec = launchSpec({ launcher: 'uv', executable: 'uv', sidecarDir: '/x/sidecar', extras: ['png', 'ipc'] })
    expect(spec.argv).toEqual(['uv', 'run', '--quiet', '--project', '/x/sidecar', '--extra', 'png', '--extra', 'ipc', 'python', '-m', 'dsh_kicad_sidecar'])
    expect(spec.env.PYTHONPATH).toBeUndefined()
  })
})
