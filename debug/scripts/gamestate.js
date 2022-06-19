/*
Player clicks 'Create Game'
*/

function createRoomCode() {
    return Math.random().toString().substring(2,8);
}