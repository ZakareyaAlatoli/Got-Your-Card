//Express is a framework for making web sites
const express = require('express');
//'app' is the Express application which we send data to
const app = express();
//http library contains various tools for setting up a server to receive http requests
const http = require('http');
//this is where the server is created
const server = http.createServer(app);
//we import the 'Server' class from 'socket.io' to upgrade the http connection to websockets
const { Server } = require("socket.io");
//'io' is a websocket server (connect to it with "ws://..." instead of "http://...")
const io = new Server(server);
//this is a middleware to read/write cookies so if players disconnect by accident they
//don't lose all progress
const cookieParser = require('cookie-parser');
//This should generate unique IDs for each user
const {v4 : uuidv4 } = require('uuid');
//Used to fetch the user ID so we don't have to rely on socket.id
app.use(cookieParser());

app.use(express.static(__dirname + '/public'));

//when a GET http request is sent to root of the website, return an html page
app.get('/', (req, res) => {
    gycID = req.cookies['gycID'];
    if(!gycID){
        gycID = uuidv4();
        res.cookie('gycID', gycID);
    }
    res.sendFile(__dirname + '/index.html');
});

//All of this information about connected players and rooms might
//need to be stored in databases in production

//When a player connects, their socket.id is mapped to their cookie id
var playerBySocket = {}

var socketByPlayer = {}
//When a player disconnects, they will be removed from any lobby
//if they don't reconnect for a certain time
var disconnectedPlayers = []
//Used to remove timeout delays for any reason
var timeouts = {}
//Keeps track of which players are in a given room
var playersByRoom = {}
//Keeps track of which room a player is in in case they disconnect for a moment
var roomByPlayer = {}
//Keeps track of player names
var nameByPlayer = {}
//Maps roomID to gameState
var roomGameState = {}
//Valid states:
//LOBBY
//QUESTIONING
//ANSWERING
//MATCHING
//RESULTS

//GLOBAL CONSTANTS
const maxPlayers = 10;

//HELPER FUNCTIONS
function removePlayer(id){
    index = disconnectedPlayers.indexOf(id);
    disconnectedPlayers.splice(index, 1);
    delete timeouts[id];
    delete nameByPlayer[id];
    delete socketByPlayer[id];
    const roomID = roomByPlayer[id];
    delete roomByPlayer[id];
    if(roomID){
        leaveRoom(id, roomID);
    }
}
//Lets players know when someone joined or left
function roomChange(roomID, socket = null){
    names = [];
    playersByRoom[roomID].forEach(player => {
        names.push(nameByPlayer[player]);
    });
    //For emitting to a single client
    if(socket){
        socket.emit('room-state', roomID, playersByRoom[roomID], names, maxPlayers);
        return;
    }
    io.to(roomID).emit('room-state', roomID, playersByRoom[roomID], names, maxPlayers);
}
//Removes a player from a room. The server doesn't
//use the websocket connection to determine if a 
//player is in a room.
function leaveRoom(id, roomID){
    delete roomByPlayer[id];
    index = playersByRoom[roomID].indexOf(id);
    playersByRoom[roomID].splice(index,1);
    if(playersByRoom[roomID].length <= 0){
        delete playersByRoom[roomID];
        return;
    }
    roomChange(roomID);
}
function enterRoom(id, roomID){
    roomByPlayer[id] = roomID;
    playersByRoom[roomID].push(id);
    roomChange(roomID);
}
function endGame(roomID){
    gameState = roomGameState[roomID];
    if(!gameState){
        return;
    }

    if(gameState.state != 'LOBBY' && gameState.state != 'RESULTS'){
        delete gameState.questions;
        delete gameState.answers;
        delete gameState.answersByQuestioner;
        delete gameState.matches;
        delete gameState.expectedMatchOrder;
        clearTimeout(gameState.timer);
        delete gameState.timer;

        players = playersByRoom[roomID];
        players.forEach(player => {
            //The game has ended, so disconnected players will be removed
            //if they don't reconnect
            //TODO: Make sure players who reconnect stay in their room
            if(disconnectedPlayers.includes(player)){
                timeouts[player] = setTimeout(removePlayer, 10000, player);
                io.to(roomID).emit('heartbeat');
            }
        });
        gameState.state = 'LOBBY';
        io.to(roomID).emit('enter-lobby');
        return;
    }
}
function closeRoom(roomID){
    delete roomGameState[roomID];
    players = playersByRoom[roomID];
    if(players){
        players.forEach(player => {
            delete roomByPlayer[player];
        })
    }
}

