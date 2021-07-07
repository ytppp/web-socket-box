const ConnectStatus = {
  Unconnect: 'unconnected',
  Connected: 'connected',
};

class WebSocketBox {
  /* webSocket实例 */
  ws = null;

  /* 连接状态 */
  connectStatus = '';

  /* 计时器 */
  // 重连计时器
  #reConnectTimer = null;
  // 心跳检测计时器
  #heartCheckTimer = null;
  // 心跳检测服务器超时计时器
  #serverTimeoutTimer = null;

  /* 参数 */
  // ws的URL地址
  wsUrl = '';
  // 是否在WebSocket服务连接出错后执行重连
  isReConnect = true;
  // 重连次数，默认4次
  reConnectTimes = 4;
  // 重连频率，默认2秒执行一次重连
  reConnectRate = 2000;
  // 是否进行心跳检测
  isHeartCheck = true;
  // 心跳检测频率，默认3秒执行一次
  heartCheckRate = 3000;
  // 心跳检测超时次数，客户端向服务器发送规定次数心跳检测，服务端都没有回复则判定为失去连接
  heartCheckTimes = 4;
  // 心跳检测超时时间，规定时间内服务端没有回复则判定为失去连接
  heartCheckResTimeOut = 30000;
  // 向后端发送的心跳检测数据
  heartBeatReqData = {
    type: 'heart_check',
  };
  // 后端返回的心跳检测数据
  heartBeatResData = {
    type: 'heart_check',
  };
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
      'isReConnect',
      'reConnectTimes',
      'reConnectRate',
      'isHeartCheck',
      'heartCheckRate',
      'heartCheckTimes',
      'heartCheckResTimeOut',
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
    this.reConnectTimesOld = this.reConnectTimes;
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
      console.log('WebSocket服务已经连接');
      // 连接成功后，重置重连参数
      this.reConnectTimes = this.reConnectTimesOld;
      if (this.#reConnectTimer) {
        clearTimeout(this.#reConnectTimer);
        this.#reConnectTimer = null;
      }
      this.connectStatus = ConnectStatus.Connected;
      if (this.isHeartCheck) {
        this.startHeartCheck();
      }
      if (this.openEvent) {
        this.openEvent();
      }
    };
  }
  onMessage() {
    this.ws.onmessage = (e) => {
      const msgObj = JSON.parse(e.data);
      console.log('WebSocket服务收到信息，信息为：', msgObj);
      const { type } = msgObj;
      // todo 判断后端返回的心跳消息
      if (type === this.heartBeatResData.type) {
        this.startHeartCheck();
      }
      if (this.messageEvent) {
        this.messageEvent(e.data);
      }
    };
  }
  onError() {
    this.ws.onerror = () => {
      console.log(`WebSocket服务连接出错,即将开始重新连接...`);
      this.connectStatus = ConnectStatus.Unconnect;
      if (this.isReConnect) {
        this.reConnectWebSocket();
      }
      if (this.errorEvent) {
        this.errorEvent();
      }
    };
  }
  onClose() {
    this.ws.onclose = () => {
      console.log('WebSocket服务关闭');
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
  // 当WebSocket服务连接出错后,重连
  reConnectWebSocket() {
    console.log(
      '正在重新连接WebSocket服务，当前剩余连接次数',
      this.reConnectTimes - 1
    );
    // 如果重连计时器存在，清除重连定时器
    this.#reConnectTimer = setTimeout(() => {
      if (this.reConnectTimes <= 1) {
        //关闭定时器
        clearInterval(this.#reConnectTimer);
      } else {
        this.reConnectTimes--;
        this.init();
      }
    }, this.reConnectRate);
  }
  close() {
    console.log('手动关闭websocket服务');
    this.ws.close();
    this.ws = null;
  }
  getConnectStatus() {
    return this.connectStatus;
  }
  startHeartCheck() {
    console.log('发送心跳检测');
    this.#heartCheckTimer && clearTimeout(this.#heartCheckTimer);
    this.#serverTimeoutTimer && clearTimeout(this.#serverTimeoutTimer);
    this.#heartCheckTimer = setTimeout(() => {
      this.sendData(this.heartBeatReqData);
      // 规定时间内没有返回心跳检测信息，关闭连接
      this.#serverTimeoutTimer = setTimeout(() => {
        console.log('规定时间内没有返回心跳检测信息,即将开始重新连接...');
        this.reConnectWebSocket();
      }, this.heartCheckResTimeOut);
    }, this.heartCheckRate);
  }
}
