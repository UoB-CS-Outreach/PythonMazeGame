/*
  Maze legend:
    # = wall
    space = corridor
    S = start position
    G = goal position
*/
let maze = [];
let numRows = 0, numCols = 0;
let startRow = 0, startCol = 0;
let goalRow = 0, goalCol = 0;
let shortestRoute = 0;

/*
  Each level names a checked-in maze plus the difficulty the generator should
  build when a fresh layout is requested. The structure of each difficulty
  (size, loops, dead ends, open rooms) lives in maze_generator.py so that the
  game and the tests agree on what "hard" means.
*/
const MAZE_LEVELS = {
    tutorial: {
        label: "Tutorial maze",
        url: "mazes/default.txt",
        difficulty: "easy",
    },
    easy: {
        label: "Easy",
        url: "mazes/easy_winding.txt",
        difficulty: "easy",
    },
    medium: {
        label: "Medium",
        url: "mazes/medium_crossroads.txt",
        difficulty: "medium",
    },
    hard: {
        label: "Hard",
        url: "mazes/hard_switchbacks.txt",
        difficulty: "hard",
    },
    expert: {
        label: "Expert",
        url: "mazes/expert_archipelago.txt",
        difficulty: "expert",
    },
    plaza: {
        label: "Plaza",
        url: "mazes/plaza_pillars.txt",
        difficulty: "plaza",
    },
    marathon: {
        label: "Marathon",
        url: "mazes/marathon_sprawl.txt",
        difficulty: "marathon",
    },
};

let currentMazeLevel = "tutorial";

function parseMazeText(text) {
    return text
        .split(/\r?\n/)
        .filter(line => line.length > 0);
}

function validateMaze(nextMaze) {
    if (nextMaze.length === 0 || nextMaze[0].length === 0) {
        throw new Error("Maze is empty");
    }

    const columns = nextMaze[0].length;
    if (nextMaze.some(line => line.length !== columns)) {
        throw new Error("Maze rows must all have the same length");
    }

    const allowed = new Set(["#", ".", " ", "S", "G"]);
    const starts = [];
    const goals = [];

    nextMaze.forEach((line, row) => {
        Array.from(line).forEach((character, column) => {
            if (!allowed.has(character)) {
                throw new Error(`Unsupported maze character: ${character}`);
            }
            if (character === "S") starts.push([row, column]);
            if (character === "G") goals.push([row, column]);
        });
    });

    if (starts.length !== 1 || goals.length !== 1) {
        throw new Error("Maze must contain exactly one start and one goal");
    }

    const [start] = starts;
    const [goal] = goals;
    const queue = [start];
    const visited = new Set([start.join(",")]);
    // Distances double as the shortest possible number of moves, which the
    // run summary compares the learner's own move count against.
    const distance = new Map([[start.join(","), 0]]);

    for (let index = 0; index < queue.length; index++) {
        const [row, column] = queue[index];
        if (row === goal[0] && column === goal[1]) {
            return {start, goal, shortest: distance.get(`${row},${column}`)};
        }

        for (const [rowDelta, columnDelta] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
            const nextRow = row + rowDelta;
            const nextColumn = column + columnDelta;
            const key = `${nextRow},${nextColumn}`;
            if (
                nextRow >= 0 && nextRow < nextMaze.length &&
                nextColumn >= 0 && nextColumn < columns &&
                nextMaze[nextRow][nextColumn] !== "#" &&
                !visited.has(key)
            ) {
                visited.add(key);
                distance.set(key, distance.get(`${row},${column}`) + 1);
                queue.push([nextRow, nextColumn]);
            }
        }
    }

    throw new Error("Maze has no route from start to goal");
}

function applyMaze(nextMaze) {
    const {start, goal, shortest} = validateMaze(nextMaze);
    maze = nextMaze;
    numRows = maze.length;
    numCols = maze[0].length;
    [startRow, startCol] = start;
    [goalRow, goalCol] = goal;
    shortestRoute = shortest;

    // Expose maze data to Python.
    globalThis.JS_MAZE = maze;
    globalThis.JS_MAZE_NUM_ROWS = numRows;
    globalThis.JS_MAZE_NUM_COLS = numCols;
    globalThis.JS_MAZE_START_ROW = startRow;
    globalThis.JS_MAZE_START_COL = startCol;
    globalThis.JS_MAZE_GOAL_ROW = goalRow;
    globalThis.JS_MAZE_GOAL_COL = goalCol;
}

