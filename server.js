const WebSocket = require('ws');

const port = parseInt(process.env.PORT) || 8080;

/**
 * MELHORIA: maxPayload
 * Define o tamanho máximo da mensagem que o servidor aceita (10KB aqui).
 * Isso evita ataques de negação de serviço (DoS) onde o atacante envia 
 * megabytes de texto para estourar a memória RAM do servidor.
 */
const wss = new WebSocket.Server({ 
    port: port,
    maxPayload: 10 * 1024 
});

// Objeto para armazenar as salas
const salas = {};

/**
 * MELHORIA: Heartbeat (Batimento Cardíaco)
 * Função simples para marcar que a conexão ainda está viva.
 */
function heartbeat() {
    this.isAlive = true;
}

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
    /**
     * MELHORIA: Controle de Conexão Ativa
     * O servidor agora monitora se o cliente sumiu sem avisar (ex: queda de internet).
     */
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    let salaAtual = null;

    ws.on('message', (data) => {
        /**
         * MELHORIA: Segurança no Parsing (Try/Catch)
         * No código anterior, se o cliente enviasse algo que não fosse JSON, 
         * o servidor crashava (caia). Agora ele apenas ignora mensagens malformadas.
         */
        let message;
        try {
            message = JSON.parse(data);
        } catch (e) {
            return; // Ignora mensagens que não são JSON válido
        }

        // AÇÃO: ENTRAR NA SALA
        if (message.type === 'JOIN_ROOM') {
            const roomCode = message.room;

            // Proteção básica: evita códigos de sala gigantescos via script
            if (!roomCode || String(roomCode).length > 20) return;

            if (!salas[roomCode]) {
                salas[roomCode] = {
                    players: [],
                    deck: criarDeck(),
                    turno: 0 
                };
            }

            if (salas[roomCode].players.length < 2) {
                salaAtual = roomCode;
                salas[roomCode].players.push(ws);

                ws.send(JSON.stringify({
                    type: 'INITIAL_HAND',
                    cards: ["Braço Esquerdo", "Braço Direito", "Perna Esquerda", "Perna Direito"],
                    playerNumber: salas[roomCode].players.length - 1 
                }));

                console.log(`Jogador entrou na sala: ${roomCode}`);

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
            
            // MELHORIA: Validação de existência da sala antes de prosseguir
            if (!sala) return;

            const playerIndex = sala.players.indexOf(ws);

            if (playerIndex === sala.turno && sala.players.length === 2) {
                const card = sala.deck.pop();

                if (card === "CABEÇA DO EXODIA") {
                    ws.send(JSON.stringify({ type: 'WINNER', card: card }));
                    broadcastToRoom(salaAtual, { type: 'GAME_OVER', winner: `Jogador ${playerIndex + 1}` }, ws);
                } else {
                    ws.send(JSON.stringify({ type: 'DRAWN_CARD', card: card }));

                    sala.turno = sala.turno === 0 ? 1 : 0;
                    broadcastToRoom(salaAtual, { type: 'NEXT_TURN', turno: sala.turno });
                }
            }
        }
    });

    ws.on('close', () => {
        if (salaAtual && salas[salaAtual]) {
            // MELHORIA: Notificação de desconexão (Opcional)
            // Caso o front esteja pronto para ler erros, avisamos que o jogo parou.
            // Se o front não souber ler 'OPPONENT_LEFT', ele apenas ignorará.
            broadcastToRoom(salaAtual, { type: 'ERROR', msg: 'Oponente desconectou' }, ws);

            salas[salaAtual].players = salas[salaAtual].players.filter(p => p !== ws);
            if (salas[salaAtual].players.length === 0) {
                delete salas[salaAtual];
            }
        }
    });
});

/**
 * MELHORIA: Limpeza de Conexões Zumbis
 * Verifica a cada 30 segundos se algum jogador desconectou "à força".
 * Se o jogador não responder ao "ping" do servidor, a conexão é fechada para liberar RAM.
 */
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

function broadcastToRoom(roomCode, data, excludeWs) {
    const sala = salas[roomCode];
    if (!sala) return;

    sala.players.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

console.log("Exodia aguarda na porta 8080 com suporte a salas e proteções ativas!");