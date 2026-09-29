/*
 * Contextual tutorials for the maze activity.
 *
 * This file deliberately contains only the teaching layer. The maze and Python
 * execution continue to be managed by maze.js.
 */

/*
  Examples for the two beginner tracks, as typed Python and as code blocks.
  Each appears on two cards: the card that explains it puts it in the editor,
  so the code being described is the code on screen, and the card that asks
  for a run offers it again in case the learner has edited it into something
  that no longer works. The blocks use the short form blocks.js reads: "move"
  and the turns are single blocks, and {if, do, else}, {while, do} and
  {untilGoal} are the blocks with gaps.
*/
const TWO_MOVES = "move()\nmove()";
const TURN_AND_MOVE = "turn_right()\nmove()\nmove()";
const FIRST_DECISION = "if path_ahead():\n    move()\nelse:\n    turn_right()";
const FIRST_LOOP = "while path_ahead():\n    move()";

const TWO_MOVE_BLOCKS = ["move", "move"];
const TURN_BLOCKS = ["turn_right", "move", "move"];
const DECISION_BLOCKS = [{if: "ahead", do: ["move"], else: ["turn_right"]}];
const LOOP_BLOCKS = [{while: "ahead", do: ["move"]}];

/*
  A finished answer, held back on the last card until every hint has been
  used. The tutorial gives the pieces and lets the learner put them together;
  simply wrapping the if example in a loop gets stuck going round in circles
  on the tutorial maze, so there is real thinking left to do.
*/
const SOLUTION_CODE = "while not at_goal():\n    if path_right():\n        turn_right()\n        move()\n    elif path_ahead():\n        move()\n    else:\n        turn_left()";
const SOLUTION_BLOCKS = [{
    untilGoal: [{
        if: "right",
        do: ["turn_right", "move"],
        else: [{if: "ahead", do: ["move"], else: ["turn_left"]}],
    }],
}];

/*
  Hints for the last card, from a nudge to nearly the whole answer, so each
  learner can take as much help as they need and no more.
*/
const HINT_STRATEGY = "Imagine walking through a maze in the dark. Keep one hand on the wall, never let go, and you will find the way out.";
const HINT_RULE = "Each time round: if the path to the right is open, turn right and move forward. Otherwise, if the path ahead is open, move forward. Otherwise, turn left.";

const LOOP_AND_DECISION = "while path_ahead():\n    move()\n\nif path_right():\n    turn_right()\nelif path_left():\n    turn_left()\nelse:\n    print(\"Dead end\")";