/* Load a maze definition from a text file. */
async function fetchMaze(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to load maze from ${url}: ${res.status} ${res.statusText}`);
    }

    return parseMazeText(await res.text());
}

applyMaze(await fetchMaze(MAZE_LEVELS.tutorial.url));

/*
  Directions used for drawing and for updating the visual
  position: 0 = up, 1 = right, 2 = down, 3 = left
*/
const DIRS = [
    [-1, 0],
    [0, 1],
    [1, 0],
    [0, -1]
];

const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");

/*
  The maze fills whatever width its panel offers, so a wide screen shows a
  large maze rather than shrinking the harder, bigger layouts into a corner.
  A cap stops the small tutorial maze from becoming comically large.
*/
const MAX_CELL_SIZE = 44;
/* Roughly the height of the panel's heading, controls and status line. */
const MAZE_PANEL_CHROME_HEIGHT = 300;

let cellSize;
let offsetX = 0;
let offsetY = 0;
let canvasWidth = 0;
let canvasHeight = 0;

/* Width the maze may occupy, inside its stage's padding. */
function availableMazeWidth() {
    const stage = canvas.parentElement;
    const styles = getComputedStyle(stage);
    const padding =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    return Math.max(200, stage.clientWidth - padding);
}

function updateMazeGeometry() {
    // Keep the whole maze panel inside the window where possible, so on a
    // wide screen the maze and the editor can be read side by side.
    const maxHeight = Math.max(
        260,
        Math.min(window.innerHeight - MAZE_PANEL_CHROME_HEIGHT, 780),
    );
    cellSize = Math.min(
        availableMazeWidth() / numCols,
        maxHeight / numRows,
        MAX_CELL_SIZE,
    );

    canvasWidth = numCols * cellSize;
    canvasHeight = numRows * cellSize;

    // Draw at device resolution so the grid lines stay crisp, then work in
    // CSS pixels everywhere else. Resizing a canvas resets its context, so
    // the scale transform has to be reapplied here.
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    canvas.width = Math.max(1, Math.round(canvasWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(canvasHeight * pixelRatio));
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

updateMazeGeometry();

/* Follow panel resizes, including the switch between one and two columns. */
let lastMazeWidth = Math.round(availableMazeWidth());

function refitMaze() {
    updateMazeGeometry();
    if (visRow !== undefined) drawMaze();
}

if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
        const width = Math.round(availableMazeWidth());
        if (width === lastMazeWidth) return;
        lastMazeWidth = width;
        refitMaze();
    }).observe(canvas.parentElement);
}

// The window's height also limits the maze, and it can change without the
// panel's width changing at all. This also covers browsers where the
// observer above is unavailable, since the panel only reflows with the
// window in practice.
window.addEventListener("resize", refitMaze);

// Fonts and the panel's own borders can settle after this module first runs,
// so measure once more when the page has finished loading.
window.addEventListener("load", refitMaze);
requestAnimationFrame(refitMaze);

/*
  Visual state of the player. This is separate from the logical
  position stored on the Python side.
*/
let visRow, visCol, visDir;

/*
  Everything a run produces, in the order the program produced it: moves and
  turns to animate, lines it printed, and in blocks mode the block that was
  about to run. Playing back one queue keeps the three in step, so a print()
  appears when the triangle gets there rather than before it has moved.
*/
let actionQueue = [];
const MOVEMENT = new Set(["move", "turnLeft", "turnRight"]);

/* Lets Python add an action that JS will play back later. */
globalThis.js_enqueue_action = function (type) {
    if (type.startsWith("highlight:")) {
        actionQueue.push({type: "highlight", id: type.slice("highlight:".length)});
    } else {
        actionQueue.push({type});
    }
};

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
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Grid lines help pupils count squares, but on the biggest mazes they
    // crowd the passages, so they are dropped once cells get small.
    const showGrid = cellSize >= 11;

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const ch = maze[r][c];
            const x = offsetX + c * cellSize;
            const y = offsetY + r * cellSize;

            ctx.fillStyle = (ch === "#") ? "#243b57" : "#ffffff";
            ctx.fillRect(x, y, cellSize, cellSize);

            // Highlight the goal cell
            if (r === goalRow && c === goalCol) {
                ctx.fillStyle = goalPulseOn ? "#33d6a6" : "#b6f0da";
                ctx.fillRect(x, y, cellSize, cellSize);
            }

            if (showGrid && ch !== "#") {
                ctx.strokeStyle = "#e4eaf1";
                ctx.strokeRect(x, y, cellSize, cellSize);
            }
        }
    }

    drawPlayer(visRow, visCol, visDir);
}

/*
  Flash the goal a few times when the maze is solved. Reaching the goal is
  the whole point of the activity, so it should be visibly rewarded rather
  than only reported as a line of text.
*/
let goalPulseOn = false;

async function celebrateGoal(runId) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    for (let pulse = 0; pulse < 3; pulse++) {
        if (runId !== runCounter) break;
        goalPulseOn = true;
        drawMaze();
        await sleep(150);
        goalPulseOn = false;
        drawMaze();
        await sleep(130);
    }

    goalPulseOn = false;
    if (runId === runCounter) drawMaze();
}

/* Reset just the JS visual state, not the Python logic. */
function resetVisualState() {
    visRow = startRow;
    visCol = startCol;
    visDir = 1;
    actionQueue = [];
    hideMazeNotice();
    drawMaze();
}

/*
  Printed output. While a program runs, each line joins the action queue and
  is shown when the animation reaches it. Anything printed outside a run is
  collected and written in one go. Writing each line straight into the text
  area cost the browser a layout per line: a loop that printed froze the page
  until the five-second limit cut it off. The cap keeps the panel readable
  when a loop prints thousands of lines.
*/
const MAX_OUTPUT_LINES = 1000;
let collectingRunOutput = false;
let pendingOutput = "";
let outputLines = 0;
let hiddenOutputLines = 0;
let outputFlushScheduled = false;

function writePythonOutput(message) {
    let text = message.replace(/\r/g, "");
    if (!text.endsWith("\n")) text += "\n";

    if (outputLines >= MAX_OUTPUT_LINES) {
        hiddenOutputLines++;
        return;
    }
    outputLines++;

    if (collectingRunOutput) {
        actionQueue.push({type: "output", text});
        return;
    }

    pendingOutput += text;
    if (!outputFlushScheduled) {
        outputFlushScheduled = true;
        setTimeout(flushOutput, 0);
    }
}

/* Add text to the end of the Output panel and keep it scrolled down. */
function writeOutputText(text) {
    const output = document.getElementById("output");
    output.value += text;
    output.scrollTop = output.scrollHeight;
}

function flushOutput() {
    outputFlushScheduled = false;
    if (!pendingOutput) return;

    writeOutputText(pendingOutput);
    pendingOutput = "";
}

function clearOutput() {
    pendingOutput = "";
    outputLines = 0;
    hiddenOutputLines = 0;
    document.getElementById("output").value = "";
}

/* Append a line of text to the output text area. */
function appendOutput(text) {
    flushOutput();
    writeOutputText(text + "\n");
}

/*
  A short explanation laid over the maze, at the top or the bottom, whichever
  is further from avoidRow: the notice is about what the triangle is doing,
  so it must not sit on top of the triangle doing it.
*/
function showMazeNotice(title, text, avoidRow) {
    const notice = document.getElementById("mazeNotice");
    document.getElementById("mazeNoticeTitle").textContent = title;
    document.getElementById("mazeNoticeText").textContent = text;
    notice.dataset.place = avoidRow < numRows / 2 ? "bottom" : "top";
    notice.hidden = false;
}

function hideMazeNotice() {
    document.getElementById("mazeNotice").hidden = true;
}

/* Simple async sleep function for the animation loop. */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* Helper to compute one step forward from a given position and direction. */
function stepForward(row, col, dir) {
    const [dr, dc] = DIRS[dir];
    return [row + dr, col + dc];
}

/*
  A program stopped for running too long has almost always spent most of its
  run going round one loop, and replaying every recorded action took up to
  half an hour at the default speed. So the replay shows the way into
  the loop and a few laps of it, at least two and at least three seconds'
  worth so a quick spin still registers, then stops at the end of a lap.
*/
const MIN_LOOP_LAPS = 2;
const MIN_LOOP_MS = 3000;

/*
  With no loop to show, this many moves and turns are enough to see what it
  did: about ten seconds at the default speed.
*/
const STUCK_REPLAY_WITHOUT_LOOP = 400;

/*
  Where the triangle starts repeating itself, as {start, period} counted in
  queue entries plus the average row of one lap, or null. Only the triangle's
  square and facing are compared, not the program's variables, but a program
  that was stopped for running too long and has made the same moves for its
  last three laps is not about to do anything else.
*/
function findRepeatingTail(actions) {
    const count = actions.length;
    const poses = new Int32Array(count + 1);
    let row = startRow;
    let col = startCol;
    let dir = 1;
    poses[0] = (row * numCols + col) * 4 + dir;

    for (let index = 0; index < count; index++) {
        const type = actions[index];
        if (type === "move") {
            [row, col] = stepForward(row, col, dir);
        } else if (type === "turnLeft") {
            dir = (dir + 3) % 4;
        } else if (type === "turnRight") {
            dir = (dir + 1) % 4;
        }
        poses[index + 1] = (row * numCols + col) * 4 + dir;
    }

    // Try the shortest laps first. Comparing from the end means a wrong
    // length usually fails within a comparison or two.
    for (let period = 1; period * 3 <= count; period++) {
        let matching = 0;
        while (
            matching < period * 2 &&
            poses[count - matching] === poses[count - matching - period]
        ) {
            matching++;
        }
        if (matching < period * 2) continue;

        // Three laps agree, so walk back to where the repeating began.
        while (
            count - matching >= period &&
            poses[count - matching] === poses[count - matching - period]
        ) {
            matching++;
        }
        const start = count - matching + 1 - period;

        let rowTotal = 0;
        for (let index = start; index < start + period; index++) {
            rowTotal += Math.floor(poses[index] / 4 / numCols);
        }
        return {start, period, meanRow: rowTotal / period};
    }
    return null;
}

/*
  What to replay of a stuck run, and what to say about it. actions is the
  type of every queue entry, so printed lines and block highlights are in it
  too; only moves and turns decide what the triangle was doing.
*/
function planStuckReplay(actions) {
    const loop = findRepeatingTail(actions);
    const lap = loop ? actions.slice(loop.start, loop.start + loop.period) : [];

    if (lap.some(type => MOVEMENT.has(type))) {
        const onTheSpot = !lap.includes("move");
        return {
            end: actions.length,
            noticeAt: loop.start,
            loop,
            avoidRow: loop.meanRow,
            title: "Stuck in a loop",
            text: onTheSpot
                ? "The triangle keeps turning on the spot, so Python stopped " +
                  "the program."
                : "The triangle keeps going round the same route, so Python " +
                  "stopped the program.",
        };
    }

    // Stop after the first few hundred moves and turns.
    let end = 0;
    let movements = 0;
    while (end < actions.length && movements < STUCK_REPLAY_WITHOUT_LOOP) {
        if (MOVEMENT.has(actions[end])) movements++;
        end++;
    }

    return {
        end,
        noticeAt: 0,
        loop: null,
        avoidRow: startRow,
        title: "Program stopped",
        text: movements === 0
            ? "It ran for too long without moving the triangle, so Python " +
              "stopped it. Check for a loop that never ends."
            : "It ran for too long, so Python stopped it. Check for a loop " +
              "that never ends.",
    };
}

/*
  Play back the queue, or for a stuck run, the part of it that stuckReplay
  picks out. Moves and turns take time; printed lines and block highlights
  happen instantly alongside the next move. Returns how far it got, or null
  if a newer run or a reset cancelled it.

  runId is used so that if the user hits "Run" again we can cancel
  the previous animation by checking that runId is still current.
*/
async function playActions(runId, stuckReplay = null) {
    const speedInput = document.getElementById("speed");
    const actionCount = stuckReplay ? stuckReplay.end : actionQueue.length;
    const movementCount = actionQueue
        .slice(0, actionCount)
        .filter(action => MOVEMENT.has(action.type)).length;
    const loop = stuckReplay?.loop;
    drawMaze();

    let index = 0;
    let end = actionCount;
    let noticeShownAt = null;

    while (index < end) {
        if (runId !== runCounter) return null; // cancelled

        if (stuckReplay && noticeShownAt === null && index >= stuckReplay.noticeAt) {
            showMazeNotice(stuckReplay.title, stuckReplay.text, stuckReplay.avoidRow);
            noticeShownAt = performance.now();
        }

        // Once enough of the loop has been seen, finish the lap in progress.
        if (loop && end === actionCount) {
            const played = index - loop.start;
            if (
                played >= loop.period * MIN_LOOP_LAPS &&
                performance.now() - noticeShownAt >= MIN_LOOP_MS
            ) {
                const lapEnd = loop.start + Math.ceil(played / loop.period) * loop.period;
                end = Math.min(actionCount, lapEnd);
                if (index >= end) break;
            }
        }

        // Re-read the slider every frame, so dragging it changes the pace of
        // a run already in progress rather than only the next one.
        const rate = actionsPerSecond(speedInput, movementCount);
        const actionsThisFrame = Math.max(
            1,
            Math.round(rate / MAX_FRAMES_PER_SECOND),
        );

        let printed = "";
        let highlight = null;
        for (let step = 0; step < actionsThisFrame && index < end; index++) {
            const action = actionQueue[index];
            if (action.type === "move") {
                [visRow, visCol] = stepForward(visRow, visCol, visDir);
                step++;
            } else if (action.type === "turnLeft") {
                visDir = (visDir + 3) % 4;
                step++;
            } else if (action.type === "turnRight") {
                visDir = (visDir + 1) % 4;
                step++;
            } else if (action.type === "output") {
                printed += action.text;
            } else if (action.type === "highlight") {
                highlight = action.id;
            }
        }

        // One write per frame, however many lines a loop printed in it.
        if (printed) writeOutputText(printed);
        if (highlight !== null) globalThis.mazeBlocks?.highlight(highlight);
        drawMaze();
        await sleep((1000 * actionsThisFrame) / rate);
    }

    // A program that never moved has nothing to replay, but still needs the
    // explanation.
    if (stuckReplay && noticeShownAt === null) {
        showMazeNotice(stuckReplay.title, stuckReplay.text, stuckReplay.avoidRow);
    }
    return index;
}

let pyodide;
let pythonReady = false;
let runCounter = 0;
let tutorialAnimationActive = false;

/*
  The speed slider sets a pace in actions per second rather than a delay per
  action, so it stays meaningful whether a program makes five moves or five
  thousand. The scale is geometric: the slow end has fine control for watching
  a single decision, and the fast end is quick enough to sit through a solver
  circling a loop 2,000 times.
*/
const SLOWEST_ACTIONS_PER_SECOND = 2;
const FASTEST_ACTIONS_PER_SECOND = 800;

/* Beyond this, several actions are applied per drawn frame instead. */
const MAX_FRAMES_PER_SECOND = 60;

/* A tutorial example is a few moves long and is meant to be followed. */
const TUTORIAL_ACTIONS_PER_SECOND = 1.5;
const TUTORIAL_SHORT_RUN = 40;

function actionsPerSecond(speedInput, actionCount) {
    const raw = parseInt(speedInput.value, 10);
    const min = parseInt(speedInput.min, 10);
    const max = parseInt(speedInput.max, 10);
    const fraction = (raw - min) / Math.max(1, max - min);
    const rate =
        SLOWEST_ACTIONS_PER_SECOND *
        (FASTEST_ACTIONS_PER_SECOND / SLOWEST_ACTIONS_PER_SECOND) ** fraction;

    if (tutorialAnimationActive && actionCount <= TUTORIAL_SHORT_RUN) {
        return Math.min(rate, TUTORIAL_ACTIONS_PER_SECOND);
    }
    return rate;
}

/*
  Create a single Pyodide instance and load maze.py into it.
  This promise resolves once Pyodide is fully ready.
*/
const pyodideReadyPromise = (async () => {
    pyodide = await loadPyodide();

    // Send Python's stdout and stderr into the output text area
    pyodide.setStdout({batched: writePythonOutput});
    pyodide.setStderr({batched: writePythonOutput});

    // Load the Python game API and generator into the interpreter.
    const [apiResponse, generatorResponse] = await Promise.all([
        fetch(`maze.py?v=${Date.now()}`, {cache: "no-store"}),
        fetch(`maze_generator.py?v=${Date.now()}`, {cache: "no-store"}),
    ]);
    if (!apiResponse.ok) {
        throw new Error(`Failed to load maze.py: ${apiResponse.status}`);
    }
    if (!generatorResponse.ok) {
        throw new Error(`Failed to load maze_generator.py: ${generatorResponse.status}`);
    }

    // Compiled under its own file name rather than Pyodide's default "<exec>",
    // which it would otherwise share with the learner's program: tracebacks
    // and the step counter both tell the two apart by file name.
    pyodide.globals.set("PMG_API_SOURCE", await apiResponse.text());
    await pyodide.runPythonAsync(
        'exec(compile(PMG_API_SOURCE, "maze.py", "exec"), globals())',
    );

    const generatorCode = await generatorResponse.text();
    pyodide.globals.set("PMG_GENERATOR_SOURCE", generatorCode);
    await pyodide.runPythonAsync(`
import types as _pmg_types
PMG_MAZE_GENERATOR = _pmg_types.ModuleType("maze_generator")
exec(
    compile(PMG_GENERATOR_SOURCE, "maze_generator.py", "exec"),
    PMG_MAZE_GENERATOR.__dict__,
)
`);

    pythonReady = true;
    document.getElementById("runBtn").textContent = "Run program";
    setMazeChangeInProgress(false);
    setMazeStatus("");
    document.dispatchEvent(new CustomEvent("maze:ready"));

    return pyodide;
})();

pyodideReadyPromise.catch(error => {
    pythonReady = false;
    setMazeChangeInProgress(false);
    setMazeStatus("The Python runtime could not be loaded. Refresh the page to try again.", true);
    appendOutput(`Unable to start Python: ${error}`);
});

let mazeChangeCounter = 0;

/*
  One short line under the maze controls. It is deliberately quiet: it speaks
  while something is loading, when something goes wrong, and when a tutorial
  or challenge needs to say what to do next. Routine successes say nothing,
  because the maze and the Output panel already show them.
*/
function setMazeStatus(message, isError = false) {
    const mazeStatus = document.getElementById("mazeStatus");
    mazeStatus.textContent = message;
    mazeStatus.classList.toggle("error", isError);
}

function setMazeControlsEnabled(enabled) {
    document.getElementById("mazeSelect").disabled = !enabled;
    document.getElementById("generateMazeBtn").disabled = !enabled;
}

function setMazeChangeInProgress(inProgress) {
    const controlsEnabled = pythonReady && !inProgress;
    setMazeControlsEnabled(controlsEnabled);
    document.getElementById("runBtn").disabled = !controlsEnabled;
    document.getElementById("resetBtn").disabled = !controlsEnabled;
}

async function activateMaze(nextMaze, level) {
    applyMaze(nextMaze);
    currentMazeLevel = level;
    document.getElementById("mazeSelect").value = level;

    runCounter++;
    updateMazeGeometry();
    resetVisualState();
    clearOutput();
    await pyodide.runPythonAsync("_sync_maze_from_js()");

    setMazeStatus("");
    document.dispatchEvent(new CustomEvent("maze:changed", {
        detail: {
            level,
            rows: numRows,
            columns: numCols,
            start: [startRow, startCol],
            goal: [goalRow, goalCol],
        }
    }));
}

async function loadPresetMaze(level) {
    const config = MAZE_LEVELS[level];
    if (!config) return;

    const changeId = ++mazeChangeCounter;
    setMazeChangeInProgress(true);
    setMazeStatus(`Loading ${config.label.toLowerCase()}…`);

    try {
        const [nextMaze] = await Promise.all([
            fetchMaze(config.url),
            pyodideReadyPromise,
        ]);
        if (changeId !== mazeChangeCounter) return;

        await activateMaze(nextMaze, level);
    } catch (error) {
        if (changeId !== mazeChangeCounter) return;
        setMazeStatus(`Could not load ${config.label.toLowerCase()}.`, true);
        appendOutput(String(error));
    } finally {
        if (changeId === mazeChangeCounter) setMazeChangeInProgress(false);
    }
}

async function generateNewMaze(level = currentMazeLevel) {
    const generatedLevel = level === "tutorial" ? "easy" : level;
    const config = MAZE_LEVELS[generatedLevel];
    if (!config) return;

    const changeId = ++mazeChangeCounter;
    setMazeChangeInProgress(true);
    setMazeStatus(`Generating a new ${config.label.toLowerCase()} maze…`);

    try {
        await pyodideReadyPromise;
        if (changeId !== mazeChangeCounter) return;

        pyodide.globals.set("PMG_GENERATED_DIFFICULTY", config.difficulty);
        const generatedText = await pyodide.runPythonAsync(`
PMG_MAZE_GENERATOR.maze_to_text(
    PMG_MAZE_GENERATOR.generate_difficulty(PMG_GENERATED_DIFFICULTY)
)
`);
        if (changeId !== mazeChangeCounter) return;

        await activateMaze(parseMazeText(String(generatedText)), generatedLevel);
    } catch (error) {
        if (changeId !== mazeChangeCounter) return;
        setMazeStatus("Could not generate a new maze.", true);
        appendOutput(String(error));
    } finally {
        if (changeId === mazeChangeCounter) setMazeChangeInProgress(false);
    }
}

/*
  Blocks mode reports the last line of an error in plain words. A traceback
  of generated Python means nothing to someone who never saw the Python,
  and the block that failed stays highlighted to show where it went wrong.
*/
function describeErrorForBlocks(error) {
    const lastLine = error.trim().split("\n").pop();
    if (/^RuntimeError: (Wall ahead|Can't move)/.test(lastLine)) {
        return "The triangle walked into a wall. The highlighted block is the " +
            "move that hit it.";
    }
    if (lastLine.startsWith("StepLimitError")) {
        return "The code blocks were still running after a long time, so " +
            "Python stopped them.";
    }
    return lastLine;
}

async function runProgram() {
    // Wait for Pyodide and maze.py to be ready
    await pyodideReadyPromise;

    /*
      Blocks mode runs a version of its Python that marks each block as it
      starts, and reports the plain version, which is what the learner gets
      if they convert their blocks.
    */
    const blocksMode = programMode === "blocks";
    const blocks = blocksMode ? globalThis.mazeBlocks : null;
    const code = blocksMode
        ? (blocks?.python() ?? "")
        : document.getElementById("code").value;
    const runnableCode = blocks ? blocks.python({highlight: true}) : code;
    clearOutput();
    blocks?.clearHighlight();

    // Increment runCounter so any previous animation loops stop
    runCounter++;
    const thisRun = runCounter;
    document.dispatchEvent(new CustomEvent("maze:run-start", {
        detail: {runId: thisRun}
    }));

    // Reset JS visual state
    resetVisualState();

    let hadError = false;

    // Reset Python side game state
    try {
        await pyodide.runPythonAsync("reset_state()");
    } catch (err) {
        hadError = true;
        appendOutput("Python error in reset_state(): " + err);
    }

    // Run the user's Python program
    let result;
    try {
        /*
          The budget exists to stop infinite loops, not to cap how big a maze
          may be. The memory solver in tests/ runs at most 23,975 lines of its
          own on a Marathon maze, and Python spends only milliseconds on that,
          so the limit sits well clear of it. A program going round in
          circles still hits the limit in a fraction of a second, and its
          replay is cut short by planStuckReplay().
        */
        pyodide.globals.set("PMG_SRC", runnableCode);
        pyodide.globals.set("PMG_MAX_SECONDS", 5);
        pyodide.globals.set("PMG_MAX_STEPS", 250000);

        collectingRunOutput = true;
        result = JSON.parse(String(await pyodide.runPythonAsync(
            "run_program(PMG_SRC, PMG_MAX_SECONDS, PMG_MAX_STEPS)",
        )));
    } catch (err) {
        // Only the game itself failing ends up here. Errors in the learner's
        // program come back in the result, already trimmed to their code.
        result = {error: formatPyodideError(err), stuck: false};
    } finally {
        collectingRunOutput = false;
    }
    if (result.error) hadError = true;

    const actionTypes = actionQueue.map(action => action.type);
    const movementTypes = actionTypes.filter(type => MOVEMENT.has(type));

    // Animate the recorded actions
    const playedTo = await playActions(
        thisRun,
        result.stuck ? planStuckReplay(actionTypes) : null,
    );

    // A newer run or reset has replaced this one.
    if (thisRun !== runCounter) return;

    // A stuck run's replay stops early, and the lines it did not reach were
    // never shown either.
    const unshownLines = hiddenOutputLines + actionQueue
        .slice(playedTo)
        .filter(action => action.type === "output").length;
    if (unshownLines > 0) {
        appendOutput(`(${unshownLines.toLocaleString()} more printed lines not shown)`);
    }
    // The error arrives when the triangle does, not before it has moved.
    if (result.error) {
        appendOutput(blocksMode ? describeErrorForBlocks(result.error) : result.error);
    } else {
        blocks?.clearHighlight();
    }

    // Ask Python whether the player reached the goal
    let reached = false;
    try {
        reached = pyodide.runPython("at_goal()");
    } catch (err) {
        hadError = true;
        appendOutput("Python error in at_goal(): " + err);
    }

    if (reached) {
        const moves = movementTypes.filter(type => type === "move").length;
        appendOutput(
            `Reached the goal in ${moves} moves. ` +
            `The shortest route is ${shortestRoute}.`,
        );
    } else if (!hadError && !tutorialAnimationActive) {
        // Tutorial examples stop short of the goal on purpose, and the
        // tutorial card already says whether the run did what it asked.
        appendOutput("Program finished without reaching goal.");
    }

    // Reported before the celebration so the tutorial unlocks immediately.
    document.dispatchEvent(new CustomEvent("maze:run-complete", {
        detail: {
            runId: thisRun,
            reached,
            hadError,
            stuck: result.stuck,
            actions: movementTypes,
            code,
            mode: programMode,
        }
    }));

    if (!reached) return;
    await celebrateGoal(thisRun);

    // After the celebration, so anything offered next does not cover it.
    if (thisRun === runCounter) {
        document.dispatchEvent(new CustomEvent("maze:goal-reached", {
            detail: {mode: programMode},
        }));
    }
}

/*
  The small window offered after reaching the goal, with one suggested next
  step. Resolves true if the learner takes it.
*/
function showGoalDialog({title, text, action}) {
    const dialog = document.getElementById("goalDialog");
    if (dialog.open) return Promise.resolve(false);

    document.getElementById("goalDialogTitle").textContent = title;
    document.getElementById("goalDialogText").textContent = text;
    const actionButton = document.getElementById("goalDialogAction");
    const laterButton = document.getElementById("goalDialogLater");
    actionButton.textContent = action;

    return new Promise(resolve => {
        function finish(accepted) {
            actionButton.onclick = null;
            laterButton.onclick = null;
            dialog.oncancel = null;
            dialog.close();
            resolve(accepted);
        }

        actionButton.onclick = () => finish(true);
        laterButton.onclick = () => finish(false);
        dialog.oncancel = event => {
            event.preventDefault();
            finish(false);
        };
        dialog.showModal();
        actionButton.focus();
    });
}

function formatPyodideError(err) {
    let msg = String(err);

    msg = msg.replace(/^PythonError:\s*/, "");

    const lines = msg.split("\n");

    const execIdx = lines.findIndex(l => l.includes('File "<exec>"'));

    if (execIdx !== -1) {
        return lines.slice(execIdx).join("\n").trim();
    }

    const filtered = lines.filter(l =>
        !l.includes("/_pyodide/") &&
        !l.includes("python312.zip") &&
        !l.includes("_pyodide")
    );

    return filtered.join("\n").trim();
}


/* UI wiring and defaults */

const initialCodeBox = document.getElementById("code");
if (!initialCodeBox.value.trim()) {
    initialCodeBox.value = `# Enter your python code here`;
}

