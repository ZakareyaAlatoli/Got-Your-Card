class Card extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.innerHTML = `
            <style>
                .card {
                    width: 125px; 
                    text-align: center;
                    height: 200px; 
                    background: linear-gradient(to top, #AA2200 0%, #FFFF00 30%, #FFFF00 100%); 
                    border-radius: 20px; 
                    position: absolute; 
                    border-style: ridge;
                    transition: transform 0.25s;
                }
                
                .selected { 
                    border-color: red;
                }
                
                .card-art {
                    width: 90%; 
                    height:56.25%; 
                    background: red; 
                    position: relative; 
                    left: 5%; 
                    margin-top: 5%; 
                    margin-bottom: 5%;
                    pointer-events: none;
                    border-style: double;
                    border-color: aquamarine;
                }
                
                .card-art img {
                    width: 100%;
                    height: 100%;
                }
                
                .card-text {
                    width: 90%; 
                    height:20%; 
                    background: green; 
                    position: relative; 
                    left: 5%;
                    pointer-events: none;
                }
            </style>
            <div class="card">
                ${this.getAttribute('name')}
                <div class="card-art">
                    <img src = ${this.getAttribute('img')}>
                </div>
                <div class="card-text">
                    ${this.textContent}
                </div>
            </div>
        `;
    }
}
  
customElements.define('player-card', Card);