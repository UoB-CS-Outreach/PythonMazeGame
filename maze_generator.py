"""Generate and validate text mazes for the browser maze game.

Difficulty is a question of maze structure, not only size. Each level adds one
new idea that the previous strategy cannot handle:

===========  ==========  ==================================================
Difficulty   Style       New concept
===========  ==========  ==================================================
easy         corridor    One winding route: turns, but no branches and no
                         dead ends.
medium       perfect     Junctions and dead ends, still with exactly one
                         route between any two squares.
hard         braided     A few loops and wall islands, so a purely local
                         rule can repeat the same route forever.
expert       braided     Many loops, islands and open rooms.
             + rooms
plaza        plaza       An open hall of free-standing pillars: no wall
                         worth following at all.
marathon     braided     Expert's structure at twice the area, with routes
             + rooms     long enough that an inefficient one runs out of
                         steps before it arrives.
===========  ==========  ==================================================

The right-hand rule is guaranteed on ``corridor`` and ``perfect`` mazes
because their passages contain no loops and their walls form a single
connected shape. It is deliberately *not* guaranteed from ``hard`` onwards.

``blocks`` remains available as an unstructured random-block test case built
around a protected start-to-goal route.

The module has no browser or third-party dependencies, so it can also be used
from tests or other tooling::

    maze = generate_difficulty("hard", seed=42)
    print(maze_to_text(maze), end="")
"""

from __future__ import annotations

import argparse
import random
from collections import deque
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

Coordinate = Tuple[int, int]
Grid = List[List[str]]
Maze = List[str]

WALL = "#"
PASSAGE = "."
START = "S"
GOAL = "G"

_DIRECTIONS: Tuple[Coordinate, ...] = ((-1, 0), (0, 1), (1, 0), (0, -1))
_CARVED_STYLES = {"corridor", "perfect", "braided"}
_LOOP_FREE_STYLES = {"corridor", "perfect"}
_STYLES = _CARVED_STYLES | {"blocks", "plaza"}

#: Structure of each difficulty offered by the game. Sizes grow, but the
#: important change is the topology: see the module docstring.
DIFFICULTIES: Dict[str, Dict[str, object]] = {
    "easy": {"rows": 11, "columns": 15, "style": "corridor"},
    "medium": {"rows": 15, "columns": 19, "style": "perfect"},
    "hard": {"rows": 19, "columns": 25, "style": "braided", "braid": 0.3},
    "expert": {
        "rows": 21,
        "columns": 29,
        "style": "braided",
        "braid": 0.55,
        "rooms": 3,
    },
    "plaza": {"rows": 21, "columns": 29, "style": "plaza", "pillar_density": 0.65},
    "marathon": {
        "rows": 29,
        "columns": 41,
        "style": "braided",
        "braid": 0.45,
        "rooms": 5,
    },
}