// Run button
document.getElementById("runBtn").addEventListener("click", () => {
    runProgram();
});

// Reset button clears output and resets both JS and Python state
document.getElementById("resetBtn").addEventListener("click", () => {
    runCounter++;
    clearOutput();
    resetVisualState();
    globalThis.mazeBlocks?.clearHighlight();
    pyodideReadyPromise.then(() => pyodide.runPythonAsync("reset_state()"));
});

/*
  Blocks or Python. The mode lives on <html data-mode>, so the stylesheet
  shows one editor and hides the other, and other scripts hear about a change
  through a "maze:mode" event. Both programs are kept when switching, and the
  maze stays as it is: the mazes are the same in both modes.
*/
let programMode = document.documentElement.dataset.mode === "blocks"
    ? "blocks"
    : "python";

function showProgramMode() {
    document.documentElement.dataset.mode = programMode;
    document.querySelectorAll("#modeSwitch [data-mode]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.mode === programMode));
    });
}

function setProgramMode(mode) {
    if (mode !== "blocks" && mode !== "python") return;
    if (mode === programMode) return;

    programMode = mode;
    showProgramMode();

    // A different program is now in charge, so stop the old one's animation.
    runCounter++;
    clearOutput();
    resetVisualState();
    document.dispatchEvent(new CustomEvent("maze:mode", {detail: {mode}}));
}

