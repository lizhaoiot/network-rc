import React, { Component, createRef } from "react";
import WakeLock from "react-wakelock-react16";
import store from "store";
import {
  Form,
  Switch,
  Dropdown,
  Button,
  Popover,
  message,
  Slider,
  Tag,
  Modal,
} from "antd";
import "./App.css";
import { Router, Location, navigate, useMatch, Match } from "@reach/router";
import Nav from "./components/Nav";
import Controller from "./components/Controller";
import Setting from "./components/Setting";
import WSAvcPlayer from "ws-avc-player";
import WebRTC from './lib/WebRTC'
import {
  HomeOutlined,
  ExpandOutlined,
  FullscreenOutlined,
  ApiOutlined,
  VideoCameraOutlined,
  BulbOutlined,
  FullscreenExitOutlined,
  ThunderboltOutlined,
  PoweroffOutlined,
  AudioOutlined
} from "@ant-design/icons";
import Login from "./components/Login";
import md5 from "md5";
import debounce from "debounce";

const pubilcUrl = process.env.PUBLIC_URL;

export default class App extends Component {
  constructor(props) {
    super(props);
    this.appRef = createRef();
    this.playerBoxRef = createRef();
    this.video = createRef();
    this.state = {
      setting: {
        speedMax: 30,
        wsAddress: window.location.host,
        cameraMode: "default",
        ...store.get("setting"),
      },
      serverSetting: {
        maxSpeed: 100,
      },
      wsConnected: false,
      cameraEnabled: false,
      lightEnabled: false,
      powerEnabled: false,
      canvasRef: undefined,
      isAiControlling: false,
      isFullscreen: false,
      localMicrphoneEnabled: true,
      videoSize: 50,
      delay: undefined,
      action: {
        speed: 0,
        direction: 0,
      },
    };

    const { changeCamera, changeLight, changePower } = this;

    this.controller = {
      changeLight,
      changeCamera,
      changePower,
      speed: (v) => {
        const {
          changeSpeed,
          state: {
            setting: { speedMax },
            action,
          },
        } = this;
        // let vAbs = Math.abs(v);
        // if (vAbs > speedMax / 100) {
        //   vAbs = speedMax / 100;
        // }
        // action.speed = v > 0 ? vAbs : -vAbs;
        action.speed = (v * speedMax) / 100;
        this.setState({ action: { ...action } });
        changeSpeed(action.speed);
      },
      direction: (v) => {
        const {
          changeDirection,
          state: { action },
        } = this;
        action.direction = v;
        changeDirection(v);
        this.setState({ action: { ...action } });
      },
    };

    this.changeVideoSize = debounce(() => {
      this.setState({ unbounceVideoSize: this.state });
    }, 300);
  }

