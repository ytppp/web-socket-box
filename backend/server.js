const WebSocket = require('ws');

class MockWebSocket {
  ws = null;
  constructor() {}
  start() {
    this.ws = new WebSocket.Server({
      port: 6789,
    });
    console.log('ws start succefully');
    this.ws.on('connection', (socket) => {
      console.log('a client connected');
      socket.on('message', function (message) {
        console.log(`client send a message: ${message}`);
        let data = JSON.parse(message);
        if (data.type === 'ping') {
          socket.send(
            // {
            //   type:
            //     Number(Math.random().toFixed(2)) * 100 > 25
            //       ? 'pong'
            //       : 'error pong',
            // }
            JSON.stringify({
              type: 'pong',
            })
          );
        }
      });
      setInterval(() => {
        socket.send(
          JSON.stringify({
            data: 'some info',
          })
        );
      }, 2000);
      socket.on('close', () => {
        console.log('a client disconnected!');
      });
    });
  }
}

new MockWebSocket().start();