showProgramMode();
document.querySelectorAll("#modeSwitch [data-mode]").forEach(button => {
    button.addEventListener("click", () => setProgramMode(button.dataset.mode));
});

/*
  Put a whole program into the Python editor, for Load sample and for
  converting blocks. Replacing work in progress needs a confirmation, but an
  empty or untouched editor does not, and a browser confirm() dialog in the
  middle of a short activity is worth avoiding. Returns whether it replaced.
*/
function replaceEditorProgram(text, question) {
    const code = document.getElementById("code");
    const written = code.value.trim();
    const untouched = written === "" ||
        written === "# Enter your python code here" ||
        written === text.trim();

    if (!untouched && !window.confirm(question)) return false;

    code.value = text;
    code.dispatchEvent(new Event("input")); // refresh line numbers
    return true;
}

document.getElementById("sampleBtn").addEventListener("click", async () => {
    const response = await fetch("samples/default.txt");
    const sample = await response.text();
    if (replaceEditorProgram(sample, "Replace your code with the sample solver?")) {
        document.getElementById("code").focus();
    }
});

document.getElementById("mazeSelect").addEventListener("change", event => {
    loadPresetMaze(event.target.value);
});

document.getElementById("generateMazeBtn").addEventListener("click", () => {
    generateNewMaze();
});