/*
  The two beginner tracks teach the same things in the same order, one with
  code blocks and one with typed Python, so they are written once and each
  card picks its words and example for the medium. Keeping them in step means
  a visitor who switches from one to the other finds the same path.
*/
function beginnerSteps(medium) {
    const blocks = medium === "blocks";
    const editor = blocks ? "#blocksEditor" : "#code";
    const example = (blockSteps, code) => (blocks ? {blocks: blockSteps} : {code});
    const restore = blocks ? "Replace blocks with example" : "Replace editor with example";

    return [
        {
            target: "#mazeCanvas",
            title: "This is the maze",
            body: `
                <p>The blue triangle starts here, facing right. The green square is
                where it has to end up.</p>
                <p>You will not steer it by hand. You will give it instructions, and
                the computer will follow them exactly.</p>
            `,
        },
        {
            target: editor,
            title: "Instructions go here",
            body: blocks ? `
                <p>Each code block is one instruction. The computer runs them from
                the top, starting under <strong>when Run is pressed</strong>.</p>
                <p>Two <strong>move forward</strong> blocks are there already.</p>
            ` : `
                <p>Each line is one instruction. <code>move()</code> means go forward
                one square. It is a <strong>function</strong>: a job with a name, and
                the brackets tell Python to do it now.</p>
                <p>Two are in the editor already. Python runs them from top to
                bottom.</p>
            `,
            ...example(TWO_MOVE_BLOCKS, TWO_MOVES),
            autoInsert: true,
        },
        {
            target: "#buttons",
            title: "Now run it",
            alsoHighlight: [editor],
            body: `
                <p>Press <strong>Run program</strong> and watch the triangle move two
                squares.${blocks ? " Each block lights up as it runs." : ""}</p>
                <p>Every run starts from the beginning, so you cannot break
                anything. <strong>Stop</strong> halts the triangle, and
                <strong>Speed</strong> changes how fast it goes. If Run is greyed
                out, it is still starting up.</p>
            `,
            ...example(TWO_MOVE_BLOCKS, TWO_MOVES),
            requiresRun: true,
            validate: result => !result.hadError && countActions(result, "move") >= 1,
            failure: `The triangle did not move. Press ${restore}, then Run program.`,
        },
        {
            target: editor,
            title: "Add a turn",
            body: blocks ? `
                <p>Drag a <strong>turn right</strong> block out of the list on the
                left. Drop it just under <strong>when Run is pressed</strong>, above
                the moves.</p>
                <p>To get rid of a block, drag it back into the list.</p>
            ` : `
                <p>Click at the very start of line 1, type <code>turn_right()</code>
                and press Enter.</p>
                <p>Spelling, capitals and brackets all have to be exact: the
                computer does exactly what it is told, and nothing else.</p>
            `,
            ...example(TURN_BLOCKS, TURN_AND_MOVE),
        },
        {
            target: "#runBtn",
            title: "Run the turn",
            alsoHighlight: [editor],
            body: `
                <p>Press <strong>Run program</strong>. The triangle turns on the
                spot, then moves down two squares.</p>
                <p>${blocks
                    ? "If something goes wrong, the <strong>Output</strong> box " +
                      "below says what happened."
                    : "If Python finds a mistake, the <strong>Output</strong> box " +
                      "below says what and on which line. Read its last line first."}</p>
            `,
            ...example(TURN_BLOCKS, TURN_AND_MOVE),
            requiresRun: true,
            validate: result => (
                !result.hadError &&
                result.actions[0] === "turnRight" &&
                countActions(result, "move") >= 2
            ),
            failure: `That did not turn first and then move. Put the turn at the top, or press ${restore}.`,
        },
        {
            target: editor,
            title: "Ask the maze a question",
            body: blocks ? `
                <p>The purple <strong>if</strong> block checks whether a path is
                open. If it is, the blocks in its first gap run. If not, the blocks
                under <strong>else</strong> run.</p>
            ` : `
                <p><code>path_ahead()</code> asks: is the next square open? The
                answer is <code>True</code> or <code>False</code>.</p>
                <p><code>if</code> runs the lines under it when the answer is
                <code>True</code>, and <code>else</code> runs the others. The colon
                and the four spaces show which lines belong to which.</p>
            `,
            ...example(DECISION_BLOCKS, FIRST_DECISION),
            autoInsert: true,
        },
        {
            target: "#runBtn",
            title: "Run the decision",
            alsoHighlight: [editor],
            body: `
                <p>Press <strong>Run program</strong>. The way ahead is open, so the
                triangle moves forward. Only one of the two choices ever runs.</p>
                ${blocks ? "" : "<p>If Python complains, check the colon and the four spaces.</p>"}
            `,
            ...example(DECISION_BLOCKS, FIRST_DECISION),
            requiresRun: true,
            validate: result => (
                !result.hadError &&
                usesWord(result, "if") &&
                countActions(result, "move") >= 1
            ),
            failure: `That was not the if example. Press ${restore}, then Run program.`,
        },
        {
            target: editor,
            title: "Repeat",
            body: blocks ? `
                <p>The green <strong>repeat while</strong> block runs the blocks
                inside it again and again, for as long as its path stays open.</p>
                <p>One block inside it can make many moves.</p>
            ` : `
                <p><code>while</code> repeats the lines indented under it for as
                long as its answer stays <code>True</code>.</p>
                <p>One line inside it can make many moves.</p>
            `,
            ...example(LOOP_BLOCKS, FIRST_LOOP),
            autoInsert: true,
        },
        {
            target: "#runBtn",
            title: "Run the loop",
            alsoHighlight: [editor],
            body: `
                <p>Press <strong>Run program</strong>. The triangle runs down the
                corridor and stops itself at the wall.</p>
            `,
            ...example(LOOP_BLOCKS, FIRST_LOOP),
            requiresRun: true,
            validate: result => (
                !result.hadError &&
                usesWord(result, "while") &&
                countActions(result, "move") >= 3
            ),
            failure: `That was not the loop reaching the wall. Press ${restore}, then Run program.`,
        },
        {
            // Pointing at Run keeps the card off both the maze and the editor,
            // which the learner needs from here on.
            target: "#runBtn",
            alsoHighlight: [editor],
            title: "Your turn",
            body: blocks ? `
                <p>You have all the pieces. Now get the triangle to the green square
                yourself.</p>
                <p>Start with a <strong>repeat until at goal</strong> block. It
                repeats the blocks inside it until the triangle is on the goal.
                Inside it, use <strong>if</strong> blocks to choose each step.</p>
            ` : `
                <p>You have all the pieces. Now get the triangle to the green square
                yourself.</p>
                <p>Start with <code>while not at_goal():</code>. It repeats the
                indented lines under it until the triangle is on the goal. Inside it,
                use <code>if</code> to choose each step.</p>
            `,
            hints: [
                HINT_STRATEGY,
                HINT_RULE,
                blocks
                    ? "That needs two <strong>if</strong> blocks. The second goes " +
                      "in the <strong>else</strong> gap of the first, and both go " +
                      "inside <strong>repeat until at goal</strong>."
                    : "Inside the loop, write <code>if</code>, then " +
                      "<code>elif</code> (short for otherwise, if), then " +
                      "<code>else</code>, each indented four spaces. The lines " +
                      "under each are indented four more.",
            ],
            ...example(SOLUTION_BLOCKS, SOLUTION_CODE),
            final: true,
        },
    ];
}

