const ConnectStatus = {
  Unconnect: 'unconnected',
  Connected: 'connected',
};

class WebSocketBox {
  /* ws实例 */
  ws = null;

  /* 连接状态 */
  connectStatus = ConnectStatus.Unconnect;

  /* 计时器 */
  // 重连计时器
  #reconnectTimer = null;
  // 心跳检测计时器
  #heartBeatTimer = null;
  // 心跳检测服务器超时计时器
  #serverTimeoutTimer = null;

  /* 参数 */
  // ws地址
  wsUrl = '';
  // 是否在ws服务连接出错后执行重连
  isReconnect = true;
  // 重连次数
  reconnectTimes = 4;
  // 重连频率，规定多久执行一次重连 单位：微秒
  reconnectRate = 5000;
  // 是否进行心跳检测
  isHeartBeat = true;
  // 心跳检测频率，规定多久执行一次心跳检测 单位：微秒
  heartBeatRate = 3000;
  // 心跳检测超时时间，规定时间内客户端没有收到回复则判定为失去连接 单位：微秒
  heartBeatResTimeOut = 10000;
  // 向后端发送的心跳检测数据
  heartBeatReqData = {
    type: 'heart_beat',
  };
  // 后端返回的心跳检测数据
  heartBeatResData = {
    type: 'heart_beat',
  };
  /* 自定义钩子事件 */
  // 连接
  openEvent = null;
  // 收到信息
  messageEvent = null;
  // 出错
  errorEvent = null;
  // 关闭
  closeEvent = null;

  /**
   * @param {*} params object
   */
  constructor(params) {
    // 必传参数
    if (!params.hasOwnProperty('wsUrl')) {
      console.log('wsUrl is required');
      return;
    }
    this.wsUrl = params.wsUrl;
    // 非必传参数
    const paramsArr = [
      'isReconnect',
      'reconnectTimes',
      'reconnectRate',
      'isHeartBeat',
      'heartBeatRate',
      'heartBeatResTimeOut',
      'heartBeatReqData',
      'heartBeatResData',
      'openEvent',
      'messageEvent',
      'errorEvent',
      'closeEvent',
    ];
    Object.keys(params).forEach((key) => {
      if (paramsArr.includes(key)) {
        this[key] = params[key];
      }
    });
    this.reconnectTimesInit = this.reconnectTimes;
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
      // 连接成功后，重置重连参数
      this.reconnectTimes = this.reconnectTimesInit;
      this.#reconnectTimer && clearTimeout(this.#reconnectTimer);
      this.connectStatus = ConnectStatus.Connected;
      if (this.isHeartBeat) {
        this.pingHeartBeat();
      }
      if (this.openEvent) {
        this.openEvent();
      }
    };
  }
  onMessage() {
    this.ws.onmessage = (e) => {
      const msgObj = JSON.parse(e.data);
      console.log('ws服务收到信息，信息为：', msgObj);
      const { type } = msgObj;
      // 判断后端返回的心跳消息
      if (type === this.heartBeatResData.type) {
        this.pingHeartBeat();
      }
      if (this.messageEvent) {
        this.messageEvent(e.data);
      }
    };
  }
  onError() {
    this.ws.onerror = (e) => {
      console.log(`ws服务连接出错`);
      this.connectStatus = ConnectStatus.Unconnect;
      if (this.isReconnect) {
        console.log(`即将重新连接...`);
        this.reconnectWebSocket();
      }
      if (this.errorEvent) {
        this.errorEvent();
      }
    };
  }
  onClose() {
    this.ws.onclose = () => {
      console.log('ws服务关闭');
      this.connectStatus = ConnectStatus.Unconnect;
      if (this.closeEvent) {
        this.closeEvent();
      }
    };
  }
  sendData(data) {
    const dataStr = JSON.stringify(data);
    try {
      this.ws.send(dataStr);
    } catch {
      //
    }
  }
  // 当ws服务连接出错后,重连
  reconnectWebSocket() {
    if (this.reconnectTimes <= 0) {
      console.log('已超过最大重连次数');
      console.log('重连ws服务失败，请检查参数是否配置正确或服务端是否开启');
      return;
    }
    this.#reconnectTimer = setTimeout(() => {
      this.reconnectTimes--;
      console.log('正在重新连接ws服务，剩余重连次数：', this.reconnectTimes);
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
    this.#heartBeatTimer && clearTimeout(this.#heartBeatTimer);
    this.#serverTimeoutTimer && clearTimeout(this.#serverTimeoutTimer);
    // 规定时间内没有返回心跳检测信息，重连
    this.#heartBeatTimer = setTimeout(() => {
      this.sendData(this.heartBeatReqData);
      // 规定时间内没有返回心跳检测信息，重连
      this.#serverTimeoutTimer = setTimeout(() => {
        console.log(
          `${
            this.heartBeatResTimeOut / 1000
          }秒内没有返回心跳检测信息,即将开始重新连接...`
        );
        this.reconnectWebSocket();
      }, this.heartBeatResTimeOut);
    }, this.heartBeatRate);
  }
}
