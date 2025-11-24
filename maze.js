// maze.js
"use strict";

/*
  This file handles all JavaScript side work:

    * defines the maze layout
    * draws the maze and player on the canvas
    * keeps a queue of actions created by Python
    * animates those actions
    * sets up Pyodide and runs the user's Python program

  All "game logic" (move(), turn_left(), etc.) lives in maze_api.py,
  which calls back into two small JS helpers:
    - js_is_wall(r, c)
    - js_enqueue_action(type)
*/

/* -------------- Maze definition -------------- */

/*
  Maze legend:
    # = wall
    space = corridor
    S = start position
    G = goal position
*/
const maze = [
  "############",
  "#S         #",
  "#   ####   #",
  "#   #      #",
  "#   #   #  #",
  "#   ### #  #",
  "#       #  #",
  "#   #   #  #",
  "#   #   #G #",
  "############"
];

const rows = maze.length;
const cols = maze[0].length;

let startRow = 0, startCol = 0;
let goalRow = 0, goalCol = 0;

/* Find start and goal cells in the maze text map */
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    if (maze[r][c] === "S") {
      startRow = r;
      startCol = c;
    }
    if (maze[r][c] === "G") {
      goalRow = r;
      goalCol = c;
    }
  }
}

/*
  We expose start and goal coordinates to Python through
  global variables on the JS side. Pyodide maps these into Python.
*/
globalThis.JS_MAZE_START_ROW = startRow;
globalThis.JS_MAZE_START_COL = startCol;
globalThis.JS_MAZE_GOAL_ROW = goalRow;
globalThis.JS_MAZE_GOAL_COL = goalCol;

/*
  Directions used for drawing and for updating the visual
  position:

    0 = up, 1 = right, 2 = down, 3 = left
*/
const DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1]
];

/* -------------- Canvas and visual state -------------- */

const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

let cellSize;
let offsetX;
let offsetY;

/*
  Compute how large each cell should be so that the entire maze
  fits inside the canvas and is centred.
*/
function computeGeometry() {
  cellSize = Math.min(canvas.width / cols, canvas.height / rows);
  offsetX = (canvas.width - cols * cellSize) / 2;
  offsetY = (canvas.height - rows * cellSize) / 2;
}
computeGeometry();

/*
  Visual state of the player. This is separate from the logical
  position stored on the Python side.
*/
let visRow, visCol, visDir;

/* Queue of actions emitted by Python, e.g. "move", "turnLeft", "turnRight". */
let actionQueue = [];

/* -------------- Maze helper functions -------------- */

/* Test whether a cell is a wall or outside the maze. */
function isWall(r, c) {
  if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
  return maze[r][c] === "#";
}

/*
  The two functions below are the minimal primitives exported to Python.

  - js_is_wall(r, c): lets Python query the map.
  - js_enqueue_action(type): lets Python add an action that JS will animate later.
*/
globalThis.js_is_wall = isWall;
globalThis.js_enqueue_action = function (type) {
  actionQueue.push({ type });
};

/* Helper to compute one step forward from a given position and direction. */
function stepForward(row, col, dir) {
  const [dr, dc] = DIRS[dir];
  return [row + dr, col + dc];
}

/* Draw the triangular player marker in the current cell. */
function drawPlayer(row, col, dir) {
  const x = offsetX + col * cellSize;
  const y = offsetY + row * cellSize;
  const cx = x + cellSize / 2;
  const cy = y + cellSize / 2;
  const r = cellSize * 0.35;

  ctx.fillStyle = "#1e88e5";
  ctx.beginPath();
  if (dir === 0) {           // up
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.lineTo(cx + r, cy + r);
  } else if (dir === 1) {    // right
    ctx.moveTo(cx + r, cy);
    ctx.lineTo(cx - r, cy - r);
    ctx.lineTo(cx - r, cy + r);
  } else if (dir === 2) {    // down
    ctx.moveTo(cx, cy + r);
    ctx.lineTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy - r);
  } else {                   // left
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy - r);
    ctx.lineTo(cx + r, cy + r);
  }
  ctx.closePath();
  ctx.fill();
}

/* Draw the full maze plus current player position. */
function drawMaze() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = maze[r][c];
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;

      ctx.fillStyle = (ch === "#") ? "#333333" : "#ffffff";
      ctx.fillRect(x, y, cellSize, cellSize);

      // Highlight the goal cell
      if (r === goalRow && c === goalCol) {
        ctx.fillStyle = "#b2f2b2";
        ctx.fillRect(x, y, cellSize, cellSize);
      }

      // Light grid lines
      ctx.strokeStyle = "#aaaaaa";
      ctx.strokeRect(x, y, cellSize, cellSize);
    }
  }

  drawPlayer(visRow, visCol, visDir);
}