const phaseDuration = 60000;
//Phase controls
function enterQuestionPhase(roomID){
    players = playersByRoom[roomID];
    gameState = roomGameState[roomID];
    gameState.state = 'QUESTIONING';

    gameState.questions = {};
    //If players aren't done with questions after the time limit
    //fill out their answers
    gameState.timer = setTimeout(() => {
        players.forEach(player => {
            //If a player has not submitted a question fill them in
            //with one
            if(!gameState.questions[player]){
                gameState.questions[player] = 'NO QUESTION SUBMITTED';
            }
        });
        enterAnswerPhase(roomID);
    }, phaseDuration);

    io.to(roomID).emit('game-start');
}
function enterAnswerPhase(roomID){
    players = playersByRoom[roomID];
    gameState = roomGameState[roomID];
    gameState.state = 'ANSWERING';

    gameState.answers = {};
    gameState.answersByQuestioner = {};
    clearTimeout(gameState.timer);

    gameState.timer = setTimeout(() => {
        players.forEach(answerer => {
            //If a player hasn't submitted answers...
            if(!gameState.answers[answerer]){
                gameState.answers[answerer] = {};
                players.forEach(questioner => {
                    if(answerer != questioner){
                        //Generate them placeholder answers
                        gameState.answers[answerer][questioner] = 'NO ANSWER GIVEN';
                        if(!gameState.answersByQuestioner[questioner]){
                            gameState.answersByQuestioner[questioner] = {};
                            gameState.answersByQuestioner[questioner][answerer] = 'NO ANSWER GIVEN';
                        }
                        else{
                            gameState.answersByQuestioner[questioner][answerer] = 'NO ANSWER GIVEN';
                        }
                    }
                })
                
            }
            //Else if a player HAS submitted answers...
            else{
                players.forEach(questioner => {
                    if(answerer != questioner){
                        //but an answer was not given to a particular question...
                        if(!gameState.answers[answerer][questioner]){
                            gameState.answers[answerer][questioner] = 'NO ANSWER GIVEN';
                            if(!gameState.answersByQuestioner[questioner]){
                                gameState.answersByQuestioner[questioner] = {};
                                gameState.answersByQuestioner[questioner][answerer] = 'NO ANSWER GIVEN';
                            }
                            else{
                                gameState.answersByQuestioner[questioner][answerer] = 'NO ANSWER GIVEN';
                            }
                        }
                    }
                })
            }
        })
        enterMatchPhase(roomID);
    }, phaseDuration);

    io.to(roomID).emit('answer-phase', gameState.questions);
}
function enterMatchPhase(roomID){
    players = playersByRoom[roomID];
    gameState = roomGameState[roomID];
    gameState.state = 'MATCHING';
    //For each player we randomize the order the answers were given
    
    gameState.matches = {};
    gameState.expectedMatchOrder = {}
    clearTimeout(gameState.timer);
    
    gameState.timer = setTimeout(() => {
        players.forEach(player => {
            if(!gameState.matches[player]){
                gameState.matches[player] = new Array(players.length-1).fill(-1);
            }
        })
        enterResultsPhase(roomID);
    }, phaseDuration);
    players.forEach(player => {
        names = [];
        answers = [];
        question = gameState.questions[player];
        expectedOrder = [];
        receivedAnswers = gameState.answersByQuestioner[player];

        for(answerer in receivedAnswers){
            answers.push(receivedAnswers[answerer]);
        }

        for(i=0; i<players.length; i++){
            if(players[i] != player){
                expectedOrder.push(i);
                currentPlayer = players[i];
            }
        }
        //When a player submits their matches, it is in the form of an array of indices. The names
        //are sent to the client in the order the answers are to be matched. For instance, if the 
        //expectedOrder array is [0,3,1,4], then the names sent to the client are [player0, player3, player1, player4]
        //Only the player's own name is not sent. When checking if the matches are correct, the player's own index
        //in the playersByRoom array is skipped over. So if the submitting player is player3, the array they would send
        //is [0,1,4],
        gameState.expectedMatchOrder[player] = expectedOrder.sort(() => Math.random() - 0.5);
        gameState.expectedMatchOrder[player].forEach(index => {
            names.push(nameByPlayer[players[index]]);
        })
        socketByPlayer[player].emit('matching-phase', names, question, answers);
    })
}
function enterResultsPhase(roomID){ 
    players = playersByRoom[roomID];
    gameState = roomGameState[roomID];
    gameState.state = 'RESULTS';

    clearTimeout(gameState.timer);

    results = [];
    players.forEach(player => {
        //The game has ended, so disconnected players will be removed
        //if they don't reconnect
        //TODO: Make sure players who reconnect stay in their room
        if(disconnectedPlayers.includes(player)){
            timeouts[player] = setTimeout(removePlayer, 10000, player);
            io.to(roomID).emit('heartbeat');
        }
        result = {};
        result.name = nameByPlayer[player];
        result.question = gameState.questions[player];
        receivedAnswers = gameState.answersByQuestioner[player];
        result.answers = [];
        for(answerer in receivedAnswers){
            result.answers.push({
                name: nameByPlayer[answerer],
                answer: receivedAnswers[answerer]
            });
        }
        //Calculate score
        expectedOrder = gameState.expectedMatchOrder[player];
        actualOrder = gameState.matches[player];
        score = 0;
        playerIndex = players.indexOf(player);
        for(i=0; i<expectedOrder.length; i++){
            expected = expectedOrder[i];
            if(expected >= playerIndex){
                expected -= 1;
            }
            if(expected == actualOrder[i]){
                score += 1;
            }
        }
        result.score = score;
        results.push(result);
    })

    io.to(roomID).emit('results-phase', results);
}










