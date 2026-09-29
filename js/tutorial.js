/*
 * Contextual tutorials for the maze activity.
 *
 * This file deliberately contains only the teaching layer. The maze and Python
 * execution continue to be managed by maze.js.
 */

const RIGHT_HAND_ROUND = "if path_right():\n    turn_right()\n    move()\nelif path_ahead():\n    move()\nelse:\n    turn_left()";

/*
  The "Python, step by step" examples. Each one appears on two cards: the card that
  explains it puts it in the editor, so the code being described is the code
  on screen, and the card that asks for a run offers it again in case the
  learner has edited it into something that no longer works.
*/
const THREE_MOVES = "move()\nmove()\nmove()";
const TURN_AND_MOVE = "# Turn right, then move twice\nturn_right()\nmove()\nmove()\nprint(\"Done\")";
const FIRST_DECISION = "if path_ahead():\n    move()\nelse:\n    turn_right()";
const FIRST_LOOP = "while path_ahead():\n    move()";

/*
  The blocks examples, in the short form blocks.js reads: "move" and the
  turns are single blocks, and {if, do, else} and {while, do} have gaps. The
  right-hand rule needs an if inside the else of another if.
*/
const TWO_MOVE_BLOCKS = ["move", "move"];
const TURN_BLOCKS = ["turn_right", "move", "move"];
const DECISION_BLOCKS = [{if: "ahead", do: ["move"], else: ["turn_right"]}];
const LOOP_BLOCKS = [{while: "ahead", do: ["move"]}];
const RIGHT_HAND_BLOCKS = [{
    if: "right",
    do: ["turn_right", "move"],
    else: [{if: "ahead", do: ["move"], else: ["turn_left"]}],
}];

