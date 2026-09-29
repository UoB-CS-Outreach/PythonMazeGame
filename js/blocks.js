/*
 * Code blocks mode for the maze activity.
 *
 * Some visitors have never programmed, and typing Python is where many of them
 * stop. Here the program is built by snapping blocks together instead. The
 * blocks turn into Python, which runs through exactly the same path as a typed
 * program, so the mazes, the animation and the step limits are all shared, and
 * Convert to Python hands over the same program as real code.
 *
 * Deliberately small: six blocks, enough for a sequence, a loop and a decision,
 * which is as far as a first five to fifteen minutes goes.
 *
 * Wrapped in a function for the same reason as challenge.js: classic scripts
 * share one global scope. Blockly itself comes from jsDelivr, the same host as
 * Pyodide, so blocks mode needs no network access the page did not already
 * have.
 */

(function () {
    "use strict";

    const blocksArea = document.getElementById("blocksEditor");
    const convertButton = document.getElementById("convertBtn");

    if (typeof Blockly === "undefined" || typeof python === "undefined") {
        // The stylesheet hides the blocks option. Anyone already in blocks
        // mode is told why the area is empty.
        document.documentElement.dataset.blocks = "unavailable";
        blocksArea.querySelector(".blocks-unavailable").textContent =
            "Code blocks could not be loaded. Switch to Python to carry on.";
        return;
    }

    const BLOCKLY_MEDIA = "https://cdn.jsdelivr.net/npm/blockly@13.3.0/media/";

    /* The site's palette: one colour per kind of block. */
    const COLOURS = {
        start: "#12345b",
        action: "#1769e0",
        loop: "#00897f",
        decision: "#7b5cd6",
    };

    const PATHS = [
        ["ahead", "ahead"],
        ["to the left", "left"],
        ["to the right", "right"],
    ];

    // Shaped like Scratch's start blocks, with a rounded top, so it reads as
    // the place the program begins rather than as one more instruction.
    Blockly.Blocks.maze_start = {
        init() {
            this.jsonInit({
                message0: "when Run is pressed",
                nextStatement: null,
                colour: COLOURS.start,
                tooltip: "The program starts here and runs downwards.",
            });
            this.hat = "cap";
        },
    };

    Blockly.defineBlocksWithJsonArray([
        {
            type: "maze_move",
            message0: "move forward",
            previousStatement: null,
            nextStatement: null,
            colour: COLOURS.action,
            tooltip: "Move one square in the direction the triangle faces.",
        },
        {
            type: "maze_turn_left",
            message0: "turn left ↺",
            previousStatement: null,
            nextStatement: null,
            colour: COLOURS.action,
            tooltip: "Turn a quarter turn left, on the spot.",
        },
        {
            type: "maze_turn_right",
            message0: "turn right ↻",
            previousStatement: null,
            nextStatement: null,
            colour: COLOURS.action,
            tooltip: "Turn a quarter turn right, on the spot.",
        },
        {
            type: "maze_repeat_until_goal",
            message0: "repeat until at goal",
            message1: "%1",
            args1: [{type: "input_statement", name: "DO"}],
            previousStatement: null,
            nextStatement: null,
            colour: COLOURS.loop,
            tooltip: "Run the blocks inside again and again until the " +
                "triangle is on the green square.",
        },
        {
            type: "maze_repeat_while_path",
            message0: "repeat while path %1 is open",
            args0: [{type: "field_dropdown", name: "PATH", options: PATHS}],
            message1: "%1",
            args1: [{type: "input_statement", name: "DO"}],
            previousStatement: null,
            nextStatement: null,
            colour: COLOURS.loop,
            tooltip: "Run the blocks inside again and again for as long as " +
                "that path is open.",
        },
        {
            type: "maze_if_else",
            message0: "if path %1 is open",
            args0: [{type: "field_dropdown", name: "PATH", options: PATHS}],
            message1: "%1",
            args1: [{type: "input_statement", name: "DO"}],
            message2: "else %1",
            args2: [{type: "input_statement", name: "ELSE"}],
            previousStatement: null,
            nextStatement: null,
            colour: COLOURS.decision,
            tooltip: "If the path is open, run the first set of blocks. " +
                "If not, run the blocks under else.",
        },
    ]);

    /*
      Each block becomes the Python a learner would have typed, with four
      spaces of indentation as in the rest of the activity. An if with an
      empty else leaves the else out, as a person writing it would.
    */
    const generator = python.pythonGenerator;
    generator.INDENT = "    ";

    function body(block, name) {
        return generator.statementToCode(block, name) || `${generator.INDENT}pass\n`;
    }

    generator.forBlock.maze_start = () => "";
    generator.forBlock.maze_move = () => "move()\n";
    generator.forBlock.maze_turn_left = () => "turn_left()\n";
    generator.forBlock.maze_turn_right = () => "turn_right()\n";
    generator.forBlock.maze_repeat_until_goal = block =>
        `while not at_goal():\n${body(block, "DO")}`;
    generator.forBlock.maze_repeat_while_path = block =>
        `while path_${block.getFieldValue("PATH")}():\n${body(block, "DO")}`;
    generator.forBlock.maze_if_else = block => {
        const otherwise = generator.statementToCode(block, "ELSE");
        return `if path_${block.getFieldValue("PATH")}():\n${body(block, "DO")}` +
            (otherwise ? `else:\n${otherwise}` : "");
    };

    const TOOLBOX = {
        kind: "flyoutToolbox",
        contents: [
            "maze_move",
            "maze_turn_left",
            "maze_turn_right",
            "maze_repeat_until_goal",
            "maze_repeat_while_path",
            "maze_if_else",
        ].map(type => ({kind: "block", type})),
    };

    let workspace = null;

    function createWorkspace() {
        blocksArea.textContent = "";
        workspace = Blockly.inject(blocksArea, {
            toolbox: TOOLBOX,
            renderer: "zelos",
            media: BLOCKLY_MEDIA,
            // A room full of lab PCs clicking at once is noise enough.
            sounds: false,
            // Blockly's bin reopens every deleted block, including each
            // example the tutorial replaced, as a heap of grey blocks.
            // Dragging a block back into the list deletes it anyway.
            trashcan: false,
            maxInstances: {maze_start: 1},
            grid: {spacing: 24, length: 2, colour: "#dbe2ea", snap: true},
            // Small enough that the right-hand rule, the widest program the
            // tutorial builds, fits beside the list of blocks on a 1366 or
            // 1920 pixel wide screen.
            zoom: {controls: true, startScale: 0.8},
            move: {scrollbars: true, drag: true, wheel: true},
        });
        // Blocks not joined to "when Run is pressed" are greyed out, which
        // shows why they are not doing anything.
        workspace.addChangeListener(Blockly.Events.disableOrphans);
        // Selecting or scrolling changes nothing about the program.
        workspace.addChangeListener(event => {
            if (!event.isUiEvent) updateConvertButton();
        });
        loadProgram([]);
    }

    /*
      Examples are written as short lists rather than Blockly's own format:
      "move", "turn_left" and "turn_right" are single blocks, and
      {if, do, else}, {while, do} and {untilGoal} are the blocks with gaps.
    */
    function toBlockState(step) {
        if (typeof step === "string") return {type: `maze_${step}`};

        const inputs = {};
        const setInput = (name, steps) => {
            const first = chain(steps);
            if (first) inputs[name] = {block: first};
        };

        if (step.if) {
            setInput("DO", step.do);
            setInput("ELSE", step.else);
            return {type: "maze_if_else", fields: {PATH: step.if}, inputs};
        }
        if (step.while) {
            setInput("DO", step.do);
            return {type: "maze_repeat_while_path", fields: {PATH: step.while}, inputs};
        }
        setInput("DO", step.untilGoal);
        return {type: "maze_repeat_until_goal", inputs};
    }

    function chain(steps = []) {
        return steps.reduceRight((next, step) => {
            const state = toBlockState(step);
            if (next) state.next = {block: next};
            return state;
        }, null);
    }

    function loadProgram(steps) {
        const start = {type: "maze_start", x: 24, y: 24, deletable: false};
        const first = chain(steps);
        if (first) start.next = {block: first};
        Blockly.serialization.workspaces.load(
            {blocks: {languageVersion: 0, blocks: [start]}},
            workspace,
        );
        // Blockly reports the change on the next animation frame. Loading is
        // done now, so the button need not wait for it.
        updateConvertButton();
    }

    /*
      The program as Python, read from "when Run is pressed" downwards only,
      so a stray block lying elsewhere on the workspace never runs. With
      highlight, each block first reports itself, which is how the page
      lights up the block that is running.
    */
    function toPython({highlight = false} = {}) {
        if (!workspace) return "";
        const start = workspace.getTopBlocks(false)
            .find(block => block.type === "maze_start");
        if (!start) return "";

        generator.STATEMENT_PREFIX = highlight ? "_highlight_block(%1)\n" : null;
        try {
            generator.init(workspace);
            const code = generator.finish(generator.blockToCode(start));
            // finish() puts blank lines where imports would go; there are none.
            return code.replace(/^\s*\n/, "");
        } finally {
            generator.STATEMENT_PREFIX = null;
        }
    }

    /* Blockly measures its container, so it can only be set up once visible. */
    function showBlocks() {
        if (!workspace) {
            createWorkspace();
        } else {
            Blockly.svgResize(workspace);
        }
    }

    document.addEventListener("maze:mode", event => {
        if (event.detail.mode === "blocks") showBlocks();
        else workspace?.highlightBlock(null);
    });
    if (document.documentElement.dataset.mode === "blocks") showBlocks();

    /* Put the blocks' Python into the editor; that switches to Python mode. */
    function convertToPython() {
        const game = globalThis.mazeGame;
        const code = toPython();
        if (!game || !code.trim()) return;

        const converted = `# Your blocks, written as Python\n${code}`;
        game.replaceCode(converted, "Replace your Python code with your blocks?");
    }

    /*
      With nothing under "when Run is pressed" there is nothing to convert,
      and switching to an unchanged Python editor would look like the button
      had done something. So it waits, greyed out, and its tooltip says why.
      Loose blocks elsewhere on the workspace do not count: they do not run.
    */
    function updateConvertButton() {
        const empty = !toPython().trim();
        convertButton.disabled = empty;
        convertButton.title = empty
            ? "Add blocks under “when Run is pressed” first."
            : "";
    }

    convertButton.addEventListener("click", convertToPython);

    globalThis.mazeBlocks = {
        convertToPython,
        /* Replace the program with an example, e.g. ["move", "move"]. */
        load: steps => {
            if (!workspace) createWorkspace();
            loadProgram(steps);
        },
        python: toPython,
        highlight: id => {
            try {
                workspace?.highlightBlock(id);
            } catch {
                // The block was deleted while the program was running.
            }
        },
        clearHighlight: () => workspace?.highlightBlock(null),
    };

    // Blockly can arrive after a tutorial has already tried to load blocks.
    document.dispatchEvent(new CustomEvent("maze:blocks-ready"));
}());