def generate_maze(
    rows: int = 21,
    columns: int = 21,
    *,
    seed: Optional[int] = None,
    style: str = "braided",
    braid: float = 0.15,
    rooms: int = 0,
    pillar_density: float = 0.6,
    block_density: float = 0.32,
) -> Maze:
    """Return a new solvable maze as a list of equal-length strings.

    Args:
        rows: Total number of rows, including the solid outer border.
        columns: Total number of columns, including the outer border.
        seed: Optional seed for reproducible output.
        style: ``corridor``, ``perfect``, ``braided``, ``plaza`` or ``blocks``.
        braid: For ``braided``, the probability of opening each dead end into
            another corridor. Higher values create more loops and wall islands.
        rooms: For ``braided``, the number of open rectangular areas to carve
            out after braiding.
        pillar_density: For ``plaza``, the chance that each lattice position
            holds a pillar.
        block_density: For ``blocks``, the probability that an unprotected
            interior cell is a wall.

    Carved mazes require odd dimensions so that one-cell passages can alternate
    with one-cell walls. Random-block mazes accept odd or even dimensions.
    Every style guarantees at least one route from ``S`` to ``G``.
    """
    _validate_options(rows, columns, style, braid, rooms, pillar_density, block_density)
    rng = random.Random(seed)

    if style == "blocks":
        grid = _generate_blocks(rows, columns, rng, block_density)
        start, goal = (1, 1), (rows - 2, columns - 2)
    elif style == "plaza":
        grid = _generate_plaza(rows, columns, rng, pillar_density)
        start, goal = _inner_endpoints(grid)
    elif style == "corridor":
        grid, start, goal = _carve_corridor(rows, columns, rng)
    else:
        grid = _carve_depth_first(rows, columns, rng)
        if style == "braided":
            _braid_dead_ends(grid, rng, braid)
            _carve_rooms(grid, rng, rooms)
        start, goal = _distant_endpoints(grid)

    grid[start[0]][start[1]] = START
    grid[goal[0]][goal[1]] = GOAL
    maze = ["".join(row) for row in grid]

    # These are intentionally kept as final invariant checks. If a future
    # generation strategy breaks solvability, or quietly makes an easier
    # difficulty harder than the taught strategy can handle, it should fail
    # here rather than emit a bad map.
    # Pillars sit on a spaced lattice, so a plaza floor is one open space in
    # the same way a carved maze is: worth checking rather than assuming.
    connected_styles = _CARVED_STYLES | {"plaza"}
    validate_maze(maze, require_all_passages_connected=style in connected_styles)
    loops = count_passage_loops(maze)
    if style in _LOOP_FREE_STYLES and loops != 0:
        raise ValueError(f"{style} mazes must not contain passage loops")
    if style == "corridor" and count_junctions(maze) != 0:
        raise ValueError("corridor mazes must not contain junctions")
    if style == "braided" and braid > 0 and loops == 0:
        raise ValueError("braided mazes must contain at least one loop")
    return maze


def generate_difficulty(name: str, *, seed: Optional[int] = None) -> Maze:
    """Return a new maze built to the structure of a named difficulty.

    ``name`` is one of the keys of :data:`DIFFICULTIES`. This is the entry
    point the game uses, so every difficulty is described in one place.
    """
    preset = DIFFICULTIES.get(name)
    if preset is None:
        choices = ", ".join(DIFFICULTIES)
        raise ValueError(f"Unknown difficulty {name!r}; choose from {choices}")

    options = dict(preset)
    return generate_maze(
        int(options.pop("rows")),
        int(options.pop("columns")),
        seed=seed,
        **options,  # type: ignore[arg-type]
    )


def find_solution(maze: Sequence[str]) -> Optional[List[Coordinate]]:
    """Return a shortest ``S``-to-``G`` path, or ``None`` if no route exists."""
    _maze_shape(maze)
    start = _find_unique_marker(maze, START)
    goal = _find_unique_marker(maze, GOAL)
    return _breadth_first_path(maze, start, goal)


def _breadth_first_path(
    cells: Sequence[Sequence[str]], start: Coordinate, goal: Coordinate
) -> Optional[List[Coordinate]]:
    """Return a shortest route between two open squares of a grid or maze."""
    rows, columns = len(cells), len(cells[0])
    queue = deque([start])
    previous: dict = {start: None}

    while queue:
        current = queue.popleft()
        if current == goal:
            path: List[Coordinate] = []
            cursor: Optional[Coordinate] = current
            while cursor is not None:
                path.append(cursor)
                cursor = previous[cursor]
            path.reverse()
            return path

        for neighbour in _neighbours(current, rows, columns):
            row, column = neighbour
            if cells[row][column] != WALL and neighbour not in previous:
                previous[neighbour] = current
                queue.append(neighbour)

    return None