const tutorialDefinitions = {
    blocks: {
        label: "Code blocks",
        programMode: "blocks",
        steps: [
            {
                target: "#mazeCanvas",
                title: "This is the maze",
                body: `
                    <p>The blue triangle starts here, facing right. The green square
                    is where it has to end up.</p>
                    <p>You will not steer it by hand. You will give it instructions,
                    and the computer will follow them exactly.</p>
                `,
            },
            {
                target: "#blocksEditor",
                title: "Instructions go here",
                body: `
                    <p>Each code block is one instruction. The computer runs them from the
                    top, starting under <strong>when Run is pressed</strong>.</p>
                    <p>Two <strong>move forward</strong> blocks are there
                    already.</p>
                `,
                blocks: TWO_MOVE_BLOCKS,
                autoInsert: true,
            },
            {
                target: "#runBtn",
                title: "Now run it",
                alsoHighlight: ["#blocksEditor"],
                body: `
                    <p>Press <strong>Run program</strong> and watch the triangle move
                    two squares. Each block lights up as it runs.</p>
                    <p>If the button is greyed out, the program is still starting
                    up. It takes a few seconds the first time.</p>
                `,
                blocks: TWO_MOVE_BLOCKS,
                requiresRun: true,
                validate: result => !result.hadError && countActions(result, "move") >= 1,
                failure: "The triangle did not move. Press Replace blocks with example, then Run program.",
            },
            {
                /*
                  Dragging and running are separate cards on purpose: a card
                  that also points at the Run button is placed so that it
                  covers the list of blocks it asks the learner to drag from.
                */
                target: "#blocksEditor",
                title: "Add a turn",
                body: `
                    <p>Drag a <strong>turn right</strong> block out of the list on
                    the left. Drop it just under <strong>when Run is
                    pressed</strong>, above the moves.</p>
                    <p>To get rid of a block, drag it back into the list.</p>
                `,
                blocks: TURN_BLOCKS,
            },
            {
                target: "#runBtn",
                title: "Run the turn",
                alsoHighlight: ["#blocksEditor"],
                body: `
                    <p>Press <strong>Run program</strong>. The triangle turns on the
                    spot, then moves down two squares.</p>
                `,
                blocks: TURN_BLOCKS,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    result.actions[0] === "turnRight" &&
                    countActions(result, "move") >= 2
                ),
                failure: "That did not turn first and then move. Put turn right at the top, or press Replace blocks with example.",
            },
            {
                target: "#blocksEditor",
                title: "Ask the maze a question",
                body: `
                    <p>The purple <strong>if</strong> block checks whether a path is
                    open. If it is, the blocks in its first gap run. If not, the
                    blocks under <strong>else</strong> run.</p>
                    <p>Only one of the two gaps ever runs.</p>
                `,
                blocks: DECISION_BLOCKS,
                autoInsert: true,
            },
            {
                target: "#runBtn",
                title: "Run the decision",
                alsoHighlight: ["#blocksEditor"],
                body: `
                    <p>The way ahead is open, so the triangle moves forward.</p>
                `,
                blocks: DECISION_BLOCKS,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    usesWord(result, "if") &&
                    countActions(result, "move") >= 1
                ),
                failure: "That was not the if example. Press Replace blocks with example, then Run program.",
            },
            {
                target: "#blocksEditor",
                title: "Repeat",
                body: `
                    <p>The green <strong>repeat while</strong> block runs the blocks
                    inside it again and again, for as long as its path stays
                    open.</p>
                    <p>One block inside it can make many moves.</p>
                `,
                blocks: LOOP_BLOCKS,
                autoInsert: true,
            },
            {
                target: "#runBtn",
                title: "Run the loop",
                alsoHighlight: ["#blocksEditor"],
                body: `
                    <p>Press <strong>Run program</strong>. The triangle runs down the
                    corridor and stops itself at the wall.</p>
                `,
                blocks: LOOP_BLOCKS,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    usesWord(result, "while") &&
                    countActions(result, "move") >= 3
                ),
                failure: "That was not the repeat example reaching the wall. Press Replace blocks with example, then Run program.",
            },
            {
                target: "#runBtn",
                title: "Keep one hand on the wall",
                alsoHighlight: ["#blocksEditor"],
                body: `
                    <p>A rule that works in a real maze: <strong>turn right if you
                    can; otherwise go straight; otherwise turn left.</strong></p>
                    <p>That is an if inside the else of another if. Run one
                    round.</p>
                `,
                blocks: RIGHT_HAND_BLOCKS,
                autoInsert: true,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    result.actions.includes("turnRight") &&
                    countActions(result, "move") >= 1
                ),
                failure: "Expected a right turn and a move. Press Replace blocks with example, then Run program.",
            },
            {
                // Pointing at Run keeps the card off both the maze and the
                // list of blocks, which the learner needs next.
                target: "#runBtn",
                alsoHighlight: ["#blocksEditor"],
                title: "Over to you",
                body: `
                    <p>The rule chooses one step. To reach the goal it has to
                    repeat.</p>
                    <p>Drag a <strong>repeat until at goal</strong> block to just
                    under <strong>when Run is pressed</strong>. Then drag the top
                    <strong>if</strong> block into its gap; everything inside the if
                    comes with it.</p>
                    <p>Run it and see where the triangle ends up.</p>
                `,
                final: true,
            },
        ],
    },
    programming: {
        label: "Python, step by step",
        programMode: "python",
        steps: [
            {
                target: "#mazeCanvas",
                title: "This is the maze",
                body: `
                    <p>The blue triangle starts here, facing right. The green square
                    is where it has to end up.</p>
                    <p>You will not steer it by hand. You will write instructions,
                    and the computer will follow them exactly.</p>
                `,
            },
            {
                target: "#code",
                title: "Instructions go here",
                body: `
                    <p>There are three in the editor already.</p>
                    <p><code>move()</code> means go forward one square. It is a
                    <strong>function</strong>: a job with a name, and the brackets
                    tell Python to do it now.</p>
                    <p>Python runs them in order, top to bottom.</p>
                `,
                code: THREE_MOVES,
                autoInsert: true,
            },
            {
                target: "#runBtn",
                title: "Now run it",
                alsoHighlight: ["#code"],
                body: `
                    <p>Press <strong>Run program</strong> and watch the triangle move
                    three squares.</p>
                    <p>If the button is greyed out, Python is still starting up. It
                    takes a few seconds the first time.</p>
                `,
                code: THREE_MOVES,
                requiresRun: true,
                validate: result => !result.hadError && countActions(result, "move") >= 1,
                failure: "The triangle did not move. Press Replace editor with example, then Run program.",
            },
            {
                target: "#buttons",
                title: "Run, reset, speed",
                body: `
                    <p><strong>Run program</strong> always starts again from the
                    beginning, so you cannot break anything.</p>
                    <p><strong>Reset position</strong> stops an animation.
                    <strong>Speed</strong> changes only how fast it is drawn.</p>
                `,
            },
            {
                target: "#code",
                title: "Turn as well as move",
                body: `
                    <p><code>turn_right()</code> and <code>turn_left()</code> turn on
                    the spot without moving.</p>
                    <p><code>print()</code> puts a message in Output. A line starting
                    with <code>#</code> is a note for humans; Python skips it.</p>
                `,
                code: TURN_AND_MOVE,
                autoInsert: true,
            },
            {
                target: "#runBtn",
                title: "Run the sequence",
                alsoHighlight: ["#code"],
                body: `
                    <p>Press <strong>Run program</strong>. The triangle should turn
                    downwards, move two squares, and print your message.</p>
                `,
                code: TURN_AND_MOVE,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    result.actions.includes("turnRight") &&
                    countActions(result, "move") >= 2
                ),
                failure: "That did not turn and then move twice. Press Replace editor with example, then Run program.",
            },
            {
                target: "#output",
                title: "Python talks back here",
                body: `
                    <p>Output shows your <code>print()</code> messages, whether you
                    reached the goal, and any error.</p>
                    <p>You never type here. When something breaks, read the last line,
                    fix the editor, run again.</p>
                `,
            },
            {
                target: "#code",
                title: "Ask the maze a question",
                body: `
                    <p><code>path_ahead()</code> asks: is the next square open? The
                    answer is <code>True</code> or <code>False</code>.</p>
                    <p><code>if</code> takes the first block, <code>else</code> the
                    other. The four spaces show which lines belong to which
                    choice.</p>
                `,
                code: FIRST_DECISION,
                autoInsert: true,
            },
            {
                target: "#runBtn",
                title: "Run the decision",
                alsoHighlight: ["#code"],
                body: `
                    <p>The way ahead is open, so the answer is <code>True</code> and
                    the triangle moves.</p>
                    <p>If Python complains, check the colon and the spaces.</p>
                `,
                code: FIRST_DECISION,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    usesWord(result, "if") &&
                    countActions(result, "move") >= 1
                ),
                failure: "That was not the if example. Press Replace editor with example, then Run program.",
            },
            {
                target: "#code",
                title: "Repeat with while",
                body: `
                    <p><code>while</code> repeats its indented block for as long as
                    the answer stays <code>True</code>.</p>
                    <p>Two lines produce many moves, and you never say how many.</p>
                `,
                code: FIRST_LOOP,
                autoInsert: true,
            },
            {
                target: "#runBtn",
                title: "Run the loop",
                alsoHighlight: ["#code"],
                body: `
                    <p>Press <strong>Run program</strong>. The triangle runs down the
                    corridor and stops itself at the wall.</p>
                `,
                code: FIRST_LOOP,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    usesWord(result, "while") &&
                    countActions(result, "move") >= 3
                ),
                failure: "That was not the while loop reaching the wall. Press Replace editor with example, then Run program.",
            },
            {
                target: "#runBtn",
                title: "Keep one hand on the wall",
                alsoHighlight: ["#code"],
                body: `
                    <p>A rule that works in a real maze: <strong>turn right if you
                    can; otherwise go straight; otherwise turn left.</strong></p>
                    <p><code>elif</code> means "otherwise, if". Python takes the first
                    branch that fits. Run one round.</p>
                `,
                code: RIGHT_HAND_ROUND,
                autoInsert: true,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    usesWord(result, "elif") &&
                    result.actions.includes("turnRight") &&
                    countActions(result, "move") >= 1
                ),
                failure: "Expected a right turn and a move. Press Replace editor with example, then Run program.",
            },
            {
                target: "#code",
                title: "Over to you",
                body: `
                    <p>You now have both halves. The rule you just ran chooses one
                    action; a loop repeats it.</p>
                    <p><code>at_goal()</code> is <code>True</code> only on the green
                    square, and <code>not</code> flips it, so
                    <code>while not at_goal():</code> keeps going until you arrive.
                    Put the rule inside it: select the rule and press Tab to
                    indent it.</p>
                    <p>Have a go. If you get stuck, the <strong>Beginner Guide</strong>
                    tab builds it up line by line, and <strong>Load sample</strong>
                    shows one finished answer.</p>
                `,
                final: true,
            },
        ],
    },
    python: {
        label: "Python for coders",
        programMode: "python",
        steps: [
            {
                target: "#mazeCanvas",
                title: "The task and the API",
                body: `
                    <p>Get the triangle from its start to the green goal. It faces
                    right, and every run resets its position.</p>
                    <p>Act with <code>move()</code>, <code>turn_left()</code>,
                    <code>turn_right()</code>. Check with <code>path_ahead()</code>,
                    <code>path_left()</code>, <code>path_right()</code>,
                    <code>path_behind()</code>, <code>at_goal()</code>.
                    <code>position()</code> gives the current
                    <code>(row, column)</code>.</p>
                    <p>The checks return <code>True</code> or <code>False</code> and
                    change nothing. Everything is relative to the way the triangle
                    faces.</p>
                `,
            },
            {
                target: "#code",
                title: "Try them",
                alsoHighlight: ["#runBtn"],
                body: `
                    <p>This prints three checks, then moves. Run it and read what
                    comes back.</p>
                `,
                code: "print(path_ahead(), path_right(), at_goal())\nmove()",
                autoInsert: true,
                requiresRun: true,
                validate: result => !result.hadError && countActions(result, "move") >= 1,
                failure: "No movement was recorded. Restore the example and run it again.",
            },
            {
                target: "#output",
                title: "Output and errors",
                body: `
                    <p>Output holds <code>print()</code> text, the final maze status
                    and the traceback. Read the last line first.</p>
                    <p>Every run clears Output and returns the triangle to the top-left
                    start facing right, so runs are repeatable.</p>
                `,
            },
            {
                target: "#code",
                title: "Python, not C or Java",
                body: `
                    <p>No braces, no semicolons. A colon opens a block, and
                    <strong>indentation is the syntax</strong>: four spaces here, and
                    Tab inserts them.</p>
                    <p><code>True</code> and <code>False</code> are capitalised. Use
                    <code>and</code>, <code>or</code>, <code>not</code> rather than
                    <code>&amp;&amp;</code>, <code>||</code>, <code>!</code>.</p>
                `,
            },
            {
                target: "#code",
                title: "if / elif / else",
                body: `
                    <p><code>elif</code> is "else if". Python tests the branches in
                    order and runs exactly one.</p>
                    <p>Insert this and run it. The right-hand path is open at the
                    start, so the first branch wins.</p>
                `,
                code: RIGHT_HAND_ROUND,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    result.actions.includes("turnRight") &&
                    countActions(result, "move") >= 1
                ),
                failure: "Expected a right turn then a move. Restore the example, check the indentation, and run it again.",
            },
            {
                target: "#code",
                title: "while not at_goal()",
                body: `
                    <p><code>not</code> inverts a Boolean, so
                    <code>while not at_goal():</code> repeats until the triangle
                    stands on the goal.</p>
                    <p>Those same three branches, indented inside that loop, are a
                    right-hand wall follower. Write it yourself, or take
                    <strong>Load sample</strong> if you would rather skip ahead to
                    breaking it.</p>
                `,
            },
            {
                target: "#mazeControls",
                title: "Then go and break it",
                body: `
                    <p>Wall following works here because Easy and Medium mazes have no
                    loops. Everything after them does.</p>
                    <p>Use the <strong>Maze</strong> menu or <strong>Generate new
                    maze</strong> to find a layout that defeats it, then work out what
                    a solver would have to remember. The <strong>Beginner Guide</strong>
                    tab covers exactly where it breaks.</p>
                `,
                final: true,
            },
        ],
    },
};

