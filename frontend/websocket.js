const ConnectStatus = {
  Unconnect: 'unconnected',
  Connected: 'connected',
};
const CheckType = {
  times: 'times',
  timeout: 'timeout',
};
const objectAssign = (...args) => {
  return Object.assign({}, ...args);
};

class WebSocketBox {
  constructor(wsUrl, options) {
    const reconnectOptsDefault = {
      // 是否在ws服务连接出错（即onError或断连）后重连
      enable: true,
      // 重连次数
      times: 3,
      // 重连频率，即多久执行一次重连 单位：毫秒
      reconnectRate: 5000,
    };
    const heartBeatOptsDefault = {
      // 是否启用心跳检测
      enable: true,
      // 心跳频率，即多久执行一次心跳检测 单位：毫秒
      rate: 5000,
      // 检测心跳断连方式，'times'指通过次数判断，'timeout'指通过超时判断
      checkType: CheckType.times,
      // 心跳检测超时次数，规定次数内客户端连续没有收到回复则判定为断连，当通过次数判断断连时使用
      times: 3,
      // 心跳检测超时时间 单位：毫秒
      // 当通过超时判断断连时，超时时间内客户端没有收到回复则判定为断连
      // 当通过次数判断断连时，超时时间内客户端没有收到回复，心跳检测超时次数减1次，心跳检测超时次数为0时仍没有收到回复则判定为断连
      timeout: 10000,
      // 向后端发送的心跳检测数据
      reqObj: {
        type: 'ping',
      },
      // 后端返回的心跳检测数据
      resObj: {
        type: 'pong',
      },
    };
    /* ws实例 */
    this.ws = null;
    /* 连接状态 */
    this.connectStatus = ConnectStatus.Unconnect;
    /* 计时器 */
    // 重连计时器
    this.reconnectTimer = null;
    // 心跳检测计时器
    this.heartBeatTimer = null;
    // 心跳检测服务器超时计时器
    this.serverTimeoutTimer = null;
    if (!wsUrl) {
      console.error('wsUrl is required');
      return;
    }
    this.wsUrl = wsUrl;
    this.reconnectOpts = objectAssign(reconnectOptsDefault, options.reconnect);
    this.heartBeatOpts = objectAssign(heartBeatOptsDefault, options.heartBeat);
    this.initReconnectTimes = this.reconnectOpts.times;
    this.initHeartBeatRateTimes = this.heartBeatOpts.times;
    if (this.heartBeatOpts.checkType === CheckType.times) {
      // 当通过次数判断断连时，心跳检测超时时间比心跳频率稍微快一些，避免二者一起执行了
      this.heartBeatOpts.timeout = this.heartBeatRate - 200;
    }
    this.init();
  }
  init() {
    this.ws = null;
    this.ws = new WebSocket(this.wsUrl);
    this.connectStatus = ConnectStatus.Unconnect;
    this.onOpen();
    this.onMessage();
    this.onError();
    this.onClose();
  }
  onOpen() {
    this.ws.onopen = () => {
      console.log('ws服务已经连接');
      // 连接成功后，若存在重连的情况则重置重连参数
      if (this.reconnectTimer) {
        this.reconnectOpts.times = this.initReconnectTimes;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.connectStatus = ConnectStatus.Connected;
      if (this.heartBeatOpts.enable) {
        this.initReconnectTimes = this.reconnectOpts.times;
        this.pingHeartBeat();
      }
    };
  }
  onMessage() {
    this.ws.onmessage = (e) => {
      const msgObj = JSON.parse(e.data);
      console.log('ws服务收到信息，信息为：', msgObj);
      const { type } = msgObj;
      this.pingHeartBeat();
      if (this.heartBeatOpts.resObj.type !== type) {
        // 抛出数据
      }
    };
  }
  onError() {
    this.ws.onerror = (e) => {
      e.preventDefault();
      console.log(`ws服务连接出错`);
      this.connectStatus = ConnectStatus.Unconnect;
      if (this.reconnectOpts.enable) {
        // 浏览器发现ws出错后，会自动关闭ws，所以这里用宏任务等ws关闭后再进行重连
        setTimeout(() => {
          console.log('即将重连...');
          this.reconnectWebSocket();
        }, 0);
      }
    };
  }
  onClose() {
    this.ws.onclose = () => {
      console.log('ws服务关闭');
      this.connectStatus = ConnectStatus.Unconnect;
    };
  }
  sendData(data) {
    const dataStr = JSON.stringify(data);
    try {
      this.ws.send(dataStr);
    } catch (e) {
      console.log(`发送数据出错：${e}`);
    }
  }
  // 当ws服务连接出错后,重连
  reconnectWebSocket() {
    console.log(`剩余重连次数：${this.reconnectOpts.times}`);
    if (this.reconnectOpts.times === 0) {
      console.log('已超过最大重连次数');
      console.log(
        '重连ws服务失败，请检查参数配置是否正确或服务端ws服务是否开启'
      );
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectOpts.times--;
      console.log('正在重新连接ws服务');
      this.init();
    }, this.reconnectRate);
  }
  // 关闭ws服务
  close() {
    if (this.ws) {
      console.log('手动关闭ws服务');
      this.ws.close();
      this.ws = null;
    }
  }
  getConnectStatus() {
    return this.connectStatus;
  }
  pingHeartBeat() {
    this.heartBeatOpts.checkType === CheckType.times
      ? this.pingByTimes()
      : this.pingByTimeout();
  }
  pingByTimeout() {
    this.heartBeatTimer && clearTimeout(this.heartBeatTimer);
    this.serverTimeoutTimer && clearTimeout(this.serverTimeoutTimer);
    this.heartBeatTimer = setTimeout(() => {
      console.log('发送ping信息');
      this.sendData(this.heartBeatOpts.reqObj);
      this.serverTimeoutTimer = setTimeout(() => {
        // 超时时间内没有返回心跳检测信息
        console.log(
          `${
            this.heartBeatOpts.timeout / 1000
          }秒内没有返回心跳检测信息，即将开始重新连接...`
        );
        if (this.reconnectOpts.enable) {
          this.reconnectWebSocket();
        } else {
          console.log('ws连接已断开');
        }
      }, this.heartBeatOpts.timeout);
    }, this.heartBeatOpts.rate);
  }
  pingByTimes() {
    this.heartBeatTimer && clearTimeout(this.heartBeatTimer);
    this.serverTimeoutTimer && clearTimeout(this.serverTimeoutTimer);
    this.heartBeatOpts.times = this.initHeartBeatRateTimes;
    this.heartBeatTimer = setInterval(() => {
      console.log('发送ping信息');
      this.sendData(this.heartBeatOpts.reqObj);
      this.serverTimeoutTimer = setTimeout(() => {
        console.log(`上一次ping没有返回pong，即将重新ping...`);
        console.log('剩余ping次数', this.heartBeatOpts.times);
        if (this.heartBeatOpts.times === 0) {
          this.heartBeatTimer && clearTimeout(this.heartBeatTimer);
          this.serverTimeoutTimer && clearTimeout(this.serverTimeoutTimer);
          if (this.reconnectOpts.enable) {
            this.reconnectWebSocket();
          } else {
            console.log('ws连接已断开');
          }
        } else {
          this.heartBeatOpts.times--;
        }
      }, this.heartBeatOpts.timeout);
    }, this.heartBeatOpts.rate);
  }
}
