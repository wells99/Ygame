const WebSocket = require('ws');
const port = parseInt(process.env.PORT) || 8080;
const wss = new WebSocket.Server({ port: port });

// Objeto para armazenar as salas
// Estrutura: { "123": { players: [], deck: [], turno: 0 } }
const salas = {};

function criarDeck() {
    let deck = ["CABEÇA DO EXODIA", 
        "Mago Negro",
        "Dragão Branco de Olhos Azuis",
        "Dragão Negro de Olhos Vermelhos",
        "Maga Negra",
        "Obelisco, o Atormentador",
        "Slifer, o Dragão do Céu",
        "O Dragão Alado de Rá",
        "Força Espelho", "Herói Elementar Neos",
        "Cyber Dragão",
        "Kuriboh"];

    return deck.sort(() => Math.random() - 0.5);
}

wss.on('connection', (ws) => {
    let salaAtual = null;

    ws.on('message', (data) => {
        const message = JSON.parse(data);

        // AÇÃO: ENTRAR NA SALA
        if (message.type === 'JOIN_ROOM') {
            const roomCode = message.room;

            // Se a sala não existe, cria ela
            if (!salas[roomCode]) {
                salas[roomCode] = {
                    players: [],
                    deck: criarDeck(),
                    turno: 0 // Índice do jogador que pode jogar
                };
            }

            // Verifica se a sala já tem 2 jogadores
            if (salas[roomCode].players.length < 2) {
                salaAtual = roomCode;
                salas[roomCode].players.push(ws);

                // Envia mão inicial
                ws.send(JSON.stringify({
                    type: 'INITIAL_HAND',
                    cards: ["Braço Esquerdo", "Braço Direito", "Perna Esquerda", "Perna Direito"],
                    playerNumber: salas[roomCode].players.length - 1 // 0 ou 1
                }));

                console.log(`Jogador entrou na sala: ${roomCode}`);

                // Se completou 2 jogadores, avisa que o jogo pode começar
                if (salas[roomCode].players.length === 2) {
                    broadcastToRoom(roomCode, {
                        type: 'GAME_START',
                        turno: salas[roomCode].turno
                    });
                }
            } else {
                ws.send(JSON.stringify({ type: 'ERROR', msg: 'Sala cheia!' }));
            }
        }

        // AÇÃO: PUXAR CARTA (Turno)
        if (message.type === 'DRAW' && salaAtual) {
            const sala = salas[salaAtual];
            const playerIndex = sala.players.indexOf(ws);

            // Verifica se é o turno do jogador
            if (playerIndex === sala.turno && sala.players.length === 2) {
                const card = sala.deck.pop();

                if (card === "CABEÇA DO EXODIA") {
                    ws.send(JSON.stringify({ type: 'WINNER', card: card }));
                    broadcastToRoom(salaAtual, { type: 'GAME_OVER', winner: `Jogador ${playerIndex + 1}` }, ws);
                } else {
                    ws.send(JSON.stringify({ type: 'DRAWN_CARD', card: card }));

                    // Passa o turno para o outro (0 vira 1, 1 vira 0)
                    sala.turno = sala.turno === 0 ? 1 : 0;
                    broadcastToRoom(salaAtual, { type: 'NEXT_TURN', turno: sala.turno });
                }
            }
        }
    });

    // Remover jogador ao desconectar
    ws.on('close', () => {
        if (salaAtual && salas[salaAtual]) {
            salas[salaAtual].players = salas[salaAtual].players.filter(p => p !== ws);
            if (salas[salaAtual].players.length === 0) {
                delete salas[salaAtual]; // Deleta a sala se ficar vazia
            }
        }
    });
});

function broadcastToRoom(roomCode, data, excludeWs) {
    const sala = salas[roomCode];
    if (!sala) return;

    sala.players.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

console.log("Exodia aguarda na porta 8080 com suporte a salas!");