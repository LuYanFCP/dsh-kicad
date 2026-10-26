/* The ADC: ADC1 channel 6 (GPIO34) converted every 5 ms through the RTC controller, with the accesses ESP-IDF's adc_oneshot
 * driver makes (12 bits, 12 dB, the output inversion ESP-IDF sets). The LED shows whether the reading is above 2048 (about
 * 1.8 V), and each new reading goes to UART0 as "adc <reading>". */
#include "common.h"

#define RTCIO_ADC_PAD        0x3FF48480
#define RTCIO_ADC1_MUX_SEL   (1u << 29)  /* GPIO34 (the ADC1 pad of RTC_IO) to the RTC side: an analog pad */
#define SENS_SAR_READ_CTRL   0x3FF48800
#define SENS_SAR_MEAS_WAIT2  0x3FF4880C
#define SENS_SAR_START_FORCE 0x3FF4882C
#define SENS_SAR_ATTEN1      0x3FF48834
#define SENS_SAR_SLAVE_ADDR1 0x3FF4883C
#define SENS_SAR_MEAS_START1 0x3FF48854
#define SAR1_SAMPLE_BIT_12   (3u << 16)
#define SAR1_DIG_FORCE       (1u << 27)
#define SAR1_DATA_INV        (1u << 28)
#define FORCE_XPD_SAR_PU     (3u << 18)
#define MEAS1_DONE_SAR       (1u << 16)
#define MEAS1_START_SAR      (1u << 17)
#define MEAS1_START_FORCE    (1u << 18)
#define SAR1_EN_PAD_S        19
#define SAR1_EN_PAD_FORCE    (1u << 31)

static void put(char c)
{
    while (((REG(UART0_STATUS) >> 16) & 0xFF) >= 126) { /* TX FIFO full */
    }
    REG(UART0_FIFO) = (uint8_t)c;
}

static void put_reading(uint32_t v)
{
    char digits[10];
    int n = 0;

    do {
        digits[n++] = '0' + v % 10;
        v /= 10;
    } while (v);
    for (const char *p = "adc "; *p; p++)
        put(*p);
    while (n)
        put(digits[--n]);
    put('\r');
    put('\n');
}

static uint32_t adc1_read(uint32_t channel)
{
    while (REG(SENS_SAR_SLAVE_ADDR1) >> 22 & 0xFF) { /* MEAS_STATUS: the controller is busy */
    }
    REG(SENS_SAR_MEAS_START1) = (REG(SENS_SAR_MEAS_START1) & ~(0xFFFu << SAR1_EN_PAD_S)) | (1u << (SAR1_EN_PAD_S + channel));
    REG(SENS_SAR_MEAS_START1) &= ~MEAS1_START_SAR;
    REG(SENS_SAR_MEAS_START1) |= MEAS1_START_SAR;
    while (!(REG(SENS_SAR_MEAS_START1) & MEAS1_DONE_SAR)) {
    }
    return REG(SENS_SAR_MEAS_START1) & 0xFFFF;
}

void main(void)
{
    uint32_t last = ~0u;

    wdt_off();
    led_setup();
    REG(RTCIO_ADC_PAD) |= RTCIO_ADC1_MUX_SEL;
    REG(SENS_SAR_MEAS_WAIT2) |= FORCE_XPD_SAR_PU;                                          /* the SAR powered up */
    REG(SENS_SAR_READ_CTRL) = (REG(SENS_SAR_READ_CTRL) & ~SAR1_DIG_FORCE) | SAR1_SAMPLE_BIT_12 | SAR1_DATA_INV;
    REG(SENS_SAR_START_FORCE) |= 3u;                                                       /* SAR1_BIT_WIDTH: 12 bits */
    REG(SENS_SAR_ATTEN1) |= 3u << (2 * 6);                                                 /* 12 dB on channel 6 */
    REG(SENS_SAR_MEAS_START1) |= MEAS1_START_FORCE | SAR1_EN_PAD_FORCE;                    /* the RTC controller, started by software */
    for (;;) {
        uint32_t v = adc1_read(6);
        led(v > 2048);
        if (v != last) {
            last = v;
            put_reading(v);
        }
        delay_ms(5);
    }
}
