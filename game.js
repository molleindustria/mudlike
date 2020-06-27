//settings are just variables that can be sent to the client from the server
//they are either related to the rooms or shared with the server 
module.exports.SETTINGS = {
    //the twee file
    STORY_FILE: "story.tw",
    //if not specified by the url where is the starting point
    firstPassage: "Start",
    ////for testing purposes I can skip the login phase
    //and join with a random avatar
    QUICK_LOGIN: false,
    //minimum time between talk messages enforced by both client and server
    ANTI_SPAM: 1000,
    talkPrompt: "Type to talk",
    privatePrompt: "Type to whisper to "
};


//snippets of text that shouldn't be hardcoded
module.exports.TEXT = {
    introText: "<strong>THE END OF THE WORD AS WE KNOW IT</strong> is an exhibition of text games and a multiuser text environment recreating a <a class=\"lowKeyLink\" href=\"http://likelike.org/shows\" target=\"_blank\">playful art gallery</a> in Pittsburgh. Click on links to explore, type to chat. But before your start...<br><br>",
    namePrompt: "What's your name? (type below, enter to confirm)",
    pronounPrompt: "What's your pronoun? (click)",
    descriptionPrompt: "How do you look to other people? <br>Use the third person eg: \"She walks on two legs and has one head.\"",
    disconnect: "$name disappears",
    descriptionBack: "Stop looking at ",
    descriptionIntro: "You look at ",
    lookDescription: "$name looks at you",
    goBack: "Go back",
    snippetExample: "~~~~Reusable bit~~~~~",
    talkingAlone: ["Unfortunately, nobody can hear you", "You say to yourself", "You are out of everybody's earshot", "Nobody is nearby"],

    insecurity_healed: "You are feeling more confident. You have recovered from the Insecurity Virus.",
    shouty_healed: "You take a deep breath and clear your voice. You have recovered from the Shouty Virus.",
    endearing_healed: "Your immune systems fought off the Endearing Virus. That was awkward.",
    valley_healed: "The symptoms of the Valley Virus are fading away.",
    singing_healed: "Your antibodies defeated the Singing Virus. You can take a bow.",

    insecurity_caught: "You are filled with doubt. You possibly caught the Insecurity Virus from ",
    shouty_caught: "DAMN, you caught the SHOUTY VIRUS from ",
    endearing_caught: "Oh dear, you caught the Endearing Virus from ",
    valley_caught: "OMG, you totally caught the Valley virus from ",
    singing_caught: "Your beautiful voice needs to be heard. You caught the Singing Virus from ",

    user_left: " left. This is just a memory.",
    AFK: "- $they appear distracted, as in: Away From Keyboard"
}

//PASSAGES is (ideally) unchangeable data sent by the server to the client, it can be loaded from a twee file
module.exports.PASSAGES = {
    //passage example
    spaceship: {
        text: "{snippet|snippetExample}{playerCondition | GLOBAL_test+example>10 | Yes it is greater than 10| no it isn't bigger than 10} text [[passage text>>action by $name|passageId]]",
        //associate this passage with a chatroom id
        room: "spaceship"
    }

};

//called at the beginning
module.exports.initGame = function (io, gameState, GAME, UTILS) {
    console.log("Game Initialized");

    global.RiTa = require('rita');

    //EVERYTHING GLOBALLLLL
    global.gameState = gameState;
    global.io = io;
    global.GAME = GAME;
    global.UTILS = UTILS;
    global.print = function (l) { console.log(l) };

    global.VIRUS_DURATION = 180; //seconds
    global.VIRUS_IMMUNITY = 180; //seconds
    global.CONTAGION_PROBABILITY = 30; //per talk

}

module.exports.PRONOUNS = {
    they: ["They", "Them", "Their", "Theirs", "Themself", "Is", "Are", "Do", "Does"],
    theyPlural: ["They", "Them", "Their", "Theirs", "Themselves", "Are", "Are", "Do", "Do"],
    he: ["He", "Him", "His", "His", "Himself", "Is", "Is", "Does", "Does"],
    she: ["She", "Her", "Her", "Hers", "Herself", "Is", "Is", "Does", "Does"],
}

//global variables that can be accessed and modified by expressions inside macros
module.exports.GLOBAL = {
    test: 5,
    counter: 0,
    globalState: "space"
}

//room titles to display, if undefined don't show any
module.exports.ROOM_TITLES = {
    likelike: "THE VENUE",
    dancefloor: "THE DANCEFLOOR",
    table: "THE TABLE",
    cabinet: "THE ARCADE",
    backyard: "THE BACKYARD",
    basement: "THE BASEMENT"
}

