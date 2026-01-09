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

/* Load maze definition from a text file */
async function loadMaze(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to load maze from ${url}: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    maze = text
        .split(/\r?\n/)
        .filter(line => line.trim().length > 0);

    if (maze.length === 0) {
        throw new Error("Maze file is empty");
    }

    numRows = maze.length;
    numCols = maze[0].length;

    // Find start and goal positions
    startRow = startCol = goalRow = goalCol = 0;
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const ch = maze[r][c];
            if (ch === "S") {
                startRow = r;
                startCol = c;
            } else if (ch === "G") {
                goalRow = r;
                goalCol = c;
            }
        }
    }

    // Expose maze data to Python
    globalThis.JS_MAZE = maze;
    globalThis.JS_MAZE_NUM_ROWS = numRows;
    globalThis.JS_MAZE_NUM_COLS = numCols;
    globalThis.JS_MAZE_START_ROW = startRow;
    globalThis.JS_MAZE_START_COL = startCol;
    globalThis.JS_MAZE_GOAL_ROW = goalRow;
    globalThis.JS_MAZE_GOAL_COL = goalCol;
}

await loadMaze("mazes/default.txt");

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
  Compute how large each cell should be so that the entire maze
  fits inside the canvas and is centred.
*/
let cellSize = Math.min(canvas.width / numCols, canvas.height / numRows);
let offsetX = (canvas.width - numCols * cellSize) / 2;
let offsetY = (canvas.height - numRows * cellSize) / 2;

/*
  Visual state of the player. This is separate from the logical
  position stored on the Python side.
*/
let visRow, visCol, visDir;

/* Queue of actions emitted by Python, e.g. "move", "turnLeft", "turnRight". */
let actionQueue = [];

/* lets Python add an action that JS will animate later. */
globalThis.js_enqueue_action = function (type) {
    actionQueue.push({type});
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
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
    visDir = 1;
    actionQueue = [];
    drawMaze();
}

/* Append a line of text to the output text area. */
function appendOutput(text) {
    const output = document.getElementById("output");
    output.value += text + "\n";
    output.scrollTop = output.scrollHeight;
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
        const raw = parseInt(speedInput.value, 10);
        const min = parseInt(speedInput.min, 10);
        const max = parseInt(speedInput.max, 10);
        const delay = (max + min) - raw;
        await sleep(delay);
    }
}

let pyodide;
let runCounter = 0;

/*
  Create a single Pyodide instance and load maze.py into it.
  This promise resolves once Pyodide is fully ready.
*/
const pyodideReadyPromise = (async () => {
    pyodide = await loadPyodide();

    const outputEl = document.getElementById("output");

    // Send Python's stdout and stderr into the output text area
    pyodide.setStdout({
      batched: (msg) => {
        // normalise Windows newlines just in case
        msg = msg.replace(/\r/g, "");

        outputEl.value += msg;
        if (msg.length && !msg.endsWith("\n")) outputEl.value += "\n";

        outputEl.scrollTop = outputEl.scrollHeight;
      }
    });
    pyodide.setStderr({
      batched: (msg) => {
        msg = msg.replace(/\r/g, "");

        outputEl.value += msg;
        if (msg.length && !msg.endsWith("\n")) outputEl.value += "\n";

        outputEl.scrollTop = outputEl.scrollHeight;
      }
    });

    // Load the Python game API file into the interpreter
    const resp = await fetch(`maze.py?v=${Date.now()}`, {cache: "no-store"});
    const apiCode = await resp.text();
    await pyodide.runPythonAsync(apiCode);

    return pyodide;
})();

async function runProgram() {
    // Wait for Pyodide and maze.py to be ready
    await pyodideReadyPromise;

    const code = document.getElementById("code").value;
    const outputEl = document.getElementById("output");
    outputEl.value = "";

    // Increment runCounter so any previous animation loops stop
    runCounter++;
    const thisRun = runCounter;

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
    try {
        pyodide.globals.set("PMG_SRC", code);
        pyodide.globals.set("PMG_MAX_SECONDS", 5);
        pyodide.globals.set("PMG_MAX_STEPS", 50000);

        await pyodide.runPythonAsync("run_user_code(PMG_SRC, PMG_MAX_SECONDS, PMG_MAX_STEPS)");
    } catch (err) {
        hadError = true;
        appendOutput(formatPyodideError(err));
    }

    // Animate the recorded actions
    await playActions(thisRun);

    // Ask Python whether the player reached the goal
    let reached = false;
    try {
        reached = pyodide.runPython("at_goal()");
    } catch (err) {
        hadError = true;
        appendOutput("Python error in at_goal(): " + err);
    }

    if (reached) {
        appendOutput("Reached goal!");
    } else if (!hadError) {
        appendOutput("Program finished without reaching goal.");
    }
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

document.getElementById("code").value = `# Enter your python code here`;

// Run button
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
document.getElementById("sampleBtn").addEventListener("click", async () => {
    const code = document.getElementById("code");
    const txt = await fetch("samples/default.txt");
    code.value = await txt.text();
    code.dispatchEvent(new Event("input")); // refresh line numbers
    code.focus();
});

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


function initTabIndent(textarea) {
    textarea.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;

        e.preventDefault();

        const value = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const indent = "    ";

        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = value.indexOf("\n", end);
        const selEnd = (lineEnd === -1) ? value.length : lineEnd;

        const selectedBlock = value.slice(lineStart, selEnd);
        const lines = selectedBlock.split("\n");

        // Indent or unindent each line
        if (!e.shiftKey) {
            const newBlock = lines.map(l => indent + l).join("\n");
            textarea.value = value.slice(0, lineStart) + newBlock + value.slice(selEnd);

            textarea.selectionStart = start + indent.length;
            textarea.selectionEnd = end + indent.length * lines.length;
        } else {
            const newLines = lines.map(l => l.startsWith(indent) ? l.slice(indent.length)
                : l.startsWith(" ") ? l.replace(/^ {1,4}/, "")
                    : l);
            const newBlock = newLines.join("\n");
            textarea.value = value.slice(0, lineStart) + newBlock + value.slice(selEnd);

            textarea.selectionStart = Math.max(lineStart, start - 4);
            textarea.selectionEnd = Math.max(lineStart, end - 4 * lines.length);
        }

        textarea.dispatchEvent(new Event("input"));
    });
}

const codeBox = document.getElementById("code");
initTabIndent(codeBox);

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