//this sets up a callback when a client connects to the server
io.on('connection', (socket) => {
    //When the client connects, we get an id saved in their cookies. This is so
    //they can reconnect to a game in progress, because reconnecting generates
    //a new websocket id
    socket.emit('get-id');
    //When it is received we check to see if they are already in a lobby, so 
    //we can rejoin them
    //TODO: Validate id
    socket.on('received-id', (id) => {
        //If a player is already connected with this id...
        if(socketByPlayer[id]){
            socket.emit('error', 'Your ID is already taken. Try deleting your cookies');
            return;
        }
        playerBySocket[socket.id] = id;
        socketByPlayer[id] = socket;

        roomID = roomByPlayer[id];
        if(disconnectedPlayers.includes(id)){
            clearTimeout(timeouts[id]);
            delete timeouts[id];
            index = disconnectedPlayers.indexOf(id);
            disconnectedPlayers.splice(index, 1);
        }
        if(nameByPlayer[id]){
            socket.emit('name-set', nameByPlayer[id]);
        }
        roomID = roomByPlayer[id];
        //If a player refreshes the page they need to get back
        //all the data they lost
        if(roomID){
            socket.join(roomID);
            state = roomGameState[roomID].state;
            players = playersByRoom[roomID];

            if(state == 'LOBBY'){
                roomChange(roomID, socket);
                socket.emit('enter-lobby');
            }
            else if(state == 'QUESTIONING'){
                question = "";
                if(gameState.questions[id]){
                    question = gameState.questions[id];
                }
                socket.emit('game-start', question);
            }
            else if(state == 'ANSWERING'){
                socket.emit('answer-phase', gameState.questions);
            }
            else if(state == 'MATCHING'){
                names = [];
                order = gameState.expectedMatchOrder[id];
                order.forEach(i => {
                    names.push(nameByPlayer[players[i]]);
                })
                question = gameState.questions[id];
                answers = [];
                players.forEach(player => {
                    if(player != id){
                        previousAnswers = gameState.answers[player];
                        for(questioner in previousAnswers){
                            if(questioner == id){
                                answers.push(previousAnswers[questioner]);
                            }
                        }
                    }
                })
                socket.emit('matching-phase', names, question, answers);
            }
            else if(state == 'RESULTS'){    
                results = [];
                players.forEach(player => {
                    result = {};
                    result.name = nameByPlayer[player];
                    result.question = gameState.questions[player];
                    receivedAnswers = gameState.answersByQuestioner[player];
                    result.answers = [];
                    for(answerer in receivedAnswers){
                        result.answers.push({
                            name: nameByPlayer[answerer],
                            answer: receivedAnswers[answerer]
                        });
                    }
                    //Calculate score
                    expectedOrder = gameState.expectedMatchOrder[player];
                    actualOrder = gameState.matches[player];
                    score = 0;
                    playerIndex = players.indexOf(player);
                    for(i=0; i<expectedOrder.length; i++){
                        expected = expectedOrder[i];
                        if(expected >= playerIndex){
                            expected -= 1;
                        }
                        if(expected == actualOrder[i]){
                            score += 1;
                        }
                    }
                    result.score = score;
                    results.push(result);
                })
                socket.emit('results-phase', results);
            }
        }
    })
    socket.on('heartbeat', (id) => {
        clearTimeout(timeouts[id]);
    })
    socket.on('enter-name', (id,nickname) => {
        if(roomByPlayer[id]){
            socket.emit('error', 'Cannot set name while in a room');
            return;
        }
        nameByPlayer[id] = nickname;
        socket.emit('name-set', nickname);
    });
    //Below are a list of callbacks for different events
    //Some have parameters and some don't
    socket.on('disconnect', () => {
        const _sID = socket.id;
        const id = playerBySocket[_sID];
        disconnectedPlayers.push(id);

        //If the disconnected player is in a room...
        if(roomByPlayer[id]){
            roomID = roomByPlayer[id];
            gameState = roomGameState[roomID];
            //and the game hasn't started, time out player
            if(gameState.state == 'LOBBY' || gameState.state == 'RESULTS'){
                timeouts[id] = setTimeout(removePlayer, 10000, id);
            }
        }
        else{
            timeouts[id] = setTimeout(removePlayer, 10000, id);
        }
        delete playerBySocket[_sID];
        delete socketByPlayer[id];
    });
    //Fired when user wants to make a new room
    socket.on('create-room', (id) => {
        if(roomByPlayer[id]){
            socket.emit('error', `You are already in room ${roomByPlayer[id]}`);
            return;
        }
        //TODO: Make roomIDs truly unique
        roomID = uuidv4().substring(0,6);
        //This will loop to make sure no previously allocated roomID
        //is used again
        while(playersByRoom[roomID]){
            roomID = uuidv4().substring(0,6);
        }
        playersByRoom[roomID] = [id];
        roomGameState[roomID] = {
            state: 'LOBBY'
        };
        roomByPlayer[id] = roomID;
        socket.join(roomID);
        socket.emit('enter-lobby');
        roomChange(roomID);
    })
    socket.on('join-room', (id, roomID) => {
        if(roomByPlayer[id]){
            socket.emit('error', `You are already in room ${roomByPlayer[id]}`);
            return;
        }
        //Check to see if this room exists
        if(playersByRoom[roomID]){
            if(playersByRoom[roomID].length >= maxPlayers){
                socket.emit('error', 'This room is full');
                return;
            }
            socket.join(roomID);
            socket.emit('enter-lobby');
            enterRoom(id, roomID);
        }
        else{
            socket.emit('error', 'That room does not exist');
        }
    })
    socket.on('leave-room', (id) => {
        roomID = roomByPlayer[id];
        if(roomID){
            socket.leave(roomID);
            socket.emit('left-room');
            leaveRoom(id, roomID);
        }
        else{
            socket.emit('error', 'You aren\'t in a room');
        }
    })
    socket.on('start-game', (id) => {
        roomID = roomByPlayer[id];
        players = playersByRoom[roomID];
        gameState = roomGameState[roomID];
        if(players.length <= 1){
            socket.emit('error', 'You need at least 2 players to start a game');
            return;
        }
        if(gameState.state != 'LOBBY' && gameState.state != 'RESULTS'){
            socket.emit('error', 'A game is already in progress in this room');
            return;
        }
        if(id != playersByRoom[roomID][0]){
            socket.emit('error', 'Only Player 1 can start a game');
            return;
        }
        //Prevent players from being removed via disconnected sockets
        //when the game starts. This is to prevent players who might
        //be suffering from temporary disconnects form being booted
        //from the lobby. If they are still not connected when the
        //game ends they should be removed from the room
        players.forEach(player => {
            if(disconnectedPlayers.includes(player)){
                clearTimeout(timeouts[player]);
            }
        })
        //Reset game state if we are starting over
        delete gameState.questions;
        delete gameState.answers;
        delete gameState.answersByQuestioner;
        delete gameState.matches;
        delete gameState.expectedMatchOrder;
        delete gameState.timer;
        enterQuestionPhase(roomID);
    })
    socket.on('end-game', (id) => {
        roomID = roomByPlayer[id];
        if(!roomID){
            socket.emit('error', 'You are not in a room');
            return;
        }
        gameState = roomGameState[roomID];
        if(gameState.state == 'LOBBY' || gameState.state == 'RESULTS'){
            socket.emit('error', 'Game is not in progress');
            return;
        }
        if(id != playersByRoom[roomID][0]){
            socket.emit('error', 'Only Player 1 can end a game in progress');
            return;
        }
        endGame(roomID);
    })
    socket.on('submit-question', (id, question) => {
        roomID = roomByPlayer[id];
        gameState = roomGameState[roomID];
        if(gameState.state != 'QUESTIONING'){
            socket.emit('error', 'You are not in the question phase');
            return;
        }

        gameState.questions[id] = question;
        remainingPlayers = playersByRoom[roomID].length - Object.keys(gameState.questions).length;
        //If all players have submitted a question
        if(remainingPlayers == 0){
            enterAnswerPhase(roomID);
        }
        else{
            socket.emit('game-message', `Waiting for ${remainingPlayers} player(s)`);
        }
    })
    socket.on('submit-answers', (id, answers) => {
        roomID = roomByPlayer[id];
        gameState = roomGameState[roomID];
        if(gameState.state != 'ANSWERING'){
            socket.emit('error', 'You are not in the answering phase');
            return;
        }
        //We can allow players to submit answers multiple times
        //but their previous answers are overwritten
        gameState.answers[id] = answers;
        for(questioner in answers){
            answer = answers[questioner];
            if(!gameState.answersByQuestioner[questioner]){
                gameState.answersByQuestioner[questioner] = {};
                gameState.answersByQuestioner[questioner][id] = answer;
            }
            else{
                gameState.answersByQuestioner[questioner][id] = answer;
            }
        }   
        //When all players have submitted answers, move on to the next
        //phase
        remainingPlayers = playersByRoom[roomID].length - Object.keys(gameState.answers).length;
        //If all players have submitted a question
        if(remainingPlayers == 0){
            enterMatchPhase(roomID);
        }
        else{
            socket.emit('game-message', `Waiting for ${remainingPlayers} player(s)`);
        }
    })
    socket.on('submit-matches', (id, matches) => {
        roomID = roomByPlayer[id];
        gameState = roomGameState[roomID];
        if(gameState.state != 'MATCHING'){
            socket.emit('error', 'You are not in the matching phase');
            return;
        }

        gameState.matches[id] = matches;
        remainingPlayers = playersByRoom[roomID].length - Object.keys(gameState.matches).length;
        //If all players have submitted a question
        if(remainingPlayers == 0){
            enterResultsPhase(roomID);
        }
        else{
            socket.emit('game-message', `Waiting for ${remainingPlayers} player(s)`);
        }
    })
});

const port = process.env.PORT || 3000;
//this makes the server start listening for incoming requests
server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});