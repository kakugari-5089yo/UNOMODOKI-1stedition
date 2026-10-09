const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// 静的ファイル（index.html）を配信する
app.use(express.static(__dirname));

// ルーム情報を管理するオブジェクト
const rooms = {};

io.on('connection', (socket) => {
    console.log('ユーザーが接続しました:', socket.id);

    // 部屋を作る・参加する
    socket.on('join_room', (data) => {
        const { roomCode, playerName } = data;
        
        // 部屋が存在しない場合は新規作成
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                code: roomCode,
                players: [],
                gameStarted: false
            };
        }

        const room = rooms[roomCode];

        // すでにゲームが始まっている場合は拒否
        if (room.gameStarted) {
            socket.emit('error_message', 'この部屋のゲームは既に開始されています。');
            return;
        }

        // プレイヤーを追加
        socket.join(roomCode);
        room.players.push({
            id: socket.id,
            name: playerName || `プレイヤー(${socket.id.slice(0,4)})`
        });

        console.log(`[${roomCode}] ${playerName} が参加しました。現在の人数: ${room.players.length}人`);

        // 部屋にいる全員に最新のプレイヤー情報を送る
        io.to(roomCode).emit('room_data', {
            players: room.players,
            gameStarted: room.gameStarted
        });
    });

    // チャットメッセージの受信と全員への転送
    socket.on('send_chat', (data) => {
        const { roomCode, playerName, message } = data;
        io.to(roomCode).emit('receive_chat', { playerName, message });
    });

    // ゲーム開始シグナルの同期
    socket.on('start_game', (data) => {
        const { roomCode } = data;
        if (rooms[roomCode]) {
            rooms[roomCode].gameStarted = true;
            io.to(roomCode).emit('game_start_confirmed', {
                players: rooms[roomCode].players
            });
        }
    });

    // プレイ中のゲームアクション（カードを出す、引くなど）を全員に同期する汎用口
    socket.on('game_action', (data) => {
        const { roomCode, actionType, payload } = data;
        // アクションを起こした本人以外（または全員）にそのままデータを横流しする
        socket.to(roomCode).emit('game_action_received', { actionType, payload, senderId: socket.id });
    });

    // 接続が切れた場合
    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました:', socket.id);
        
        // 全部屋を走査して、切断したプレイヤーを削除
        Object.keys(rooms).forEach(roomCode => {
            const room = rooms[roomCode];
            const initialLength = room.players.length;
            room.players = room.players.filter(p => p.id !== socket.id);
            
            if (room.players.length !== initialLength) {
                if (room.players.length === 0) {
                    // 誰もいなくなったら部屋を削除
                    delete rooms[roomCode];
                    console.log(`[${roomCode}] 部屋が空になったため削除しました。`);
                } else {
                    // 残ったメンバーに通知
                    io.to(roomCode).emit('room_data', {
                        players: room.players,
                        gameStarted: room.gameStarted
                    });
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`うのもどきサーバーがポート ${PORT} で起動しました！`);
    console.log(`ブラウザで http://localhost:${PORT} を開いてください。`);
});
