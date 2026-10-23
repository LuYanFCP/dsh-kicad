/* The USI in two-wire mode (I2C): not simulated. */
#include <avr/io.h>
int main(void) {
    USICR = (1 << USIWM1) | (1 << USICS1);
    for (;;) { }
}
