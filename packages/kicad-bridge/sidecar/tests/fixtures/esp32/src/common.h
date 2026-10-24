/* Bare-metal ESP32 test programs (no ESP-IDF): the ROM loads each image from 0x1000 as the second-stage bootloader and jumps
 * to _start (start.S), which calls main(). The CPU stays on the 40 MHz crystal the ROM leaves it on. */
#include <stdint.h>

#define REG(a) (*(volatile uint32_t *)(a))

/* GPIO */
#define GPIO_OUT_W1TS        0x3FF44008
#define GPIO_OUT_W1TC        0x3FF4400C
#define GPIO_ENABLE_W1TS     0x3FF44024
#define GPIO_ENABLE_W1TC     0x3FF44028
#define GPIO_IN              0x3FF4403C
#define GPIO_PIN(n)          (0x3FF44088 + 4 * (n))
#define GPIO_FUNC_OUT_SEL(n) (0x3FF44530 + 4 * (n))
#define OEN_SEL              (1u << 10)  /* the output enable comes from GPIO_ENABLE */
#define OEN_INV_SEL          (1u << 11)
#define SIG_GPIO_OUT         0x100

/* IO_MUX: function, input enable, drive strength (the pulls of these RTC pads are in RTC_IO) */
#define IO_MUX_GPIO2         0x3FF49040
#define IO_MUX_GPIO0         0x3FF49044
#define MCU_SEL_MASK         (7u << 12)
#define MCU_SEL_GPIO         (2u << 12)
#define FUN_DRV_20MA         (2u << 10)
#define FUN_IE               (1u << 9)

/* RTC_IO pad registers: GPIO0 is touch pad 1, GPIO2 touch pad 2 */
#define RTCIO_TOUCH_PAD1     0x3FF48498
#define RTCIO_TOUCH_PAD2     0x3FF4849C
#define RTCIO_RUE            (1u << 27)
#define RTCIO_RDE            (1u << 28)
#define RTCIO_MUX_SEL        (1u << 19)  /* the pad is an RTC pad */

/* Timer group 0 watchdog, which the ROM leaves running */
#define TIMG0_WDTCONFIG0     0x3FF5F048
#define TIMG0_WDTCONFIG1     0x3FF5F04C
#define TIMG0_WDTCONFIG2     0x3FF5F050
#define TIMG0_WDTWPROTECT    0x3FF5F064
#define WDT_KEY              0x50D83AA1

/* UART0 */
#define UART0_FIFO           0x3FF40000
#define UART0_STATUS         0x3FF4001C

#define CPU_HZ 40000000u

static inline uint32_t ccount(void)
{
    uint32_t v;
    __asm__ volatile("rsr.ccount %0" : "=a"(v));
    return v;
}

static inline void delay_ms(uint32_t ms)
{
    while (ms--) {
        uint32_t t = ccount();
        while ((uint32_t)(ccount() - t) < CPU_HZ / 1000) {
        }
    }
}

static inline void wdt_off(void)
{
    REG(TIMG0_WDTWPROTECT) = WDT_KEY;
    REG(TIMG0_WDTCONFIG0) = 0;
    REG(TIMG0_WDTWPROTECT) = 0;
}

/* GPIO2 as a push-pull output, low, no pull */
static inline void led_setup(void)
{
    REG(IO_MUX_GPIO2) = MCU_SEL_GPIO | FUN_DRV_20MA;
    REG(RTCIO_TOUCH_PAD2) = 0;
    REG(GPIO_FUNC_OUT_SEL(2)) = SIG_GPIO_OUT;
    REG(GPIO_OUT_W1TC) = 1u << 2;
    REG(GPIO_ENABLE_W1TS) = 1u << 2;
}

static inline void led(int on)
{
    REG(on ? GPIO_OUT_W1TS : GPIO_OUT_W1TC) = 1u << 2;
}

/* GPIO0 as an input, set up the way ESP-IDF's GPIO driver does it (MicroPython's Pin(0, Pin.IN) runs these accesses): by
 * read-modify-writes, which keep the pull-up GPIO0 has from reset */
static inline void button_setup(void)
{
    REG(RTCIO_TOUCH_PAD1) &= ~RTCIO_MUX_SEL;                                 /* rtc_gpio_deinit */
    REG(IO_MUX_GPIO0) = (REG(IO_MUX_GPIO0) & ~MCU_SEL_MASK) | MCU_SEL_GPIO;   /* gpio_pad_select_gpio */
    REG(IO_MUX_GPIO0) |= FUN_IE;                                              /* gpio_input_enable */
    REG(GPIO_ENABLE_W1TC) = 1u << 0;                                          /* gpio_output_disable */
    REG(GPIO_FUNC_OUT_SEL(0)) &= ~OEN_INV_SEL;
    REG(GPIO_FUNC_OUT_SEL(0)) |= OEN_SEL;
}