// Tutorials always use the known fixed maze. It stays loaded afterward so the
// learner can choose when and how to move on to another maze. Each tutorial
// also belongs to one mode, blocks or Python.
document.addEventListener("tutorial:start", event => {
    tutorialAnimationActive = true;
    setProgramMode(event.detail?.programMode || "python");
    if (currentMazeLevel !== "tutorial") loadPresetMaze("tutorial");
});

document.addEventListener("tutorial:end", () => {
    tutorialAnimationActive = false;
});

document.addEventListener("tutorial:complete", async () => {
    if (currentMazeLevel !== "tutorial") {
        await loadPresetMaze("tutorial");
    }
});

/*
  Small bridge for other scripts on the page (this file is a module, so
  pyodide itself is not global). Anything that needs to run Python or swap the
  displayed maze should go through here rather than reaching into maze.js.
*/
globalThis.mazeGame = {
    loadPreset: loadPresetMaze,
    generate: generateNewMaze,

    /* Resolves once Pyodide, maze.py and the generator are all loaded. */
    ready: () => pyodideReadyPromise,

    /* Run a snippet of Python and return its value. */
    runPython: async source => {
        await pyodideReadyPromise;
        return pyodide.runPythonAsync(source);
    },

    /* Set a Python global, for passing values in before runPython(). */
    setGlobal: async (name, value) => {
        await pyodideReadyPromise;
        pyodide.globals.set(name, value);
    },

    /* Display an arbitrary maze, e.g. one that a challenge run failed on. */
    loadMazeText: async (text, level, description) => {
        await pyodideReadyPromise;
        await activateMaze(parseMazeText(String(text)), level);
        if (description) setMazeStatus(description);
    },

    /* Disable the run and maze controls while a long task is in progress. */
    setBusy: inProgress => setMazeChangeInProgress(inProgress),

    /* The program in use: the Python editor's, or the code blocks' as Python. */
    getCode: () => (programMode === "blocks"
        ? (globalThis.mazeBlocks?.python() ?? "")
        : document.getElementById("code").value),

    /* Replace the Python editor's contents, asking first if it holds work. */
    replaceCode: replaceEditorProgram,

    /* "blocks" or "python", and switching between them. */
    getMode: () => programMode,
    setMode: setProgramMode,

    /* Offer one next step after the goal; resolves true if it is taken. */
    showGoalDialog,

    /* Status line under the maze controls. */
    setStatus: (message, isError = false) => setMazeStatus(message, isError),
};

