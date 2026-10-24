/* Entry of the bare-metal test programs: a stack at the top of the application DRAM, then main() (call0 ABI). */
    .section .entry.literal, "ax"
    .align 4
.Lstack:
    .word _stack_top
.Lmain:
    .word main

    .section .entry, "ax"
    .global _start
    .align 4
_start:
    l32r    a1, .Lstack
    l32r    a0, .Lmain
    callx0  a0
1:  j       1b
