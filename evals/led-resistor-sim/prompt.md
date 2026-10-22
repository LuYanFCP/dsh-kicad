Design a circuit in `led.kicad_sch` (a blank project is in the workspace): a 5 V supply drives one LED through a series resistor. Choose the resistor so the LED current is between 8 mA and 12 mA, and prove it by simulation, not by hand calculation.

Naming, so the checker can find things: the supply is `V1` (Simulation_SPICE:VDC, 5 V) on net `VCC`, the resistor is `R1`, the LED is `D1`, ground is `GND`. Give the LED a SPICE model (hidden property Sim.Device = D, Sim.Params `is=1e-18 n=2 rs=3`). ERC must pass with 0 errors.