const selector = document.getElementById("tutorialSelector");
const closeSelectorButton = document.getElementById("closeTutorialSelector");
const tutorialsButton = document.getElementById("tutorialsBtn");
const backdrop = document.getElementById("tutorialBackdrop");
const coachmark = document.getElementById("tutorialCoachmark");
const mazeCanvas = document.getElementById("mazeCanvas");
const stepCount = document.getElementById("tutorialStepCount");
const stepTitle = document.getElementById("tutorialStepTitle");
const stepBody = document.getElementById("tutorialStepBody");
const feedback = document.getElementById("tutorialFeedback");
const insertCodeButton = document.getElementById("tutorialInsertCodeBtn");
const closeTutorialButton = document.getElementById("tutorialCloseBtn");
const minimizeTutorialButton = document.getElementById("tutorialMinimizeBtn");
const backButton = document.getElementById("tutorialBackBtn");
const nextButton = document.getElementById("tutorialNextBtn");
const resumeButton = document.getElementById("resumeTutorialBtn");

let currentMode = null;
let currentStepIndex = 0;
let tutorialIsOpen = false;
let tutorialIsMinimized = false;
let highlightedElement = null;
/* Every element lit up for this step: the target plus any extras. */
let highlightedElements = [];
let resumeAfterSelector = false;
let closeConfirmPending = false;

