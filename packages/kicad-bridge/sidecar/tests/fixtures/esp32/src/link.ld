/* Code in IRAM, data in the application DRAM; literals ahead of the code that loads them (l32r reaches backwards). */
ENTRY(_start)
MEMORY
{
    iram (rx) : ORIGIN = 0x40080000, LENGTH = 0x20000
    dram (rw) : ORIGIN = 0x3FFB0000, LENGTH = 0x10000
}
SECTIONS
{
    .vectors : { KEEP(*(.vectors)) } > iram  /* VECBASE needs 1 KB alignment: first in IRAM (empty but in the interrupt program) */
    .iram : { KEEP(*(.entry.literal)) KEEP(*(.entry)) *(.literal .literal.*) *(.text .text.*) } > iram
    .dram : { *(.rodata .rodata.* .data .data.* .bss .bss.* COMMON) } > dram
}
_stack_top = ORIGIN(dram) + LENGTH(dram);