def validate_maze(
    maze: Sequence[str], *, require_all_passages_connected: bool = False
) -> None:
    """Raise ``ValueError`` if a maze cannot safely be loaded by the game.

    By default disconnected traversable islands are allowed, matching the game
    format. Set ``require_all_passages_connected`` for carved-maze checks.
    """
    rows, columns = _maze_shape(maze)
    start = _find_unique_marker(maze, START)
    _find_unique_marker(maze, GOAL)

    allowed = {WALL, PASSAGE, START, GOAL, " "}
    unexpected = sorted({character for line in maze for character in line} - allowed)
    if unexpected:
        raise ValueError(f"Unsupported maze character(s): {unexpected!r}")

    if find_solution(maze) is None:
        raise ValueError("Maze has no route from S to G")

    if require_all_passages_connected:
        reachable = _reachable_cells(maze, start, rows, columns)
        if reachable != _passage_cells(maze):
            raise ValueError("Maze contains disconnected traversable cells")


def count_passage_loops(maze: Sequence[str]) -> int:
    """Return how many independent loops the open squares contain.

    Zero means the open squares form a tree: exactly one route between any two
    of them. That is the property the taught wall-following strategy relies on,
    so it holds for the easy and medium mazes and not for harder ones.
    """
    rows, columns = _maze_shape(maze)
    passages = _passage_cells(maze)
    edges = sum(
        (row + row_delta, column + column_delta) in passages
        for row, column in passages
        for row_delta, column_delta in ((0, 1), (1, 0))
    )
    components = _count_components(maze, passages, rows, columns)
    return edges - len(passages) + components


def count_junctions(maze: Sequence[str]) -> int:
    """Return how many open squares have three or more open neighbours.

    A maze with no junctions is a single corridor, so a program only has to
    keep following it rather than choose between branches.
    """
    rows, columns = _maze_shape(maze)
    passages = _passage_cells(maze)
    return sum(
        sum(neighbour in passages for neighbour in _neighbours(cell, rows, columns))
        >= 3
        for cell in passages
    )


def maze_to_text(maze: Sequence[str]) -> str:
    """Validate a maze and serialize it with a final newline."""
    validate_maze(maze)
    return "\n".join(maze) + "\n"


def write_maze(maze: Sequence[str], output: Path) -> None:
    """Validate and write a maze to ``output`` using UTF-8 text."""
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(maze_to_text(maze), encoding="utf-8")


def _validate_options(
    rows: int,
    columns: int,
    style: str,
    braid: float,
    rooms: int,
    pillar_density: float,
    block_density: float,
) -> None:
    if rows < 5 or columns < 5:
        raise ValueError("Maze dimensions must both be at least 5")
    if style not in _STYLES:
        choices = ", ".join(sorted(_STYLES))
        raise ValueError(f"Unknown style {style!r}; choose from {choices}")
    if style in _CARVED_STYLES and (rows % 2 == 0 or columns % 2 == 0):
        raise ValueError("Carved mazes require odd dimensions")
    if not 0.0 <= braid <= 1.0:
        raise ValueError("braid must be between 0 and 1")
    if rooms < 0:
        raise ValueError("rooms cannot be negative")
    if rooms and style != "braided":
        raise ValueError("Only braided mazes can contain open rooms")
    if not 0.0 <= pillar_density <= 1.0:
        raise ValueError("pillar_density must be between 0 and 1")
    if not 0.0 <= block_density <= 1.0:
        raise ValueError("block_density must be between 0 and 1")


def _carve_depth_first(rows: int, columns: int, rng: random.Random) -> Grid:
    grid = [[WALL for _ in range(columns)] for _ in range(rows)]
    origin = (1, 1)
    grid[origin[0]][origin[1]] = PASSAGE
    stack = [origin]

    while stack:
        row, column = stack[-1]
        candidates = []
        for row_delta, column_delta in _DIRECTIONS:
            next_row = row + 2 * row_delta
            next_column = column + 2 * column_delta
            if (
                0 < next_row < rows - 1
                and 0 < next_column < columns - 1
                and grid[next_row][next_column] == WALL
            ):
                candidates.append((next_row, next_column, row_delta, column_delta))

        if not candidates:
            stack.pop()
            continue

        next_row, next_column, row_delta, column_delta = rng.choice(candidates)
        grid[row + row_delta][column + column_delta] = PASSAGE
        grid[next_row][next_column] = PASSAGE
        stack.append((next_row, next_column))

    return grid


