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
  // 是否在ws服务连接出错（即onError）后重连
  isReconnect = true;
  // 重连次数
  reconnectTimes = 3;
  // 重连频率，即多久执行一次重连 单位：毫秒
  reconnectRate = 5000;
  // 是否心跳检测
  isHeartBeat = true;
  // 是否在心跳检测断连后重连
  isReconnectHeartBeatFail = true;
  // 心跳频率，即多久执行一次心跳检测 单位：毫秒
  heartBeatRate = 5000;
  // 检测心跳断连方式，'times'指通过次数判断，'timeOut'指通过超时判断
  heartBeatCheckType = 'times';
  // 心跳检测超时次数，规定次数内客户端连续没有收到回复则判定为断连，当通过次数判断断连时使用
  heartBeatRateTimes = 3;
  // 心跳检测超时时间 单位：毫秒
  // 当通过超时判断断连时，超时时间内客户端没有收到回复则判定为断连
  // 当通过次数判断断连时，超时时间内客户端没有收到回复，心跳检测超时次数减1次，心跳检测超时次数为0时仍没有收到回复则判定为断连
  heartBeatResTimeOut = 10000;
  // 向后端发送的心跳检测数据
  heartBeatReqData = {
    type: 'ping',
  };
  // 后端返回的心跳检测数据
  heartBeatResData = {
    type: 'pong',
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
    if (!params || !params.wsUrl) {
      console.error('wsUrl is required');
      return;
    }
    this.wsUrl = params.wsUrl;
    // 非必传参数，不传用默认值替代
    const paramsArr = [
      'isReconnect',
      'reconnectTimes',
      'reconnectRate',
      'isHeartBeat',
      'isReconnectHeartBeatFail',
      'heartBeatRate',
      'heartBeatCheckType',
      'heartBeatRateTimes',
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
    this.heartBeatRateTimesInit = this.heartBeatRateTimes;
    if (this.heartBeatCheckType === 'times') {
      // 当通过次数判断断连时，心跳检测超时时间比心跳频率稍微快一些，避免二者一起执行了
      this.heartBeatResTimeOut = this.heartBeatRate - 200;
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
      // 连接成功后，重置重连参数
      this.reconnectTimes = this.reconnectTimesInit;
      this.#reconnectTimer && clearTimeout(this.#reconnectTimer);

      this.connectStatus = ConnectStatus.Connected;
      if (this.isHeartBeat) {
        this.reconnectTimesInit = this.reconnectTimes;
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
      e.preventDefault();
      console.log(`ws服务连接出错`);
      this.connectStatus = ConnectStatus.Unconnect;
      if (this.isReconnect) {
        // 浏览器发现ws出错后，会自动关闭ws，所以这里用宏任务等ws关闭后再进行重连
        setTimeout(() => {
          console.log('即将重连...');
          this.reconnectWebSocket();
        }, 0);
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
    console.log(`剩余重连次数：${this.reconnectTimes}`);
    if (this.reconnectTimes === 0) {
      console.log('已超过最大重连次数');
      console.log(
        '重连ws服务失败，请检查参数配置是否正确或服务端ws服务是否开启'
      );
      return;
    }
    this.#reconnectTimer = setTimeout(() => {
      this.reconnectTimes--;
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
    this.heartBeatCheckType === 'times'
      ? this.pingByTimes()
      : this.pingByTimeout();
  }
  pingByTimeout() {
    this.#heartBeatTimer && clearTimeout(this.#heartBeatTimer);
    this.#serverTimeoutTimer && clearTimeout(this.#serverTimeoutTimer);
    this.#heartBeatTimer = setTimeout(() => {
      console.log('发送ping信息');
      this.sendData(this.heartBeatReqData);
      this.#serverTimeoutTimer = setTimeout(() => {
        // 超时时间内没有返回心跳检测信息
        console.log(
          `${
            this.heartBeatResTimeOut / 1000
          }秒内没有返回心跳检测信息，即将开始重新连接...`
        );
        if (this.isReconnectHeartBeatFail) {
          this.reconnectWebSocket();
        } else {
          console.log('ws连接已断开');
        }
      }, this.heartBeatResTimeOut);
    }, this.heartBeatRate);
  }
  pingByTimes() {
    this.#heartBeatTimer && clearTimeout(this.#heartBeatTimer);
    this.#serverTimeoutTimer && clearTimeout(this.#serverTimeoutTimer);
    this.heartBeatRateTimes = this.heartBeatRateTimesInit;
    this.#heartBeatTimer = setInterval(() => {
      console.log('发送ping信息');
      this.sendData(this.heartBeatReqData);
      this.#serverTimeoutTimer = setTimeout(() => {
        console.log(`上一次ping没有返回pong，即将重新ping...`);
        console.log('剩余ping次数', this.heartBeatRateTimes);
        if (this.heartBeatRateTimes === 0) {
          this.#heartBeatTimer && clearTimeout(this.#heartBeatTimer);
          this.#serverTimeoutTimer && clearTimeout(this.#serverTimeoutTimer);
          if (this.isReconnectHeartBeatFail) {
            this.reconnectWebSocket();
          } else {
            console.log('ws连接已断开');
          }
        } else {
          this.heartBeatRateTimes--;
        }
      }, this.heartBeatResTimeOut);
    }, this.heartBeatRate);
  }
}
