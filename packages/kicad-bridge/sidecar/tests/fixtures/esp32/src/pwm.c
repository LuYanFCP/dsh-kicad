/* LEDC: the LED on GPIO2 from low-speed channel 0, timer 0 at 1 kHz (SLOW_CLK = APB_CLK, 40 MHz on the crystal, / 39.0625 /
 * 2**10), 25 %; 300 ms later a hardware fade by +1 each period, 768 times (to 100 % in 768 ms). Its end interrupt reaches the
 * handler in vectors.S (CPU interrupt 12), and main() then turns the LED off (duty 0). */
#include "common.h"

extern char _vectors[];
volatile uint32_t irq_count;
volatile uint32_t isr_save[2];

static void ls0_duty(uint32_t duty, uint32_t fade)
{
    REG(LEDC_LSCH0_DUTY) = duty << 4;
    REG(LEDC_LSCH0_CONF1) = (1u << 31) | (1u << 30) | fade;   /* DUTY_START, upwards */
    REG(LEDC_LSCH0_CONF0) = (1u << 2) | (1u << 4);             /* timer 0, output on, PARA_UP */
}

void main(void)
{
    wdt_off();
    led_setup();
    REG(LEDC_CONF) = 1;                                                    /* SLOW_CLK = APB_CLK */
    REG(LEDC_LSTIMER0_CONF) = 10 | (10000u << 5) | (1u << 25) | (1u << 26);  /* 10 bits, 39 + 16/256, SLOW_CLK, PARA_UP */
    REG(LEDC_LSCH0_HPOINT) = 0;
    ls0_duty(256, (1u << 20) | (1u << 10));                                /* one step of 0: a plain duty change */
    REG(GPIO_FUNC_OUT_SEL(2)) = SIG_LEDC_LS0;
    delay_ms(300);

    REG(DPORT_PRO_LEDC_INT_MAP) = 12;                                      /* the LEDC source to CPU interrupt 12 */
    REG(LEDC_INT_CLR) = 0xFFFFFF;
    REG(LEDC_INT_ENA) = 1u << 16;                                          /* DUTY_CHNG_END_LSCH0 */
    __asm__ volatile("wsr.vecbase %0\n rsync" :: "r"(_vectors));
    __asm__ volatile("wsr.intenable %0\n rsync" :: "r"(1u << 12));
    __asm__ volatile("movi a2, 0x20\n wsr.ps a2\n rsync" ::: "a2");        /* user vector mode, out of exception mode, level 0 */
    ls0_duty(256, (768u << 20) | (1u << 10) | 1u);                         /* +1 each period, 768 times */
    while (!irq_count)
        delay_ms(1);
    ls0_duty(0, (1u << 20) | (1u << 10));
    for (;;)
        delay_ms(10);
}
