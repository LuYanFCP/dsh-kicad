import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as toolKiCad from '../src/index.ts'
import { formatFirmware, formatMcu, type FirmwareRun, type McuCheckValue } from '../src/index.ts'
import { bootKiCad, disposeAll, hasKiCadCli, runTool, SIDECAR_DIR, text } from '../../../test/harness.ts'

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

const firmwareRun = (over: Partial<FirmwareRun> = {}): FirmwareRun => ({
  path: '/p/b.kicad_sch', mcu: 'U1', firmware: '/p/button_poll.hex', clock_hz: 1_000_000, vcc: 5, duration: 0.1, cycles: 100_000, instructions: 60_000, simulated_to: 0.1, aborted: null,
  assertions: [
    { name: 'LED D1 is on', when: 'within 1ms after press', passed: true, value: 'on', first_at: 0.030006 },
    { name: 'LED D1 is off', when: 'at 20ms', passed: false, value: 'on', reason: 'it was on at 20 ms, expected off' },
  ],
  hazards: [{ severity: 'warning', rule: 'floating_input', pin: 'PB3', net: 'BTN', t: 0.000015, message: 'the firmware reads PB3 while net BTN floats', fix: 'Enable the internal pull-up.' }],
  timeline: [{ t: 0, pins: { PB4: 'in' }, leds: { D1: 0 }, switches: [] }, { t: 0.030006, pins: { PB4: 'out-high' }, leds: { D1: 1 }, switches: ['SW1'] }, { t: 0.04, pins: { PB0: 'pwm 25% 61Hz' }, leds: { D2: 0.254 }, switches: [] }],
  eeprom: { changed: { 0: 3 }, writes: [{ t: 0.0035, address: 0, value: 3 }] }, usi_transfers: [{ t: 0.000132, tx: 0xA5, rx: 0x12 }],
  scenario: { path: '/p/b.fw.json', loaded: ['assertions', 'stimuli'], saved: false },
  passed: false, switches: ['SW1'], leds: ['D1'], pins: { PB3: 'BTN', PB4: 'LEDDRV' }, notes: ['the supply voltage is not in the net name or the vcc argument: assumed 5 V'],
  ...over,
})

describe('formatFirmware', () => {
  it('gives the verdict, every assertion, the hazards and the board over time', () => {
    const out = formatFirmware(firmwareRun())
    expect(out).toContain('Firmware button_poll.hex on U1 (1MHz, 5 V), 100 ms of 100 ms simulated, 60000 instructions: FAILED.')
    expect(out).toContain('✓ LED D1 is on (within 1ms after press)')
    expect(out).toContain('✗ LED D1 is off (at 20ms): it was on at 20 ms, expected off')
    expect(out).toContain('! warning PB3 at 0.015 ms: the firmware reads PB3 while net BTN floats → Enable the internal pull-up.')
    expect(out).toContain('30.01 ms: PB4 out-high; D1 on; closed: SW1')
    expect(out).toContain('40 ms: PB0 pwm 25% 61Hz; D2 25%')
    expect(out).toContain('EEPROM at the end: [0] = 3 (1 write(s)).')
    expect(out).toContain('USI transfers: 0.132 ms sent 0xA5 received 0x12.')
    expect(out).toContain('Scenario from /p/b.fw.json (assertions, stimuli).')
    expect(out).toContain('assumed 5 V')
  })

  it('says when the run stopped and never passes what it could not verify', () => {
    const out = formatFirmware(firmwareRun({
      passed: null, simulated_to: 0.000016, aborted: { what: 'ADC', reason: 'the ADC is not simulated (word address 0x001D, cycle 16)', t: 0.000016 },
      assertions: [{ name: 'LED D1 is off', when: 'at 5ms', passed: null, reason: 'cannot verify: the simulation stopped at 0.016 ms' }], hazards: [], timeline: [],
    }))
    expect(out).toContain('CANNOT VERIFY')
    expect(out).toContain('Stopped at 0.016 ms: the ADC is not simulated')
    expect(out).toContain('? LED D1 is off (at 5ms): cannot verify')
    expect(out).not.toContain('PASSED')
  })

  it('reads an ESP32 run on QEMU: no instruction count, the boot mode and the end of the UART output', () => {
    const out = formatFirmware(firmwareRun({
      device: 'esp32', firmware: '/p/flash.bin', clock_hz: undefined, cycles: undefined, instructions: undefined, vcc: 3.3, duration: 2, simulated_to: 2,
      eeprom: undefined, usi_transfers: undefined, passed: true, assertions: [], hazards: [], timeline: [], notes: [], scenario: undefined,
      qemu: { path: '/q/qemu-system-xtensa', version: '9.2.2', source: 'PATH', clock: 'rtc' },
      strap: { value: '0x03', levels: { GPIO0: 0 }, download_mode: true },
      uart: 'rst:0x1 (POWERON_RESET),boot:0x3 (DOWNLOAD_BOOT(UART0/UART1/SDIO_REI_REO_V2))\n\x1b[0;32mI (31) boot: ok\x1b[0m\nwaiting for download\n', uart_bytes: 120,
    }))
    expect(out).toContain('Firmware flash.bin on U1 (ESP32 on QEMU 9.2.2, 3.3 V), 2000 ms of 2000 ms simulated: PASSED.')
    expect(out).toContain('The strapping pins (GPIO_STRAP 0x03) started the serial bootloader: the firmware did not run.')
    expect(out).toContain('UART0 output (120 bytes; the last lines):\n  rst:0x1 (POWERON_RESET)')
    expect(out).toContain('\n  I (31) boot: ok\n  waiting for download')
    expect(out).not.toContain('instructions')
  })
})