/* Reset just the JS visual state, not the Python logic. */
function resetVisualState() {
  visRow = startRow;
  visCol = startCol;
  visDir = 1; // facing right
  actionQueue = [];
  drawMaze();
}

/* Append a line of text to the output text area. */
function appendOutput(text) {
  const output = document.getElementById("output");
  output.value += text + "\n";
  output.scrollTop = output.scrollHeight;
}

/* -------------- Animation of actions -------------- */

/* Simple async sleep function for the animation loop. */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/*
  Animate all actions currently in the queue.

  runId is used so that if the user hits "Run" again we can cancel
  the previous animation by checking that runId is still current.
*/
async function playActions(runId) {
  const speedInput = document.getElementById("speed");
  drawMaze();

  for (const action of actionQueue) {
    if (runId !== runCounter) return; // cancelled

    if (action.type === "move") {
      [visRow, visCol] = stepForward(visRow, visCol, visDir);
    } else if (action.type === "turnLeft") {
      visDir = (visDir + 3) % 4;
    } else if (action.type === "turnRight") {
      visDir = (visDir + 1) % 4;
    }

    drawMaze();
    const delay = parseInt(speedInput.value, 10);
    await sleep(delay);
  }
}

/* -------------- Pyodide setup -------------- */

let pyodide;
let runCounter = 0;

/*
  Create a single Pyodide instance and load maze_api.py into it.
  This promise resolves once Pyodide is fully ready.
*/
const pyodideReadyPromise = (async () => {
  pyodide = await loadPyodide();

  const outputEl = document.getElementById("output");

  // Send Python's stdout and stderr into the output text area
  pyodide.setStdout({
    batched: (msg) => {
      outputEl.value += msg;
      outputEl.scrollTop = outputEl.scrollHeight;
    }
  });
  pyodide.setStderr({
    batched: (msg) => {
      outputEl.value += msg;
      outputEl.scrollTop = outputEl.scrollHeight;
    }
  });

  // Load the Python game API file into the interpreter
  const resp = await fetch("maze_api.py");
  const apiCode = await resp.text();
  await pyodide.runPythonAsync(apiCode);

  return pyodide;
})();

/* -------------- Running the user program -------------- */

async function runProgram() {
  // Wait for Pyodide and maze_api.py to be ready
  await pyodideReadyPromise;

  const code = document.getElementById("code").value;
  const outputEl = document.getElementById("output");
  outputEl.value = "";

  // Increment runCounter so any previous animation loops stop
  runCounter++;
  const thisRun = runCounter;

  // Reset JS visual state
  resetVisualState();

  // Reset Python side game state
  try {
    await pyodide.runPythonAsync("reset_state()");
  } catch (err) {
    appendOutput("Python error in reset_state: " + err);
  }

  // Run the user's Python program
  try {
    await pyodide.runPythonAsync(code);
  } catch (err) {
    appendOutput("Python error: " + err);
  }

  // Animate the recorded actions
  await playActions(thisRun);

  // Ask Python whether the player reached the goal
  let reached = false;
  try {
    reached = pyodide.runPython("at_goal()");
  } catch (err) {
    appendOutput("Python error in at_goal(): " + err);
  }

  if (reached) {
    appendOutput("Reached goal!");
  } else {
    appendOutput("Program finished without reaching goal.");
  }
}

/* -------------- UI wiring and defaults -------------- */

/* Sample program for the text area, using the Python API. */
const defaultCode = `# Example: right-hand rule maze solver
# You can use full Python here (variables, functions, etc.)

while not at_goal():
    if path_right():
        turn_right()
        move()
    elif path_ahead():
        move()
    else:
        turn_left()
`;

// Put the sample program into the text area
document.getElementById("code").value = defaultCode;

// Hook up the Run button
document.getElementById("runBtn").addEventListener("click", () => {
  runProgram();
});

// Reset button clears output and resets both JS and Python state
document.getElementById("resetBtn").addEventListener("click", () => {
  runCounter++;
  document.getElementById("output").value = "";
  resetVisualState();
  pyodideReadyPromise.then(() => pyodide.runPythonAsync("reset_state()"));
});

// Sample button restores the sample code
document.getElementById("sampleBtn").addEventListener("click", () => {
  document.getElementById("code").value = defaultCode;
});

// Initial draw when the page loads
resetVisualState();