def _carve_corridor(
    rows: int, columns: int, rng: random.Random
) -> Tuple[Grid, Coordinate, Coordinate]:
    """Carve a maze, then keep only its longest route.

    A perfect maze has exactly one route between any two squares, so the route
    between its two most distant squares is a single winding corridor: it has
    turns, but no branches and no dead ends.
    """
    carved = _carve_depth_first(rows, columns, rng)
    start, goal = _distant_endpoints(carved)
    route = _breadth_first_path(carved, start, goal)
    if route is None:  # pragma: no cover - a carved maze is always connected
        raise ValueError("Carved maze has no route between its endpoints")

    grid = [[WALL for _ in range(columns)] for _ in range(rows)]
    for row, column in route:
        grid[row][column] = PASSAGE

    return grid, start, goal


def _carve_rooms(grid: Grid, rng: random.Random, count: int) -> None:
    """Open ``count`` rectangular areas, creating open space and wall islands."""
    rows, columns = len(grid), len(grid[0])

    for _ in range(count):
        height = rng.choice((3, 5))
        width = rng.choice((3, 5))
        if rows - height <= 1 or columns - width <= 1:
            continue

        top = rng.randrange(1, rows - height, 2)
        left = rng.randrange(1, columns - width, 2)
        for row in range(top, top + height):
            for column in range(left, left + width):
                grid[row][column] = PASSAGE


def _braid_dead_ends(grid: Grid, rng: random.Random, probability: float) -> None:
    """Open dead ends into neighbouring corridors, creating loops.

    Every wall removed here joins two squares that were already connected, so
    it adds exactly one loop. When ``probability`` is greater than zero the
    random pass is topped up if needed, so a braided maze always contains at
    least one loop rather than occasionally staying a perfect maze.
    """
    if probability == 0:
        return

    rows, columns = len(grid), len(grid[0])
    cells = [
        (row, column)
        for row in range(1, rows - 1, 2)
        for column in range(1, columns - 1, 2)
    ]
    rng.shuffle(cells)

    opened = _open_dead_ends(grid, cells, rng, probability)
    if opened == 0:
        _open_dead_ends(grid, cells, rng, 1.0, limit=1)


def _open_dead_ends(
    grid: Grid,
    cells: Sequence[Coordinate],
    rng: random.Random,
    probability: float,
    limit: Optional[int] = None,
) -> int:
    """Open up to ``limit`` dead ends and return how many were opened."""
    rows, columns = len(grid), len(grid[0])
    opened = 0

    for row, column in cells:
        if limit is not None and opened >= limit:
            break
        if probability < 1.0 and rng.random() > probability:
            continue
        if _open_neighbour_count(grid, row, column) != 1:
            continue

        removable_walls = []
        for row_delta, column_delta in _DIRECTIONS:
            wall_row, wall_column = row + row_delta, column + column_delta
            far_row, far_column = row + 2 * row_delta, column + 2 * column_delta
            if (
                0 < far_row < rows - 1
                and 0 < far_column < columns - 1
                and grid[wall_row][wall_column] == WALL
                and grid[far_row][far_column] != WALL
            ):
                removable_walls.append((wall_row, wall_column))

        if removable_walls:
            wall_row, wall_column = rng.choice(removable_walls)
            grid[wall_row][wall_column] = PASSAGE
            opened += 1

    return opened


