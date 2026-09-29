"""Draw the pictures for the help panel from the game's own mazes.

Run from the project directory whenever the mazes or the generator change::

    py tools/make_help_images.py

Every picture is built from real data rather than drawn by hand: the checked-in
maze files, and Hard maze 15 from challenge mode with the taught right-hand
solver and a memory solver actually run on it. So a picture cannot show
something the game does not do. If the generator changes so that Hard maze 15
no longer traps the wall follower, this script fails instead of drawing a
misleading picture.
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import maze_generator  # noqa: E402

ASSETS = PROJECT_ROOT / "assets"

# The canvas colours from js/maze.js, so the pictures look like the game.
WALL = "#243b57"
FLOOR = "#ffffff"
GOAL = "#b6f0da"
TRIANGLE = "#1e88e5"
ROUTE = "#1769e0"
LOOP = "#f05d4e"
VISITED = "#c9ddf8"
TEXT = "#172235"
FONT = "Inter, 'Segoe UI', system-ui, sans-serif"

# 0 = up, 1 = right, 2 = down, 3 = left, as in maze.py.
DIRS = [(-1, 0), (0, 1), (1, 0), (0, -1)]
CELL = 10

# Challenge mode's Hard maze 15, the first maze the taught solver fails.
LOOP_LEVEL, LOOP_SEED = "hard", 15


def find(maze, marker):
    return next(
        (row, line.index(marker)) for row, line in enumerate(maze) if marker in line
    )


def is_open(maze, row, column):
    return maze[row][column] != "#"


def triangle(row, column, direction, size=CELL):
    """The player marker, drawn as maze.js draws it."""
    cx, cy = (column + 0.5) * size, (row + 0.5) * size
    r = size * 0.35
    points = {
        0: [(cx, cy - r), (cx - r, cy + r), (cx + r, cy + r)],
        1: [(cx + r, cy), (cx - r, cy - r), (cx - r, cy + r)],
        2: [(cx, cy + r), (cx - r, cy - r), (cx + r, cy - r)],
        3: [(cx - r, cy), (cx + r, cy - r), (cx + r, cy + r)],
    }[direction]
    joined = " ".join(f"{x:g},{y:g}" for x, y in points)
    return f'<polygon points="{joined}" fill="{TRIANGLE}"/>'


def maze_svg(maze, shaded=(), overlay=""):
    """A maze with its start and goal, optionally shading some squares."""
    rows, columns = len(maze), len(maze[0])
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {columns * CELL} '
        f'{rows * CELL}" width="{columns * CELL * 2}" height="{rows * CELL * 2}">',
        f'<rect width="{columns * CELL}" height="{rows * CELL}" fill="{FLOOR}"/>',
    ]
    for row, column in shaded:
        parts.append(
            f'<rect x="{column * CELL}" y="{row * CELL}" width="{CELL}" '
            f'height="{CELL}" fill="{VISITED}"/>'
        )

    # One rectangle per run of wall along a row keeps the file small. Crisp
    # edges stop the floor showing through as a hairline between rows.
    parts.append('<g shape-rendering="crispEdges">')
    for row, line in enumerate(maze):
        column = 0
        while column < columns:
            if line[column] != "#":
                column += 1
                continue
            end = column
            while end < columns and line[end] == "#":
                end += 1
            parts.append(
                f'<rect x="{column * CELL}" y="{row * CELL}" '
                f'width="{(end - column) * CELL}" height="{CELL}" fill="{WALL}"/>'
            )
            column = end
    parts.append("</g>")

    goal_row, goal_column = find(maze, "G")
    parts.append(
        f'<rect x="{goal_column * CELL}" y="{goal_row * CELL}" width="{CELL}" '
        f'height="{CELL}" fill="{GOAL}"/>'
    )
    parts.append(overlay)
    start_row, start_column = find(maze, "S")
    parts.append(triangle(start_row, start_column, 1))
    parts.append("</svg>\n")
    return "".join(parts)


def centre(row, column):
    return (column + 0.5) * CELL, (row + 0.5) * CELL


def polyline(squares, colour):
    points = " ".join(f"{x:g},{y:g}" for x, y in (centre(*s) for s in squares))
    return (
        f'<polyline points="{points}" fill="none" stroke="{colour}" '
        f'stroke-width="3" stroke-linejoin="round" stroke-linecap="round" '
        f'stroke-opacity="0.85"/>'
    )


def arrowheads(squares, colour, count=4):
    """A few arrows along a route, so its direction can be read."""
    parts = []
    for index in range(1, count + 1):
        i = index * (len(squares) - 1) // (count + 1)
        (r1, c1), (r2, c2) = squares[i], squares[i + 1]
        direction = DIRS.index((r2 - r1, c2 - c1))
        x1, y1 = centre(r1, c1)
        x2, y2 = centre(r2, c2)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        rotation = direction * 90 - 90
        parts.append(
            f'<polygon points="4,0 -3,-3.5 -3,3.5" fill="{colour}" '
            f'transform="translate({mx:g},{my:g}) rotate({rotation})"/>'
        )
    return "".join(parts)


def follow_right_wall(maze):
    """Run the taught solver: right if possible, else ahead, else turn left.

    Returns the squares visited before it starts repeating itself and the
    squares of the loop it then repeats forever, or raises if it arrives.
    """
    row, column = find(maze, "S")
    goal = find(maze, "G")
    direction = 1
    path = [(row, column)]
    seen = {}

    while (row, column) != goal:
        state = (row, column, direction)
        if state in seen:
            start = seen[state]
            return path[: start + 1], path[start:] + [path[start]]
        seen[state] = len(path) - 1

        right = (direction + 1) % 4
        dr, dc = DIRS[right]
        if is_open(maze, row + dr, column + dc):
            direction = right
        else:
            dr, dc = DIRS[direction]
            if not is_open(maze, row + dr, column + dc):
                direction = (direction - 1) % 4
                continue
        dr, dc = DIRS[direction]
        row, column = row + dr, column + dc
        path.append((row, column))

    raise RuntimeError(f"The wall follower solved {LOOP_LEVEL} maze {LOOP_SEED}")


def explore_with_memory(maze):
    """Run the memory solver from the tests: every visited square, and the route."""
    position = find(maze, "S")
    goal = find(maze, "G")
    visited = {position}
    route = [position]

    while position != goal:
        row, column = position
        for dr, dc in DIRS:
            square = (row + dr, column + dc)
            if is_open(maze, *square) and square not in visited:
                visited.add(square)
                route.append(square)
                position = square
                break
        else:
            route.pop()
            position = route[-1]

    return visited, route


def directions_svg():
    """The four path checks, facing right and then facing down."""
    size = 40
    labels = {
        1: {1: "ahead", 0: "left", 2: "right", 3: "behind"},
        2: {2: "ahead", 1: "left", 3: "right", 0: "behind"},
    }
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150" '
        'width="300" height="150">'
    ]
    for panel, (facing, caption) in enumerate(
        ((1, "Facing right"), (2, "Facing down"))
    ):
        left = panel * 170
        for row in range(3):
            for column in range(3):
                x, y = left + column * size, row * size
                ring = [(r, c) for r, c in DIRS]
                offset = (row - 1, column - 1)
                if offset in ring:
                    world = ring.index(offset)
                    parts.append(
                        f'<rect x="{x}" y="{y}" width="{size}" height="{size}" '
                        f'fill="{VISITED}" stroke="#ffffff" stroke-width="2"/>'
                    )
                    parts.append(
                        f'<text x="{x + size / 2:g}" y="{y + size / 2 + 4:g}" '
                        f'font-family="{FONT}" font-size="11" font-weight="700" '
                        f'fill="{TEXT}" text-anchor="middle">'
                        f"{labels[facing][world]}</text>"
                    )
                elif offset == (0, 0):
                    parts.append(
                        f'<rect x="{x}" y="{y}" width="{size}" height="{size}" '
                        f'fill="{FLOOR}" stroke="#dbe2ea"/>'
                    )
                    marker = triangle(0, 0, facing, size)
                    parts.append(f'<g transform="translate({x},{y})">{marker}</g>')
                else:
                    parts.append(
                        f'<rect x="{x}" y="{y}" width="{size}" height="{size}" '
                        f'fill="#f4f7fb" stroke="#ffffff" stroke-width="2"/>'
                    )
        parts.append(
            f'<text x="{left + 60}" y="143" font-family="{FONT}" font-size="12" '
            f'fill="{TEXT}" text-anchor="middle">{caption}</text>'
        )
    parts.append("</svg>\n")
    return "".join(parts)


def load(name):
    return (PROJECT_ROOT / "mazes" / name).read_text(encoding="utf-8").splitlines()


def main():
    pictures = {
        "help-directions.svg": directions_svg(),
        "help-easy.svg": maze_svg(load("easy_winding.txt")),
        "help-medium.svg": maze_svg(load("medium_crossroads.txt")),
        "help-plaza.svg": maze_svg(load("plaza_pillars.txt")),
    }

    maze = maze_generator.generate_difficulty(LOOP_LEVEL, seed=LOOP_SEED)
    way_in, loop = follow_right_wall(maze)
    pictures["help-loop.svg"] = maze_svg(
        maze,
        overlay=(polyline(way_in, ROUTE) if len(way_in) > 1 else "")
        + polyline(loop, LOOP)
        + arrowheads(loop, LOOP),
    )

    visited, route = explore_with_memory(maze)
    pictures["help-memory.svg"] = maze_svg(
        maze, shaded=visited, overlay=polyline(route, ROUTE)
    )

    for name, svg in pictures.items():
        (ASSETS / name).write_text(svg, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
