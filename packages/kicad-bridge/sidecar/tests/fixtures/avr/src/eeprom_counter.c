/* A boot counter in EEPROM: each start reads address 0, adds one, writes it back (3.4 ms), and lets the watchdog restart the chip until it
   has counted to 3; then PB0 goes high and the chip sits still. `last` holds the value read at this start. */
#include <avr/io.h>
#include <avr/eeprom.h>
#include <avr/wdt.h>
uint8_t last __attribute__((section(".noinit")));
uint8_t mcusr_copy __attribute__((section(".noinit")));
void get_mcusr(void) __attribute__((naked)) __attribute__((section(".init3")));
void get_mcusr(void) { mcusr_copy = MCUSR; MCUSR = 0; wdt_disable(); }
int main(void) {
    uint8_t n = eeprom_read_byte((const uint8_t *)0);
    if (n == 0xFF) n = 0;
    last = n;
    eeprom_update_byte((uint8_t *)0, n + 1);
    if (n < 2) { wdt_enable(WDTO_15MS); for (;;) { } }
    DDRB |= (1 << PB0);
    PORTB |= (1 << PB0);
    for (;;) { }
}
