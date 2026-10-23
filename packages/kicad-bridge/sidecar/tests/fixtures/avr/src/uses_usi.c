/* The USI as a shift register: not simulated. */
#include <avr/io.h>
int main(void) {
    USICR = (1 << USIWM1) | (1 << USICS1);
    for (;;) { }
}