def _generate_plaza(
    rows: int, columns: int, rng: random.Random, density: float
) -> Grid:
    """Return an open hall dotted with free-standing pillars.

    Pillars are placed on a lattice with a clear gap between them, so every
    one is an isolated island of wall and the floor stays connected. There is
    no long wall to follow here: a hand kept on a pillar goes around that
    pillar and nowhere else.
    """
    grid = [
        [
            WALL if row in (0, rows - 1) or column in (0, columns - 1) else PASSAGE
            for column in range(columns)
        ]
        for row in range(rows)
    ]

    for row in range(2, rows - 2, 3):
        for column in range(2, columns - 2, 3):
            if rng.random() > density:
                continue
            height = rng.choice((1, 1, 2))
            width = rng.choice((1, 2, 2))
            for pillar_row in range(row, min(row + height, rows - 2)):
                for pillar_column in range(column, min(column + width, columns - 2)):
                    grid[pillar_row][pillar_column] = WALL

    return grid


def _generate_blocks(
    rows: int, columns: int, rng: random.Random, density: float
) -> Grid:
    grid = [[WALL for _ in range(columns)] for _ in range(rows)]
    route = _random_manhattan_route(rows, columns, rng)

    for row in range(1, rows - 1):
        for column in range(1, columns - 1):
            if (row, column) in route or rng.random() >= density:
                grid[row][column] = PASSAGE

    return grid


def _random_manhattan_route(
    rows: int, columns: int, rng: random.Random
) -> set[Coordinate]:
    row, column = 1, 1
    goal = (rows - 2, columns - 2)
    route = {(row, column)}

    while (row, column) != goal:
        moves = []
        if row < goal[0]:
            moves.append((1, 0))
        if column < goal[1]:
            moves.append((0, 1))
        row_delta, column_delta = rng.choice(moves)
        row += row_delta
        column += column_delta
        route.add((row, column))

    return route


def _distant_endpoints(grid: Grid) -> Tuple[Coordinate, Coordinate]:
    first, _ = _farthest_cell(grid, (1, 1))
    second, _ = _farthest_cell(grid, first)
    return first, second


def _inner_endpoints(grid: Grid) -> Tuple[Coordinate, Coordinate]:
    """Pick two distant squares that do not touch the outer wall.

    In an open hall the outer wall is one continuous shape, so a start and a
    goal placed against it can be joined simply by following it round. Keeping
    both away from the border is what makes a plaza a real problem: the only
    walls in reach are pillars, and going around a pillar leads nowhere.
    """
    rows, columns = len(grid), len(grid[0])
    inner = {
        (row, column)
        for row in range(2, rows - 2)
        for column in range(2, columns - 2)
        if grid[row][column] != WALL
    }
    if len(inner) < 2:
        return _distant_endpoints(grid)

    origin = min(inner)
    first, _ = _farthest_cell(grid, origin, allowed=inner)
    second, _ = _farthest_cell(grid, first, allowed=inner)
    return first, second


def _farthest_cell(
    grid: Grid, origin: Coordinate, allowed: Optional[set] = None
) -> Tuple[Coordinate, int]:
    """Return the open square furthest from ``origin``, and how far that is.

    ``allowed`` restricts which squares may be the answer; the search still
    travels through every open square.
    """
    rows, columns = len(grid), len(grid[0])
    queue = deque([(origin, 0)])
    seen = {origin}
    farthest = origin
    farthest_distance = 0

    while queue:
        current, distance = queue.popleft()
        if distance > farthest_distance and (allowed is None or current in allowed):
            farthest, farthest_distance = current, distance
        for neighbour in _neighbours(current, rows, columns):
            row, column = neighbour
            if grid[row][column] != WALL and neighbour not in seen:
                seen.add(neighbour)
                queue.append((neighbour, distance + 1))

    return farthest, farthest_distance


def _open_neighbour_count(grid: Grid, row: int, column: int) -> int:
    return sum(
        grid[row + row_delta][column + column_delta] != WALL
        for row_delta, column_delta in _DIRECTIONS
    )


