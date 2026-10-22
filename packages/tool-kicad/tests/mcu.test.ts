import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as toolKiCad from '../src/index.ts'
import { formatMcu, type McuCheckValue } from '../src/index.ts'
import { bootKiCad, disposeAll, hasKiCadCli, runTool, text } from '../../../test/harness.ts'

afterEach(disposeAll)

const value = (over: Partial<McuCheckValue> = {}): McuCheckValue => ({
  path: '/p/esp.kicad_sch', providers: ['esp32'], passed: false,
  mcus: [{
    reference: 'U1', lib_id: 'RF_Module:ESP32-WROOM-32', value: 'ESP32-WROOM-32', provider: 'esp32', status: 'checked', errors: 1, warnings: 0,
    findings: [{ severity: 'error', rule: 'strapping_level', pin: 'U1:14', pin_name: 'IO12', gpio: 12, net: '+3V3', message: 'GPIO12 is tied high', fix: 'Do not tie it high.' }],
  }],
  requirements: [{ target: 'VBAT', needs: ['adc1'], pin: 'U1:6', gpio: 34, passed: true }, { target: 'LED', needs: ['output'], pin: 'U1:6', gpio: 34, passed: false, reason: 'GPIO34 — output: it is input-only' }],
  ...over,
})

describe('formatMcu', () => {
  it('gives the verdict, each finding with its fix and every requirement', () => {
    const out = formatMcu(value())
    expect(out).toContain('MCU check on /p/esp.kicad_sch: FAILED.')
    expect(out).toContain('U1 ESP32-WROOM-32 (provider esp32): 1 error(s), 0 warning(s)')
    expect(out).toContain('✗ error U1:14 IO12: GPIO12 is tied high → Do not tie it high.')
    expect(out).toContain('✓ VBAT needs adc1 (U1:6)')
    expect(out).toContain('✗ LED needs output (U1:6): GPIO34 — output: it is input-only')
  })

  it('says cannot verify rather than passed when no provider covers the MCU', () => {
    const out = formatMcu({
      path: '/p/x.kicad_sch', providers: ['esp32'], passed: null,
      mcus: [{ reference: 'U2', lib_id: 'MCU_ST_STM32F1:STM32F103C8Tx', value: 'STM32F103C8Tx', provider: null, status: 'cannot_verify', reason: 'no provider covers this MCU' }],
      requirements: [{ target: 'X', needs: ['adc'], passed: null, reason: 'cannot verify: no MCU in the schematic is covered by a provider' }],
    })
    expect(out).toContain('CANNOT VERIFY (no MCU is covered by a provider)')
    expect(out).toContain('U2 STM32F103C8Tx (MCU_ST_STM32F1:STM32F103C8Tx): CANNOT VERIFY — no provider covers this MCU')
    expect(out).toContain('? X needs adc')
    expect(out).not.toContain('PASSED')
  })

  it('reports a schematic without an MCU', () => {
    expect(formatMcu({ path: '/p/x.kicad_sch', providers: [], passed: null, mcus: [], requirements: [] })).toBe('MCU check on /p/x.kicad_sch: no microcontroller found in the schematic.')
  })
})

describe('kicad_check_mcu', () => {
  it.runIf(hasKiCadCli())('finds GPIO12 held high through the tool pipeline and judges a requirement', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const path = join(mkdtempSync(join(tmpdir(), 'dsh-kicad-mcu-')), 'esp.kicad_sch')
    await ctx.kicad.run('create_schematic', { path })
    await ctx.kicad.run('edit_schematic', {
      path,
      operations: [
        { op: 'add_symbol', lib_id: 'RF_Module:ESP32-WROOM-32', x: 127, y: 88.9, reference: 'U1', value: 'ESP32-WROOM-32' },
        { op: 'connect_pin_to_net', pin: 'U1:2', net: '+3V3', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'U1:1', net: 'GND', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'U1:14', net: '+3V3', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'U1:6', net: 'VBAT_SENSE', kind: 'label' },
      ],
    })
    const result = await runTool(ctx, 'kicad_check_mcu', { path, requirements: [{ net: 'VBAT_SENSE', needs: 'adc1' }, { net: 'VBAT_SENSE', needs: 'output' }] })
    expect(result.isError).toBeFalsy()
    const out = text(result)
    expect(out).toContain('FAILED')
    expect(out).toMatch(/✗ error U1:14 IO12: GPIO12 is a strapping pin and is tied high by net \+3V3/)
    expect(out).toContain('✓ VBAT_SENSE needs adc1 (U1:6)')
    expect(out).toMatch(/✗ VBAT_SENSE needs output \(U1:6\): GPIO34 — output: it is input-only/)
    expect(out).toContain('✗ error U1:3 EN: EN is not connected')
  })
})