//called upon player initialization (login)
module.exports.initPlayer = function (p) {

    var viruses = {
        insecurity: { percent: 20 },
        shouty: { percent: 20 },
        endearing: { percent: 20 },
        valley: { percent: 50 },
        singing: { percent: 20 },
        healthy: { percent: 0 }
    }

    //count players
    var playersTotal = Object.keys(io.sockets.connected).length;

    //reset count
    for (rId in viruses) {
        viruses[rId].count = 0;
    }

    //
    for (var id in gameState.players) {
        if (gameState.players[id].viruses != null) {
            for (var vId in gameState.players[id].viruses) {
                if (gameState.players[id].viruses[vId] > 0)
                    viruses[vId].count++;
            }
        }
    }

    //see what role is farther than the prescribed percent
    var mostNeeded = "";
    var biggestGap = -100;

    //compare the gaps
    for (rId in viruses) {
        role = viruses[rId];
        var target = role.percent * (playersTotal) / 100;
        var current = role.count;
        var gap = target - current;
        //print(rId + ": total players " + playersTotal + " } " + target + " target users - " + current + " current users = " + gap);

        if (gap > biggestGap) {
            mostNeeded = rId;
            biggestGap = gap;
            //print(biggestGap);

        }
    }

    //initialize viruses
    p.viruses = {
        insecurity: 0,
        shouty: 0,
        endearing: 0,
        valley: 0,
        singing: 0
    }

    if (mostNeeded != "healthy") {
        p.viruses[mostNeeded] = VIRUS_IMMUNITY + VIRUS_DURATION;
        console.log(p.nickName + " is " + mostNeeded);
    }

}

//allows to replace or modify a player description before it's sent to the client
module.exports.descriptionFilter = function (html, target, requester) {

    return html;
}


//allows to replace or modify a passage before it's sent to the client
module.exports.passageFilter = function (html, requester, passageId) {
    return html;
}

//eat a candy
module.exports.candy = function (playerId, arguments) {
    try {


        var p = gameState.players[playerId];
        if (p.room) {
            io.sockets.sockets[playerId].broadcast.to(p.room).emit("actionMessage", UTILS.nameLink(playerId) + " eats a candy.");

            var newVirus = "none";
            //find a virus that they don't have
            for (rId in p.viruses) {
                if (p.viruses[rId] <= 0)
                    newVirus = rId;
            }

            if (newVirus != "none") {
                p.viruses[newVirus] = VIRUS_IMMUNITY + VIRUS_DURATION;
                //console.log(p.nickName + " gets " + newVirus);
                var notification = GAME.TEXT[newVirus + "_caught"] + "the candy.";
                io.sockets.sockets[playerId].emit("actionMessage", notification);
            }
            else {
                io.sockets.sockets[playerId].emit("actionMessage", "It's sweet but nothing special.");
            }
        }

    }
    catch (e) {
        console.error(e);
    }
}

//pet the dog
module.exports.pet = function (playerId, arguments) {
    try {
        var p = gameState.players[playerId];
        if (p.room) {
            io.sockets.sockets[playerId].broadcast.to(p.room).emit("actionMessage", UTILS.nameLink(playerId) + " pets Harvey the dog.");
            io.sockets.sockets[playerId].emit("actionMessage", "You pet Harvey. Harvey rolls on his back.");
        }

    }
    catch (e) {

        console.error(e);
    }
}

