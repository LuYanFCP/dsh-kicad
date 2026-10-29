"""The layout the working rules ask for, judged from the schematic file: a design drawn in titled functional blocks.
Needs the sidecar's src on sys.path (each verify.py puts it there)."""

REQUIREMENT = 'drawn in titled functional blocks: 2+ frames, none crossing, every part inside one'


def check_blocks(path, min_blocks=2):
    """(ok, lines): at least ``min_blocks`` titled frames (add_block), none crossing another (a block nested inside
    another is fine), and every part (power symbols aside) inside one."""
    from dsh_kicad_sidecar.schematic import Schematic
    sch = Schematic(path)
    blocks = sch.blocks()
    outside = sch.outside_blocks(blocks)
    frames = [(b['at'][0], b['at'][1], b['at'][0] + b['size'][0], b['at'][1] + b['size'][1]) for b in blocks]
    holds = lambda p, q: p[0] <= q[0] and p[1] <= q[1] and q[2] <= p[2] and q[3] <= p[3]
    crossing = [(blocks[i]['title'], blocks[j]['title']) for i, a in enumerate(frames) for j, b in enumerate(frames) if i < j
                and a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3] and not holds(a, b) and not holds(b, a)]
    lines = [f"{b['title']}: {', '.join(b['references']) or '(empty)'}" for b in blocks]
    if outside:
        lines.append(f"outside every block: {', '.join(outside)}")
    if crossing:
        lines.append('crossing frames: ' + ', '.join(f'{a} × {b}' for a, b in crossing))
    return len(blocks) >= min_blocks and not crossing and not outside, lines
