/* Counts the starts in memory that survives a reset: a reset button on the RESET pin restarts the program. PB0 goes high at each start. */
#include <avr/io.h>
uint8_t boots __attribute__((section(".noinit")));
uint8_t mcusr_copy __attribute__((section(".noinit")));
void get_mcusr(void) __attribute__((naked)) __attribute__((section(".init3")));
void get_mcusr(void) { mcusr_copy = MCUSR; MCUSR = 0; }
int main(void) {
    if (mcusr_copy & (1 << PORF)) boots = 0;
    boots++;
    DDRB |= (1 << PB0);
    PORTB |= (1 << PB0);
    for (;;) { }
}
