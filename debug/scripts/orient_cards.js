cards = Array.from(document.getElementsByClassName('card'));
console.log(cards);

resetHand();
for(i=0; i<cards.length; i++) {
    cards[i].addEventListener("click", function(e) {
        const card = e.target;
        if(card.classList.contains('selected')){
            card.classList.remove('selected');
            console.log(`Unselected ${card}`);
            resetHand();
        }
        else{
            resetHand();
            card.classList.add('selected');
            console.log(`Selected ${card}`);
            card.style.transform = "translate(225px, 25px) rotate(0deg) scale(1.25,1.25)";
        }
    }, true);
}

function resetHand() {
    let deg = -30;
    let pos = 125;
    for(i=0; i<cards.length; i++) {
        cards[i].classList.remove('selected');
        cards[i].style.transform = `translate(${pos}%, 125%) rotate(${deg}deg) scale(1,1)`;
        deg += (60 / (cards.length - 1));
        pos += (100 / (cards.length - 1));
    }
}