function countActions(result, actionType) {
    return result.actions.filter(action => action === actionType).length;
}

/*
  Whether the program that ran uses a keyword. The actions alone cannot tell
  the loop example from three move() lines left over from an earlier card,
  and a step that passes on leftover code teaches nothing.
*/
function usesWord(result, word) {
    const code = (result.code || "").replace(/#.*$/gm, "");
    return new RegExp(`\\b${word}\\b`).test(code);
}

function currentTutorial() {
    return currentMode ? tutorialDefinitions[currentMode] : null;
}

function currentStep() {
    const tutorial = currentTutorial();
    return tutorial ? tutorial.steps[currentStepIndex] : null;
}

function setFeedback(message, state = "") {
    feedback.textContent = message;
    feedback.hidden = !message;
    if (state) {
        feedback.dataset.state = state;
    } else {
        delete feedback.dataset.state;
    }
}

function clearHighlight() {
    highlightedElements.forEach(element => {
        element.classList.remove("tutorial-highlight");
    });
    highlightedElements = [];
    highlightedElement = null;
}

function clearRunningMazeHighlight() {
    mazeCanvas.classList.remove("tutorial-maze-running");
}

function hideCoachmark() {
    clearHighlight();
    clearRunningMazeHighlight();
    backdrop.hidden = true;
    coachmark.hidden = true;
    window.removeEventListener("resize", positionCoachmark);
    window.removeEventListener("scroll", positionCoachmark, true);
}

/* The box enclosing every highlighted element for this step. */
function highlightedArea() {
    const boxes = highlightedElements.map(element =>
        element.getBoundingClientRect(),
    );
    return {
        top: Math.min(...boxes.map(box => box.top)),
        bottom: Math.max(...boxes.map(box => box.bottom)),
        left: Math.min(...boxes.map(box => box.left)),
        right: Math.max(...boxes.map(box => box.right)),
        get width() {
            return this.right - this.left;
        },
        get height() {
            return this.bottom - this.top;
        },
    };
}

function positionCoachmark() {
    if (!highlightedElement || coachmark.hidden) return;

    if (window.matchMedia("(max-width: 600px)").matches) {
        coachmark.style.removeProperty("top");
        coachmark.style.removeProperty("left");
        return;
    }

    const margin = 14;
    const target = highlightedArea();
    const card = coachmark.getBoundingClientRect();
    const centredX = target.left + (target.width - card.width) / 2;
    const centredY = target.top + (target.height - card.height) / 2;

    /* Below, above, right, left: where the card would go and the room there. */
    const placements = [
        {
            top: target.bottom + margin,
            left: centredX,
            room: window.innerHeight - target.bottom,
            needed: card.height + margin,
        },
        {
            top: target.top - card.height - margin,
            left: centredX,
            room: target.top,
            needed: card.height + margin,
        },
        {
            top: centredY,
            left: target.right + margin,
            room: window.innerWidth - target.right,
            needed: card.width + margin,
        },
        {
            top: centredY,
            left: target.left - card.width - margin,
            room: target.left,
            needed: card.width + margin,
        },
    ];

    // Prefer the first side the card fits on; otherwise take whichever side
    // is least cramped, so the card is never dropped straight on top of the
    // control it is pointing at.
    const choice =
        placements.find(placement => placement.room >= placement.needed) ||
        placements.reduce((best, placement) =>
            placement.room - placement.needed > best.room - best.needed
                ? placement
                : best,
        );

    const clamp = (value, limit) => Math.max(margin, Math.min(value, limit));
    coachmark.style.top =
        `${clamp(choice.top, window.innerHeight - card.height - margin)}px`;
    coachmark.style.left =
        `${clamp(choice.left, window.innerWidth - card.width - margin)}px`;
}

function showCoachmark() {
    const step = currentStep();
    if (!step) return;

    highlightedElement = document.querySelector(step.target);
    if (!highlightedElement) {
        finishTutorial();
        return;
    }

    /*
      Only highlighted elements are raised above the backdrop, so anything the
      learner has to click has to be lit. A step that waits for a run always
      lights the Run button for that reason, whether or not it is the element
      the card is pointing at: without it the button is dimmed and a real
      mouse click lands on the backdrop instead.
    */
    const extras = [...(step.alsoHighlight || [])];
    if (step.requiresRun) extras.push("#runBtn");

    highlightedElements = [highlightedElement];
    extras.forEach(selector => {
        const extra = document.querySelector(selector);
        if (extra && !highlightedElements.includes(extra)) {
            highlightedElements.push(extra);
        }
    });

    const narrowScreen = window.matchMedia("(max-width: 600px)").matches;
    highlightedElement.scrollIntoView({
        block: narrowScreen ? "start" : "center",
        inline: "nearest",
    });
    highlightedElements.forEach(element => {
        element.classList.add("tutorial-highlight");
    });

    backdrop.hidden = false;
    coachmark.hidden = false;
    resumeButton.hidden = true;
    tutorialIsOpen = true;
    tutorialIsMinimized = false;

    window.addEventListener("resize", positionCoachmark);
    window.addEventListener("scroll", positionCoachmark, true);
    /*
      Position immediately, then again once scrolling and layout have settled:
      scrollIntoView() above may still be moving the page, and the card's
      height depends on this step's content. Measuring only once leaves the
      card on stale geometry, which is how it ends up sitting on top of the
      control it is pointing at.

      Deliberately not driven by requestAnimationFrame alone: a browser does
      not run animation frames for a page in a background tab, so a learner
      who switches tabs mid-tutorial would come back to a card that never
      moved again.
    */
    positionCoachmark();
    coachmark.focus({preventScroll: true});
    setTimeout(positionCoachmark, 0);
    setTimeout(positionCoachmark, 160);
}

function renderStep() {
    const tutorial = currentTutorial();
    const step = currentStep();
    if (!tutorial || !step) return;

    hideCoachmark();
    resetCloseConfirmation();

    stepCount.textContent = `${tutorial.label} · ${currentStepIndex + 1} of ${tutorial.steps.length}`;
    stepTitle.textContent = step.title;
    stepBody.innerHTML = step.body;
    setFeedback(step.requiresRun ? "Run the program to complete this step." : "");

    insertCodeButton.hidden = !(step.code || step.blocks);
    insertCodeButton.textContent = step.blocks
        ? "Replace blocks with example"
        : "Replace editor with example";

    // Some steps put their example into the editor for the learner, so that the
    // very first thing they do is run a working program rather than type one.
    if (step.autoInsert) insertExample(step);

    backButton.disabled = currentStepIndex === 0;
    nextButton.disabled = Boolean(step.requiresRun);
    nextButton.textContent = step.final ? "Finish tutorial" : "Continue";

    showCoachmark();
}

/* Put a step's example program into the blocks or the Python editor. */
function insertExample(step) {
    if (step.blocks) {
        globalThis.mazeBlocks?.load(step.blocks);
    } else if (step.code) {
        const editor = document.getElementById("code");
        editor.value = step.code;
        editor.dispatchEvent(new Event("input"));
    }
}

function startTutorial(mode) {
    if (!tutorialDefinitions[mode]) return;

    currentMode = mode;
    currentStepIndex = 0;
    tutorialIsOpen = true;
    tutorialIsMinimized = false;
    resumeButton.hidden = true;
    // maze.js switches to this tutorial's mode, blocks or Python, on hearing it.
    document.dispatchEvent(new CustomEvent("tutorial:start", {
        detail: {mode, programMode: tutorialDefinitions[mode].programMode},
    }));
    renderStep();
}

function finishTutorial(completed = false) {
    tutorialIsOpen = false;
    tutorialIsMinimized = false;
    resumeButton.hidden = true;
    hideCoachmark();
    document.dispatchEvent(new CustomEvent("tutorial:end", {
        detail: {mode: currentMode, completed}
    }));

    if (completed) {
        document.dispatchEvent(new CustomEvent("tutorial:complete", {
            detail: {mode: currentMode}
        }));
    }

    const blocksMode = document.documentElement.dataset.mode === "blocks";
    const editor = document.getElementById(blocksMode ? "blocksEditor" : "code");
    editor.scrollIntoView({block: "center"});
    editor.focus({preventScroll: true});
}

function openSelector() {
    resumeAfterSelector = tutorialIsOpen && !tutorialIsMinimized;
    hideCoachmark();
    // The first time, there is no tutorial to go back to, only none at all.
    closeSelectorButton.textContent = currentMode ? "Cancel" : "Skip the tutorial";

    if (typeof selector.showModal === "function") {
        selector.showModal();
    } else {
        selector.setAttribute("open", "");
    }

    const selectedOption = currentMode
        ? selector.querySelector(`[data-tutorial-mode="${currentMode}"]`)
        : selector.querySelector("[data-tutorial-mode]");
    selectedOption?.focus();
}

function closeSelector() {
    if (typeof selector.close === "function") {
        selector.close();
    } else {
        selector.removeAttribute("open");
    }

    if (resumeAfterSelector) renderStep();
    resumeAfterSelector = false;
}

selector.querySelectorAll("[data-tutorial-mode]").forEach(option => {
    option.addEventListener("click", () => {
        const mode = option.dataset.tutorialMode;
        resumeAfterSelector = false;

        if (typeof selector.close === "function") {
            selector.close();
        } else {
            selector.removeAttribute("open");
        }

        startTutorial(mode);
    });
});

// Escape does what the Skip or Cancel button does.
selector.addEventListener("cancel", event => {
    event.preventDefault();
    closeSelector();
});

closeSelectorButton.addEventListener("click", closeSelector);

insertCodeButton.addEventListener("click", () => {
    const step = currentStep();
    if (!step) return;

    insertExample(step);
    if (step.code) document.getElementById("code").focus();
});

/*
  Every card points at parts of one mode's editor, which the other mode hides.
  Switching mode partway through would leave the cards pointing at nothing,
  so the tutorial closes instead.
*/
document.addEventListener("maze:mode", event => {
    const tutorial = currentTutorial();
    if (tutorialIsOpen && tutorial && tutorial.programMode !== event.detail.mode) {
        finishTutorial();
    }
});

backButton.addEventListener("click", () => {
    if (currentStepIndex === 0) return;
    currentStepIndex -= 1;
    renderStep();
});

nextButton.addEventListener("click", () => {
    const tutorial = currentTutorial();
    const step = currentStep();
    if (!tutorial || !step || nextButton.disabled) return;

    if (step.final || currentStepIndex >= tutorial.steps.length - 1) {
        finishTutorial(true);
        return;
    }

    currentStepIndex += 1;
    renderStep();
});

/*
  Closing asks for a second click rather than opening a browser confirm()
  dialog: the dialog is easy to dismiss by accident, it looks nothing like the
  rest of the activity, and some browser setups suppress it altogether, which
  would make the button appear broken.
*/
function resetCloseConfirmation() {
    if (!closeConfirmPending) return;
    closeConfirmPending = false;
    closeTutorialButton.textContent = "Close";
}

closeTutorialButton.addEventListener("click", () => {
    if (!closeConfirmPending) {
        closeConfirmPending = true;
        closeTutorialButton.textContent = "Yes, close it";
        setFeedback(
            "Close the guidance? You can start it again from Tutorials at the top.",
        );
        return;
    }

    resetCloseConfirmation();
    finishTutorial();
});

minimizeTutorialButton.addEventListener("click", () => {
    if (!tutorialIsOpen) return;

    tutorialIsMinimized = true;
    hideCoachmark();
    resumeButton.hidden = false;
    resumeButton.focus({preventScroll: true});
});

resumeButton.addEventListener("click", () => {
    if (!tutorialIsOpen || !tutorialIsMinimized) return;
    showCoachmark();
});

tutorialsButton.addEventListener("click", openSelector);

document.addEventListener("maze:run-start", () => {
    const step = currentStep();
    if (!tutorialIsOpen || !step?.requiresRun) return;

    if (!tutorialIsMinimized) {
        mazeCanvas.classList.add("tutorial-maze-running");
    }
    nextButton.disabled = true;
    setFeedback("Program running…");
});

document.addEventListener("maze:run-complete", event => {
    clearRunningMazeHighlight();
    const step = currentStep();
    if (!tutorialIsOpen || !step?.requiresRun) return;

    const result = event.detail;
    const passed = step.validate ? step.validate(result) : !result.hadError;

    if (passed) {
        nextButton.disabled = false;
        setFeedback("Completed. Continue when you are ready.", "success");
    } else if (result.hadError) {
        setFeedback("The program stopped with an error. Review the Output panel, make a correction and run it again.", "error");
    } else {
        setFeedback(step.failure || "The expected result was not completed. Make a correction and try again.", "error");
    }

    positionCoachmark();
});

document.getElementById("resetBtn").addEventListener(
    "click",
    clearRunningMazeHighlight,
);

openSelector();