// Initial draw when the page loads
resetVisualState();

/*  Simple JS tabs for the help panel */

function initHelpTabs() {
    const tabs = document.getElementById("help-tabs");
    if (!tabs) return;

    const buttons = tabs.querySelectorAll(".tabs-nav button");
    const panes = tabs.querySelectorAll(".tab-pane");

    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;

            // update button active state
            buttons.forEach((b) => {
                b.classList.toggle("active", b === btn);
            });

            // show matching pane
            panes.forEach((pane) => {
                pane.classList.toggle("active", pane.dataset.tab === target);
            });
        });
    });
}

initHelpTabs();


/*
  Replace part of the editor's text through the browser's own editing command
  where it exists, so Ctrl+Z still undoes it. Assigning textarea.value wipes
  the undo history, and a learner who has just mangled their program needs
  that history more than anyone.
*/
function replaceEditorText(textarea, start, end, text) {
    textarea.focus();
    textarea.setSelectionRange(start, end);

    let done = false;
    try {
        done = text
            ? document.execCommand("insertText", false, text)
            : document.execCommand("delete");
    } catch {
        done = false;
    }

    if (!done) {
        textarea.setRangeText(text, start, end, "end");
        textarea.dispatchEvent(new Event("input"));
    }
}

const INDENT = "    ";

