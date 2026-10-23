"""The AVR instruction set (the AVRe subset an ATtiny85 has: no MUL, no JMP/CALL), decoded into closures over one ``Avr``.

Each closure executes one instruction and returns its cycle count. Flag formulas follow the AVR Instruction Set Manual.
"""

from __future__ import annotations

from typing import Any, Callable

from .avr import AvrError, IllegalInstruction

C, Z, N, V, S, H, T, I = (1 << i for i in range(8))


def _s8(v: int) -> int:
    return v - 256 if v & 0x80 else v


def _s12(v: int) -> int:
    return v - 4096 if v & 0x800 else v


def _s7(v: int) -> int:
    return v - 128 if v & 0x40 else v


def decode(cpu: Any, op: int, pc: int) -> Callable[[], int]:
    r = cpu.r
    d5 = (op >> 4) & 0x1F
    r5 = (op & 0x0F) | ((op >> 5) & 0x10)
    d4 = 16 + ((op >> 4) & 0x0F)
    k8 = ((op >> 4) & 0xF0) | (op & 0x0F)

    def flags_add(a: int, b: int, res: int, carry_in: int = 0) -> None:
        r8 = res & 0xFF
        a3, b3, r3 = a >> 3 & 1, b >> 3 & 1, r8 >> 3 & 1
        a7, b7, r7 = a >> 7, b >> 7, r8 >> 7
        h = (a3 & b3) | (b3 & (r3 ^ 1)) | ((r3 ^ 1) & a3)
        v = (a7 & b7 & (r7 ^ 1)) | ((a7 ^ 1) & (b7 ^ 1) & r7)
        c = (a7 & b7) | (b7 & (r7 ^ 1)) | ((r7 ^ 1) & a7)
        n = r7
        cpu.sreg = (cpu.sreg & 0xC0) | c | (int(r8 == 0) << 1) | (n << 2) | (v << 3) | ((n ^ v) << 4) | (h << 5)

    def flags_sub(a: int, b: int, res: int, keep_z: bool = False) -> None:
        r8 = res & 0xFF
        a3, b3, r3 = a >> 3 & 1, b >> 3 & 1, r8 >> 3 & 1
        a7, b7, r7 = a >> 7, b >> 7, r8 >> 7
        h = ((a3 ^ 1) & b3) | (b3 & r3) | (r3 & (a3 ^ 1))
        v = (a7 & (b7 ^ 1) & (r7 ^ 1)) | ((a7 ^ 1) & b7 & r7)
        c = ((a7 ^ 1) & b7) | (b7 & r7) | (r7 & (a7 ^ 1))
        n = r7
        z = int(r8 == 0) & ((cpu.sreg >> 1) & 1 if keep_z else 1)
        cpu.sreg = (cpu.sreg & 0xC0) | c | (z << 1) | (n << 2) | (v << 3) | ((n ^ v) << 4) | (h << 5)

    def flags_logic(res: int) -> None:
        n = res >> 7 & 1
        cpu.sreg = (cpu.sreg & 0xE1) | (int(res == 0) << 1) | (n << 2) | (n << 4)  # V = 0, S = N

    top = op >> 12

    def skip() -> int:
        """Skip the next instruction (one or two words): 2 or 3 cycles."""
        nxt = cpu.words[cpu.pc] if cpu.pc < len(cpu.words) else 0
        two = (nxt & 0xFE0F) in (0x9000, 0x9200)  # LDS / STS (JMP and CALL do not exist on this chip)
        cpu.pc += 2 if two else 1
        return 3 if two else 2

    # ---- two-register ALU: 0000 11rd ADD ... ----
    if top in (0, 1, 2) and (op & 0xFF00) != 0x0100 and op != 0:
        group = op >> 10
        if group == 0b000001:  # CPC
            def f():
                a, b = r[d5], r[r5]
                flags_sub(a, b, a - b - (cpu.sreg & 1), keep_z=True)
                return 1
            return f
        if group == 0b000010:  # SBC
            def f():
                a, b = r[d5], r[r5]
                res = a - b - (cpu.sreg & 1)
                flags_sub(a, b, res, keep_z=True)
                r[d5] = res & 0xFF
                return 1
            return f
        if group == 0b000011:  # ADD (and LSL = ADD Rd,Rd)
            def f():
                a, b = r[d5], r[r5]
                res = a + b
                flags_add(a, b, res)
                r[d5] = res & 0xFF
                return 1
            return f
        if group == 0b000100:  # CPSE
            def f():
                if r[d5] != r[r5]:
                    return 1
                return skip()
            return f
        if group == 0b000101:  # CP
            def f():
                a, b = r[d5], r[r5]
                flags_sub(a, b, a - b)
                return 1
            return f
        if group == 0b000110:  # SUB
            def f():
                a, b = r[d5], r[r5]
                flags_sub(a, b, a - b)
                r[d5] = (a - b) & 0xFF
                return 1
            return f
        if group == 0b000111:  # ADC (and ROL = ADC Rd,Rd)
            def f():
                a, b = r[d5], r[r5]
                res = a + b + (cpu.sreg & 1)
                flags_add(a, b, res)
                r[d5] = res & 0xFF
                return 1
            return f
        if group == 0b001000:  # AND
            def f():
                res = r[d5] & r[r5]
                flags_logic(res)
                r[d5] = res
                return 1
            return f
        if group == 0b001001:  # EOR
            def f():
                res = r[d5] ^ r[r5]
                flags_logic(res)
                r[d5] = res
                return 1
            return f
        if group == 0b001010:  # OR
            def f():
                res = r[d5] | r[r5]
                flags_logic(res)
                r[d5] = res
                return 1
            return f
        if group == 0b001011:  # MOV
            def f():
                r[d5] = r[r5]
                return 1
            return f

    if op == 0:
        return lambda: 1
    if (op & 0xFF00) == 0x0100:  # MOVW
        d, s = ((op >> 4) & 0x0F) * 2, (op & 0x0F) * 2

        def f():
            r[d], r[d + 1] = r[s], r[s + 1]
            return 1
        return f

    # ---- register / immediate ----
    if top == 0x3:  # CPI
        def f():
            if cpu.watch:
                cpu.watch_use(d4, 0xFF)
            a = r[d4]
            flags_sub(a, k8, a - k8)
            return 1
        return f
    if top == 0x4:  # SBCI
        def f():
            a = r[d4]
            res = a - k8 - (cpu.sreg & 1)
            flags_sub(a, k8, res, keep_z=True)
            r[d4] = res & 0xFF
            return 1
        return f
    if top == 0x5:  # SUBI
        def f():
            a = r[d4]
            flags_sub(a, k8, a - k8)
            r[d4] = (a - k8) & 0xFF
            return 1
        return f
    if top == 0x6:  # ORI
        def f():
            res = r[d4] | k8
            flags_logic(res)
            r[d4] = res
            return 1
        return f
    if top == 0x7:  # ANDI
        def f():
            if cpu.watch:
                cpu.watch_use(d4, k8)
            res = r[d4] & k8
            flags_logic(res)
            r[d4] = res
            return 1
        return f
    if top == 0xE:  # LDI
        def f():
            r[d4] = k8
            return 1
        return f

    # ---- LDD/STD with Y or Z (and LD/ST Y, Z without displacement) ----
    if (op & 0xD000) == 0x8000:
        q = ((op >> 8) & 0x20) | ((op >> 7) & 0x18) | (op & 7)
        base = 28 if op & 0x08 else 30
        if op & 0x0200:  # STD
            def f():
                cpu.write_data(((r[base + 1] << 8) | r[base]) + q, r[d5])
                return 2
        else:  # LDD
            def f():
                r[d5] = cpu.read_data(((r[base + 1] << 8) | r[base]) + q)
                return 2
        return f

    # ---- 1001 0xxx : loads, stores, one-register ops ----
    if (op & 0xFC00) == 0x9000:
        store = bool(op & 0x0200)
        mode = op & 0x0F
        if mode == 0x0:  # LDS / STS (two words)
            addr_word = cpu.words2[pc + 1]
            if store:
                def f():
                    cpu.pc += 1
                    cpu.write_data(addr_word, r[d5])
                    return 2
            else:
                def f():
                    cpu.pc += 1
                    r[d5] = cpu.read_data(addr_word)
                    return 2
            return f
        if mode == 0xF:  # POP / PUSH
            if store:
                def f():
                    cpu.write_data(cpu.sp, r[d5])
                    cpu.sp -= 1
                    return 2
            else:
                def f():
                    cpu.sp += 1
                    r[d5] = cpu.read_data(cpu.sp)
                    return 2
            return f
        pointer = {0x1: 30, 0x2: 30, 0x9: 28, 0xA: 28, 0xC: 26, 0xD: 26, 0xE: 26}.get(mode)
        if mode in (0x4, 0x5) and not store:  # LPM Rd,Z / Z+
            inc = mode == 0x5

            def f():
                z = (r[31] << 8) | r[30]
                r[d5] = cpu.flash[z] if z < len(cpu.flash) else 0xFF
                if inc:
                    z += 1
                    r[30], r[31] = z & 0xFF, z >> 8 & 0xFF
                return 3
            return f
        if pointer is None:
            raise IllegalInstruction(f"illegal or unsupported instruction 0x{op:04X} at word address 0x{pc:04X}")
        post_inc = mode in (0x1, 0x9, 0xD)
        pre_dec = mode in (0x2, 0xA, 0xE)

        def f():
            p = (r[pointer + 1] << 8) | r[pointer]
            if pre_dec:
                p = (p - 1) & 0xFFFF
                r[pointer], r[pointer + 1] = p & 0xFF, p >> 8
            if store:
                cpu.write_data(p, r[d5])
            else:
                r[d5] = cpu.read_data(p)
            if post_inc:
                p = (p + 1) & 0xFFFF
                r[pointer], r[pointer + 1] = p & 0xFF, p >> 8
            return 2
        return f

    if (op & 0xFE00) == 0x9400:
        low = op & 0x0F
        if low == 0x0:  # COM
            def f():
                res = 0xFF - r[d5]
                cpu.sreg = (cpu.sreg & 0xE0) | 1 | (int(res == 0) << 1) | ((res >> 7) << 2) | ((res >> 7) << 4)
                r[d5] = res
                return 1
            return f
        if low == 0x1:  # NEG
            def f():
                a = r[d5]
                res = (0 - a) & 0xFF
                h = (res >> 3 & 1) | (a >> 3 & 1)
                v = int(res == 0x80)
                n = res >> 7
                cpu.sreg = (cpu.sreg & 0xC0) | int(res != 0) | (int(res == 0) << 1) | (n << 2) | (v << 3) | ((n ^ v) << 4) | (h << 5)
                r[d5] = res
                return 1
            return f
        if low == 0x2:  # SWAP
            def f():
                a = r[d5]
                r[d5] = ((a << 4) | (a >> 4)) & 0xFF
                return 1
            return f
        if low == 0x3:  # INC
            def f():
                a = r[d5]
                res = (a + 1) & 0xFF
                v = int(a == 0x7F)
                n = res >> 7
                cpu.sreg = (cpu.sreg & 0xE1) | (int(res == 0) << 1) | (n << 2) | (v << 3) | ((n ^ v) << 4)
                r[d5] = res
                return 1
            return f
        if low == 0x5:  # ASR
            def f():
                a = r[d5]
                res = (a >> 1) | (a & 0x80)
                c, n = a & 1, res >> 7
                v = n ^ c
                cpu.sreg = (cpu.sreg & 0xE0) | c | (int(res == 0) << 1) | (n << 2) | (v << 3) | ((n ^ v) << 4)
                r[d5] = res
                return 1
            return f
        if low == 0x6:  # LSR
            def f():
                a = r[d5]
                res = a >> 1
                c = a & 1
                cpu.sreg = (cpu.sreg & 0xE0) | c | (int(res == 0) << 1) | (c << 3) | (c << 4)  # N = 0, V = N ^ C = C, S = V
                r[d5] = res
                return 1
            return f
        if low == 0x7:  # ROR
            def f():
                a = r[d5]
                res = ((cpu.sreg & 1) << 7) | (a >> 1)
                c, n = a & 1, res >> 7
                v = n ^ c
                cpu.sreg = (cpu.sreg & 0xE0) | c | (int(res == 0) << 1) | (n << 2) | (v << 3) | ((n ^ v) << 4)
                r[d5] = res
                return 1
            return f
        if low == 0xA:  # DEC
            def f():
                a = r[d5]
                res = (a - 1) & 0xFF
                v = int(a == 0x80)
                n = res >> 7
                cpu.sreg = (cpu.sreg & 0xE1) | (int(res == 0) << 1) | (n << 2) | (v << 3) | ((n ^ v) << 4)
                r[d5] = res
                return 1
            return f
        # no-operand forms
        if (op & 0xFF0F) == 0x9408:  # BSET / BCLR (SEI, CLI, SEC, ...)
            bit = 1 << ((op >> 4) & 7)
            if op & 0x0080:
                def f():
                    cpu.sreg &= ~bit
                    return 1
            else:
                def f():
                    cpu.sreg |= bit
                    if bit == I:
                        cpu.skip_interrupt = True  # the instruction after SEI always runs
                    return 1
            return f
        if op == 0x9409:  # IJMP
            def f():
                cpu.pc = ((r[31] << 8) | r[30]) & 0xFFFF
                return 2
            return f
        if op == 0x9509:  # ICALL
            def f():
                cpu.push_pc(cpu.pc)
                cpu.pc = ((r[31] << 8) | r[30]) & 0xFFFF
                return 3
            return f
        if op == 0x9508:  # RET
            def f():
                cpu.pc = cpu.pop_pc()
                return 4
            return f
        if op == 0x9518:  # RETI
            def f():
                cpu.pc = cpu.pop_pc()
                cpu.sreg |= I
                cpu.skip_interrupt = True
                return 4
            return f
        if op == 0x9588:  # SLEEP
            def f():
                if cpu.mcucr & 0x20:  # SE
                    if (cpu.mcucr >> 3 & 3) == 1 and cpu.adcsra & 0x80:
                        raise cpu.unsupported("ADC", "the firmware sleeps in ADC noise reduction mode, which starts a conversion by itself; it is not simulated")
                    cpu.sleeping = True
                    cpu.t0_sync()
                return 1
            return f
        if op == 0x95A8:  # WDR
            def f():
                cpu.wdt_reset()
                return 1
            return f
        if op == 0x9598:  # BREAK
            return lambda: 1
        if op == 0x95C8:  # LPM (R0 ← Z)
            def f():
                z = (r[31] << 8) | r[30]
                r[0] = cpu.flash[z] if z < len(cpu.flash) else 0xFF
                return 3
            return f
        if op == 0x95E8:  # SPM
            def f():
                raise cpu.unsupported("SPM")
            return f
        raise IllegalInstruction(f"illegal or unsupported instruction 0x{op:04X} at word address 0x{pc:04X}")

    if (op & 0xFE00) == 0x9600:  # ADIW / SBIW
        d = 24 + ((op >> 3) & 6)
        k = ((op >> 2) & 0x30) | (op & 0x0F)
        sub = bool(op & 0x0100)

        def f():
            a = (r[d + 1] << 8) | r[d]
            res = (a - k if sub else a + k) & 0xFFFF
            ah7, r15 = a >> 15, res >> 15
            if sub:
                v, c = ah7 & (r15 ^ 1), r15 & (ah7 ^ 1)
            else:
                v, c = (ah7 ^ 1) & r15, (r15 ^ 1) & ah7
            cpu.sreg = (cpu.sreg & 0xE0) | c | (int(res == 0) << 1) | (r15 << 2) | (v << 3) | ((r15 ^ v) << 4)
            r[d], r[d + 1] = res & 0xFF, res >> 8
            return 2
        return f

    if (op & 0xFC00) == 0x9800:  # CBI / SBIC / SBI / SBIS
        a, b = (op >> 3) & 0x1F, op & 7
        kind = (op >> 8) & 3
        mask = 1 << b
        if kind == 0:  # CBI
            def f():
                if a != 0x16:  # clearing a PINB bit writes a 0: nothing happens
                    cpu.io_write(a, cpu.io_read(a) & ~mask)
                return 2
        elif kind == 2:  # SBI
            def f():
                if a == 0x16:  # SBI on PINB toggles PORTB
                    cpu.io_write(a, mask)
                else:
                    cpu.io_write(a, cpu.io_read(a) | mask)
                return 2
        elif kind == 1:  # SBIC
            def f():
                if a == 0x16:
                    cpu.note_pin_use(mask)
                return skip() if not cpu.io_read(a) & mask else 1
        else:  # SBIS
            def f():
                if a == 0x16:
                    cpu.note_pin_use(mask)
                return skip() if cpu.io_read(a) & mask else 1
        return f

    if top == 0xB:  # IN / OUT
        a = ((op >> 5) & 0x30) | (op & 0x0F)
        if op & 0x0800:
            def f():
                cpu.io_write(a, r[d5])
                return 1
        elif a == 0x16:  # IN Rd,PINB: remember which pins float; a later test of such a bit is the hazard
            def f():
                r[d5] = cpu.io_read(a)
                fm = cpu.floating_mask()
                if fm:
                    cpu.watch[d5] = (fm, cpu.cycle + 40)
                return 1
        else:
            def f():
                r[d5] = cpu.io_read(a)
                return 1
        return f

    if top == 0xC:  # RJMP
        k = _s12(op & 0x0FFF)

        def f():
            cpu.pc = (cpu.pc + k) & 0xFFF
            return 2
        return f
    if top == 0xD:  # RCALL
        k = _s12(op & 0x0FFF)

        def f():
            cpu.push_pc(cpu.pc)
            cpu.pc = (cpu.pc + k) & 0xFFF
            return 3
        return f

    if (op & 0xF800) == 0xF000:  # BRBS / BRBC
        k = _s7((op >> 3) & 0x7F)
        bit = 1 << (op & 7)
        if op & 0x0400:  # BRBC
            def f():
                if not cpu.sreg & bit:
                    cpu.pc = (cpu.pc + k) & 0xFFFF
                    return 2
                return 1
        else:
            def f():
                if cpu.sreg & bit:
                    cpu.pc = (cpu.pc + k) & 0xFFFF
                    return 2
                return 1
        return f

    if (op & 0xFC08) == 0xF800:  # BLD / BST
        b = op & 7
        if op & 0x0200:  # BST
            def f():
                if cpu.watch:
                    cpu.watch_use(d5, 1 << b)
                cpu.sreg = (cpu.sreg & ~T) | (((r[d5] >> b) & 1) << 6)
                return 1
        else:  # BLD
            def f():
                r[d5] = (r[d5] & ~(1 << b)) | (((cpu.sreg >> 6) & 1) << b)
                return 1
        return f
    if (op & 0xFC08) == 0xFC00:  # SBRC / SBRS
        b = op & 7
        want = 1 if op & 0x0200 else 0

        def f():
            if cpu.watch:
                cpu.watch_use(d5, 1 << b)
            return skip() if ((r[d5] >> b) & 1) == want else 1
        return f

    raise IllegalInstruction(f"illegal or unsupported instruction 0x{op:04X} at word address 0x{pc:04X}")