const tutorialDefinitions = {
    blocks: {
        label: "Code blocks",
        programMode: "blocks",
        steps: beginnerSteps("blocks"),
    },
    programming: {
        label: "Python, step by step",
        programMode: "python",
        steps: beginnerSteps("python"),
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
                failure: "No movement was recorded. Press Replace editor with example and run it again.",
            },
            {
                target: "#output",
                title: "Output and errors",
                body: `
                    <p>Output holds <code>print()</code> text, the final maze status
                    and any traceback. Read the last line first.</p>
                    <p>Every run clears Output and puts the triangle back at the start
                    facing right, so runs are repeatable.</p>
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
                    <code>&amp;&amp;</code>, <code>||</code>, <code>!</code>, and
                    <code>elif</code> for else if.</p>
                `,
            },
            {
                target: "#code",
                title: "A loop and a decision",
                alsoHighlight: ["#runBtn"],
                body: `
                    <p>A <code>while</code> loop, then one
                    <code>if</code> / <code>elif</code> / <code>else</code>. It drives
                    to the end of the corridor, then turns towards an open side.</p>
                    <p>The branches are tested in order and only the first
                    <code>True</code> one runs. Run it.</p>
                `,
                code: LOOP_AND_DECISION,
                autoInsert: true,
                requiresRun: true,
                validate: result => (
                    !result.hadError &&
                    usesWord(result, "while") &&
                    countActions(result, "move") >= 3
                ),
                failure: "That was not the example. Press Replace editor with example, then Run program.",
            },
            {
                target: "#runBtn",
                alsoHighlight: ["#code"],
                title: "Your turn",
                body: `
                    <p>Get the triangle to the goal with a
                    <code>while not at_goal():</code> loop and a rule inside it that
                    chooses each step.</p>
                `,
                hints: [
                    "A classic rule is to keep one hand on the wall: turn right if " +
                    "you can, otherwise go straight, otherwise turn left.",
                ],
                code: SOLUTION_CODE,
            },
            {
                target: "#mazeControls",
                title: "Then go and break it",
                body: `
                    <p>Wall following works here because Easy and Medium mazes have no
                    loops. Everything after them does.</p>
                    <p>After your first goal, challenge mode runs your program on 150
                    mazes. Find where it fails, then work out what it would have to
                    remember. The <strong>Harder mazes</strong> tab shows where it
                    breaks.</p>
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
const hintButton = document.getElementById("tutorialHintBtn");
const hintList = document.getElementById("tutorialHints");
const dragHandle = document.getElementById("tutorialDragHandle");
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
/* How many of this card's hints are showing. */
let hintsShown = 0;
/*
  Whether this card should stay where it is rather than be placed afresh:
  set once the learner drags it or opens a hint.
*/
let holdPosition = false;

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

/* Put the card at a position, kept fully inside the window. */
function placeCoachmark(left, top, margin = 14) {
    const card = coachmark.getBoundingClientRect();
    const clamp = (value, limit) => Math.max(margin, Math.min(value, limit));
    coachmark.style.left = `${clamp(left, window.innerWidth - card.width - margin)}px`;
    coachmark.style.top = `${clamp(top, window.innerHeight - card.height - margin)}px`;
}

function positionCoachmark() {
    if (!highlightedElement || coachmark.hidden) return;

    if (window.matchMedia("(max-width: 600px)").matches) {
        coachmark.style.removeProperty("top");
        coachmark.style.removeProperty("left");
        return;
    }

    // A card the learner has moved, or opened a hint on, stays where it is,
    // only kept inside the window if it resizes or the card grows.
    if (holdPosition) {
        const card = coachmark.getBoundingClientRect();
        placeCoachmark(card.left, card.top, 8);
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

    placeCoachmark(choice.left, choice.top, margin);
}

/*
  The card can be dragged by its top part when it covers something the
  learner wants to see. The position they choose holds until the next card,
  which is placed automatically again because it points somewhere else.
  Phones pin the card to the bottom of the screen instead, so no dragging.
*/
dragHandle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || window.matchMedia("(max-width: 600px)").matches) {
        return;
    }
    event.preventDefault();

    const card = coachmark.getBoundingClientRect();
    const grabX = event.clientX - card.left;
    const grabY = event.clientY - card.top;
    // Capturing keeps the drag going when the pointer outruns the card. It is
    // a nicety, so a browser that refuses it still gets a working drag.
    try {
        dragHandle.setPointerCapture(event.pointerId);
    } catch {
        // Carry on without capture.
    }
    coachmark.classList.add("tutorial-dragging");

    function follow(moveEvent) {
        holdPosition = true;
        placeCoachmark(moveEvent.clientX - grabX, moveEvent.clientY - grabY, 8);
    }

    function release() {
        dragHandle.removeEventListener("pointermove", follow);
        dragHandle.removeEventListener("pointerup", release);
        dragHandle.removeEventListener("pointercancel", release);
        coachmark.classList.remove("tutorial-dragging");
    }

    dragHandle.addEventListener("pointermove", follow);
    dragHandle.addEventListener("pointerup", release);
    dragHandle.addEventListener("pointercancel", release);
});

/*
  A card with hints keeps its finished example back until every hint has
  been read, so the answer is always the last resort rather than the first.
*/
function updateHintControls(step) {
    const hints = step.hints || [];
    hintButton.hidden = hintsShown >= hints.length;
    hintButton.textContent = hintsShown === 0 ? "Show a hint" : "Another hint";
    insertCodeButton.hidden = !(step.code || step.blocks) || hintsShown < hints.length;
}

hintButton.addEventListener("click", () => {
    const step = currentStep();
    const hints = step?.hints || [];
    if (hintsShown >= hints.length) return;

    const hint = document.createElement("p");
    hint.className = "tutorial-hint";
    hint.innerHTML = `<strong>Hint ${hintsShown + 1}.</strong> ${hints[hintsShown]}`;
    hintList.appendChild(hint);
    hintsShown += 1;

    updateHintControls(step);
    /*
      The card has grown. Placing it afresh would send it jumping to another
      side of the page just as the learner asked it for help, often on top of
      the blocks or code they are working on. So it stays put, and only slides
      up as far as it must to stay inside the window.
    */
    holdPosition = true;
    const card = coachmark.getBoundingClientRect();
    placeCoachmark(card.left, card.top);
});

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

    // Each card starts with its hints folded away and placed automatically.
    hintsShown = 0;
    hintList.textContent = "";
    holdPosition = false;
    insertCodeButton.textContent = step.blocks
        ? "Replace blocks with example"
        : "Replace editor with example";
    updateHintControls(step);

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

    // Shown again as it was, rather than rendered afresh: a fresh render
    // would reset a card the learner had already passed back to waiting
    // for a run, and put its example back over their code.
    if (resumeAfterSelector) showCoachmark();
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
  On a slow connection the blocks editor can arrive after the tutorial has
  begun, so an example put in before then went nowhere. It gets the one the
  learner would have been given by now.
*/
document.addEventListener("maze:blocks-ready", () => {
    const tutorial = currentTutorial();
    if (!tutorialIsOpen || tutorial?.programMode !== "blocks") return;

    const given = tutorial.steps
        .slice(0, currentStepIndex + 1)
        .filter(step => step.autoInsert)
        .pop();
    if (given) insertExample(given);
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

function minimizeTutorial() {
    if (!tutorialIsOpen || tutorialIsMinimized) return;

    tutorialIsMinimized = true;
    hideCoachmark();
    resumeButton.hidden = false;
    resumeButton.focus({preventScroll: true});
}

minimizeTutorialButton.addEventListener("click", minimizeTutorial);

/*
  Reaching the goal on a tutorial's last cards offers to run the challenge.
  Its panel sits under the tutorial's backdrop, where its Stop button and
  its results cannot be used, so the card makes way. Resume brings it back.
*/
document.addEventListener("challenge:start", minimizeTutorial);

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

// A stopped run never completes, so a card waiting for one asks again.
document.addEventListener("maze:run-stopped", () => {
    clearRunningMazeHighlight();
    const step = currentStep();
    if (tutorialIsOpen && step?.requiresRun && nextButton.disabled) {
        setFeedback("Run the program to complete this step.");
    }
});

openSelector();
