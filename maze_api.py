"""
maze_api.py

This file runs inside Pyodide (Python in the browser) and contains
the "game API" that the user code calls:

    move(), turn_left(), turn_right()
    path_ahead(), path_left(), path_right()
    at_goal()

The actual maze and drawing are handled by JavaScript in maze.js.

Python communicates with JS through a few small helper objects that
Pyodide exposes in the `js` module.
"""

from js import JS_MAZE_GOAL_COL  # JS global: goal column index
from js import JS_MAZE_GOAL_ROW  # JS global: goal row index
from js import JS_MAZE_START_COL  # JS global: starting column index
from js import JS_MAZE_START_ROW  # JS global: starting row index
from js import js_enqueue_action  # JS function: add an action to the animation queue
from js import js_is_wall  # JS function: check if a cell is a wall

# Direction encoding:
#   0 = up, 1 = right, 2 = down, 3 = left
DIRS = [(-1, 0), (0, 1), (1, 0), (0, -1)]

# Internal Python side state for the player.
# JS has its own visual copy; we keep this one for logic checks.
row = int(JS_MAZE_START_ROW)
col = int(JS_MAZE_START_COL)
direction = 1  # facing right by default


def reset_state():
    """
    Reset the Python side player state to the start position.

    maze.js calls this via Pyodide before running a new user program
    and when the user presses the Reset button.
    """
    global row, col, direction
    row = int(JS_MAZE_START_ROW)
    col = int(JS_MAZE_START_COL)
    direction = 1


def _step_forward(r: int, c: int, d: int):
    """
    Pure helper used by several functions.

    Given a position (r, c) and a direction code d, return the
    next cell in that direction.
    """
    dr, dc = DIRS[d]
    return r + dr, c + dc


# ------------- Public game API -------------------------------------


def move():
    """
    Move one cell forward if there is no wall.

    If the next cell is a wall, we raise an error so the user can see
    what went wrong in their program.

    We also enqueue a "move" action so JS can animate it.
    """
    global row, col
    nr, nc = _step_forward(row, col, direction)
    if js_is_wall(nr, nc):
        raise RuntimeError("Tried to move into a wall")
    row, col = nr, nc
    js_enqueue_action("move")


def turn_left():
    """
    Turn 90 degrees left.

    Only the direction changes; the position stays the same.
    We also record a "turnLeft" event so JS can rotate the player arrow.
    """
    global direction
    direction = (direction - 1) % 4
    js_enqueue_action("turnLeft")


def turn_right():
    """
    Turn 90 degrees right.
    """
    global direction
    direction = (direction + 1) % 4
    js_enqueue_action("turnRight")


def path_ahead() -> bool:
    """
    Check if there is free space directly ahead of the player.
    """
    nr, nc = _step_forward(row, col, direction)
    return not js_is_wall(nr, nc)


def path_left() -> bool:
    """
    Check if there is free space to the left of the player.
    """
    d = (direction - 1) % 4
    nr, nc = _step_forward(row, col, d)
    return not js_is_wall(nr, nc)


def path_right() -> bool:
    """
    Check if there is free space to the right of the player.
    """
    d = (direction + 1) % 4
    nr, nc = _step_forward(row, col, d)
    return not js_is_wall(nr, nc)


def at_goal() -> bool:
    """
    Return True if the player is currently on the goal cell.
    """
    return (row == int(JS_MAZE_GOAL_ROW)) and (col == int(JS_MAZE_GOAL_COL))


# ------------- Extra helpers for teaching / experimentation ----------


def turn_around():
    """
    Turn 180 degrees by calling turn_left twice.

    This shows how you can build more complex behaviour from the
    basic game functions.
    """
    turn_left()
    turn_left()


def step_until_wall() -> int:
    """
    Move forward repeatedly until you reach a wall.

    Returns the number of steps taken. This is a nice example of
    using a variable in a loop with the maze API.
    """
    steps = 0
    while path_ahead():
        move()
        steps += 1
    return steps


def follow_right_wall(max_steps: int = 1000):
    """
    Simple right-hand rule maze solver.

    It keeps your right hand on the wall. The max_steps parameter
    prevents an infinite loop if the maze is badly designed.
    """
    steps = 0
    while not at_goal() and steps < max_steps:
        if path_right():
            turn_right()
            move()
        elif path_ahead():
            move()
        else:
            turn_left()
        steps += 1
