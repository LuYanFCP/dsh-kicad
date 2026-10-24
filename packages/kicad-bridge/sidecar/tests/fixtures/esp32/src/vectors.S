/* Exception vectors of the interrupt test program (VECBASE points here). A level-1 interrupt, the GPIO interrupt, runs level1
 * below: it reads which pins' interrupts the PRO CPU takes, clears their status and counts. Nothing else is expected (call0
 * code raises no window exceptions), so anything else parks the CPU. */
#define EXCCAUSE_LEVEL1_INTERRUPT 4

    .section .vectors, "ax"
    .balign 0x400
    .global _vectors
_vectors:
    .org    0x300                   /* KernelExceptionVector (PS.UM = 0) */
    j       level1
    .org    0x340                   /* UserExceptionVector (PS.UM = 1) */
    j       level1
    .org    0x3C0                   /* DoubleExceptionVector */
1:  j       1b
    .org    0x400

    .section .literal.level1, "ax"
    .align 4
.Lsave:
    .word isr_save
.Lpcpu_int:
    .word 0x3FF44068                /* GPIO_PCPU_INT */
.Lstatus_w1tc:
    .word 0x3FF4404C                /* GPIO_STATUS_W1TC */
.Lcount:
    .word irq_count

    .section .text.level1, "ax"
    .align 4
level1:
    wsr.excsave1 a2
    rsr.exccause a2
    addi    a2, a2, -EXCCAUSE_LEVEL1_INTERRUPT
    bnez    a2, park
    l32r    a2, .Lsave
    s32i    a3, a2, 0
    s32i    a4, a2, 4
    l32r    a3, .Lpcpu_int
    l32i    a4, a3, 0
    l32r    a3, .Lstatus_w1tc
    s32i    a4, a3, 0
    l32r    a3, .Lcount
    l32i    a4, a3, 0
    addi    a4, a4, 1
    s32i    a4, a3, 0
    l32i    a4, a2, 4
    l32i    a3, a2, 0
    rsr.excsave1 a2
    rfe
park:
    j       park