/*
  Indentation is the part of Python that newcomers find hardest to type, and
  the tutorial's last step asks for exactly that: a loop with the rule
  indented inside it. So the editor behaves like a Python editor. Enter keeps
  the current indentation and adds a level after a colon, Backspace in the
  indentation removes a whole level, and Tab and Shift+Tab indent or unindent
  every selected line.
*/
function initIndentKeys(textarea) {
    textarea.addEventListener("keydown", (e) => {
        if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;

        const value = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const beforeCaret = value.slice(lineStart, start);

        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            let indent = beforeCaret.match(/^[ \t]*/)[0];
            // A comment can end in a colon too, so look at the code only.
            if (beforeCaret.replace(/#.*$/, "").trimEnd().endsWith(":")) {
                indent += INDENT;
            }
            replaceEditorText(textarea, start, end, "\n" + indent);
            return;
        }

        if (e.key === "Backspace" && !e.shiftKey && start === end && /^ +$/.test(beforeCaret)) {
            e.preventDefault();
            // Back to the previous multiple of four, not always four.
            const remove = ((beforeCaret.length - 1) % INDENT.length) + 1;
            replaceEditorText(textarea, start - remove, start, "");
            return;
        }

        if (e.key !== "Tab") return;
        e.preventDefault();

        const lineEnd = value.indexOf("\n", end);
        const blockEnd = (lineEnd === -1) ? value.length : lineEnd;
        const lines = value.slice(lineStart, blockEnd).split("\n");

        if (!e.shiftKey) {
            replaceEditorText(
                textarea, lineStart, blockEnd,
                lines.map(line => INDENT + line).join("\n"),
            );
            textarea.setSelectionRange(
                start + INDENT.length,
                end + INDENT.length * lines.length,
            );
        } else {
            const removed = lines.map(line => line.match(/^ {0,4}/)[0].length);
            replaceEditorText(
                textarea, lineStart, blockEnd,
                lines.map((line, index) => line.slice(removed[index])).join("\n"),
            );
            const totalRemoved = removed.reduce((sum, count) => sum + count, 0);
            textarea.setSelectionRange(
                Math.max(lineStart, start - removed[0]),
                Math.max(lineStart, end - totalRemoved),
            );
        }
    });
}

const codeBox = document.getElementById("code");
initIndentKeys(codeBox);

function initLineNumbers(textarea, gutter) {
    function update() {
        const lines = textarea.value.split("\n").length;
        let out = "";
        for (let i = 1; i <= lines; i++) out += i + "\n";
        gutter.textContent = out;
    }

    textarea.addEventListener("input", update);
    textarea.addEventListener("scroll", () => {
        gutter.scrollTop = textarea.scrollTop;
    });

    update();
}

const lineNumbers = document.getElementById("lineNumbers");
initLineNumbers(codeBox, lineNumbers);