describe('kicad_simulate_firmware', () => {
  it.runIf(hasKiCadCli())('verifies a button-and-LED requirement against the board through the tool pipeline', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const dir = mkdtempSync(join(tmpdir(), 'dsh-kicad-fw-'))
    const path = join(dir, 'b.kicad_sch')
    await ctx.kicad.run('create_schematic', { path })
    await ctx.kicad.run('edit_schematic', {
      path,
      operations: [
        { op: 'add_symbol', lib_id: 'MCU_Microchip_ATtiny:ATtiny85-20S', x: 127, y: 88.9, reference: 'U1', value: 'ATtiny85-20S' },
        { op: 'add_symbol', lib_id: 'Switch:SW_Push', x: 50.8, y: 76.2, reference: 'SW1', value: 'BTN' },
        { op: 'add_symbol', lib_id: 'Device:R', x: 76.2, y: 38.1, reference: 'R1', value: '330' },
        { op: 'add_symbol', lib_id: 'Device:LED', x: 76.2, y: 63.5, reference: 'D1', value: 'LED' },
        { op: 'connect_pin_to_net', pin: 'U1:8', net: '+5V', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'U1:4', net: 'GND', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'SW1:1', net: 'BTN', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'SW1:2', net: 'GND', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'U1:2', net: 'BTN', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'U1:3', net: 'LEDDRV', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'R1:1', net: 'LEDDRV', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'R1:2', net: 'LEDMID', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'D1:2', net: 'LEDMID', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'D1:1', net: 'GND', kind: 'power' },
      ],
    })
    const firmware = join(SIDECAR_DIR, 'tests/fixtures/avr/button_poll.hex')
    const result = await runTool(ctx, 'kicad_simulate_firmware', {
      path, firmware,
      stimuli: [{ at: '30ms', press: 'SW1', name: 'press' }],
      assertions: [
        { led: 'D1', is: 'off', from: '0ms', to: '29ms' },
        { led: 'D1', is: 'on', after: 'press', within: '1ms', name: 'LED lights within 1 ms of the press' },
        { led: 'D1', is: 'off', at: '60ms', name: 'LED is off while pressed (wrong)' },
      ],
    })
    expect(result.isError).toBeFalsy()
    const out = text(result)
    expect(out).toContain('FAILED')
    expect(out).toContain('✓ LED D1 is off (from 0ms to 29ms)')
    expect(out).toContain('✓ LED lights within 1 ms of the press (within 1ms after press)')
    expect(out).toContain('✗ LED is off while pressed (wrong) (at 60ms): it was on at 60 ms, expected off')
    const bad = await runTool(ctx, 'kicad_simulate_firmware', { path, firmware, stimuli: [{ at: '1ms', press: 'SW9' }] })
    expect(bad.isError).toBe(true)
    expect(text(bad)).toMatch(/no switch SW9 \(switches: SW1\)/)
  })

  it.runIf(hasKiCadCli())('verifies a battery monitor: a sagging battery on a divider read by the ADC', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const dir = mkdtempSync(join(tmpdir(), 'dsh-kicad-adc-'))
    const path = join(dir, 'b.kicad_sch')
    await ctx.kicad.run('create_schematic', { path })
    await ctx.kicad.run('edit_schematic', {
      path,
      operations: [
        { op: 'add_symbol', lib_id: 'MCU_Microchip_ATtiny:ATtiny85-20S', x: 127, y: 88.9, reference: 'U1', value: 'ATtiny85-20S' },
        { op: 'add_symbol', lib_id: 'Device:R', x: 38.1, y: 38.1, reference: 'R4', value: '100k' },
        { op: 'add_symbol', lib_id: 'Device:R', x: 38.1, y: 63.5, reference: 'R5', value: '47k' },
        { op: 'connect_pin_to_net', pin: 'U1:8', net: '+5V', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'U1:4', net: 'GND', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'R4:1', net: 'VBAT', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'R4:2', net: 'SENSE', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'R5:1', net: 'SENSE', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'R5:2', net: 'GND', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'U1:2', net: 'SENSE', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'U1:5', net: 'LOWBAT', kind: 'label' },
      ],
    })
    const result = await runTool(ctx, 'kicad_simulate_firmware', {
      path, firmware: join(SIDECAR_DIR, 'tests/fixtures/avr/adc_threshold.hex'),
      stimuli: [{ at: '10ms', drive: 'VBAT', level: 7.4, name: 'sag' }, { at: '40ms', drive: 'VBAT', level: 9.0, name: 'charged' }],
      assertions: [
        { net: 'SENSE', min: 2.3, max: 2.4, at: '20ms', name: 'the divider gives 2.37 V at 7.4 V' },
        { pin: 'PB0', level: 'low', at: '30ms', name: 'weak: PB0 low' },
        { pin: 'PB0', level: 'high', after: 'charged', within: '5ms', name: 'charged: PB0 high within 5 ms' },
      ],
    })
    expect(result.isError).toBeFalsy()
    const out = text(result)
    expect(out).toContain('PASSED')
    expect(out).toContain('✓ charged: PB0 high within 5 ms')
  })

  it.runIf(hasKiCadCli())('saves the firmware scenario next to the schematic and runs it again from there', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const dir = mkdtempSync(join(tmpdir(), 'dsh-kicad-fwspec-'))
    const path = join(dir, 'b.kicad_sch')
    await ctx.kicad.run('create_schematic', { path })
    await ctx.kicad.run('edit_schematic', {
      path,
      operations: [
        { op: 'add_symbol', lib_id: 'MCU_Microchip_ATtiny:ATtiny85-20S', x: 127, y: 88.9, reference: 'U1', value: 'ATtiny85-20S' },
        { op: 'add_symbol', lib_id: 'Switch:SW_Push', x: 50.8, y: 76.2, reference: 'SW1', value: 'BTN' },
        { op: 'add_symbol', lib_id: 'Device:R', x: 76.2, y: 38.1, reference: 'R1', value: '330' },
        { op: 'add_symbol', lib_id: 'Device:LED', x: 76.2, y: 63.5, reference: 'D1', value: 'LED' },
        { op: 'connect_pin_to_net', pin: 'U1:8', net: '+5V', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'U1:4', net: 'GND', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'SW1:1', net: 'BTN', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'SW1:2', net: 'GND', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'U1:2', net: 'BTN', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'U1:3', net: 'LEDDRV', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'R1:1', net: 'LEDDRV', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'R1:2', net: 'LEDMID', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'D1:2', net: 'LEDMID', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'D1:1', net: 'GND', kind: 'power' },
      ],
    })
    const firmware = join(SIDECAR_DIR, 'tests/fixtures/avr/button_poll.hex')
    const first = await runTool(ctx, 'kicad_simulate_firmware', {
      path, firmware, duration: '60ms', save_scenario: true,
      stimuli: [{ at: '30ms', press: 'SW1', name: 'press' }],
      assertions: [{ led: 'D1', is: 'off', at: '20ms' }, { led: 'D1', is: 'on', after: 'press', within: '1ms' }],
    })
    expect(first.isError).toBeFalsy()
    expect(text(first)).toContain('PASSED')
    expect(text(first)).toContain('Scenario saved to')
    const again = await runTool(ctx, 'kicad_simulate_firmware', { path })
    expect(again.isError).toBeFalsy()
    expect(text(again)).toContain('PASSED')
    expect(text(again)).toMatch(/Scenario from .*b\.fw\.json \(/)
  })
})