  componentDidMount() {
    const { connect } = this;
    let pingTime;
    this.wsavc = new WSAvcPlayer({
      useWorker: true,
      workerFile: `${process.env.PUBLIC_URL}/Decoder.js`,
    });

    this.wsavc.on("pong", ({ sendTime }) => {
      this.setState({ delay: (new Date().getTime() - sendTime) / 2 });
    });

    this.wsavc.on("controller init", ({ needPassword, maxSpeed }) => {
      this.setState({ serverSetting: { maxSpeed, needPassword } });
      if (needPassword) {
        navigate(`${pubilcUrl}/login`);
      } else {
        this.onLogin();
      }
    });

    this.wsavc.on("disconnected", () => {
      console.log("WS disconnected");
      this.setState({ wsConnected: false });
      clearInterval(pingTime);
    });
    this.wsavc.on("connected", () => {
      console.log("WS connected");
      this.setState({ wsConnected: true });
      if (this.webrtc) {
        this.webrtc.socket = this.wsavc.ws;
      }
      pingTime = setInterval(() => {
        const sendTime = new Date().getTime();
        this.wsavc.send("ping", { sendTime });
      }, 1000);
    });
    this.wsavc.on("frame_shift", (fbl) => {
      // console.log("Stream frame shift: ", fbl);
    });
    this.wsavc.on("resized", (payload) => {
      console.log("resized", payload);
    });
    this.wsavc.on("stream_active", (cameraEnabled) => {
      console.log("Stream is ", cameraEnabled ? "active" : "offline");
      if (cameraEnabled) {
        this.playerBoxRef.current.appendChild(this.wsavc.AvcPlayer.canvas);
        this.setState({
          cameraEnabled,
          canvasRef: this.wsavc.AvcPlayer.canvas,
        });
      } else {
        this.setState({ cameraEnabled, canvasRef: undefined });
      }
    });

    this.wsavc.on("light enabled", (lightEnabled) => {
      this.setState({ lightEnabled });
    });

    this.wsavc.on("power enabled", (powerEnabled) => {
      this.setState({ powerEnabled });
    });

    this.wsavc.on("login", ({ message: m }) => {
      message.success(m);
      navigate(`${pubilcUrl}/`, { replace: true });
      this.onLogin();
    });

    this.wsavc.on("error", ({ message: m }) => {
      message.error(m);
    });

    this.wsavc.on("info", ({ message: m }) => {
      message.info(m);
    })

    connect();

    document.body.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        this.setState({ isFullscreen: true });
      } else {
        this.setState({ isFullscreen: false });
      }
    });
  }

  connect = () => {
    const { wsAddress } = this.state.setting;
    this.wsavc.connect(
      `${
      window.location.protocol === "https:" ? "wss://" : "ws://"
      }${wsAddress}`
    );
  };

  disconnect = (e) => {
    e && e.preventDefault();
    this.setState({ wsConnected: false });
    if (!this.wsavc) return;
    this.wsavc.disconnect();
  };

  login = ({ password }) => {
    const { wsConnected } = this.state;
    if (!wsConnected) return;
    this.wsavc.send("login", {
      token: md5(`${password}eson`),
    });
  };

  onLogin = () => {
    const time = setInterval(() => {
      if (!this.video.current) return;
      clearInterval(time);
      this.webrtc = new WebRTC({
        socket: this.wsavc.ws,
        video: this.video.current,
        onError(e) {
          message.error(e.message)
        },
        onSuccess: () => {
          this.setState({
            localMicrphoneEnabled: true,
            cameraEnabled: true
          })
        },
        onClose: () => {
          this.setState({
            localMicrphoneEnabled: false,
            cameraEnabled: false
          });
          this.webrtc = undefined;
        }
      })
    }, 100)

  }

  changeCamera = (enabled) => {
    const {
      state: {
        // setting: { cameraMode, cameraEnabled },
        // setting: { cameraEnabled },
        wsConnected,
      },
    } = this;
    if (!wsConnected) return;
    this.wsavc.send("webrtc camera", enabled);
    this.setState({ cameraEnabled: enabled })
    // this.wsavc.send("open camera", { enabled, cameraMode });
  };

  changeLight = (enable) => {
    const { wsConnected } = this.state;
    if (!wsConnected) return;
    this.wsavc.send("open light", enable);
  };

  changePower = (enable) => {
    const { wsConnected } = this.state;
    if (!wsConnected) return;
    this.wsavc.send("open power", enable);
  };

  piPowerOff = () => {
    const { wsConnected } = this.state;
    if (!wsConnected) return;
    Modal.confirm({
      autoFocusButton: "cancel",
      icon: <PoweroffOutlined />,
      title: "确定要关闭 Pi 酱系统？",
      maskClosable: true,
      onOk: () => {
        this.wsavc.send("pi power off");
      },
      okType: "danger",
      okText: "树莓派关机",
      cancelText: "取消"
    })
  };

  changeSetting = (setting) => {
    this.setState({ setting });
    store.set("setting", setting);
    navigate(`${pubilcUrl}/`);

    // this.connect();
  };

  changeZeroSpeedRate = (speedZeroRate) => {
    if (!this.state.wsConnected) return;
    this.wsavc.send("speed zero rate", speedZeroRate);
    this.setState({ speedZeroRate });
  };

  changeSpeed = (speedRate) => {
    if (!this.state.wsConnected) return;
    this.wsavc.send("speed rate", speedRate);
  };

  changeDirection = (directionRate) => {
    if (!this.state.wsConnected) return;
    this.wsavc.send("direction rate", directionRate);
  };

  changeLocalMicrphone = (enabled) => {
    this.webrtc.openMicrophone(enabled);
    this.setState({
      localMicrphoneEnabled: enabled
    })
  }

  render() {
    const {
      disconnect,
      connect,
      controller,
      changeSetting,
      changeLight,
      changeCamera,
      changePower,
      changeLocalMicrphone,
      piPowerOff,
      login,
      state: {
        setting,
        wsConnected,
        cameraEnabled,
        // canvasRef,
        action,
        isFullscreen,
        serverSetting,
        lightEnabled,
        videoSize,
        delay,
        powerEnabled,
        localMicrphoneEnabled,
      },
      webrtc
    } = this;

    return (
      <div className="App" ref={this.appRef}>
        <Form layout="inline" className="app-status" size="small">
          <Form.Item>
            <Location>
              {({ navigate }) => (
                <Dropdown.Button
                  overlay={<Nav piPowerOff={piPowerOff} />}
                  onClick={() => navigate(`${process.env.PUBLIC_URL}/`)}
                  type="primary"
                >
                  <HomeOutlined /> 控制
                </Dropdown.Button>
              )}
            </Location>
          </Form.Item>
          <Form.Item>
            <Switch
              checked={wsConnected}
              onChange={(v) => {
                if (v) connect();
                else disconnect();
              }}
              unCheckedChildren={<ApiOutlined />}
              checkedChildren={<ApiOutlined />}
            />
          </Form.Item>
          <Form.Item>
            <Switch
              checked={powerEnabled}
              onChange={changePower}
              checkedChildren={<ThunderboltOutlined />}
              unCheckedChildren={<ThunderboltOutlined />}
            />
          </Form.Item>
          <Form.Item>
            <Switch
              checked={cameraEnabled}
              onChange={changeCamera}
              checkedChildren={<VideoCameraOutlined />}
              unCheckedChildren={<VideoCameraOutlined />}
            />
          </Form.Item>

          {/* <Form.Item>
            <Button style={{ width: "6em" }}>
              舵机:{action.direction.toFixed(2)}
            </Button>
          </Form.Item>
          <Form.Item>
            <Button style={{ width: "6em" }}>
              电调:{action.speed.toFixed(2)}
            </Button>
          </Form.Item> */}
          {cameraEnabled && (
            <Form.Item>
              <Popover
                placement="bottomRight"
                content={
                  <Slider
                    defaultValue={videoSize}
                    step={0.1}
                    tipFormatter={(v) => v * 2}
                    onAfterChange={(videoSize) => this.setState({ videoSize })}
                    style={{ width: "30vw" }}
                    marks={{ 0: 0, 50: 100, 100: 200 }}
                  />
                }
              >
                <Button shape="round">
                  <ExpandOutlined />
                  {(videoSize * 2).toFixed(1)}%
                </Button>
              </Popover>
            </Form.Item>
          )}

          <Form.Item>
            <Switch
              checked={lightEnabled}
              onChange={changeLight}
              checkedChildren={<BulbOutlined />}
              unCheckedChildren={<BulbOutlined />}
            />
          </Form.Item>

          {webrtc && webrtc.localStream &&
            <Form.Item>
              <Switch
                checked={localMicrphoneEnabled}
                onChange={changeLocalMicrphone}
                checkedChildren={<AudioOutlined />}
                unCheckedChildren={<AudioOutlined />}
              />
            </Form.Item>
          }

          {document.body.requestFullscreen && (
            <Form.Item>
              <Button
                type="primary"
                shape="circle"
                icon={
                  isFullscreen ? (

                    <FullscreenExitOutlined />
                  ) : (
                      <FullscreenOutlined />
                    )
                }
                onClick={() => {
                  if (isFullscreen) {
                    document.exitFullscreen();
                  } else {
                    document.body.requestFullscreen();
                  }
                }}
              ></Button>
            </Form.Item>
          )}
          {wsConnected &&
            <Form.Item>
              <Button
                type="danger"
                shape="circle"
                icon={
                  <PoweroffOutlined />
                }
                onClick={piPowerOff}
              ></Button>
            </Form.Item>}

          {wsConnected && delay && (
            <Form.Item>
              <Tag color={delay > 80 ? "red" : "green"}>ping:{delay}</Tag>
            </Form.Item>)}

        </Form>
        <Match path="/:item">
          {({ match }) => <div
            className="player-box"
            ref={this.playerBoxRef}
            style={{
              // opacity: cameraEnabled ? 1 : 0,
              display: !match || match.uri.indexOf("/ai") > -1 ? "flex" : "none",
              transform: `scale(${videoSize / 50})`,
            }}
          >
            <video ref={this.video} autoPlay controls />
          </div>}
        </Match>
        <Router className="app-page">
          <Setting
            path={`${process.env.PUBLIC_URL}/setting`}
            {...setting}
            serverSetting={serverSetting}
            wsConnected={wsConnected}
            onDisconnect={disconnect}
            onSubmit={changeSetting}
          />
          <Login path={`${process.env.PUBLIC_URL}/login`} onSubmit={login} />
          <Controller
            path={`${process.env.PUBLIC_URL}/*`}
            controller={controller}
            lightEnabled={lightEnabled}
            cameraEnabled={cameraEnabled}
            videoEl={this.video.current}
            action={action}
            powerEnabled={powerEnabled}
            videoSize={videoSize}
          >
          </Controller>
        </Router>
        <WakeLock preventSleep={wsConnected} />
      </div>
    );
  }
}
