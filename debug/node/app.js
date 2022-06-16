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
const {v4 : uuidv4} = require('uuid');
//Used to fetch the user ID so we don't have to rely on socket.id
app.use(cookieParser());

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
//When a player disconnects, they will be removed from any lobby
//if they don't reconnect for a certain time
var disconnectedPlayers = {}
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
    delete disconnectedPlayers[id];
    delete nameByPlayer[id];
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
    state = roomGameState[roomID].state;
    //For emitting to a single client
    if(socket){
        socket.emit('room-state', roomID, playersByRoom[roomID], names, maxPlayers, state);
        return;
    }
    io.to(roomID).emit('room-state', roomID, playersByRoom[roomID], names, maxPlayers, state);
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

//this sets up a callback when a client connects to the server
io.on('connection', (socket) => {
    //When the client connects, we get an id saved in their cookies. This is so
    //they can reconnect to a game in progress, because reconnecting generates
    //a new websocket id
    socket.emit('get-id');
    //When it is received we check to see if they are already in a lobby, so 
    //we can rejoin them
    socket.on('received-id', (id) => {
        playerBySocket[socket.id] = id;
        if(disconnectedPlayers[id]){
            clearTimeout(disconnectedPlayers[id]);
            delete disconnectedPlayers[id];
        }
        if(nameByPlayer[id]){
            socket.emit('name-set', nameByPlayer[id]);
        }
        if(roomByPlayer[id]){
            socket.join(roomByPlayer[id]);
            roomChange(roomByPlayer[id], socket);
        }
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
        //If the disconnected player is in a room...
        if(roomByPlayer[id]){
            roomID = roomByPlayer[id];
            //and the game hasn't started, time out player
            if(roomGameState[roomID].state == 'LOBBY'){
                disconnectedPlayers[id] = setTimeout(removePlayer, 10000, id);
            }
        }
        delete playerBySocket[_sID];
    });
    socket.on('create-room', (id) => {
        if(roomByPlayer[id]){
            socket.emit('error', `You are already in room ${roomByPlayer[id]}`);
            return;
        }
        //TODO: Make roomIDs truly unique
        roomID = uuidv4().substring(0,6);
        playersByRoom[roomID] = [id];
        roomGameState[roomID] = {
            state: 'LOBBY'
        };
        roomByPlayer[id] = roomID;
        socket.join(roomID);
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
        if(players.length <= 1){
            socket.emit('error', 'You need at least 2 players to start a game');
            return;
        }
        //Prevent players from being removed via disconnected sockets
        //when the game starts. This is to prevent players who might
        //be suffering from temporary disconnects form being booted
        //from the lobby. If they are still not connected when the
        //game ends they should be removed from the room
        players.forEach(player => {
            if(disconnectedPlayers[player]){
                clearTimeout(disconnectedPlayers[player]);
            }
        })
        if(id == players[0]){
            io.to(roomID).emit('game-start');
            gameState = roomGameState[roomID];
            gameState.state = 'QUESTIONING';
            gameState.questions = {};
            //TODO: Add timer to prevent idling players from stalling
            //the game indefinitely
        }
        else{
            socket.emit('error', 'Only Player 1 can start the game');
        }
    })
    socket.on('submit-question', (id, question) => {
        roomID = roomByPlayer[id];
        gameState = roomGameState[roomID];
        if(gameState.questions[id]){
            socket.emit('error', 'You\'ve already submitted a question');
        }
        else{
            gameState.questions[id] = question;
            if(Object.keys(gameState.questions).length == playersByRoom[roomID].length){
                io.to(roomID).emit('answer-phase', gameState.questions);
                gameState.state = 'ANSWERING';
                gameState.answers = {};
            }
        }
        //TODO: Add timeout
    })
    socket.on('submit-answers', (id, answers) => {
        roomID = roomByPlayer[id];
        gameState = roomGameState[roomID];
        //We can allow players to submit answers multiple times
        //but their previous answers are overwritten
        gameState.answers[id] = answers;
        //When all players have submitted answers, move on to the next
        //phase
        //TODO: Add timeout
        if(Object.keys(gameState.answers).length == playersByRoom[roomID].length){
            //TODO: Add matching phase
            gameState.state = 'MATCHING';
            gameState.matches = {};
            io.to(roomID).emit('matching-phase');
        }
    })
});

const port = process.env.PORT || 3000;
//this makes the server start listening for incoming requests
server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});