//allows to replace or modify a player description before it's sent to the client
module.exports.talkFilter = function (msg, player) {


    if (player.viruses.endearing > VIRUS_IMMUNITY) {
        var terms = ["Honey, ", "Baby, ", "My Darling, ", "Hun, ", "Babe, ", "Sweetie, ", "Dear, "];
        var prefix = UTILS.randomIn(terms);
        msg = prefix + msg;
    }

    if (player.viruses.valley > VIRUS_IMMUNITY) {

        var modified = "";

        //opening
        if (UTILS.randomInt(0, 100) < 20) {
            modified += UTILS.randomIn(["So anyway, ", "OMG, "]);
        }
        //like, ya know
        var tok = RiTa.tokenize(msg);
        //print(tok);
        for (var i = 0; i < tok.length; i++) {
            var w = tok[i];

            if (w == "is" || w == "are" || w == "was" || w == "were" || w == "I'm" || w == "that's" || w == "'re") {
                if (UTILS.randomInt(0, 100) < 50) {
                    modified += w + UTILS.randomIn([" like, ", " like, you know, "]);
                }
                else
                    modified += w + " ";
            }
            else if (RiTa.isAdjective(w)) {
                if (UTILS.randomInt(0, 100) < 50 && modified.indexOf("like") == -1)
                    modified += UTILS.randomIn([" like, ", "like, totally ", " literally ", "totally "]) + w + " ";
                else
                    modified += w + " ";
            }
            else if (RiTa.isPunctuation(w)) {
                //remove last space
                if (modified.charAt(modified.length - 1) == " ") {
                    modified = modified.substr(0, modified.length - 1);
                }

                modified += w + " ";
            }
            else
                modified += w + " ";

        }

        if (UTILS.randomInt(0, 100) < 20) {
            modified += UTILS.randomIn([" right?", " I know right?"]);
        }

        msg = modified;
    }



    if (player.viruses.singing > VIRUS_IMMUNITY) {
        //randomly adds vowels
        var mArray = msg.split("");

        for (var i = mArray.length - 1; i >= 0; i--) {
            var l = mArray[i];

            if (l == "a" || l == "e" || l == "i" || l == "o" || l == "u") {
                if (UTILS.randomInt(0, 100) < 50) {

                    var sing = UTILS.randomInt(0, 8);

                    for (var j = 0; j < sing; j++) {
                        mArray.splice(i, 0, l);
                    }
                }
            }
        }

        msg = mArray.join("");
    }

    if (player.viruses.shouty > VIRUS_IMMUNITY) {
        msg = msg.toUpperCase() + "!";
    }

    if (player.viruses.insecurity > VIRUS_IMMUNITY) {
        msg += "?";
    }

    //contagion//////////////
    if (player.room != null) {

        //for all players in the same room
        for (var id in gameState.players) {
            if (gameState.players[id].room == player.room && id != player.id) {

                var other = gameState.players[id];
                var caught = false;
                //for all viruses 
                for (var vId in player.viruses) {

                    //contagious and other is not immune
                    if (player.viruses[vId] > VIRUS_IMMUNITY && other.viruses[vId] <= 0 && !caught) {

                        if (UTILS.randomInt(0, 100) < CONTAGION_PROBABILITY) {
                            var notification = GAME.TEXT[vId + "_caught"] + UTILS.nameLink(player.id);
                            io.sockets.sockets[other.id].emit("actionMessage", notification);
                            caught = true;
                            other.viruses[vId] = VIRUS_IMMUNITY + VIRUS_DURATION;
                        }

                    }
                }
            }
        }

    }


    return msg;
}



//custom macros aka scripts embedded in passages {macroName|arg1|...|argN}
module.exports.MACROS = {
    //first arg[] is the macro id itself 

    //output if player has the virus 
    //{virus|virusname|text if player has that virus|text if they don't(optional)}
    virus: function (args, p) {

        if (args.length >= 3) {
            var txt = "";

            for (var vId in p.viruses) {
            }
            //infected with that particular virus
            if (p.viruses[args[1]] > VIRUS_IMMUNITY)
                txt = args[2];
            else if (args[3])
                txt = args[3];

            return txt;
        }
        else
            console.log("Argument error on " + args.join("|"));
    },

    //output if player has not viruses
    //{healthy|text if player has no viruses|text if they have any viruses(optional)}

    healthy: function (args, p) {

        if (args.length >= 2) {
            var txt = "";
            var infected = false;

            for (var vId in p.viruses) {
                if (p.viruses[vId] > VIRUS_IMMUNITY)
                    infected = true;
            }

            if (!infected)
                txt = args[1];
            else if (args[2])
                txt = args[2];


            return txt;
        }
        else
            console.log("Argument error on " + args.join("|"));
    }

}

//custom admin commands {macroName|arg1|...|argN}
module.exports.ADMIN = {
    //first arg[] is the macro id itself 

    //output if player has the virus 
    //  /variable varName=value
    variable: function (args, p) {
        try {


            if (args[1] != null) {
                console.log("Admin changes variable " + args[1]);
                var exp = args[1].split("=");

                if (exp.length == 2) {
                    if (global[exp[0]] != null) {
                        console.log("Variable is " + exp[0]);
                        var val = parseInt(exp[1]);

                        if (!isNaN(val)) {
                            console.log("Admin changes variable " + args[1]);
                            global[exp[0]] = val;
                        }
                        else {

                        }
                    }
                    else
                        console.log("No variable named " + exp[0]);
                }
            }
        }
        catch (e) {

        }
    }
}

//update viruses
module.exports.everySecond = function () {

    for (var pId in gameState.players) {

        var p = gameState.players[pId];
        for (id in p.viruses) {

            //sick and contagious
            if (p.viruses[id] > VIRUS_IMMUNITY) {
                p.viruses[id]--;

                //just healed message, only if player actually spoke (to implement)
                if (p.viruses[id] <= VIRUS_IMMUNITY) {
                    io.sockets.sockets[pId].emit("actionMessage", GAME.TEXT[id + "_healed"]);
                }
            }
            ////
            else if (p.viruses[id] > 0) {
                p.viruses[id]--;
            }
        }
    }
}