def _maze_shape(maze: Sequence[str]) -> Tuple[int, int]:
    if not maze:
        raise ValueError("Maze is empty")
    columns = len(maze[0])
    if columns == 0:
        raise ValueError("Maze rows cannot be empty")
    if any(len(line) != columns for line in maze):
        raise ValueError("Maze rows must all have the same length")
    return len(maze), columns


def _find_unique_marker(maze: Sequence[str], marker: str) -> Coordinate:
    matches = [
        (row, column)
        for row, line in enumerate(maze)
        for column, character in enumerate(line)
        if character == marker
    ]
    if len(matches) != 1:
        message = f"Maze must contain exactly one {marker}; found {len(matches)}"
        raise ValueError(message)
    return matches[0]


def _passage_cells(maze: Sequence[str]) -> set[Coordinate]:
    return {
        (row, column)
        for row, line in enumerate(maze)
        for column, character in enumerate(line)
        if character != WALL
    }


def _count_components(
    maze: Sequence[str], passages: set[Coordinate], rows: int, columns: int
) -> int:
    unvisited = set(passages)
    components = 0
    while unvisited:
        origin = next(iter(unvisited))
        unvisited -= _reachable_cells(maze, origin, rows, columns)
        components += 1
    return components


def _reachable_cells(
    maze: Sequence[str], origin: Coordinate, rows: int, columns: int
) -> set[Coordinate]:
    queue = deque([origin])
    seen = {origin}
    while queue:
        current = queue.popleft()
        for neighbour in _neighbours(current, rows, columns):
            row, column = neighbour
            if maze[row][column] != WALL and neighbour not in seen:
                seen.add(neighbour)
                queue.append(neighbour)
    return seen


def _neighbours(
    coordinate: Coordinate, rows: int, columns: int
) -> Iterable[Coordinate]:
    row, column = coordinate
    for row_delta, column_delta in _DIRECTIONS:
        next_row, next_column = row + row_delta, column + column_delta
        if 0 <= next_row < rows and 0 <= next_column < columns:
            yield next_row, next_column


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--difficulty",
        choices=list(DIFFICULTIES),
        help="build the maze the game uses for this difficulty, which "
        "overrides --rows, --columns, --style, --braid and --rooms",
    )
    parser.add_argument("--rows", type=int, default=21, help="maze rows (default: 21)")
    parser.add_argument(
        "--columns", type=int, default=21, help="maze columns (default: 21)"
    )
    parser.add_argument("--seed", type=int, help="seed for reproducible generation")
    parser.add_argument(
        "--style", choices=sorted(_STYLES), default="braided", help="maze style"
    )
    parser.add_argument(
        "--braid",
        type=float,
        default=0.15,
        help="chance of opening a dead end in braided mazes (default: 0.15)",
    )
    parser.add_argument(
        "--rooms",
        type=int,
        default=0,
        help="open areas to carve into a braided maze (default: 0)",
    )
    parser.add_argument(
        "--pillar-density",
        type=float,
        default=0.6,
        help="chance of a pillar at each plaza lattice point (default: 0.6)",
    )
    parser.add_argument(
        "--block-density",
        type=float,
        default=0.32,
        help="wall probability in blocks mazes (default: 0.32)",
    )
    parser.add_argument("--output", type=Path, help="write to a file instead of stdout")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """Run the command-line maze generator."""
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        if args.difficulty:
            maze = generate_difficulty(args.difficulty, seed=args.seed)
        else:
            maze = generate_maze(
                args.rows,
                args.columns,
                seed=args.seed,
                style=args.style,
                braid=args.braid,
                rooms=args.rooms,
                pillar_density=args.pillar_density,
                block_density=args.block_density,
            )
    except ValueError as error:
        parser.error(str(error))

    if args.output:
        write_maze(maze, args.output)
    else:
        print(maze_to_text(maze), end="")  # noqa: T201 - printing is the CLI's job
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
