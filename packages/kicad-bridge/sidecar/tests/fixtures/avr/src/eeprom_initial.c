/* EEPROM contents from the ELF's .eeprom section: PB0 goes high if config[0] is 0x12 and config[1] is 0x34. */
#include <avr/io.h>
#include <avr/eeprom.h>
uint8_t EEMEM config[2] = { 0x12, 0x34 };
volatile uint8_t seen[2];
int main(void) {
    seen[0] = eeprom_read_byte(&config[0]);
    seen[1] = eeprom_read_byte(&config[1]);
    DDRB |= (1 << PB0);
    if (seen[0] == 0x12 && seen[1] == 0x34) PORTB |= (1 << PB0);
    for (;;) { }
}
